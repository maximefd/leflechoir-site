"""Les chiffres que Google et Bing publient sur la recherche, pour le poste de pilotage ([ADR 0029](../docs/adr/0029-tableau-de-bord-et-donnees-seo.md)).

- **Google** (Search Console) : clics, impressions et position par jour et par requête, par l'API Search Analytics ;
  les pages indexées, par l'outil d'inspection d'URL, quelques adresses du sitemap à chaque minute du minuteur.
  Un compte de service, lecteur de la propriété, signe sa demande de jeton (RS256).
- **Bing** (Webmaster Tools) : clics et impressions par jour, requêtes et positions, pages dans l'index, par la clé
  d'API du compte.

Le relevé passe une fois par jour, par `flask system tick` (alerts.py) ; il relit les derniers jours, que les moteurs
corrigent encore. Tout reste chez nous : l'historique ne dépend plus des 16 mois de la Search Console. Rien de
personnel n'y entre : des totaux que les moteurs calculent eux-mêmes. Sans réglage (`GSC_*`, `BING_*`), rien n'est
relevé et le tableau de bord le dit.
"""
from __future__ import annotations

import json
import logging
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

import click
import jwt
from flask import current_app, has_app_context
from flask.cli import AppGroup

from extensions import db
from models import SeoDaily, SeoQueryDaily, SeoUrlCheck

logger = logging.getLogger(__name__)

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"
GOOGLE_API = "https://searchconsole.googleapis.com"
BING_API = "https://ssl.bing.com/webmaster/api.svc/json"

SOURCES = ("google", "bing")
# Les moteurs corrigent leurs chiffres plusieurs jours durant : chaque relevé relit cette fenêtre
SYNC_DAYS = 10
# Une fois par jour, après cette heure (UTC) : les chiffres de la veille sont alors publiés
SYNC_HOUR = 6
# L'inspection d'URL (quota Google : 2 000 par jour) : quelques adresses par minute, chacune revue chaque semaine
INSPECT_PER_TICK = 8
INSPECT_EVERY = timedelta(days=7)
QUERY_ROWS = 5000
TIMEOUT_S = 30
# Cloudflare refuse la signature par défaut de Python (« Python-urllib ») : le relevé dit qui il est, et pour quel
# site (ADR 0033 : chaque site a son relevé)
USER_AGENT = "Pilotage/1.0 (+{site}/a-propos)"


def _user_agent() -> str:
    site = (current_app.config.get("FRONTEND_URL") or "").rstrip("/") if has_app_context() else ""
    return USER_AGENT.format(site=site or "https://leflechoir.fr")

# Les questions suivies : celles de la FAQ de l'accueil (frontend/src/content/faq-accueil.ts) et les requêtes visées
# (docs/VISIBILITE-IA.md). Une requête compte pour une question si chacun de ses groupes y a un mot ; un mot finissant
# par « * » est un début de mot (« fleche* » : fléché, fléchés). Les requêtes sont comparées sans accents.
QUESTIONS: tuple[tuple[str, tuple[tuple[str, ...], ...]], ...] = (
    ("Comment créer des mots fléchés gratuitement ?", (("creer*", "faire", "fabriquer*"), ("fleche*",), ("gratuit*",))),
    ("Générateur de mots fléchés", (("generat*",), ("fleche*",))),
    ("Comment les pros construisent-ils des mots fléchés ?",
     (("pro", "pros", "professionnel*", "verbicrucist*"), ("fleche*",))),
    ("Quels outils pour créer des mots fléchés ?", (("outil*", "logiciel*", "application*", "appli"), ("fleche*",))),
    ("Comment créer des mots fléchés avec l'IA ?", (("ia", "intelligence", "chatgpt"), ("fleche*",))),
    ("Mots fléchés à imprimer", (("imprim*",), ("fleche*",))),
    ("Mots fléchés du jour", (("jour",), ("fleche*",))),
    ("Mots fléchés ou mots croisés : quelle différence ?", (("croise*",), ("fleche*",))),
)


