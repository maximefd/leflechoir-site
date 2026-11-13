"""La rubrique « API » du poste de pilotage et du bilan du lundi ([ADR 0032](../docs/adr/0032-api-ouverte.md), point 10).

Rien de neuf n'est mesuré pour elle : elle relit les événements que l'API écrit déjà (usage.py).
- Une demande de grille refusée à l'arrivée (quota, API fermée, requête invalide) : un événement `generation` sur
  `/v1/grids`, écrit par la requête, avec son code `reason` pour issue.
- Une demande acceptée : le même événement, écrit par le processus de génération à sa fin
  (`record_background_generation`), avec l'attente dans la file (`queued_ms`).
- Les deux portent la voie (`client` : `api` ou `mcp`, le connecteur), l'assistant d'un appel relayé et `keyed`.
- Les arrivées par le lien préparé : les pages vues qui portent `utm_source`, la seule partie d'adresse gardée.
- Les clés : la table `api_key`, commune à tous les sites ; on n'en lit que des comptes.
"""

from collections import Counter
from datetime import datetime, timedelta, timezone

from flask import current_app

from models import ApiKey, UsageEvent
from stats import ENGINE_OUTCOMES, PERIODS, _percentile

ROUTE = "/v1/grids"
WAYS = ("mcp", "api")
# Ce qui refuse une demande valable faute de droits du moment : quotas, débit, répétitions, file pleine
QUOTA = ("quota_minute", "quota_day", "quota_words", "quota_global", "rate_limited", "repeated_settings",
         "generation_in_progress", "busy")
# L'API fermée ou en pause : interrupteur, disjoncteur, langue absente
CLOSED = ("api_disabled", "api_paused", "lang_unavailable")
DAILY_DAYS = 30


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _category(outcome: str | None) -> str:
    """grid, failure (le moteur n'a pas trouvé), quota, closed, invalid (requête refusée telle qu'écrite)."""
    if outcome == "grid":
        return "grid"
    if outcome in ENGINE_OUTCOMES or outcome == "internal_error":
        return "failure"
    if outcome in QUOTA:
        return "quota"
    if outcome in CLOSED:
        return "closed"
    return "invalid"


def _figures(requests: list[UsageEvent], links: list[UsageEvent]) -> dict:
    categories = Counter(_category(event.outcome) for event in requests)
    grids = [event for event in requests if event.outcome == "grid"]
    attempted = categories["grid"] + categories["failure"]
    queued = [event.data["queued_ms"] for event in grids if isinstance(event.data.get("queued_ms"), int)]
    return {
        "requests": len(requests),
        "grids": len(grids),
        # La réussite du moteur : sur les demandes qui lui sont parvenues, hors refus
        "success": categories["grid"] / attempted if attempted else None,
        "failures": categories["failure"],
        "quota": categories["quota"],
        "closed": categories["closed"],
        "invalid": categories["invalid"],
        "mcp": sum(1 for event in grids if event.data.get("client") == "mcp"),
        "http": sum(1 for event in grids if event.data.get("client") != "mcp"),
        "keyed": sum(1 for event in grids if event.data.get("keyed")),
        "queue_p95_ms": _percentile(queued, 0.95),
        "duration_p95_ms": _percentile([event.duration_ms for event in grids if event.duration_ms is not None], 0.95),
        "link_views": len(links),
    }


def _assistant(event: UsageEvent) -> str:
    """« claude », « chatgpt »… ; « lechat? » : le nom que se donne un appelant d'une adresse non publiée."""
    if event.data.get("client") != "mcp":
        return "api"
    return event.data.get("assistant") or "inconnu"


def _keys(now: datetime) -> dict:
    keys = ApiKey.query.with_entities(ApiKey.created_at, ApiKey.last_used_at, ApiKey.revoked_at).all()
    active = [key for key in keys if key.revoked_at is None]
    return {
        "active": len(active),
        "revoked": len(keys) - len(active),
        "created_30d": sum(1 for key in keys if key.created_at >= now - timedelta(days=30)),
        "used_7d": sum(1 for key in active if key.last_used_at and key.last_used_at >= now - timedelta(days=7)),
    }


