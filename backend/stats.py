"""`flask stats` : ce que disent les événements d'usage ([ADR 0016](../docs/adr/0016-mesure-d-usage-sans-cookie.md)).

Lu sur le serveur, en attendant le poste de pilotage (Phase 8). Chaque question de l'ADR a sa réponse ici,
sauf le temps passé, qui attend la balise du navigateur :
- combien de visiteurs, de recherches, de générations, de comptes et de grilles conservées ;
- quelles générations réussissent, dans quels formats, avec combien de mots imposés ;
- combien de refus « occupé » ou de rate limiting, face aux seuils de l'ADR 0013 ;
- quel temps CPU les générations consomment ;
- quelles erreurs, sur quelles routes ;
- quels mots imposés manquent au lexique (pour la curation).

Les visiteurs se comptent par jour : une empreinte change chaque jour (usage.py). Sur 7 ou 30 jours, le
chiffre est la somme des visiteurs de chaque jour, et non un nombre de personnes distinctes.

Le poste de pilotage (`as_json`, #129) y ajoute, toujours sur les événements déjà collectés : l'évolution par
jour, le parcours, les issues par format et selon les mots imposés, et les seuils en trois états.
"""

import os
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

import click
from flask import current_app
from flask.cli import AppGroup

from models import UsageEvent
import usage
import usage_demo

PERIODS = (("Aujourd'hui", 1), ("7 jours", 7), ("30 jours", 30))
BUSY = ("busy_visitor", "busy_server")
# Seuils de l'ADR 0013 : au-delà, passer au VPS-2
P95_THRESHOLD_S = 15
BUSY_THRESHOLD = 0.05
# L'ADR ne donne qu'un seuil : l'indicateur passe à l'orange à partir de cette part du seuil, au rouge au-delà
NEAR_SHARE = 0.8

# --- Tableaux du poste de pilotage (#129) : tous sur 30 jours, calculés sur les événements déjà collectés ---
DAILY_DAYS = 30
REFUSALS = (*BUSY, "rate_limited")
# Issues d'une demande arrivée jusqu'au générateur ; le reste (500, format inconnu…) est rangé dans « other »
ENGINE_OUTCOMES = ("grid", "timeout", "must_words", "must_words_unplaced", "no_solution")
MUST_COUNT_CAP = 5  # « 5 et plus »
MATRIX_COUNT_CAP = 3  # « 3 et plus » : au-delà, les cases du croisement seraient presque vides
# Longueur du plus long mot imposé : c'est elle qui pèse sur la réussite, plus que le nombre (#73)
LENGTH_BANDS = ((4, "2 à 4"), (6, "5 à 6"), (8, "7 à 8"), (10, "9 à 10"), (None, "11 et plus"))
FUNNEL_STEPS = ("visits", "active", "searched", "generated", "grid", "registered", "saved")


def _percentile(values: list[int], share: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(share * len(ordered)))]


def _rate(part: int, whole: int) -> str:
    return f"{100 * part / whole:.0f} %" if whole else "—"


def _level(value: float | None, limit: float) -> str:
    """Un seuil en trois états : « ok », « near » dès 80 % du seuil, « over » au-delà ; « unknown » sans mesure."""
    if value is None:
        return "unknown"
    if value > limit:
        return "over"
    return "near" if value >= NEAR_SHARE * limit else "ok"


def _length_band(length: int) -> str:
    return next(label for limit, label in LENGTH_BANDS if limit is None or length <= limit)


def _engine_outcome(outcome: str | None) -> str:
    return outcome if outcome in ENGINE_OUTCOMES else "other"


def _funnel(events: list[UsageEvent]) -> dict:
    """Le parcours, en visiteurs d'un jour : visite → recherche ou génération → grille → compte → grille conservée.

    Une empreinte ne vit qu'un jour (usage.py) : qui génère lundi et s'inscrit mardi compte une fois à chaque
    étape, deux jours différents. Une « visite » est une empreinte qui a produit au moins un événement : qui ne
    fait que lire une page n'est pas vu avant la balise (#130). Les étapes ne sont pas strictement emboîtées :
    un compte déjà créé conserve une grille sans repasser par l'inscription.
    """
    steps: dict[str, set] = {step: set() for step in FUNNEL_STEPS}
    for event in events:
        if not event.visitor:
            continue
        visit = (event.created_at.date(), event.visitor)
        steps["visits"].add(visit)
        if event.kind == "search":
            steps["searched"].add(visit)
        elif event.kind == "generation":
            steps["generated"].add(visit)
            if event.outcome == "grid":
                steps["grid"].add(visit)
        elif event.kind == "account" and event.outcome == "register":
            steps["registered"].add(visit)
        elif event.kind == "grid":
            steps["saved"].add(visit)
    steps["active"] = steps["searched"] | steps["generated"]
    return {step: len(visits) for step, visits in steps.items()}


