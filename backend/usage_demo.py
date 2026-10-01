"""Jeu de données fictives pour le poste de pilotage : `flask usage seed-demo` (Phase 8, `make seed-demo`).

Le tableau de bord se développe sans accès à la production. Cette commande remplit `usage_event` de plusieurs
semaines d'événements vraisemblables, tirés au hasard à partir d'une graine : générations de toutes issues,
recherches, étapes de compte, grilles conservées, erreurs, pays, mots imposés absents du lexique. **Rien n'y
vient d'un vrai visiteur.**

- **Jamais en production** : la commande refuse de tourner avec `APP_ENV=production`.
- **Relançable sans doublon** : chaque événement fictif porte une empreinte qui commence par « demo », ce qu'une
  vraie empreinte (hexadécimale, usage.py) ne fait jamais. La commande efface les siens puis les réécrit ; les
  vrais événements de la base locale ne bougent pas.
- **Ni compte ni sel fictifs** : `usage_event` est écrite avec `user_id` vide.
- **Le serveur aussi** (rubrique « Système ») : deux jours d'échantillons à la minute, un résumé par jour avant
  eux, et quelques alertes au journal. Ces tables-là ne disent pas d'où vient une ligne : la commande
  **remplace** tous les échantillons et résumés de la base locale, et les alertes dont la période commence
  par « demo ».

Les événements ont la forme exacte de ceux qu'écrit usage.py : ce que le tableau de bord lit ici, il le lira
en production.
"""

import random
from datetime import datetime, timedelta, timezone

import click
from flask import current_app

from extensions import db
from models import AlertSent, ContactMessage, SystemDaily, SystemSample, UsageEvent

DEMO_PREFIX = "demo"
DEFAULT_DAYS = 42
DEFAULT_SEED = 8
MAX_DAYS = 396  # au-delà, la purge quotidienne les effacerait (usage.EVENTS_RETENTION)

# Formats du catalogue et nombre de layouts de chacun (backend/layouts, octobre 2026), poids dans les demandes,
# durée médiane d'une génération réussie et réussite sans mot imposé (ordres de grandeur de l'ADR 0013)
FORMATS = {
    "6x6": (3, 6, 30, 0.99),
    "6x7": (7, 22, 40, 0.99),
    "7x9": (1, 8, 120, 0.99),
    "11x6": (1, 5, 150, 0.98),
    "11x9": (2, 6, 400, 0.98),
    "14x9": (8, 9, 700, 0.97),
    "10x13": (9, 18, 900, 0.97),
    "12x15": (1, 6, 1800, 0.95),
    "11x17": (2, 8, 2300, 0.92),
    "13x16": (4, 8, 2600, 0.93),
    "13x18": (1, 4, 9000, 0.82),
}
BUDGET_MS = 20_000  # GENERATION_TIME_BUDGET_S

COUNTRIES = (("FR", 78), ("BE", 7), ("CH", 4), ("CA", 4), ("LU", 1), ("DE", 2), ("US", 2), ("MA", 1), (None, 1))
# Heures UTC : le site vit surtout en journée et en soirée, à l'heure française
HOUR_WEIGHTS = (1, 1, 1, 1, 1, 2, 4, 7, 9, 10, 9, 8, 8, 9, 9, 8, 9, 11, 13, 14, 11, 6, 3, 2)

# La balise du navigateur (audience.py) : pages, d'où l'on vient, langue du navigateur
PAGES = (("/", 30), ("/grid", 26), ("/search", 22), ("/creer-des-mots-fleches", 9), ("/grids", 5), ("/login", 4),
         ("/register", 2), ("/privacy", 1), ("/dictionaries", 1))
REFERRERS = (("", 62), ("google.com", 17), ("bing.com", 4), ("duckduckgo.com", 3), ("chatgpt.com", 3),
             ("perplexity.ai", 2), ("copilot.microsoft.com", 1), ("qwant.com", 2), ("facebook.com", 2), ("reddit.com", 1),
             ("mots-fleches-forum.example", 1), ("lemonde.fr", 1), ("claude.ai", 1))
BROWSER_LANGS = (("fr", 88), ("en", 7), ("de", 2), ("es", 1), ("nl", 1), ("", 1))

