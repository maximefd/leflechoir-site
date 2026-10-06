# DANS backend/schemas.py
"""
Schémas de validation des requêtes de l'API (pydantic).

Chaque endpoint qui lit un corps JSON passe par `parse_body(Schema)` : toute entrée
invalide est rejetée avec une erreur 400 et un message en français, sans jamais
renvoyer la valeur reçue (pour ne pas refléter de mot de passe ou de contenu hostile).
"""

from typing import Annotated, Literal, TypeVar

from email_validator import EmailNotValidError, validate_email
from flask import request
from pydantic import (BaseModel, ConfigDict, Field, StrictBool, StringConstraints, ValidationError, field_validator,
                      model_validator)

# Lettres françaises (avec accents et ligatures)
LETTERS = "A-Za-zÀ-ÖØ-öø-ÿŒœÆæ"
# Un mot : commence et finit par une lettre ; tiret, apostrophe et espace autorisés à l'intérieur
WORD_PATTERN = rf"^[{LETTERS}][{LETTERS}'’ -]*[{LETTERS}]$"
# Un motif de recherche : lettres et « ? » (plus les séparateurs des mots composés)
MASK_PATTERN = rf"^[{LETTERS}?'’ -]+$"
# Un nom de dictionnaire : lettres, chiffres, espaces et ponctuation courante
DICTIONARY_NAME_PATTERN = r"^[\w '’().,:&!-]+$"
# Le mot mystère tel que tapé (#218) : un prénom ou un message, lettres seulement ; vide = pas de mot mystère.
# Sa longueur en lettres (3 à 20) se vérifie après normalisation, dans la route, avec un `reason`.
MYSTERY_INPUT_PATTERN = rf"^([{LETTERS}][{LETTERS}'’ -]*)?$"
# Le mot mystère tel que l'API le renvoie : normalisé, une espace entre deux mots (« JOYEUX NOEL »)
MYSTERY_WORD_PATTERN = r"^[A-Z]+( [A-Z]+)*$"

MAX_SEED = 2_147_483_647

DictionaryName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100, pattern=DICTIONARY_NAME_PATTERN)
]


class RequestValidationError(Exception):
    """Corps de requête invalide : converti en réponse 400 par le gestionnaire d'erreurs."""

    def __init__(self, message: str, details: list[dict] | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or []


class ApiModel(BaseModel):
    # Les champs inconnus sont ignorés (le frontend peut envoyer plus que nécessaire)
    model_config = ConfigDict(extra="ignore")


# --- Authentification ---

class RegisterRequest(ApiModel):
    email: Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=3, max_length=254)]
    # Pas de strip sur le mot de passe : les espaces font partie du secret
    password: Annotated[str, Field(min_length=8, max_length=128)]

    @field_validator("email")
    @classmethod
    def check_email(cls, value: str) -> str:
        try:
            validate_email(value, check_deliverability=False)
        except EmailNotValidError as exc:
            raise ValueError("adresse e-mail invalide") from exc
        return value


class LoginRequest(ApiModel):
    email: Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=1, max_length=254)]
    # Pas de longueur minimale : les comptes créés avant la règle des 8 caractères doivent pouvoir se connecter
    password: Annotated[str, Field(min_length=1, max_length=128)]


class ForgotPasswordRequest(ApiModel):
    email: Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=1, max_length=254)]


class EmailLinkRequest(ApiModel):
    """Le jeton d'un lien reçu par e-mail, renvoyé par la page du frontend qui l'a reçu."""
    token: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]


class ResetPasswordRequest(EmailLinkRequest):
    password: Annotated[str, Field(min_length=8, max_length=128)]


class AccountDeletionRequest(ApiModel):
    # Le mot de passe, redemandé : un jeton volé ne doit pas suffire à effacer un compte
    password: Annotated[str, Field(min_length=1, max_length=128)]


# --- Dictionnaires personnels ---

class DictionaryCreateRequest(ApiModel):
    name: DictionaryName


class DictionaryUpdateRequest(ApiModel):
    name: DictionaryName | None = None
    is_active: StrictBool | None = None