def _daily(events: list[UsageEvent], now: datetime) -> list[dict]:
    """Un jour par ligne (UTC), du plus ancien à aujourd'hui, jours sans événement compris."""
    days = [now.date() - timedelta(days=offset) for offset in range(DAILY_DAYS - 1, -1, -1)]
    counters: dict = {day: Counter() for day in days}
    visitors: dict = {day: set() for day in days}
    durations: dict = {day: [] for day in days}
    for event in events:
        day = event.created_at.date()
        if day not in counters:
            continue
        count = counters[day]
        if event.visitor:
            visitors[day].add(event.visitor)
        if event.kind == "search":
            count["searches"] += 1
        elif event.kind == "generation":
            count["generations"] += 1
            if event.outcome == "grid":
                count["grids"] += 1
                if event.duration_ms is not None:
                    durations[day].append(event.duration_ms)
            elif event.outcome in BUSY:
                count["busy"] += 1
        elif event.kind == "account" and event.outcome == "register":
            count["registers"] += 1
        elif event.kind == "grid":
            count["saved"] += 1
        if event.status >= 400:
            count["errors"] += 1
        if event.status >= 500:
            count["server_errors"] += 1
    keys = ("searches", "generations", "grids", "busy", "registers", "saved", "errors", "server_errors")
    return [{"day": day.isoformat(), "visitors": len(visitors[day]), **{key: counters[day][key] for key in keys},
             "p95": _percentile(durations[day], 0.95)} for day in days]


def _generation_tables(generations: list[UsageEvent]) -> dict:
    """Ce que deviennent les demandes, par format et selon les mots imposés (de quoi nourrir #73).

    Seules comptent les demandes arrivées jusqu'à la vue (elles portent leur format) : une requête invalide
    ou refusée par la limite de débit n'apprend rien sur le générateur. Les refus « occupé » sont comptés à
    part, hors du taux de réussite.
    """
    formats: dict[str, dict] = defaultdict(lambda: {"outcomes": Counter(), "refused": 0, "durations": []})
    must_counts: dict[int, Counter] = defaultdict(Counter)
    must_lengths: dict[str, Counter] = defaultdict(Counter)
    matrix: dict[tuple[int, str], Counter] = defaultdict(Counter)
    for event in generations:
        name = event.data.get("format")
        if not name:
            continue
        if event.outcome in REFUSALS:
            formats[name]["refused"] += 1
            continue
        outcome = _engine_outcome(event.outcome)
        formats[name]["outcomes"][outcome] += 1
        if outcome == "grid" and event.duration_ms is not None:
            formats[name]["durations"].append(event.duration_ms)
        must = event.data.get("must", [])
        must_counts[min(len(must), MUST_COUNT_CAP)][outcome] += 1
        if must:
            band = _length_band(max(word.get("length", 0) for word in must))
            must_lengths[band][outcome] += 1
            matrix[(min(len(must), MATRIX_COUNT_CAP), band)][outcome] += 1
    return {"formats": formats, "must_counts": must_counts, "must_lengths": must_lengths, "must_matrix": matrix}


