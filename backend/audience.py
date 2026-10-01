"""Mesure d'audience sans cookie : pages vues, temps passé, exports PDF ([ADR 0016](../docs/adr/0016-mesure-d-usage-sans-cookie.md), point 3, #130).

Le navigateur envoie une balise (frontend/src/lib/audience.ts) quand une page se quitte. Elle respecte les
conditions d'exemption de la CNIL :

- **statistiques anonymes** : le chemin sans paramètres, le nom d'hôte seul du référent, la langue principale du
  navigateur, la durée pendant laquelle la page a été visible. Aucun identifiant de compte (la balise ne porte pas
  de cookie), jamais l'adresse IP : le visiteur est l'empreinte du jour, comme pour les autres événements ;
- **opposition** : le navigateur n'envoie rien si le visiteur a refusé (lien de la page confidentialité) ou si
  `Global Privacy Control` est actif. Ici, en second rempart, une requête qui porte `Sec-GPC: 1` est oubliée ;
- **robots écartés** : un agent utilisateur de robot est oublié ;
- l'opposition ne coupe que cette balise, pas la mesure des recherches et des générations (décision du 01/10/2026).

Un événement `page` de plus dans `usage_event` : mêmes durées de conservation (13 mois), mêmes purges. La réponse
est vide (204), et une requête oubliée reçoit la même réponse : rien n'indique à un robot qu'il a été écarté.
"""

import re

from flask import Blueprint, request

import usage
from schemas import AudienceRequest, parse_body

audience_bp = Blueprint("audience", __name__, url_prefix="/api/audience")

# Les navigateurs automatisés et les robots d'indexation ne sont pas des lecteurs
ROBOT_AGENT = re.compile(r"bot|crawl|spider|slurp|headless|phantom|lighthouse|preview|fetch|monitor|scrap",
                         re.IGNORECASE)

# Les moteurs de réponse IA, à part : de quoi suivre la visibilité dans ChatGPT, Perplexity ou Copilot (#134)
AI_ENGINES = ("chatgpt.com", "chat.openai.com", "perplexity.ai", "copilot.microsoft.com", "gemini.google.com",
              "claude.ai", "you.com", "phind.com", "mistral.ai", "chat.mistral.ai")
SEARCH_ENGINES = ("google.", "bing.", "duckduckgo.", "qwant.", "ecosia.", "yahoo.", "brave.", "startpage.")


def source_kind(referrer: str) -> str:
    """Le genre de source d'une visite : accès direct, moteur de réponse IA, moteur de recherche, autre site."""
    host = referrer.lower().removeprefix("www.")
    if not host:
        return "direct"
    if host in AI_ENGINES or any(host.endswith("." + engine) for engine in AI_ENGINES):
        return "ai"
    if any(host.startswith(engine) or ("." + engine) in host for engine in SEARCH_ENGINES):
        return "search"
    return "other"


def _declined() -> bool:
    """Opposition par Global Privacy Control, ou robot : la balise est oubliée sans un mot."""
    if request.headers.get("Sec-GPC", "").strip() == "1":
        return True
    return bool(ROBOT_AGENT.search(request.headers.get("User-Agent", "")))


@audience_bp.post("")
def beacon():
    """Une page vue : le chemin, d'où l'on vient, la langue du navigateur, le temps où elle est restée visible."""
    payload = parse_body(AudienceRequest)
    if not _declined():
        primary = payload.lang.split("-")[0].lower()[:3]
        usage.describe("page", payload.kind, data={
            "path": payload.path.rstrip("/") or "/",
            "referrer": payload.referrer.lower().removeprefix("www."),
            "browser_lang": primary,
            "visible_ms": payload.visible_ms,
        })
    return "", 204