class WordCreateRequest(ApiModel):
    mot: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=30, pattern=WORD_PATTERN)]
    definition: Annotated[str, StringConstraints(strip_whitespace=True, max_length=255)] | None = None


class SuggestionRequest(ApiModel):
    """Un mot signalé (à retirer) ou proposé (à ajouter), en un clic (roadmap 1e)."""
    kind: Literal["remove", "add"]
    word: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=30, pattern=WORD_PATTERN)]
    source: Literal["search", "search_empty", "grid", "editor", "editor_unknown"]


class ContactRequest(ApiModel):
    """Un message du formulaire de contact (Phase 8, #131) : un motif, un texte, une adresse de réponse facultative."""
    reason: Literal["suggestion", "problem", "data"]
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=10, max_length=2000)]
    email: Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, max_length=254)] = ""
    # L'identifiant de la requête qui a échoué (en-tête X-Request-ID), joint par « Signaler ce problème »
    request_id: Annotated[str, StringConstraints(max_length=64, pattern=r"^[A-Za-z0-9-]*$")] = ""
    # Le pot de miel : un champ caché que seul un robot remplit
    website: Annotated[str, StringConstraints(max_length=200)] = ""

    @field_validator("message")
    @classmethod
    def check_message(cls, value: str) -> str:
        if "\x00" in value:  # PostgreSQL refuse le caractère nul dans un texte : ce serait une erreur 500
            raise ValueError("le message contient un caractère interdit")
        return value

    @field_validator("email")
    @classmethod
    def check_email(cls, value: str) -> str:
        if value:
            try:
                validate_email(value, check_deliverability=False)
            except EmailNotValidError as exc:
                raise ValueError("adresse e-mail invalide") from exc
        return value


class ContactReadRequest(ApiModel):
    """Lu ou non lu : la seule écriture de la boîte de réception avec la suppression."""
    read: StrictBool


class AudienceRequest(ApiModel):
    """Une page vue, ou un export PDF, signalé par le navigateur (ADR 0016, point 3, #130).

    Tout est borné : un chemin sans paramètres, le nom d'hôte seul du référent, la langue du navigateur.
    Rien ici ne désigne une personne.
    """
    kind: Literal["view", "pdf"]
    path: Annotated[str, StringConstraints(min_length=1, max_length=100, pattern=r"^/[A-Za-z0-9/_.-]*$")]
    referrer: Annotated[str, StringConstraints(max_length=100, pattern=r"^[A-Za-z0-9.-]*$")] = ""
    lang: Annotated[str, StringConstraints(max_length=12, pattern=r"^[A-Za-z0-9-]*$")] = ""
    visible_ms: Annotated[int, Field(ge=0, le=1_800_000)] = 0


# --- Recherche et génération ---

class SearchRequest(ApiModel):
    mask: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30, pattern=MASK_PATTERN)]
    limit: Annotated[int, Field(ge=1, le=500)] = 200


class GridSize(ApiModel):
    width: Annotated[int, Field(ge=2, le=20)] = 10
    height: Annotated[int, Field(ge=2, le=20)] = 10


GridWord = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=2, max_length=30, pattern=WORD_PATTERN)
]

MysteryInput = Annotated[str, StringConstraints(strip_whitespace=True, max_length=40, pattern=MYSTERY_INPUT_PATTERN)]