# Mots imposés : ceux que le lexique connaît, et ceux qu'il n'a pas (prénoms, mots récents)
KNOWN_WORDS = ("ETE", "MER", "CHAT", "NOEL", "FETE", "PLAGE", "ECOLE", "JARDIN", "SOLEIL", "VOYAGE", "MARIAGE",
               "MUSIQUE", "FAMILLE", "CUISINE", "VACANCES", "CHOCOLAT", "RETRAITE", "MONTAGNE", "BRETAGNE",
               "NAISSANCE", "ANNIVERSAIRE")
UNKNOWN_WORDS = ("MAELYS", "CAMILLE", "NOLAN", "LOULOU", "MAMIE", "PAPOU", "TIKTOK", "PADEL", "WIFI", "EMOJI",
                 "COVOIT", "SUDOKU", "PODCAST", "LEFLECHOIR")
WISH_WORDS = ("CAFE", "LIVRE", "VELO", "PIANO", "TARTE", "RANDO", "POTAGER", "PETANQUE")

ERRORS = (((401, "/api/users/me"), 30), ((401, "/api/auth/login"), 22), ((401, "/api/auth/refresh"), 12),
          ((404, "/api/grids/<int:grid_id>"), 8), ((409, "/api/auth/register"), 6),
          ((400, "/api/auth/password/reset"), 4), ((400, "/api/dictionaries/<int:dict_id>/words"), 6),
          ((400, "/api/grids"), 4), ((429, "/api/auth/login"), 3), ((404, "/api/dictionaries/<int:dict_id>"), 3),
          ((500, "/api/grids/<int:grid_id>"), 1))

# Un jour d'incident, il y a un peu plus d'une semaine : refus « occupé » et erreurs 500 en rafale. De quoi
# voir les seuils et les alertes réagir, et distinguer les 7 derniers jours des 30.
INCIDENT_DAYS_AGO = 9


def _refuse_production() -> None:
    if current_app.config.get("APP_ENV") == "production":
        raise click.ClickException("Refusé en production : les données fictives fausseraient la mesure d'usage.")


def _weighted(rng: random.Random, choices):
    return rng.choices([value for value, _ in choices], weights=[weight for _, weight in choices])[0]


class _Visit:
    """Une visite fictive : ses événements se suivent, de quelques secondes à quelques minutes."""

    def __init__(self, rng: random.Random, start: datetime, site: str, lang: str):
        self.rng = rng
        self.at = start
        self.common = {"site": site, "lang": lang, "country": _weighted(rng, COUNTRIES),
                       "visitor": DEMO_PREFIX + f"{rng.getrandbits(112):028x}", "user_id": None}
        self.events: list[dict] = []

    def add(self, kind, outcome, status, route, duration_ms, cpu_ms=None, data=None, words=None,
            pause_s=(5, 90)) -> None:
        self.at += timedelta(seconds=self.rng.uniform(*pause_s), milliseconds=duration_ms)
        self.events.append({"created_at": self.at, "kind": kind, "outcome": outcome, "status": status,
                            "route": route, "duration_ms": duration_ms,
                            "cpu_ms": min(duration_ms, self.rng.randint(1, 6)) if cpu_ms is None else cpu_ms,
                            "data": data or {}, "words": words, **self.common})

    def light(self) -> int:
        """Durée d'une requête légère (connexion, grille conservée, erreur)."""
        return self.rng.randint(4, 120)


def _search(visit: _Visit, logged_in: bool) -> None:
    rng = visit.rng
    roll = rng.random()
    if roll < 0.012:
        outcome, status = ("rate_limited", 429) if roll < 0.004 else ("invalid_request", 400)
        visit.add("search", outcome, status, "/api/search", rng.randint(1, 4))
        return
    length = rng.randint(3, 10)
    wildcards = 0 if rng.random() < 0.1 else rng.randint(1, length - 1)
    results = 0 if rng.random() < 0.12 else min(200, int(rng.expovariate(1 / 25)) + 1)
    visit.add("search", "results", 200, "/api/search", rng.randint(3, 90),
              data={"pattern_length": length, "wildcards": wildcards, "results": results, "logged_in": logged_in})