def _events(since: datetime, site: str) -> tuple[list[UsageEvent], list[UsageEvent]]:
    """Les demandes de grille de l'API et les pages vues venues d'un lien d'assistant, depuis `since`."""
    base = UsageEvent.query.filter(UsageEvent.site == site, UsageEvent.created_at >= since)
    requests = base.filter(UsageEvent.kind == "generation", UsageEvent.route == ROUTE).all()
    pages = base.filter(UsageEvent.kind == "page", UsageEvent.outcome == "view").all()
    return requests, [event for event in pages if event.data.get("source")]


def summary(now: datetime | None = None) -> dict:
    """Aujourd'hui, 7 et 30 jours ; puis, sur 30 jours : jour par jour, assistants, issues, formats, sources, clés."""
    now = now or _utcnow()
    site = current_app.config["SITE"]
    since = now - timedelta(days=DAILY_DAYS)
    requests, links = _events(since, site)
    start_of_today = datetime.combine(now.date(), datetime.min.time())

    periods = []
    for label, days in PERIODS:
        start = start_of_today if days == 1 else now - timedelta(days=days)
        periods.append({"label": label, "days": days,
                        **_figures([e for e in requests if e.created_at >= start],
                                   [e for e in links if e.created_at >= start])})

    daily = []
    for offset in range(DAILY_DAYS - 1, -1, -1):
        day = (now - timedelta(days=offset)).date()
        grids = [e for e in requests if e.created_at.date() == day and e.outcome == "grid"]
        daily.append({"day": day.isoformat(),
                      "mcp": sum(1 for e in grids if e.data.get("client") == "mcp"),
                      "http": sum(1 for e in grids if e.data.get("client") != "mcp"),
                      "refused": sum(1 for e in requests if e.created_at.date() == day
                                     and _category(e.outcome) in ("quota", "closed"))})

    assistants: dict[str, Counter] = {}
    for event in requests:
        assistants.setdefault(_assistant(event), Counter())[_category(event.outcome)] += 1
    formats = Counter(e.data.get("format", "?") for e in requests if e.outcome == "grid")

    return {
        "periods": periods,
        "daily": daily,
        "assistants": [{"assistant": name, "requests": sum(counter.values()), "grids": counter["grid"]}
                       for name, counter in sorted(assistants.items(), key=lambda item: -sum(item[1].values()))],
        "outcomes": [{"outcome": outcome or "?", "category": _category(outcome), "count": count}
                     for outcome, count in Counter(e.outcome for e in requests).most_common()],
        "formats": [{"format": name, "grids": count} for name, count in formats.most_common(10)],
        "sources": [{"source": source, "views": count}
                    for source, count in Counter(e.data["source"] for e in links).most_common(10)],
        "keys": _keys(now),
    }


def _ms(value: float | None) -> str:
    return "—" if value is None else f"{value / 1000:.1f} s".replace(".", ",")


def render_week(now: datetime) -> list[str]:
    """Le paragraphe « API » du bilan du lundi : les sept derniers jours à côté des sept précédents."""
    site = current_app.config["SITE"]
    requests, links = _events(now - timedelta(days=14), site)
    cut = now - timedelta(days=7)
    week = _figures([e for e in requests if e.created_at >= cut], [e for e in links if e.created_at >= cut])
    before = _figures([e for e in requests if e.created_at < cut], [e for e in links if e.created_at < cut])
    keys = _keys(now)

    def line(label, key, fmt=str):
        return f"{label:<28} {fmt(week[key]):>10}   (semaine précédente : {fmt(before[key])})"

    def rate(value):
        return "—" if value is None else f"{100 * value:.0f} %"

    return [
        "API ouverte (ADR 0032) :",
        line("Demandes de grille", "requests"),
        line("  grilles rendues", "grids"),
        line("  par le connecteur", "mcp"),
        line("  par l'API HTTP", "http"),
        line("  avec une clé", "keyed"),
        line("  réussite du moteur", "success", rate),
        line("  refus (quotas)", "quota"),
        line("  refus (API fermée)", "closed"),
        line("  attente p95 dans la file", "queue_p95_ms", _ms),
        line("Arrivées par un lien d'IA", "link_views"),
        f"Clés : {keys['active']} actives, {keys['used_7d']} servies cette semaine, "
        f"{keys['created_30d']} créées en 30 jours.",
    ]