class GenerateRequest(ApiModel):
    size: GridSize = Field(default_factory=GridSize)
    seed: Annotated[int, Field(ge=0, le=MAX_SEED)] | None = None
    use_global: StrictBool = True
    # Plafonds de garde uniquement : la vraie limite est le layout, vérifiée avant de résoudre (ADR 0007)
    must_words: Annotated[list[GridWord], Field(max_length=50)] = Field(default_factory=list)
    wish_words: Annotated[list[GridWord], Field(max_length=500)] = Field(default_factory=list)
    # Réglage de moteur, désactivé par défaut : trier les candidats par fréquence donne des mots
    # plus courants mais fait échouer les plus grandes grilles plus souvent (mesures dans
    # backend/benchmarks/README.md). `None` : réglage du solveur.
    # Les valeurs doivent rester celles de engine.grid_solver.FREQUENCY_MODES (vérifié par un test).
    frequency_mode: Literal["none", "exact", "band", "known", "tiebreak"] | None = None
    # Moteur v2 (#209) : « best » garde la meilleure de plusieurs grilles dans le budget, « first » rend la
    # première trouvée. Absent : le réglage du serveur (GENERATION_QUALITY, « first » par défaut).
    quality: Literal["first", "best"] | None = None
    # Moteur v2 (#210) : « catalogue », une mise en page relevée dans un magazine, à l'identique (formats du
    # catalogue) ; « sur_mesure », une géométrie que le moteur dessine, dans tout format de 5 à 20 cases de côté
    # (bornes vérifiées dans la route, avec leur `reason`). Absent : le réglage du serveur (GENERATION_GEOMETRY,
    # « catalogue » par défaut).
    geometry: Literal["catalogue", "sur_mesure"] | None = None
    # Dictionnaires thématiques de l'auteur, versés au pool « souhaité » (ADR 0007). Plafond de
    # garde ; l'appartenance est vérifiée dans la route, qui répond 404 pour tout autre dictionnaire.
    wish_dictionary_ids: Annotated[list[Annotated[int, Field(ge=1)]], Field(max_length=10)] = Field(
        default_factory=list)
    # Mot mystère (#218) : ses lettres sont numérotées dans la grille produite. Il ne change rien à la génération.
    mystery_word: MysteryInput | None = None


class GridCell(ApiModel):
    x: Annotated[int, Field(ge=0, le=19)]
    y: Annotated[int, Field(ge=0, le=19)]
    # Une case noire (définition) n'a pas de lettre : la chaîne vide est normale
    char: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2)] = ""
    is_black: StrictBool = False


class GridPlacedWord(ApiModel):
    text: GridWord
    x: Annotated[int, Field(ge=0, le=19)]
    y: Annotated[int, Field(ge=0, le=19)]
    direction: Literal["across", "down"]
    source: Literal["must", "wish", "common"]


class MysteryCell(ApiModel):
    x: Annotated[int, Field(ge=0, le=19)]
    y: Annotated[int, Field(ge=0, le=19)]


class MysteryPayload(ApiModel):
    """Le mot mystère d'une grille produite (#218) : le mot, la seed de ses cases, une case par lettre dans l'ordre.

    Gardé tel que l'auteur l'a vu ; la route vérifie que chaque case porte bien sa lettre.
    """
    word: Annotated[str, StringConstraints(min_length=3, max_length=40, pattern=MYSTERY_WORD_PATTERN)]
    seed: Annotated[int, Field(ge=0, le=MAX_SEED)] | None = None
    cells: Annotated[list[MysteryCell], Field(min_length=3, max_length=20)]


class GridPayload(ApiModel):
    """La grille telle que `/api/grids/generate` l'a renvoyée, que l'on stocke sans la rejouer."""
    width: Annotated[int, Field(ge=2, le=20)]
    height: Annotated[int, Field(ge=2, le=20)]
    layout: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]
    seed: Annotated[int, Field(ge=0, le=MAX_SEED)] | None = None
    # 20 x 20 cases au plus, comme les bornes de largeur et de hauteur
    cells: Annotated[list[GridCell], Field(max_length=400)]
    words: Annotated[list[GridPlacedWord], Field(max_length=200)] = Field(default_factory=list)
    fill_ratio: Annotated[float, Field(ge=0, le=1)] = 0.0
    wish_ratio: Annotated[float, Field(ge=0, le=1)] = 0.0
    must_words: Annotated[list[GridWord], Field(max_length=50)] = Field(default_factory=list)
    # Rangé à part dans la grille conservée (colonne `mystery`), pas dans ses cases
    mystery: MysteryPayload | None = None