def _imposed_words(rng: random.Random) -> tuple[list[str], list[bool]]:
    count = _weighted(rng, ((0, 70), (1, 15), (2, 8), (3, 4), (4, 2), (5, 1)))
    chosen: dict[str, bool] = {}
    while len(chosen) < count:
        known = rng.random() < 0.82
        chosen[rng.choice(KNOWN_WORDS if known else UNKNOWN_WORDS)] = known
    texts = sorted(chosen)  # comme la route : un ensemble trié
    return texts, [chosen[text] for text in texts]


def _generation(visit: _Visit, logged_in: bool, incident: bool) -> bool:
    """Une demande de génération ; vrai si elle donne une grille."""
    rng = visit.rng
    route = "/api/grids/generate"
    # Refusées avant la vue : ni format ni mots (usage._deduced_outcome)
    roll = rng.random()
    if roll < 0.004:
        visit.add("generation", "rate_limited", 429, route, rng.randint(1, 4))
        return False
    if roll < 0.010:
        visit.add("generation", "invalid_request", 400, route, rng.randint(1, 4))
        return False

    name = _weighted(rng, [(name, weight) for name, (_, weight, _, _) in FORMATS.items()])
    layouts, _, median_ms, base_success = FORMATS[name]
    width, height = (int(side) for side in name.split("x"))
    must, known = _imposed_words(rng)
    wishes = sorted(rng.sample(WISH_WORDS, rng.randint(1, 3))) if rng.random() < 0.12 else []
    data = {"format": name, "must": [{"length": len(text), "known": flag} for text, flag in zip(must, known)],
            "wish_count": len(wishes), "dictionaries": rng.randint(1, 2) if logged_in and rng.random() < 0.2 else 0,
            "use_global": True, "frequency_mode": None, "logged_in": logged_in}
    words = {"must": must, "wish": wishes} if must or wishes else None

    def add(outcome, status, duration_ms, computed=False, attempted=False):
        if attempted:
            data.update(layout=f"{name}-{rng.randint(1, layouts):03d}",
                        attempts=1 + int(rng.expovariate(1.2) * (1 + duration_ms / 4000)))
        visit.add("generation", outcome, status, route, duration_ms,
                  cpu_ms=round(duration_ms * rng.uniform(0.9, 0.99)) if computed else None, data=data, words=words)
        return outcome == "grid"

    if incident and rng.random() < 0.3:
        return add("http_500", 500, rng.randint(20, 400))
    busy = rng.random()
    if busy < (0.3 if incident else 0.02):
        return add("busy_server", 429, rng.randint(2, 15))
    if busy > 0.992:
        return add("busy_visitor", 429, rng.randint(2, 15))
    if any(len(text) > max(width, height) for text in must):
        return add("must_words", 422, rng.randint(15, 70))

    # C'est la longueur des mots imposés qui pèse, plus que leur nombre (roadmap, Phase 3, #73)
    success = base_success
    for text in must:
        success *= 1 - 0.04 - 0.045 * max(0, len(text) - 5)
    duration_ms = round(rng.lognormvariate(0, 0.9) * median_ms * (1 + 0.7 * len(must)))
    if rng.random() < success and duration_ms < BUDGET_MS:
        return add("grid", 200, max(8, duration_ms), computed=True, attempted=True)
    if must and rng.random() < 0.6:
        return add("must_words_unplaced", 422, BUDGET_MS + rng.randint(20, 500), computed=True, attempted=True)
    if rng.random() < 0.85:
        return add("timeout", 422, BUDGET_MS + rng.randint(20, 500), computed=True, attempted=True)
    return add("no_solution", 422, rng.randint(200, 6000), computed=True, attempted=True)


