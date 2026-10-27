"""Le texte des articles, repris et relu par l'auteur dans la page même (ADR 0027).

- `GET /api/articles/<slug>/texte` : le texte éditable — titre, chapeau, description, sections et paragraphes.
- `PUT /api/articles/<slug>/texte` : le réécrit dans `frontend/src/content/articles/textes/<slug>.json`.
  Le dépôt reste la seule vérité : l'auteur relit le diff et committe, rien ne part en production sans lui.
- `GET`/`PUT /api/articles/<slug>/notes` : les annotations de relecture de l'auteur, une par section (ancre
  stable) plus une pour l'article entier. Elles vivent dans `data/annotations/`, hors du site publié : jamais
  dans le paquet du navigateur, exclues du dépôt public (prive.txt) — des notes de travail, pas du contenu.
- Ouvert en développement sans compte (retour de l'auteur du 07/10/2026 : un rôle d'administrateur n'y ajoute
  rien), fermé partout ailleurs : il faut `TEXTES_DIR` monté — seul le conteneur de développement monte ce
  dossier du dépôt (docker-compose.yml) — et un `APP_ENV` autre que `production`. En production, l'adresse
  répond 404, comme si elle n'existait pas ; le git reste le filet : rien n'est commité sans relecture du diff.
- Seuls les articles existants se rééditent : pas de création depuis le téléphone, pas de traversée de chemin.
  Un nouvel article reste un fichier que l'agent écrit, et que l'auteur reprend ensuite dans la page.
"""

import json
import logging
import os
import re
import tempfile
from pathlib import Path
from typing import Annotated

from flask import Blueprint, abort, current_app, jsonify, request
from pydantic import Field, StringConstraints

from schemas import ApiModel, RequestValidationError, parse_body

logger = logging.getLogger(__name__)

texte_bp = Blueprint("article_texte", __name__, url_prefix="/api/articles")

# Un slug d'article : minuscules, chiffres, tirets (celui du fichier TSX correspondant)
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")

# La clé de la note qui regarde l'article entier, pas une section en particulier
NOTE_ARTICLE = "_article"


class SectionTexte(ApiModel):
    id: Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", min_length=1, max_length=80)]
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    paragraphs: list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]] = \
        Field(min_length=1, max_length=40)


class ArticleTexte(ApiModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    description: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=400)]
    chapo: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=800)]
    sections: list[SectionTexte] = Field(min_length=1, max_length=20)


class NotesArticle(ApiModel):
    """Les annotations de l'auteur : une par section (ou `_article` pour l'ensemble), gardées hors du site."""
    notes: dict[str, Annotated[str, StringConstraints(strip_whitespace=True, max_length=4000)]] = \
        Field(default_factory=dict, max_length=40)


@texte_bp.before_request
def developpement_seul():
    """En production, le 404 d'une adresse inconnue, même si un dossier était monté par erreur."""
    if current_app.config.get("APP_ENV") == "production":
        logger.warning("Édition des textes refusée en production : %s %s", request.method, request.path)
        abort(404)


def _dossier() -> Path | None:
    """Le dossier des textes, monté par le conteneur de développement ; `None` si l'édition est fermée."""
    brut = current_app.config.get("TEXTES_DIR")
    dossier = Path(brut) if brut else None
    return dossier if dossier and dossier.is_dir() else None


def _fichier(slug: str) -> tuple[Path | None, tuple | None]:
    """Le fichier texte d'un slug, ou la réponse d'erreur : édition fermée, slug inconnu ou malveillant."""
    if _dossier() is None:
        return None, (jsonify({"error": "La modification des textes n'est pas disponible ici.", "reason": "edition_unavailable"}), 404)
    if not SLUG.fullmatch(slug) or len(slug) > 80:
        return None, (jsonify({"error": "Article inconnu.", "reason": "unknown_article"}), 404)
    chemin = _dossier() / f"{slug}.json"
    if not chemin.is_file():
        return None, (jsonify({"error": "Article inconnu.", "reason": "unknown_article"}), 404)
    return chemin, None