class BlankGridRequest(ApiModel):
    """Créer une grille à la main (roadmap, point 5B) : depuis un layout du catalogue, ou toute vide."""
    name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100, pattern=DICTIONARY_NAME_PATTERN)
    ] | None = None
    # L'un ou l'autre : un layout du catalogue (« 13x16-003 »), ou une taille libre de 4 à 20 cases
    layout: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\d{1,2}x\d{1,2}-\d{3}$")] | None = None
    width: Annotated[int, Field(ge=4, le=20)] | None = None
    height: Annotated[int, Field(ge=4, le=20)] | None = None

    @model_validator(mode="after")
    def one_source(self):
        if (self.layout is None) == (self.width is None or self.height is None):
            raise ValueError("donne soit un layout, soit une largeur et une hauteur")
        return self


class GeometryRequest(ApiModel):
    """Une géométrie de style magazine tirée au hasard, pour commencer une grille à la main (#221)."""
    width: Annotated[int, Field(ge=5, le=20)]
    height: Annotated[int, Field(ge=5, le=20)]
    # Sans seed, un tirage neuf ; avec, le même tirage (tests)
    seed: Annotated[int, Field(ge=0, le=2**31 - 1)] | None = None


class SaveGridRequest(ApiModel):
    """Conserver une grille produite. Sans nom, la route en compose un à partir du format et de la date."""
    name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100, pattern=DICTIONARY_NAME_PATTERN)
    ] | None = None
    grid: GridPayload


# Clé d'une définition : la **position** du mot et son sens — « 1-2-across ». Jamais son texte :
# une lettre corrigée à la main renomme le mot ([ADR 0012](../docs/adr/0012-grille-modifiable.md)).
DEFINITION_KEY_PATTERN = r"^\d{1,2}-\d{1,2}-(across|down)$"

DefinitionKey = Annotated[str, StringConstraints(strip_whitespace=True, pattern=DEFINITION_KEY_PATTERN)]
# Une définition de mots fléchés est courte par nature : elle doit tenir dans une demi-case
DefinitionText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]


class GridCellEdit(ApiModel):
    """Une lettre posée à la main. Le reste de la grille s'en déduit ([ADR 0012])."""
    x: Annotated[int, Field(ge=0, le=19)]
    y: Annotated[int, Field(ge=0, le=19)]
    # Une lettre majuscule sans accent — la forme dans laquelle le moteur travaille — ou **rien**,
    # pour effacer la case : un trou est un état de travail, pas une anomalie (ADR 0012).
    char: Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, pattern=r"^[A-Z]?$")]


class GridBlockEdit(ApiModel):
    """Une case lettre devenue case définition, ou l'inverse (roadmap, point 5A)."""
    x: Annotated[int, Field(ge=0, le=19)]
    y: Annotated[int, Field(ge=0, le=19)]
    is_black: StrictBool


class GridUpdateRequest(ApiModel):
    """Renommer une grille conservée, écrire ses définitions, ses notes, ou corriger ses lettres."""
    name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100, pattern=DICTIONARY_NAME_PATTERN)
    ] | None = None
    # Envoyées en bloc : l'écran connaît toujours l'état complet de la grille qu'il affiche
    definitions: Annotated[dict[DefinitionKey, DefinitionText], Field(max_length=200)] | None = None
    # Bloc-notes libre : ce que l'auteur garde à côté de la grille
    notes: Annotated[str, StringConstraints(max_length=5000)] | None = None
    archived: StrictBool | None = None
    # Lettres corrigées à la main : seules les cases changées sont envoyées
    cells: Annotated[list[GridCellEdit], Field(max_length=400)] | None = None
    # Cases définitions déplacées : appliquées avant les lettres de la même requête
    blocks: Annotated[list[GridBlockEdit], Field(max_length=400)] | None = None
    # Aperçu : la grille n'est pas enregistrée, on renvoie seulement ce que le changement ferait sortir
    # des conventions, pour que l'auteur confirme en connaissance de cause
    preview: StrictBool = False
    # Mot mystère (#218) : un mot le pose ou le change, la chaîne vide le retire. `mystery_seed` donne d'autres
    # cases au même mot ; sans elle, c'est la seed de la grille
    mystery_word: MysteryInput | None = None
    mystery_seed: Annotated[int, Field(ge=0, le=MAX_SEED)] | None = None


