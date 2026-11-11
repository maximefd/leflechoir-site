"""Les visiteurs d'un jour, comptés une fois la journée close, puis l'empreinte oubliée (avis du 08/11/2026).

L'empreinte du jour (usage.py) relie les événements d'une même journée : elle sert à compter les visiteurs, les
étapes du parcours, les pays et les sources des pages vues. Ces comptes s'additionnent d'un jour à l'autre (une
empreinte ne vit qu'un jour) : à la clôture, on les écrit dans `day_visitors`, et l'empreinte est effacée des
événements. Le poste de pilotage additionne les comptes des jours clos et ceux, encore vivants, du jour ouvert.
"""

from collections import Counter, defaultdict
from datetime import date, datetime

from models import DayVisitors, UsageEvent, db

FUNNEL_STEPS = ("visits", "active", "searched", "generated", "grid", "registered", "saved")
REFERRER_LENGTH = 100


def funnel_sets(events) -> dict[str, set]:
    """Les étapes du parcours, en visites (jour, empreinte) : pour les événements hors pages vues."""
    steps: dict[str, set] = {step: set() for step in FUNNEL_STEPS}
    for event in events:
        if not event.visitor or event.kind == "page":
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
    return steps


def counts(events) -> Counter:
    """Ce que l'empreinte permet de compter dans les événements d'un jour et d'un site."""
    result = Counter()
    others = [e for e in events if e.visitor and e.kind != "page"]
    views = [e for e in events if e.visitor and e.kind == "page" and e.outcome == "view"]
    result["events"] = len({e.visitor for e in others})
    for step, visits in funnel_sets(others).items():
        result[f"funnel:{step}"] = len(visits)
    for country in {(e.visitor, e.country or "?") for e in others}:
        result[f"country:{country[1]}"] += 1
    result["pages"] = len({e.visitor for e in views})
    for _, referrer in {(e.visitor, (e.data or {}).get("referrer", "")[:REFERRER_LENGTH]) for e in views}:
        result[f"referrer:{referrer}"] += 1
    return +result  # sans les zéros


def close(before: datetime) -> int:
    """Compte puis efface l'empreinte des événements d'avant `before` (le début du jour) ; rend leur nombre.

    À appeler dans la transaction du ménage quotidien (usage._purge) : les comptes et l'effacement partent ensemble.
    """
    events = UsageEvent.query.filter(UsageEvent.created_at < before, UsageEvent.visitor.isnot(None)).all()
    groups: dict[tuple[date, str], list] = defaultdict(list)
    for event in events:
        groups[(event.created_at.date(), event.site)].append(event)
    for (day, site), of_day in groups.items():
        for key, visitors in counts(of_day).items():
            row = db.session.get(DayVisitors, (day, site, key))
            if row is None:
                db.session.add(DayVisitors(day=day, site=site, key=key, visitors=visitors))
            else:
                row.visitors += visitors
    db.session.flush()
    if events:
        (UsageEvent.query.filter(UsageEvent.created_at < before, UsageEvent.visitor.isnot(None))
         .update({UsageEvent.visitor: None}, synchronize_session=False))
    return len(events)


def closed(first: date, last: date, site: str | None = None) -> dict[date, Counter]:
    """Les comptes des jours clos de `first` à `last` (inclus), jour par jour."""
    query = DayVisitors.query.filter(DayVisitors.day >= first, DayVisitors.day <= last)
    if site:
        query = query.filter(DayVisitors.site == site)
    result: dict[date, Counter] = defaultdict(Counter)
    for row in query.all():
        result[row.day][row.key] += row.visitors
    return result


def total(by_day: dict[date, Counter], after: date, before: date) -> Counter:
    """La somme des comptes des jours strictement entre `after` et `before` : les jours entiers d'une période."""
    result = Counter()
    for day, of_day in by_day.items():
        if after < day < before:
            result.update(of_day)
    return result