# Les recherches clés : ce qu'on veut voir le site apparaître dans les résultats, tapé tel quel ou presque. Chaque mot
# qui compte doit être dans la requête (au pluriel près, dans n'importe quel ordre) ; les petits mots ne comptent pas.
RECHERCHES_CLES: tuple[str | tuple[str, tuple[tuple[str, ...], ...]], ...] = (
    "créer une grille de mots fléchés",
    "générateur de mots fléchés",
    "comment créer des mots fléchés",
    "créer des mots fléchés gratuit",
    "faire des mots fléchés",
    "mots fléchés personnalisés",
    "mots fléchés à imprimer",
    "logiciel mots fléchés",
    "mots fléchés du jour",
    "mots fléchés en ligne",
    # Les listes de mots : « mot de 5 lettres finissant par ez », « mots de 3 lettres »… (le nombre ne compte pas)
    ("mot de N lettres (les listes)", (("mot", "mots"), ("lettre*",))),
)
PETITS_MOTS = {"a", "au", "aux", "de", "des", "du", "en", "et", "la", "le", "les", "un", "une", "pour", "avec", "sur"}

# Les questions posées : une requête qui en a la forme (premier mot interrogatif, ou point d'interrogation)
MOTS_QUESTION = {"comment", "quel", "quelle", "quels", "quelles", "pourquoi", "ou", "combien", "qui", "que", "quoi",
                 "quand", "est", "peut", "peuton", "faut", "existe"}
QUESTIONS_POSEES = 15


def phrase_groups(phrase: str) -> tuple[tuple[str, ...], ...]:
    """« créer une grille de mots fléchés » : creer*, grille*, mot*, fleche* (le pluriel et l'accord passent)."""
    words = [word for word in normalize(phrase).split() if word not in PETITS_MOTS]
    return tuple((word.rstrip("sx") + "*",) for word in words)


def is_question(query: str) -> bool:
    words = normalize(query).split()
    return bool(words) and (words[0] in MOTS_QUESTION or query.strip().endswith("?"))


class SeoError(Exception):
    """Un relevé qui n'a pas abouti : réglage, droit ou réponse du moteur. Le message va au tableau de bord."""


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _http(url: str, *, data: bytes | None = None, headers: dict | None = None) -> dict | list:
    request = urllib.request.Request(url, data=data, headers={"User-Agent": _user_agent(), **(headers or {})})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
            return json.loads(response.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:200]
        raise SeoError(f"{urllib.parse.urlsplit(url).netloc} : HTTP {error.code} {detail}") from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise SeoError(f"{urllib.parse.urlsplit(url).netloc} injoignable : {error}") from error


def normalize(text: str) -> str:
    """Minuscules, sans accents ni ponctuation : « Mots fléchés ! » donne « mots fleches »."""
    plain = unicodedata.normalize("NFD", text.lower())
    plain = "".join(char for char in plain if unicodedata.category(char) != "Mn")
    return " ".join(re.findall(r"[a-z0-9]+", plain))


def matches(query: str, groups: tuple[tuple[str, ...], ...]) -> bool:
    words = normalize(query).split()

    def has(alternative: str) -> bool:
        if alternative.endswith("*"):
            return any(word.startswith(alternative[:-1]) for word in words)
        return alternative in words

    return all(any(has(alternative) for alternative in group) for group in groups)


def configured(config=None) -> dict[str, bool]:
    config = config or current_app.config
    return {"google": bool(config.get("GSC_CREDENTIALS_FILE")), "bing": bool(config.get("BING_WEBMASTER_API_KEY"))}


def _site_host(config) -> str:
    return urllib.parse.urlsplit(config.get("FRONTEND_URL") or "").netloc


# --- Google ---

_token_cache: dict[str, tuple[str, float]] = {}