class SlotRef(ApiModel):
    """Un emplacement de la grille, désigné par son départ et son sens."""
    x: Annotated[int, Field(ge=0, le=19)]
    y: Annotated[int, Field(ge=0, le=19)]
    direction: Literal["across", "down"]
    # Garder les lettres déjà posées (on comble les trous) ou proposer de remplacer tout le mot
    keep_letters: StrictBool = True
    # Proposer des mots plus courts que l'emplacement, suivis d'une case définition (roadmap 5B)
    shorter: StrictBool = False


class DifficultyRequest(ApiModel):
    """Estimation de la difficulté d'une demande, sans générer : appelée à chaque frappe."""
    must_words: Annotated[list[GridWord], Field(max_length=50)] = Field(default_factory=list)
    # Facultatif : sans taille choisie, l'estimation agrège tous les formats
    size: GridSize | None = None
    # Sur mesure (#210), les taux du catalogue ne valent pas : l'estimation répond « pas encore mesuré »
    geometry: Literal["catalogue", "sur_mesure"] | None = None


# --- Conversion des erreurs ---

FIELD_LABELS = {
    "grid": "grille",
    "cells": "cases",
    "words": "mots",
    "layout": "mise en page",
    "definitions": "définitions",
    "notes": "notes",
    "archived": "archivée",
    "char": "lettre",
    "email": "e-mail",
    "password": "mot de passe",
    "token": "lien",
    "name": "nom",
    "is_active": "actif",
    "mot": "mot",
    "definition": "définition",
    "mask": "motif",
    "limit": "limite",
    "size": "taille",
    "width": "largeur",
    "height": "hauteur",
    "seed": "seed",
    "use_global": "dictionnaire commun",
    "must_words": "mots obligatoires",
    "wish_words": "mots souhaités",
    "frequency_mode": "tri par fréquence",
    "geometry": "type de grille",
    "wish_dictionary_ids": "dictionnaires thématiques",
    "mystery": "mot mystère",
    "mystery_word": "mot mystère",
    "mystery_seed": "cases du mot mystère",
}


def _field_label(location: tuple) -> str:
    names = [part for part in location if isinstance(part, str)]
    return FIELD_LABELS.get(names[-1], names[-1]) if names else "corps de la requête"


def _error_message(error: dict) -> str:
    """Traduit une erreur pydantic en message lisible, sans inclure la valeur reçue."""
    field = _field_label(error.get("loc", ()))
    context = error.get("ctx") or {}
    kind = error.get("type", "")

    if kind == "missing":
        return f"Le champ « {field} » est obligatoire."
    if kind == "string_too_short":
        return f"« {field} » doit contenir au moins {context.get('min_length')} caractère(s)."
    if kind == "string_too_long":
        return f"« {field} » doit contenir au plus {context.get('max_length')} caractères."
    if kind == "string_pattern_mismatch":
        return f"« {field} » contient des caractères non autorisés."
    if kind in ("int_parsing", "int_type", "int_from_float"):
        return f"« {field} » doit être un nombre entier."
    if kind == "greater_than_equal":
        return f"« {field} » doit être supérieur ou égal à {context.get('ge')}."
    if kind == "less_than_equal":
        return f"« {field} » doit être inférieur ou égal à {context.get('le')}."
    if kind in ("bool_type", "bool_parsing"):
        return f"« {field} » doit valoir vrai ou faux."
    if kind == "string_type":
        return f"« {field} » doit être un texte."
    if kind in ("model_type", "model_attributes_type", "dict_type"):
        return f"« {field} » doit être un objet."
    return f"« {field} » n'est pas valide."


T = TypeVar("T", bound=BaseModel)


def parse_body(model: type[T]) -> T:
    """Valide le corps JSON de la requête courante avec le schéma donné."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise RequestValidationError("Le corps de la requête doit être un objet JSON.")
    try:
        return model.model_validate(data)
    except ValidationError as exc:
        errors = exc.errors(include_url=False, include_input=False)
        details = [
            {"field": ".".join(str(part) for part in err["loc"]), "message": _error_message(err)}
            for err in errors
        ]
        raise RequestValidationError(details[0]["message"], details) from None