def _period_figures(events: list[UsageEvent], days: int, cpu_count: int) -> dict:
    by_kind = defaultdict(list)
    for event in events:
        by_kind[event.kind].append(event)
    generations = by_kind["generation"]
    outcomes = Counter(e.outcome for e in generations)
    accounts = Counter(e.outcome for e in by_kind["account"])
    durations = [e.duration_ms for e in generations if e.outcome == "grid" and e.duration_ms is not None]
    cpu_ms = sum(e.cpu_ms or 0 for e in generations)
    visitor_days = len({(e.created_at.date(), e.visitor) for e in events if e.visitor})
    return {
        "visitors": visitor_days,
        "searches": len(by_kind["search"]),
        "generations": len(generations),
        "grids": outcomes["grid"],
        "success": _rate(outcomes["grid"], len(generations) - sum(outcomes[b] for b in BUSY)
                         - outcomes["rate_limited"]),
        "busy": sum(outcomes[b] for b in BUSY),
        "busy_server": outcomes["busy_server"],
        "busy_visitor": outcomes["busy_visitor"],
        "rate_limited": outcomes["rate_limited"],
        "p50": _percentile(durations, 0.5),
        "p95": _percentile(durations, 0.95),
        "cpu_s": cpu_ms / 1000,
        "cpu_share": cpu_ms / 1000 / (days * 86400 * cpu_count),
        "register": accounts["register"],
        "verify": accounts["verify"],
        "login": accounts["login"],
        "delete": accounts["delete"],
        "saved": len(by_kind["grid"]),
        "errors": sum(1 for e in events if e.status >= 400),
        "server_errors": sum(1 for e in events if e.status >= 500),
        "funnel": _funnel(events),
    }


def compute(now: datetime | None = None, cpu_count: int | None = None) -> dict:
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    cpu_count = cpu_count or os.cpu_count() or 1
    since = now - timedelta(days=30)
    events = UsageEvent.query.filter(UsageEvent.created_at >= since).order_by(UsageEvent.created_at).all()
    start_of_today = datetime.combine(now.date(), datetime.min.time())

    periods = {}
    for label, days in PERIODS:
        start = start_of_today if days == 1 else now - timedelta(days=days)
        periods[label] = _period_figures([e for e in events if e.created_at >= start], days, cpu_count)

    generations = [e for e in events if e.kind == "generation"]
    formats = defaultdict(Counter)
    by_must_count = defaultdict(Counter)
    unknown_words = Counter()
    for event in generations:
        if event.outcome in BUSY or event.outcome == "rate_limited":
            continue
        succeeded = "grid" if event.outcome == "grid" else "échec"
        formats[event.data.get("format", "?")][succeeded] += 1
        must = event.data.get("must", [])
        by_must_count[min(len(must), 3)][succeeded] += 1
        must_texts = (event.words or {}).get("must", [])
        for detail, text in zip(must, must_texts):
            if not detail.get("known", True):
                unknown_words[text] += 1

    return {
        "now": now,
        "periods": periods,
        "outcomes": Counter(e.outcome for e in generations),
        "formats": formats,
        "by_must_count": by_must_count,
        "unknown_words": unknown_words,
        "countries": Counter(e.country or "?" for e in events if e.visitor),
        "country_visitors": Counter(country for _, _, country in
                                    {(e.created_at.date(), e.visitor, e.country or "?") for e in events if e.visitor}),
        "daily": _daily(events, now),
        "tables": _generation_tables(generations),
        "errors": Counter((e.route or "?", e.status) for e in events if e.status >= 400),
        "latest": list(reversed(generations))[:10],
    }


def _iso(moment: datetime) -> str:
    return moment.isoformat(timespec="seconds") + "Z"


