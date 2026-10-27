"""La langue et le site servis par cette API (ADR 0017, ADR 0031) : un site = une langue = une API.

`SITE` et `SITE_LANG` viennent de la configuration (`app.py`) ; le client ne choisit jamais la langue. Le moteur,
pur, reçoit la langue en paramètre (`engine/langues.py`) ; les réponses la portent, avec le site, pour que les
clients de l'API (le site, les assistants IA) sachent ce qu'ils ont reçu.
"""

from flask import current_app

from engine.langues import Langue, langue


def langue_du_site() -> Langue:
    return langue(current_app.config["SITE_LANG"])


def du_site(body: dict) -> dict:
    """La réponse, avec la langue et le site qui l'ont produite."""
    return {**body, "lang": current_app.config["SITE_LANG"], "site": current_app.config["SITE"]}
