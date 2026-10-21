"""« Le sens des mots » (ADR 0028) : le sens d'un mot tiré du Wiktionnaire, affiché à côté des grilles.

- **Jamais une définition de case** : ni dans la grille, ni dans le PDF, ni dans les définitions proposées. Ces
  textes sont sous CC BY-SA 4.0 ; ils restent dans ce module et sa route, sans champ commun avec les définitions.
- Le fichier `sens.sqlite` est construit sur le Mac (`make lexicon-sens`) et envoyé avec le lexique
  (`make deploy-lexicon`). On l'ouvre en lecture seule à chaque requête : rien n'est chargé en mémoire.
- Absent (développement sans lexique, serveur avant le premier envoi) : la route répond `senses_unavailable` et
  le site n'affiche simplement aucun sens.
"""

import logging
import sqlite3
from pathlib import Path

from flask import Blueprint, current_app, jsonify

from normalization import normalize_word
from schemas import SensRequest, parse_body

sens_bp = Blueprint("sens", __name__, url_prefix="/api/sens")
logger = logging.getLogger(__name__)

# Une grande grille compte une centaine de mots ; une recherche en renvoie 200 au plus
MAX_SENS_WORDS = 200
SOURCE = "Wiktionnaire"
LICENCE = "CC BY-SA 4.0"
# Le fichier ne change qu'avec le lexique : le navigateur peut le garder une journée
CACHE_SECONDS = 86_400


def sens_path(config) -> Path | None:
    """`SENS_PATH`, sinon `sens.sqlite` à côté du lexique curé (LEXICON_PATH)."""
    if config.get("SENS_PATH"):
        return Path(config["SENS_PATH"])
    if config.get("LEXICON_PATH"):
        return Path(config["LEXICON_PATH"]).with_name("sens.sqlite")
    return None


def lookup(words, path: Path | None, lang: str) -> dict[str, dict] | None:
    """Mot normalisé -> {"lemme", "textes"} ; None si le fichier des sens est absent ou illisible."""
    if path is None or not path.is_file():
        return None
    wanted = sorted({normalize_word(word) for word in words} - {""})
    if not wanted:
        return {}
    marks = ",".join("?" * len(wanted))
    try:
        connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            rows = connection.execute(
                f"""SELECT f.norm, s.lemme, s.texte FROM formes f
                    JOIN sens s ON s.lang = f.lang AND s.lemme_norm = f.lemme_norm AND s.cle = f.cle
                    WHERE f.lang = ? AND f.norm IN ({marks}) ORDER BY f.norm, s.rang""",
                [lang, *wanted],
            ).fetchall()
        finally:
            connection.close()
    except sqlite3.Error:
        logger.exception("Fichier des sens illisible : %s", path)
        return None
    found: dict[str, dict] = {}
    for norm, lemme, texte in rows:
        found.setdefault(norm, {"lemme": lemme, "textes": []})["textes"].append(texte)
    return found


def lookup_for_app(words) -> dict[str, dict] | None:
    return lookup(words, sens_path(current_app.config), current_app.config["SITE_LANG"])


@sens_bp.post("")
def senses():
    payload = parse_body(SensRequest)
    if len(payload.mots) > MAX_SENS_WORDS:
        return jsonify({"error": f"{MAX_SENS_WORDS} mots au plus par demande.", "reason": "too_many_words"}), 400
    found = lookup_for_app(payload.mots)
    if found is None:
        return jsonify({"error": "Le sens des mots n'est pas disponible pour le moment.",
                        "reason": "senses_unavailable"}), 503
    response = jsonify({"sens": found, "source": SOURCE, "licence": LICENCE})
    response.headers["Cache-Control"] = f"public, max-age={CACHE_SECONDS}"
    return response
