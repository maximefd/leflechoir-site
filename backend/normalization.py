"""Une seule normalisation des mots pour tout le site (#127), par langue (ADR 0031).

Le lexique, la recherche, les mots imposés et souhaités, les dictionnaires personnels et les suggestions
passent par ici : « porte-monnaie », « PORTEMONNAIE » et « Porte monnaie » sont le même mot, comme « cœur »
et « COEUR ». Majuscules, sans accents, ligatures décomposées (Œ → OE, Æ → AE), sans tiret, apostrophe ni
espace. `tools/lexicon/normalize.py` en garde une copie, qu'un test tient identique.

Chaque langue dit ses **lettres spéciales**, réécrites avant d'ôter les accents (l'allemand des grilles écrit
Ä → AE, Ö → OE, Ü → UE, ß → SS), et ses **lettres propres**, gardées telles quelles parce qu'elles sont des lettres
de la grille à part entière (aucune pour le français, l'allemand et l'anglais ; le Å suédois ou le Ñ espagnol le
jour où ces langues viendront). Une API sert une seule langue, celle de son site : `definir_langue` la fixe au
démarrage (`app.py`), et chaque fonction en accepte une autre en paramètre.
"""

import unicodedata

# Ligatures que la décomposition Unicode ne sépare pas, et la capitale ẞ (« ß ».upper() donne déjà « SS »)
LIGATURES = {"Œ": "OE", "Æ": "AE", "ẞ": "SS"}
LETTRES_SPECIALES = {
    "fr": LIGATURES,
    "de": {**LIGATURES, "Ä": "AE", "Ö": "OE", "Ü": "UE"},
    "en": LIGATURES,
}
LETTRES_PROPRES = {"fr": "", "de": "", "en": ""}
LANGUES = tuple(LETTRES_SPECIALES)

_langue = "fr"


def definir_langue(lang: str) -> None:
    """La langue du site servi par ce processus (un site = une langue = une API, ADR 0031)."""
    global _langue
    if lang not in LETTRES_SPECIALES:
        raise ValueError(f"Langue inconnue : « {lang} ». Langues connues : {', '.join(LANGUES)}.")
    _langue = lang


def _letters(text: str, keep: str = "", lang: str | None = None) -> str:
    lang = lang or _langue
    propres = LETTRES_PROPRES[lang]
    upper = text.upper().translate(str.maketrans(LETTRES_SPECIALES[lang]))
    out = []
    for char in upper:
        if char in propres:
            out.append(char)
            continue
        out.extend(c for c in unicodedata.normalize("NFD", char)
                   if unicodedata.category(c) != "Mn" and (c.isalnum() or c in keep))
    return "".join(out)


def normalize_word(text, lang: str | None = None) -> str:
    """La forme d'un mot dans les grilles : « l'été » → « LETE », « cœur » → « COEUR », « Größe » (de) → « GROESSE »."""
    return _letters(text, lang=lang) if isinstance(text, str) else ""


def normalize_pattern(text, lang: str | None = None) -> str:
    """Un motif de recherche : comme un mot, en gardant les cases inconnues `?`."""
    return _letters(text, keep="?", lang=lang) if isinstance(text, str) else ""


def normalize_phrase(text, lang: str | None = None) -> str:
    """Plusieurs mots, chacun normalisé comme un mot, séparés par une espace : « Joyeux Noël » → « JOYEUX NOEL ».

    Pour le mot mystère (#218), qui peut être un message : sous la grille, sa rangée de cases laisse un blanc
    entre deux mots. Le tiret et l'apostrophe, eux, disparaissent comme ailleurs (« Jean-Paul » → « JEANPAUL »).
    """
    if not isinstance(text, str):
        return ""
    return " ".join(word for word in (normalize_word(part, lang) for part in text.split()) if word)
