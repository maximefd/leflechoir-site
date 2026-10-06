"""Une seule normalisation des mots pour tout le site (#127).

Le lexique, la recherche, les mots imposés et souhaités, les dictionnaires personnels et les suggestions
passent par ici : « porte-monnaie », « PORTEMONNAIE » et « Porte monnaie » sont le même mot, comme « cœur »
et « COEUR ». Majuscules, sans accents, ligatures décomposées (Œ → OE, Æ → AE), sans tiret, apostrophe ni
espace. `tools/lexicon/normalize.py` en garde une copie, qu'un test tient identique.
"""

import unicodedata

# Ligatures que la décomposition Unicode ne sépare pas
LIGATURES = str.maketrans({"Œ": "OE", "Æ": "AE"})


def _letters(text: str, keep: str = "") -> str:
    upper = text.upper().translate(LIGATURES)
    return "".join(
        c for c in unicodedata.normalize("NFD", upper)
        if unicodedata.category(c) != "Mn" and (c.isalnum() or c in keep)
    )


def normalize_word(text) -> str:
    """La forme d'un mot dans les grilles : « l'été » → « LETE », « cœur » → « COEUR »."""
    return _letters(text) if isinstance(text, str) else ""


def normalize_pattern(text) -> str:
    """Un motif de recherche : comme un mot, en gardant les cases inconnues `?`."""
    return _letters(text, keep="?") if isinstance(text, str) else ""


def normalize_phrase(text) -> str:
    """Plusieurs mots, chacun normalisé comme un mot, séparés par une espace : « Joyeux Noël » → « JOYEUX NOEL ».

    Pour le mot mystère (#218), qui peut être un message : sous la grille, sa rangée de cases laisse un blanc
    entre deux mots. Le tiret et l'apostrophe, eux, disparaissent comme ailleurs (« Jean-Paul » → « JEANPAUL »).
    """
    if not isinstance(text, str):
        return ""
    return " ".join(word for word in (normalize_word(part) for part in text.split()) if word)