def _fichier_notes(slug: str) -> tuple[Path | None, tuple | None]:
    """Le fichier de notes d'un slug (créé à la première note), ou l'erreur : édition fermée ou article inconnu.

    L'article doit exister côté textes (`TEXTES_DIR`) ; les notes s'écrivent de leur côté (`NOTES_DIR`).
    """
    if _dossier() is None:
        return None, (jsonify({"error": "La modification des textes n'est pas disponible ici.", "reason": "edition_unavailable"}), 404)
    brut = current_app.config.get("NOTES_DIR")
    dossier_notes = Path(brut) if brut else None
    if dossier_notes is None or not dossier_notes.is_dir():
        return None, (jsonify({"error": "La modification des textes n'est pas disponible ici.", "reason": "edition_unavailable"}), 404)
    if not SLUG.fullmatch(slug) or len(slug) > 80 or not (_dossier() / f"{slug}.json").is_file():
        return None, (jsonify({"error": "Article inconnu.", "reason": "unknown_article"}), 404)
    return dossier_notes / f"{slug}.json", None


@texte_bp.get("/<slug>/texte")
def lire_texte(slug: str):
    chemin, erreur = _fichier(slug)
    if erreur:
        return erreur
    texte = json.loads(chemin.read_text(encoding="utf-8"))
    return jsonify({"slug": slug, "texte": texte})


@texte_bp.put("/<slug>/texte")
def ecrire_texte(slug: str):
    chemin, erreur = _fichier(slug)
    if erreur:
        return erreur
    texte = parse_body(ArticleTexte)
    identifiants = [section.id for section in texte.sections]
    if len(set(identifiants)) != len(identifiants):
        raise RequestValidationError("Deux sections portent le même identifiant d’ancre.")
    # Écriture atomique : un fichier complet, jamais à moitié réécrit si le conteneur s'arrête en route
    _ecrit(chemin, json.dumps(texte.model_dump(), ensure_ascii=False, indent=2) + "\n")
    logger.info("Texte d'article réécrit : %s (%d sections)", slug, len(texte.sections))
    return jsonify({"slug": slug, "ok": True})


def _ecrit(chemin: Path, contenu: str) -> None:
    """Écriture atomique : un fichier complet, jamais à moitié réécrit si le conteneur s'arrête en route."""
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=chemin.parent, delete=False) as ephémère:
        ephémère.write(contenu)
    os.replace(ephémère.name, chemin)


@texte_bp.get("/<slug>/notes")
def lire_notes(slug: str):
    chemin, erreur = _fichier_notes(slug)
    if erreur:
        return erreur
    notes: dict[str, str] = {}
    if chemin.is_file():
        notes = json.loads(chemin.read_text(encoding="utf-8")).get("notes", {})
    return jsonify({"slug": slug, "notes": notes})


@texte_bp.put("/<slug>/notes")
def ecrire_notes(slug: str):
    chemin, erreur = _fichier_notes(slug)
    if erreur:
        return erreur
    corps = parse_body(NotesArticle)
    for cle in corps.notes:
        if cle != NOTE_ARTICLE and not SLUG.fullmatch(cle):
            raise RequestValidationError("Une note s’accroche à l’identifiant d’une section de l’article.")
    # Une note vidée disparaît : c'est le geste d'effacement. Plus rien à noter ? plus de fichier.
    notes = {cle: texte for cle, texte in corps.notes.items() if texte}
    if notes:
        _ecrit(chemin, json.dumps({"notes": notes}, ensure_ascii=False, indent=2) + "\n")
    else:
        chemin.unlink(missing_ok=True)
    logger.info("Notes d'article réécrites : %s (%d)", slug, len(notes))
    return jsonify({"slug": slug, "ok": True})