def _page_events(visit: _Visit, has_grid: bool) -> list[dict]:
    """Les pages vues de la visite, tirées à part : la graine des autres événements ne bouge pas."""
    rng = random.Random(visit.common["visitor"])
    referrer = _weighted(rng, REFERRERS)
    language = _weighted(rng, BROWSER_LANGS)
    start = visit.events[0]["created_at"] - timedelta(seconds=rng.uniform(5, 40)) if visit.events else visit.at
    events = []
    at = start
    for index in range(_weighted(rng, ((1, 45), (2, 25), (3, 15), (4, 8), (7, 5), (12, 2)))):
        visible_ms = int(min(1_800_000, rng.lognormvariate(10.3, 1.0)))  # médiane d'environ 30 s
        at += timedelta(milliseconds=visible_ms + rng.randint(300, 4000))
        path = _weighted(rng, PAGES)
        data = {"path": path, "referrer": referrer if index == 0 else "", "browser_lang": language,
                "visible_ms": visible_ms}
        events.append({**visit.common, "created_at": at, "kind": "page", "outcome": "view", "status": 204,
                       "route": "/api/audience", "duration_ms": rng.randint(2, 12), "cpu_ms": 1, "data": data,
                       "words": None})
    if has_grid and rng.random() < 0.35:
        at += timedelta(seconds=rng.uniform(2, 20))
        events.append({**visit.common, "created_at": at, "kind": "page", "outcome": "pdf", "status": 204,
                       "route": "/api/audience", "duration_ms": 4, "cpu_ms": 1,
                       "data": {"path": "/grids/edit", "referrer": "", "browser_lang": language, "visible_ms": 0},
                       "words": None})
    return events


def _visit_events(rng: random.Random, start: datetime, site: str, lang: str, incident: bool) -> list[dict]:
    visit = _Visit(rng, start, site, lang)
    logged_in = rng.random() < 0.12
    if logged_in:
        visit.add("account", "login", 200, "/api/auth/login", visit.light())

    if rng.random() < 0.55:
        for _ in range(_weighted(rng, ((1, 30), (2, 25), (3, 18), (5, 15), (9, 8), (16, 4)))):
            _search(visit, logged_in)

    last_format = None
    if rng.random() < 0.62:
        for _ in range(_weighted(rng, ((1, 40), (2, 28), (3, 16), (4, 9), (6, 7)))):
            if _generation(visit, logged_in, incident):
                last_format = visit.events[-1]["data"]["format"]

    # Conserver une grille demande un compte : c'est elle qui fait s'inscrire
    if last_format and not logged_in and rng.random() < 0.11:
        visit.add("account", "register", 201, "/api/auth/register", rng.randint(180, 420))
        logged_in = True
        if rng.random() < 0.7:
            visit.add("account", "verify", 200, "/api/auth/email/verify", visit.light(), pause_s=(40, 900))
    if last_format and logged_in and rng.random() < 0.65:
        visit.add("grid", "saved", 201, "/api/grids", visit.light(), data={"format": last_format})

    if rng.random() < 0.09:
        status, route = _weighted(rng, ERRORS)
        visit.add("error", None, status, route, visit.light())
    if incident and rng.random() < 0.25:
        visit.add("error", None, 500, _weighted(rng, (("/api/grids", 2), ("/api/dictionaries", 1))), visit.light())
    if logged_in and rng.random() < 0.01:
        visit.add("account", "delete", 200, "/api/users/me", visit.light())
    # Une visite sur sept ne laisse aucune page vue : refus, GPC, robot filtré, navigateur sans JavaScript
    silent = int(visit.common["visitor"][len(DEMO_PREFIX):], 16) % 7 == 0
    pages = [] if silent else _page_events(visit, bool(last_format))
    return visit.events + pages


def generate(days: int = DEFAULT_DAYS, seed: int = DEFAULT_SEED, now: datetime | None = None,
             site: str = "fr", lang: str = "fr") -> list[dict]:
    """Les événements fictifs des `days` derniers jours, dans l'ordre : mêmes arguments, mêmes événements."""
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    rng = random.Random(seed)
    today = datetime.combine(now.date(), datetime.min.time())
    events = []
    for days_ago in range(days - 1, -1, -1):
        day = today - timedelta(days=days_ago)
        # Le site grandit doucement, et les week-ends sont plus fréquentés
        weekend = 1.3 if day.weekday() >= 5 else 1
        visits = (14 + 30 * (1 - days_ago / days)) * weekend * rng.uniform(0.75, 1.25)
        for _ in range(round(visits)):
            hour = rng.choices(range(24), weights=HOUR_WEIGHTS)[0]
            start = day + timedelta(hours=hour, seconds=rng.uniform(0, 3600))
            events.extend(_visit_events(rng, start, site, lang, incident=days_ago == INCIDENT_DAYS_AGO))
    # Rien dans le futur : la journée en cours s'arrête à maintenant
    return sorted((event for event in events if event["created_at"] <= now), key=lambda event: event["created_at"])