def as_json(stats: dict) -> dict:
    """Les mêmes chiffres pour le poste de pilotage (`GET /api/admin/stats`, admin.py).

    Des agrégats seulement. Les dernières générations y figurent sans rien qui désigne un visiteur : ni
    empreinte, ni compte, ni mots imposés (seul leur nombre).
    """
    week, month = stats["periods"]["7 jours"], stats["periods"]["30 jours"]
    tables = stats["tables"]

    def busy_share(period: dict) -> float:
        return period["busy"] / period["generations"] if period["generations"] else 0

    def busy_level(period: dict) -> str:
        return _level(busy_share(period) if period["generations"] else None, BUSY_THRESHOLD)

    def outcomes(counter: Counter) -> dict:
        """Les issues d'un groupe de demandes : `total` hors refus, puis une clé par issue."""
        return {"total": sum(counter.values()), **{key: counter[key] for key in (*ENGINE_OUTCOMES, "other")}}

    bands = [label for _, label in LENGTH_BANDS]

    return {
        "now": _iso(stats["now"]),
        "periods": [{"label": label, "days": days, **stats["periods"][label]} for label, days in PERIODS],
        # Seuils de l'ADR 0013, sur 30 jours comme dans `flask stats` ; les 7 derniers jours disent la tendance
        "thresholds": {
            "p95_ms": month["p95"],
            "p95_limit_ms": P95_THRESHOLD_S * 1000,
            "p95_level": _level(month["p95"], P95_THRESHOLD_S * 1000),
            "busy_share": busy_share(month),
            "busy_limit": BUSY_THRESHOLD,
            "busy_level": busy_level(month),
            "near_share": NEAR_SHARE,
            "week": {
                "p95_ms": week["p95"],
                "p95_level": _level(week["p95"], P95_THRESHOLD_S * 1000),
                "busy_share": busy_share(week),
                "busy_level": busy_level(week),
            },
        },
        "daily": stats["daily"],
        "outcomes": [{"outcome": outcome or "?", "count": count}
                     for outcome, count in stats["outcomes"].most_common()],
        "formats": [{"format": name, **outcomes(table["outcomes"]), "refused": table["refused"],
                     "p50": _percentile(table["durations"], 0.5), "p95": _percentile(table["durations"], 0.95)}
                    for name, table in sorted(tables["formats"].items(),
                                              key=lambda item: -sum(item[1]["outcomes"].values()))],
        "must_counts": [{"must": count, **outcomes(counter)}
                        for count, counter in sorted(tables["must_counts"].items())],
        "must_lengths": [{"band": band, **outcomes(tables["must_lengths"][band])}
                         for band in bands if band in tables["must_lengths"]],
        # Nombre × longueur du plus long mot imposé : une case par croisement rencontré
        "must_matrix": [{"must": count, "band": band, "total": sum(counter.values()), "grid": counter["grid"]}
                        for (count, band), counter in sorted(tables["must_matrix"].items(),
                                                             key=lambda item: (item[0][0], bands.index(item[0][1])))],
        "must_bands": bands,
        "unknown_words": [{"word": word, "count": count} for word, count in stats["unknown_words"].most_common(50)],
        "countries": [{"country": country, "events": count, "visitors": stats["country_visitors"][country]}
                      for country, count in stats["countries"].most_common(20)],
        "errors": [{"route": route, "status": status, "count": count}
                   for (route, status), count in stats["errors"].most_common(30)],
        "latest": [{
            "at": _iso(event.created_at),
            "format": event.data.get("format"),
            "layout": event.data.get("layout"),
            "outcome": event.outcome,
            "duration_ms": event.duration_ms,
            "must": len(event.data.get("must", [])),
        } for event in stats["latest"]],
    }


def _seconds(ms: float | None) -> str:
    return "—" if ms is None else f"{ms / 1000:.2f} s"