def _google_token(config) -> str:
    path = config["GSC_CREDENTIALS_FILE"]
    cached = _token_cache.get(path)
    if cached and cached[1] > time.time() + 60:
        return cached[0]
    try:
        with open(path, encoding="utf-8") as handle:
            account = json.load(handle)
    except (OSError, ValueError) as error:
        raise SeoError(f"compte de service illisible ({path}) : {error}") from error
    now = int(time.time())
    assertion = jwt.encode(
        {"iss": account["client_email"], "scope": GOOGLE_SCOPE, "aud": account.get("token_uri", GOOGLE_TOKEN_URL),
         "iat": now, "exp": now + 3600},
        account["private_key"], algorithm="RS256",
    )
    body = urllib.parse.urlencode({"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                                   "assertion": assertion}).encode()
    answer = _http(account.get("token_uri", GOOGLE_TOKEN_URL), data=body,
                   headers={"Content-Type": "application/x-www-form-urlencoded"})
    token = answer.get("access_token")
    if not token:
        raise SeoError("Google n'a pas donné de jeton au compte de service")
    _token_cache[path] = (token, time.time() + int(answer.get("expires_in", 3600)))
    return token


def google_property(config) -> str:
    """La propriété Search Console : réglée, ou la propriété de domaine du site (validée par DNS chez Cloudflare)."""
    return config.get("GSC_PROPERTY") or f"sc-domain:{_site_host(config)}"


def _google_post(config, path: str, body: dict) -> dict:
    return _http(f"{GOOGLE_API}{path}", data=json.dumps(body).encode(),
                 headers={"Authorization": f"Bearer {_google_token(config)}", "Content-Type": "application/json"})


def google_rows(config, start: date, end: date, dimensions: list[str]) -> list[dict]:
    prop = urllib.parse.quote(google_property(config), safe="")
    answer = _google_post(config, f"/webmasters/v3/sites/{prop}/searchAnalytics/query", {
        "startDate": start.isoformat(), "endDate": end.isoformat(), "dimensions": dimensions,
        "rowLimit": QUERY_ROWS, "dataState": "all",
    })
    return answer.get("rows", [])


def google_inspect(config, url: str) -> tuple[str | None, str | None]:
    answer = _google_post(config, "/v1/urlInspection/index:inspect",
                          {"inspectionUrl": url, "siteUrl": google_property(config)})
    status = answer.get("inspectionResult", {}).get("indexStatusResult", {})
    return status.get("verdict"), (status.get("coverageState") or "")[:120] or None


# --- Bing ---

def _bing(config, method: str) -> list[dict]:
    params = urllib.parse.urlencode({"siteUrl": bing_site(config), "apikey": config["BING_WEBMASTER_API_KEY"]})
    answer = _http(f"{BING_API}/{method}?{params}")
    rows = answer.get("d") if isinstance(answer, dict) else answer
    return rows or []


def bing_site(config) -> str:
    return config.get("BING_SITE_URL") or f"https://{_site_host(config)}/"


_BING_DATE = re.compile(r"/Date\((-?\d+)")


def bing_day(value: str) -> date | None:
    """« /Date(1697760000000-0700)/ » : des millisecondes depuis 1970 (le décalage horaire ne change pas le jour UTC)."""
    found = _BING_DATE.search(value or "")
    return datetime.fromtimestamp(int(found.group(1)) / 1000, tz=timezone.utc).date() if found else None


# --- Le relevé ---

def _day_row(source: str, day: date, config) -> SeoDaily:
    row = SeoDaily.query.filter_by(site=config["SITE"], source=source, day=day).first()
    if row is None:
        row = SeoDaily(site=config["SITE"], lang=config["SITE_LANG"], source=source, day=day)
        db.session.add(row)
    return row


def _replace_queries(source: str, by_day: dict[date, dict[str, dict]], config) -> None:
    for day, queries in by_day.items():
        SeoQueryDaily.query.filter_by(site=config["SITE"], source=source, day=day).delete()
        for query, figures in queries.items():
            db.session.add(SeoQueryDaily(site=config["SITE"], lang=config["SITE_LANG"], source=source, day=day,
                                         search=query[:200], clicks=figures["clicks"],
                                         impressions=figures["impressions"], position=figures["position"]))


def sync_google(today: date, config=None) -> None:
    config = config or current_app.config
    start, end = today - timedelta(days=SYNC_DAYS), today - timedelta(days=1)
    for row in google_rows(config, start, end, ["date"]):
        day = date.fromisoformat(row["keys"][0])
        target = _day_row("google", day, config)
        target.clicks, target.impressions = int(row.get("clicks", 0)), int(row.get("impressions", 0))
        target.position, target.updated_at = row.get("position"), _utcnow()
    by_day: dict[date, dict[str, dict]] = defaultdict(dict)
    for row in google_rows(config, start, end, ["date", "query"]):
        day, query = date.fromisoformat(row["keys"][0]), row["keys"][1]
        by_day[day][query] = {"clicks": int(row.get("clicks", 0)), "impressions": int(row.get("impressions", 0)),
                              "position": row.get("position")}
    _replace_queries("google", by_day, config)


def sync_bing(today: date, config=None) -> None:
    config = config or current_app.config
    since = today - timedelta(days=SYNC_DAYS)
    for row in _bing(config, "GetRankAndTrafficStats"):
        day = bing_day(row.get("Date"))
        if day and since <= day < today:
            target = _day_row("bing", day, config)
            target.clicks, target.impressions = int(row.get("Clicks", 0)), int(row.get("Impressions", 0))
            target.updated_at = _utcnow()
    for row in _bing(config, "GetCrawlStats"):
        day = bing_day(row.get("Date"))
        if day and since <= day <= today and row.get("InIndex") is not None:
            _day_row("bing", day, config).indexed = int(row["InIndex"])
    by_day: dict[date, dict[str, dict]] = defaultdict(dict)
    for row in _bing(config, "GetQueryStats"):
        day = bing_day(row.get("Date"))
        if day and since <= day < today and row.get("Query"):
            position = row.get("AvgImpressionPosition")
            by_day[day][row["Query"]] = {"clicks": int(row.get("Clicks", 0)),
                                         "impressions": int(row.get("Impressions", 0)),
                                         "position": float(position) if position not in (None, -1) else None}
    _replace_queries("bing", by_day, config)


def sitemap_urls(config) -> list[str]:
    site = (config.get("FRONTEND_URL") or "").rstrip("/")
    request = urllib.request.Request(f"{site}/sitemap.xml", headers={"User-Agent": _user_agent()})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
            body = response.read().decode("utf-8")
    except (urllib.error.URLError, TimeoutError) as error:
        raise SeoError(f"sitemap illisible : {error}") from error
    return re.findall(r"<loc>([^<]+)</loc>", body)


def refresh_urls(config=None) -> None:
    """Les adresses à inspecter suivent le sitemap en ligne : les nouvelles entrent, les disparues sortent."""
    config = config or current_app.config
    urls = set(sitemap_urls(config))
    known = {row.url: row for row in SeoUrlCheck.query.filter_by(site=config["SITE"]).all()}
    for url in urls - known.keys():
        db.session.add(SeoUrlCheck(site=config["SITE"], lang=config["SITE_LANG"], url=url[:300]))
    for url, row in known.items():
        if url not in urls:
            db.session.delete(row)


def inspect_some(now: datetime, config=None, limit: int = INSPECT_PER_TICK) -> int:
    """Quelques adresses, les plus anciennement vues d'abord ; puis le compte des pages indexées du jour."""
    config = config or current_app.config
    stale = (SeoUrlCheck.query.filter(SeoUrlCheck.site == config["SITE"])
             .filter((SeoUrlCheck.checked_at.is_(None)) | (SeoUrlCheck.checked_at < now - INSPECT_EVERY))
             .order_by(SeoUrlCheck.checked_at.asc().nullsfirst()).limit(limit).all())
    for row in stale:
        row.verdict, row.coverage = google_inspect(config, row.url)
        row.checked_at = now
    if stale:
        checked = SeoUrlCheck.query.filter(SeoUrlCheck.site == config["SITE"], SeoUrlCheck.checked_at.isnot(None))
        _day_row("google", now.date(), config).indexed = checked.filter(SeoUrlCheck.verdict == "PASS").count()
        db.session.commit()
    return len(stale)


def _synced_today(source: str, now: datetime, config) -> bool:
    row = SeoDaily.query.filter_by(site=config["SITE"], source=source, day=now.date()).first()
    return bool(row and row.updated_at and row.updated_at.date() == now.date() and row.updated_at.hour >= SYNC_HOUR)


def sync(now: datetime | None = None, force: bool = False, config=None) -> dict[str, str]:
    """Le relevé du jour, moteur par moteur : un échec n'empêche pas l'autre, et se note sur la ligne du jour."""
    now = now or _utcnow()
    config = config or current_app.config
    done = {}
    for source, step in (("google", sync_google), ("bing", sync_bing)):
        if not configured(config)[source]:
            continue
        if not force and (now.hour < SYNC_HOUR or _synced_today(source, now, config)):
            continue
        error = None
        try:
            step(now.date(), config)
            db.session.commit()  # les chiffres relevés restent, même si la liste des adresses échoue ensuite
            if source == "google":
                refresh_urls(config)
        except Exception as failure:  # un réglage faux (clé mal formée, propriété inconnue) se lit au tableau de bord
            db.session.rollback()
            error = str(failure)[:200]
            logger.warning("Relevé SEO %s en échec : %s", source, error)
        marker = _day_row(source, now.date(), config)
        marker.updated_at, marker.sync_error = now, error
        db.session.commit()
        done[source] = error or "ok"
    return done


def tick(now: datetime | None = None) -> None:
    """Chaque minute (alerts.py) : le relevé s'il est dû, puis quelques inspections d'adresses."""
    now = now or _utcnow()
    config = current_app.config
    if not any(configured(config).values()):
        return
    sync(now, config=config)
    if configured(config)["google"]:
        try:
            inspect_some(now, config)
        except SeoError as failure:
            db.session.rollback()
            logger.warning("Inspection d'URL en échec : %s", failure)


# --- Pour le tableau de bord ---

def _window(rows: list, start: date, end: date) -> list:
    return [row for row in rows if start <= row.day <= end]


def _weighted_position(rows) -> float | None:
    weight = sum(row.impressions or 0 for row in rows if row.position is not None)
    if not weight:
        return None
    return round(sum((row.position or 0) * (row.impressions or 0) for row in rows if row.position is not None)
                 / weight, 1)


def _aggregate_queries(rows) -> dict[str, dict]:
    grouped: dict[str, list] = defaultdict(list)
    for row in rows:
        grouped[normalize(row.search)].append(row)
    return {query: {"query": items[0].search, "clicks": sum(r.clicks for r in items),
                    "impressions": sum(r.impressions for r in items), "position": _weighted_position(items)}
            for query, items in grouped.items()}


def summary(days: int, now: datetime | None = None) -> dict:
    """Les chiffres SEO d'une période et de la précédente, la fin calée sur le dernier jour publié par chaque moteur."""
    now = now or _utcnow()
    config = current_app.config
    site = config["SITE"]
    since = now.date() - timedelta(days=2 * days + 7)
    daily = SeoDaily.query.filter(SeoDaily.site == site, SeoDaily.day >= since).all()
    queries = SeoQueryDaily.query.filter(SeoQueryDaily.site == site, SeoQueryDaily.day >= since).all()

    sources = {}
    current_queries, previous_queries = [], []
    for source in SOURCES:
        rows = [row for row in daily if row.source == source]
        published = [row.day for row in rows if row.impressions is not None]
        marker = next((row for row in rows if row.day == now.date()), None)
        indexed = max((row for row in rows if row.indexed is not None), key=lambda row: row.day, default=None)
        state = {
            "configured": configured(config)[source],
            "last_sync": marker.updated_at.isoformat(timespec="minutes") + "Z" if marker else None,
            "error": marker.sync_error if marker else None,
            "indexed": indexed.indexed if indexed else None,
        }
        if published:
            end = max(published)
            start, previous_end = end - timedelta(days=days - 1), end - timedelta(days=days)
            previous_start = previous_end - timedelta(days=days - 1)
            current, previous = _window(rows, start, end), _window(rows, previous_start, previous_end)
            state.update({
                "through": end.isoformat(),
                "clicks": sum(row.clicks or 0 for row in current),
                "clicks_before": sum(row.clicks or 0 for row in previous),
                "impressions": sum(row.impressions or 0 for row in current),
                "impressions_before": sum(row.impressions or 0 for row in previous),
                "daily": [{"day": row.day.isoformat(), "clicks": row.clicks or 0, "impressions": row.impressions or 0}
                          for row in sorted(current, key=lambda row: row.day)],
            })
            mine = [row for row in queries if row.source == source]
            current_queries += _window(mine, start, end)
            previous_queries += _window(mine, previous_start, previous_end)
            # Google donne sa position du jour ; Bing seulement par requête
            state["position"] = (_weighted_position(current) if source == "google"
                                 else _weighted_position(_window(mine, start, end)))
            state["position_before"] = (_weighted_position(previous) if source == "google"
                                        else _weighted_position(_window(mine, previous_start, previous_end)))
        sources[source] = state

    now_q, before_q = _aggregate_queries(current_queries), _aggregate_queries(previous_queries)
    rising = []
    for key, figures in now_q.items():
        before = before_q.get(key, {"clicks": 0, "impressions": 0, "position": None})
        rising.append({**figures, "clicks_before": before["clicks"], "impressions_before": before["impressions"],
                       "position_before": before["position"]})
    rising.sort(key=lambda q: (-(q["clicks"] - q["clicks_before"]), -(q["impressions"] - q["impressions_before"]),
                               q["query"]))

    questions = []
    for label, groups in QUESTIONS:
        entry = {"question": label}
        for source in SOURCES:
            matched = [row for row in current_queries if row.source == source and matches(row.search, groups)]
            entry[source] = ({"position": _weighted_position(matched), "clicks": sum(r.clicks for r in matched),
                              "impressions": sum(r.impressions for r in matched)} if matched else None)
        questions.append(entry)

    def ranking(rows):
        return ({"position": _weighted_position(rows), "clicks": sum(r.clicks for r in rows),
                 "impressions": sum(r.impressions for r in rows)} if rows else None)

    key_searches = []
    for item in RECHERCHES_CLES:
        phrase, groups = item if isinstance(item, tuple) else (item, phrase_groups(item))
        entry = {"search": phrase}
        for source in SOURCES:
            entry[source] = ranking([row for row in current_queries if row.source == source and matches(row.search, groups)])
            before = [row for row in previous_queries if row.source == source and matches(row.search, groups)]
            entry[f"{source}_position_before"] = _weighted_position(before) if before else None
        key_searches.append(entry)

    asked = [figures for key, figures in now_q.items() if is_question(figures["query"])]
    asked.sort(key=lambda q: (-q["impressions"], q["query"]))

    return {
        "sources": sources,
        "sitemap_urls": SeoUrlCheck.query.filter_by(site=site).count(),
        "rising": rising[:8],
        "key_searches": key_searches,
        "asked": asked[:QUESTIONS_POSEES],
        "questions": questions,
    }


# --- En ligne de commande ---

seo_cli = AppGroup("seo", help="Les chiffres de Google et Bing pour le poste de pilotage (ADR 0029).")


@seo_cli.command("sync")
def sync_command():
    """Relève maintenant, sans attendre l'heure du minuteur (utile après avoir posé les clés)."""
    done = sync(force=True)
    if not done:
        click.echo("Rien à relever : ni GSC_CREDENTIALS_FILE ni BING_WEBMASTER_API_KEY ne sont réglés.")
    for source, outcome in done.items():
        click.echo(f"{source} : {outcome}")


@seo_cli.command("status")
def status_command():
    """Ce que le poste de pilotage montrera : la période de 7 jours, moteur par moteur."""
    click.echo(json.dumps(summary(7)["sources"], ensure_ascii=False, indent=2))


def init_seo_cli(app) -> None:
    app.cli.add_command(seo_cli)