# --- Le serveur : échantillons, résumés quotidiens, journal des alertes ---

SAMPLE_HOURS = 48
MEM_TOTAL_MB = 3900  # le VPS de l'ADR 0013 : 4 Go


def _machine(rng: random.Random, moment: datetime, now: datetime, days: int) -> dict:
    """La machine à un instant : plus chargée en journée, un peu plus lourde de semaine en semaine, et serrée le
    jour d'incident."""
    age = (now - moment).total_seconds() / 86400
    growth = 1 - min(age, days) / days  # 0 au début de la période, 1 aujourd'hui
    load = HOUR_WEIGHTS[moment.hour] / max(HOUR_WEIGHTS)
    incident = (now.date() - moment.date()).days == INCIDENT_DAYS_AGO and 17 <= moment.hour <= 20
    busy = 2 if incident else (1 if rng.random() < 0.12 * load else 0)
    api = 760 + 90 * growth + rng.uniform(-8, 8)  # le partage du lexique entre workers s'érode (ADR 0013)
    used = 520 + api + 160 * load + (1500 if incident else 0) + rng.uniform(-40, 40)
    night = moment.replace(hour=3, minute=30, second=12, microsecond=0)
    return {
        "mem_total_mb": MEM_TOTAL_MB, "mem_used_mb": round(used), "api_mem_mb": round(api),
        "cpu_percent": round(min(100, 2 + 9 * load + 45 * busy + rng.uniform(0, 3)), 1),
        "slots_busy": busy, "slots_total": 2,
        "db_size_mb": round(38 + 9 * growth, 1),
        "last_backup_at": night if moment >= night else night - timedelta(days=1),
        "api_ok": True,
    }


def seed_system(days: int, seed: int, now: datetime, site: str, lang: str) -> int:
    """Remplace les échantillons système et leurs résumés par une machine fictive ; renvoie le nombre de lignes."""
    rng = random.Random(seed + 1)
    for model in (SystemSample, SystemDaily):
        model.query.delete(synchronize_session=False)
    AlertSent.query.filter(AlertSent.period.startswith(DEMO_PREFIX)).delete(synchronize_session=False)
    ContactMessage.query.filter(ContactMessage.request_id.startswith(DEMO_PREFIX)).delete(synchronize_session=False)

    minute = now.replace(second=0, microsecond=0)
    samples, cpu_busy, cpu_total = [], 0, 0
    for offset in range(SAMPLE_HOURS * 60, -1, -1):
        moment = minute - timedelta(minutes=offset)
        machine = _machine(rng, moment, now, days)
        cpu_total += 12_000  # deux cœurs, une minute, en centièmes de seconde
        cpu_busy += round(120 * machine["cpu_percent"])
        samples.append({"created_at": moment, "site": site, "lang": lang, "cpu_busy": cpu_busy,
                        "cpu_total": cpu_total, **machine})
    db.session.bulk_insert_mappings(SystemSample, samples)

    daily = []
    first_sampled = samples[0]["created_at"].date()
    for days_ago in range(days - 1, 0, -1):
        day = now.date() - timedelta(days=days_ago)
        if day >= first_sampled:
            continue  # ces journées-là ont leurs échantillons : le ménage les résume, comme en production
        start = datetime.combine(day, datetime.min.time())
        hours = [_machine(rng, start + timedelta(hours=hour), now, days) for hour in range(24)]
        used, cpu = [hour["mem_used_mb"] for hour in hours], [hour["cpu_percent"] for hour in hours]
        daily.append({
            "day": day, "site": site, "lang": lang, "samples": 1440, "mem_total_mb": MEM_TOTAL_MB,
            "mem_used_avg_mb": round(sum(used) / 24), "mem_used_max_mb": max(used),
            "api_mem_max_mb": max(hour["api_mem_mb"] for hour in hours),
            "cpu_avg_percent": round(sum(cpu) / 24, 1), "cpu_max_percent": max(cpu),
            "slots_busy_max": max(hour["slots_busy"] for hour in hours),
            "slots_full": 60 * sum(1 for hour in hours if hour["slots_busy"] == 2),
            "db_size_mb": hours[-1]["db_size_mb"], "last_backup_at": hours[-1]["last_backup_at"], "api_down": 0,
        })
    db.session.bulk_insert_mappings(SystemDaily, daily)

    incident = datetime.combine(now.date() - timedelta(days=INCIDENT_DAYS_AGO), datetime.min.time())
    monday = datetime.combine(now.date() - timedelta(days=now.weekday()), datetime.min.time()) + timedelta(hours=6)
    journal = [
        (incident + timedelta(hours=17, minutes=6), "ram", "Mémoire à 82,4 % depuis 5 minutes (seuil 75,0 %).", True),
        (incident + timedelta(hours=17, minutes=9), "server_errors",
         "9 erreurs 500 en 15 minutes. Le détail est dans Sentry.", True),
        (incident + timedelta(hours=18, minutes=2), "busy",
         "Refus « occupé » : 11,3 % des 97 générations des dernières 24 heures (seuil 5,0 %).", True),
        (monday - timedelta(days=7), "weekly", "Bilan de la semaine.", True),
        (monday, "weekly", "Bilan de la semaine.", True),
        (now - timedelta(hours=3), "test", "Alerte d'essai : si tu la lis, les alertes arrivent.", True),
    ]
    alerts = [{"created_at": at, "site": site, "lang": lang, "kind": kind, "summary": summary,
               "delivered": delivered, "period": f"{DEMO_PREFIX}-{position}"}
              for position, (at, kind, summary, delivered) in enumerate(journal) if at <= now]
    db.session.bulk_insert_mappings(AlertSent, alerts)
    return len(samples) + len(daily) + len(alerts)