def render(stats: dict) -> str:
    config = current_app.config
    periods = stats["periods"]
    lines = [f"{config['SITE_NAME']} ({config['SITE']}) — mesure d'usage au {stats['now']:%d/%m/%Y %H:%M} UTC", ""]

    rows = [
        ("Visiteurs (somme par jour)", "visitors"),
        ("Recherches", "searches"),
        ("Générations demandées", "generations"),
        ("  grilles obtenues", "grids"),
        ("  taux de réussite", "success"),
        ("  refus « occupé »", "busy"),
        ("  refus rate limiting", "rate_limited"),
        ("  durée médiane (réussies)", "p50"),
        ("  durée p95 (réussies)", "p95"),
        ("  temps CPU", "cpu_s"),
        ("  part de la capacité CPU", "cpu_share"),
        ("Inscriptions", "register"),
        ("Adresses confirmées", "verify"),
        ("Connexions", "login"),
        ("Comptes supprimés", "delete"),
        ("Grilles conservées", "saved"),
        ("Erreurs (4xx et 5xx)", "errors"),
        ("  dont 5xx", "server_errors"),
    ]
    header = f"{'':32}" + "".join(f"{label:>14}" for label, _ in PERIODS)
    lines.append(header)
    for label, key in rows:
        cells = []
        for period, _ in PERIODS:
            value = periods[period][key]
            if key in ("p50", "p95"):
                value = _seconds(value)
            elif key == "cpu_s":
                value = f"{value:.0f} s"
            elif key == "cpu_share":
                value = f"{100 * value:.2f} %"
            cells.append(f"{value!s:>14}")
        lines.append(f"{label:32}" + "".join(cells))

    month = periods["30 jours"]
    lines += ["", "Seuils de l'ADR 0013 (30 jours) :"]
    p95 = month["p95"]
    lines.append(f"  p95 des générations : {_seconds(p95)} (seuil {P95_THRESHOLD_S} s)"
                 + ("  ⚠️ DÉPASSÉ" if p95 is not None and p95 > P95_THRESHOLD_S * 1000 else ""))
    busy_share = month["busy"] / month["generations"] if month["generations"] else 0
    lines.append(f"  refus « occupé » : {100 * busy_share:.1f} % des générations (seuil {100 * BUSY_THRESHOLD:.0f} %)"
                 + ("  ⚠️ DÉPASSÉ" if busy_share > BUSY_THRESHOLD else ""))

    def section(title, counter, fmt=lambda key, value: f"{key} : {value}", limit=15):
        lines.extend(["", title])
        if not counter:
            lines.append("  (rien)")
        for key, value in counter.most_common(limit) if isinstance(counter, Counter) else counter:
            lines.append(f"  {fmt(key, value)}")

    section("Issues des générations (30 jours) :", stats["outcomes"])
    section("Formats (30 jours, hors refus) :",
            sorted(stats["formats"].items(), key=lambda item: -sum(item[1].values())),
            lambda fmt, c: f"{fmt} : {sum(c.values())} demandes, réussite {_rate(c['grid'], sum(c.values()))}")
    section("Réussite selon le nombre de mots imposés (30 jours) :",
            sorted(stats["by_must_count"].items()),
            lambda n, c: f"{'3 et plus' if n == 3 else n} : {sum(c.values())} demandes, "
                         f"réussite {_rate(c['grid'], sum(c.values()))}")
    section("Mots imposés absents du lexique (30 jours, pour la curation) :", stats["unknown_words"])
    section("Pays des visiteurs (30 jours, événements) :", stats["countries"], limit=10)
    section("Erreurs par route et statut (30 jours) :", stats["errors"],
            lambda key, value: f"{key[1]} {key[0]} : {value}")

    lines.extend(["", "Dernières générations :"])
    if not stats["latest"]:
        lines.append("  (aucune)")
    for event in stats["latest"]:
        must = event.data.get("must", [])
        lines.append(f"  {event.created_at:%d/%m %H:%M}  {event.data.get('format', '?'):>6}  "
                     f"{event.outcome or '?':<20} {_seconds(event.duration_ms):>7}  "
                     f"{len(must)} mot(s) imposé(s)")
    return "\n".join(lines)


usage_cli = AppGroup("usage", help="Mesure d'usage (ADR 0016).")


@usage_cli.command("purge")
def purge_command():
    """Efface les mots imposés de plus de 90 jours, les événements de plus de 13 mois et les sels passés."""
    usage.purge()
    click.echo("Mesure d'usage : ménage fait.")


@usage_cli.command("seed-demo")
@click.option("--days", type=click.IntRange(1, usage_demo.MAX_DAYS), default=usage_demo.DEFAULT_DAYS,
              show_default=True, help="Nombre de jours à remplir, jusqu'à aujourd'hui.")
@click.option("--seed", type=int, default=usage_demo.DEFAULT_SEED, show_default=True,
              help="Graine du tirage : la même graine redonne les mêmes événements.")
@click.option("--clear", "only_clear", is_flag=True, help="Efface les événements fictifs sans en réécrire.")
def seed_demo_command(days, seed, only_clear):
    """Remplit la mesure d'usage d'événements fictifs, pour développer le poste de pilotage. Jamais en production."""
    if only_clear:
        click.echo(f"Mesure d'usage : {usage_demo.clear()} événement(s) fictif(s) effacé(s).")
        return
    count = usage_demo.seed_demo(days, seed)
    click.echo(f"Mesure d'usage : {count} événements fictifs sur {days} jours (graine {seed}). "
               "Les relire : flask stats, ou /admin.")


@click.command("stats")
def stats_command():
    """Chiffres du jour, de 7 et de 30 jours : visiteurs, générations, comptes, erreurs (ADR 0016)."""
    click.echo(render(compute()))


def init_stats_cli(app) -> None:
    app.cli.add_command(stats_command)
    app.cli.add_command(usage_cli)