# La boîte de réception : quelques messages fictifs (motif, texte, adresse, —, lu ou non)
CONTACT_MESSAGES = (
    ("suggestion", "Ce serait bien d'avoir des grilles en 8x8, pour les débutants de mon atelier.", "atelier@exemple.fr",
     False, True),
    ("problem", "La génération en 13x18 avec trois mots imposés m'a répondu « impossible » plusieurs fois de suite.",
     None, True, False),
    ("suggestion", "Le mot WIKI manque dans le lexique.", None, False, True),
    ("data", "Je voudrais effacer mon compte et recevoir une copie de mes grilles.", "claire@exemple.fr", False, True),
    ("problem", "Sur mon téléphone, l'export PDF ne démarre pas.", "jean@exemple.fr", True, True),
    ("suggestion", "Merci pour l'outil, la recherche par motif me fait gagner un temps fou.", None, False, True),
)


def seed_contact(now: datetime, site: str, lang: str) -> int:
    """Des messages de contact fictifs, reconnaissables à leur identifiant de requête (« demo-… »)."""
    for index, (reason, text, email, _, read) in enumerate(CONTACT_MESSAGES):
        at = now - timedelta(days=index * 3, hours=index * 5 + 1)
        db.session.add(ContactMessage(
            created_at=at, site=site, lang=lang, reason=reason, message=text, reply_email=email,
            request_id=f"{DEMO_PREFIX}-{index:04x}", user_id=None,
            read_at=at + timedelta(hours=4) if read else None))
    return len(CONTACT_MESSAGES)


def clear() -> int:
    """Efface les événements fictifs, et eux seuls ; puis les échantillons système, tous (voir en tête)."""
    _refuse_production()
    removed = UsageEvent.query.filter(UsageEvent.visitor.startswith(DEMO_PREFIX)).delete(synchronize_session=False)
    for model in (SystemSample, SystemDaily):
        model.query.delete(synchronize_session=False)
    AlertSent.query.filter(AlertSent.period.startswith(DEMO_PREFIX)).delete(synchronize_session=False)
    db.session.commit()
    return removed


def seed_demo(days: int = DEFAULT_DAYS, seed: int = DEFAULT_SEED, now: datetime | None = None) -> int:
    """Remplace les événements fictifs par un nouveau tirage ; renvoie leur nombre."""
    _refuse_production()
    clear()
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    site, lang = current_app.config["SITE"], current_app.config["SITE_LANG"]
    events = generate(days, seed, now, site=site, lang=lang)
    db.session.bulk_insert_mappings(UsageEvent, events)
    seed_system(days, seed, now, site, lang)
    seed_contact(now, site, lang)
    db.session.commit()
    # Import tardif : system_samples lit stats, qui porte la commande de ce module
    from system_samples import maintain
    maintain(now)
    return len(events)
