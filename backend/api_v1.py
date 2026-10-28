"""L'API ouverte : la référence pour créer des mots fléchés, dans toutes les langues ([ADR 0032](../docs/adr/0032-api-ouverte.md)).

Une adresse internationale, un contrat stable, en tâche de fond dès le départ. On ne stocke pas les grilles : une grille
est un fichier JSON (grid_file.py) qui appartient à qui l'a reçu, et qu'il nous renvoie.
- `GET /v1` : la notice, lisible par un modèle. Ce que fait le service et ce qu'il ne fait pas, les règles du genre,
  **le rôle de l'appelant** (il choisit les mots et écrit les définitions), les guides de style par langue, les
  niveaux, les langues, les limites du demandeur et la marche à suivre ;
- `POST /v1/grids` (`lang` est un paramètre de la génération) inscrit une génération et répond aussitôt `202` ;
- `GET /v1/grids/{id}` rend son état, puis le fichier de la grille (gardé 24 heures, le temps d'être récupéré) ;
- `POST /v1/clues/check` : un fichier et ses définitions ; ce qui ne va pas (refus) et ce qui sonne dictionnaire
  (alertes de style), et, si tout va, les liens pour jouer la grille ou l'ouvrir sur le site ;
- `POST /v1/render` : un fichier, dessiné en SVG, PNG ou PDF, à remplir ou sa solution, toujours signé ;
- `GET /v1/limits` : les quotas du demandeur et ce qu'il en a consommé.

Le demandeur est une clé (`Authorization: Bearer flk_…`, api_keys.py), valable pour toutes les langues quel que soit
le site de son compte ; ou, sans clé, une empreinte du jour (ADR 0016) : un niveau anonyme très bas, pour essayer.
Ni cookie ni CORS : des appels de serveur à serveur (le chemin `/v1/` est hors de celui des cookies du site, `/api/`).
Toute erreur porte un `reason` stable ; le message suit `Accept-Language` (api_messages.py).

Ce site reçoit les appels (`API_HOME`) ; chaque site calcule les grilles de sa langue (generation_runner.py).

Sécurité (point 9) : corps borné et schéma strict, formats plus petits que ceux du site, budget de temps fixe, une
génération à la fois par demandeur, quotas comptés en base (partagés entre workers), plafond global, file bornée,
disjoncteur par langue, garde contre l'aspiration du lexique.
"""

import hashlib
import json
import math
import secrets
from urllib.parse import urlparse
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

from flask import Blueprint, Response, current_app, g, jsonify, request
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError
from werkzeug.exceptions import HTTPException

import alerts
import grid_file
import usage
from api_keys import authenticate
from api_messages import LANGUAGE_NAMES, message, pick_language, who
from engine.langues import LANGUES, langue
from engine.mystery import MAX_LETTERS, MIN_LETTERS, letters_in
from generation_runner import HEARTBEAT_STALE_S
from grid_generator import drawable
from grid_render import clue_capacity, render_pdf, render_png, render_svg
from models import ApiKey, ApiRunner, GenerationJob, db
from monitoring import report_exception
from normalization import normalize_phrase, normalize_word
from schemas import MAX_SEED

api_v1_bp = Blueprint("api_v1", __name__, url_prefix="/v1")

# Les formats que l'API génère : plus petits que ceux du site (5 à 20), pour borner le coût d'un appel
MIN_SIDE, MAX_SIDE = 5, 15
MAX_REQUIRED_WORDS = 10
MAX_PREFERRED_WORDS = 60
# Les formats conseillés, ceux qui réussissent le mieux dans le budget de l'API
RECOMMENDED_FORMATS = [(8, 8), (10, 10), (9, 12), (12, 12), (12, 15)]
JOB_ID_PREFIX = "gen_"
# Ce qu'un client attend avant de redemander l'état d'une génération qui n'a pas fini
POLL_AFTER_S = 2
JOB_RETENTION = timedelta(days=1)
PNG_WIDTHS = (400, 3000)

ApiWord = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40,
                                           pattern=grid_file.PLAIN_TEXT)]


class StrictModel(BaseModel):
    # Un champ inconnu est refusé : un client qui se trompe de nom le sait tout de suite, au lieu d'être ignoré
    model_config = ConfigDict(extra="forbid")


class CreateGridRequest(StrictModel):
    # « arrowword » : les mots fléchés ; les mots croisés viendront sans casser les clients
    type: Literal["arrowword"] = "arrowword"
    lang: Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, pattern=r"^[a-z]{2}$")]
    # Bornes de garde : les bornes de l'API (MIN_SIDE, MAX_SIDE) se vérifient dans la route, avec leur `reason`
    width: Annotated[int, Field(ge=1, le=100)] = 10
    height: Annotated[int, Field(ge=1, le=100)] = 10
    level: Literal["easy", "medium", "hard"] = "medium"
    required_words: Annotated[list[ApiWord], Field(max_length=MAX_REQUIRED_WORDS)] = Field(default_factory=list)
    preferred_words: Annotated[list[ApiWord], Field(max_length=MAX_PREFERRED_WORDS)] = Field(default_factory=list)
    seed: Annotated[int, Field(ge=0, le=MAX_SEED)] | None = None
    mystery_word: Annotated[str, StringConstraints(strip_whitespace=True, max_length=40,
                                                   pattern=grid_file.PLAIN_TEXT)] | None = None


class GridFileRequest(StrictModel):
    grid: grid_file.GridFileIn


class RenderRequest(StrictModel):
    grid: grid_file.GridFileIn
    format: Literal["svg", "png", "pdf"] = "svg"
    # « puzzle » : la grille à remplir, avec ses définitions ; « solution » : les lettres
    view: Literal["puzzle", "solution"] = "puzzle"
    width: Annotated[int, Field(ge=PNG_WIDTHS[0], le=PNG_WIDTHS[1])] | None = None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _iso(moment: datetime | None) -> str | None:
    return moment.isoformat(timespec="seconds") + "Z" if moment else None


def _lang() -> str:
    return g.get("msg_lang") or pick_language(request.headers.get("Accept-Language"))


def refuse(status: int, reason: str, retry_after: float | None = None, params: dict | None = None, **extra):
    response = jsonify({"error": message(reason, _lang(), **(params or {})), "reason": reason, **extra})
    response.status_code = status
    if retry_after is not None:
        g.api_retry_after = str(max(1, math.ceil(retry_after)))
    if status == 401:
        response.headers["WWW-Authenticate"] = 'Bearer realm="api"'
    return response


# --- Erreurs : dans la langue du demandeur, avec leur `reason` ---

VALIDATION_TEXTS = {
    "missing": {"en": "« {field} » is required", "fr": "« {field} » est obligatoire",
                "de": "„{field}“ ist erforderlich"},
    "extra_forbidden": {"en": "« {field} » is not a field of this request", "fr": "le champ « {field} » n'existe pas",
                        "de": "„{field}“ ist kein Feld dieser Anfrage"},
    "too_long": {"en": "« {field} » is too long", "fr": "« {field} » est trop long", "de": "„{field}“ ist zu lang"},
    "type": {"en": "« {field} » has the wrong type", "fr": "« {field} » n'a pas le bon type",
             "de": "„{field}“ hat den falschen Typ"},
    "value": {"en": "« {field} » is out of range or malformed", "fr": "« {field} » est hors limites ou mal formé",
              "de": "„{field}“ liegt außerhalb des Bereichs oder ist fehlerhaft"},
    "body": {"en": "the body must be a JSON object", "fr": "le corps doit être un objet JSON",
             "de": "der Körper muss ein JSON-Objekt sein"},
}


def _validation_text(kind: str, field: str, lang: str) -> str:
    if kind in ("missing", "extra_forbidden"):
        key = kind
    elif kind in ("too_long", "string_too_long"):
        key = "too_long"
    elif kind.endswith("_type") or kind.endswith("_parsing") or kind in ("int_from_float", "literal_error"):
        key = "type"
    else:
        key = "value"
    return VALIDATION_TEXTS[key][lang].format(field=field)


def parse_strict(model):
    """Le corps validé par son schéma ; une erreur part en 400 `invalid_request`, dans la langue du demandeur."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None, refuse(400, "invalid_request", params={"detail": VALIDATION_TEXTS["body"][_lang()]})
    try:
        return model.model_validate(data), None
    except ValidationError as exc:
        details = []
        for error in exc.errors(include_url=False, include_input=False):
            field = ".".join(str(part) for part in error["loc"])
            details.append({"field": field, "type": error["type"],
                            "message": _validation_text(error["type"], field, _lang())})
        return None, refuse(400, "invalid_request", params={"detail": details[0]["message"]}, details=details)


@api_v1_bp.errorhandler(HTTPException)
def http_error(error: HTTPException):
    reasons = {404: "not_found", 405: "method_not_allowed", 413: "payload_too_large", 429: "rate_limited"}
    response = refuse(error.code or 500, reasons.get(error.code, "internal_error"))
    if error.code == 429:
        g.pop("api_retry_after", None)  # le limiteur pose le sien
    return response


@api_v1_bp.errorhandler(Exception)
def unexpected_error(error: Exception):
    current_app.logger.exception("Erreur non gérée sur %s %s", request.method, request.path)
    report_exception(error)
    return refuse(500, "internal_error")


# --- Avant toute route : l'interrupteur, le corps, la clé ---

@api_v1_bp.before_request
def guard():
    config = current_app.config
    g.msg_lang = pick_language(request.headers.get("Accept-Language"))
    if not config["API_ENABLED"] or not config["API_HOME"]:
        return refuse(503, "api_disabled")
    if request.method in ("POST", "PUT"):
        length = request.content_length
        if length is None:
            return refuse(411, "length_required")
        if length > config["API_MAX_BODY_BYTES"]:
            return refuse(413, "payload_too_large", params={"max_kb": config["API_MAX_BODY_BYTES"] // 1024})
        if request.mimetype != "application/json":
            return refuse(415, "unsupported_media_type")
    key, refusal = authenticate(request.headers.get("Authorization"))
    if refusal:
        return refuse(401, refusal)
    g.api_key = key
    # L'empreinte du jour, comme pour la mesure d'usage : jamais l'adresse elle-même
    g.api_visitor = usage.visitor_fingerprint(_utcnow().date())


RATE_LIMIT_HEADERS = ("X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset")


@api_v1_bp.after_app_request
def own_headers(response):
    """Les en-têtes de l'API, posés après ceux du limiteur de débit (enregistré plus tard, il passe avant).

    Le limiteur réécrit `Retry-After` sur toute réponse, avec la fin de sa fenêtre d'une minute : un 202 dirait
    d'attendre 60 s au lieu de 2. Ses en-têtes X-RateLimit parlent d'un plafond par adresse, pas des quotas du
    demandeur (`GET /v1/limits`) : retirés, ils ne tromperont personne. Seul son propre refus garde son délai.
    """
    if request.blueprint != api_v1_bp.name:
        return response
    for name in RATE_LIMIT_HEADERS:
        response.headers.pop(name, None)
    # Retiré de `g` : un contexte d'application partagé (tests, commandes) ne le passe pas à la requête suivante
    retry_after = g.pop("api_retry_after", None)
    if retry_after is not None:
        response.headers["Retry-After"] = retry_after
    elif response.status_code != 429:
        response.headers.pop("Retry-After", None)
    # Une réponse de l'API ne vaut que pour son demandeur et à cet instant
    response.headers["Cache-Control"] = "no-store"
    response.headers["Content-Language"] = g.get("msg_lang") or "en"
    response.headers["Vary"] = "Accept-Language, Authorization"
    return response


# --- Les langues et le savoir-faire ---

def language_status(runner: ApiRunner | None, now: datetime) -> str:
    if runner is None or runner.beat_at < now - timedelta(seconds=HEARTBEAT_STALE_S):
        return "unavailable"
    if runner.paused_until and runner.paused_until > now:
        return "paused"
    return "available"


# Les règles du genre, que les IA connaissent mal (essais du 27/10/2026, docs/API-BESOINS.md)
GENRE_RULES = [
    "An arrowword grid has letter cells and clue cells. Every clue cell holds one or two clues, each with an arrow "
    "pointing to its answer; a clue cell holding two clues is split in two halves.",
    "Every run of two letters or more, across or down, is a real word, and every word has its clue in the cell just "
    "before it (left of an across word, above a down word), or in a bent-arrow cell at the edge.",
    "Every letter belongs to at least one word; no clue cell is left without a clue.",
    "Answers are written without accents, spaces, hyphens or apostrophes (see languages[].normalization).",
    "A clue is short and plays on words: it is not a dictionary definition. It matches the answer's part of speech and "
    "number (a verb clue for a verb), never contains the answer or its root, and fits its cell.",
    "Building a valid grid by hand is a hard constraint search that language models fail at (unchecked crossings, "
    "made-up words): use this engine for the grid, and write the clues yourself.",
]

STYLE_GUIDES = {
    "fr": {
        "genre": "Mots fléchés",
        "rules": [
            "Une définition tient en 1 à 4 mots, sans phrase ni relative (« qui », « que l'on »).",
            "Elle prend la nature de la réponse : un verbe conjugué pour un verbe conjugué, un pluriel pour un pluriel, "
            "un féminin pour un féminin.",
            "Le genre aime le double sens, le décalage et le piège sur la nature du mot (on croit chercher un nom, "
            "c'est un verbe).",
            "Jamais le mot lui-même, ni un mot de sa famille.",
            "Un mot rare ou technique se définit simplement ; un mot courant peut se définir avec malice.",
        ],
        "examples": [
            {"answer": "ANS", "dictionary": "Nombre d'années écoulées depuis la naissance", "arrowword": "Se fêtent"},
            {"answer": "GATEAU", "dictionary": "Pâtisserie servie lors d'une fête", "arrowword": "Porte des bougies"},
            {"answer": "ROSES", "dictionary": "Fleurs que l'on peut offrir", "arrowword": "Ont des épines"},
            {"answer": "ENTONNER", "dictionary": "Commencer à chanter", "arrowword": "Lancer l'air"},
            {"answer": "AMIS", "dictionary": "Personnes proches qui participent à la fête", "arrowword": "Sont de la fête"},
        ],
    },
    "de": {
        "genre": "Schwedenrätsel",
        "rules": [
            "Ein Hinweis hat 1 bis 3 Wörter, ohne Satz und ohne Relativsatz.",
            "Er passt grammatisch zur Lösung: ein Verb für ein Verb, ein Plural für einen Plural.",
            "Doppelsinn und Wortspiel sind willkommen.",
            "Nie das Wort selbst oder seinen Stamm.",
            "Im Raster stehen Ä, Ö, Ü und ß als AE, OE, UE und SS.",
        ],
        "examples": [
            {"answer": "KUCHEN", "dictionary": "Süßes Gebäck, das man zum Geburtstag isst", "arrowword": "Trägt Kerzen"},
            {"answer": "ROSEN", "dictionary": "Blumen, die man verschenken kann", "arrowword": "Haben Dornen"},
            {"answer": "FEIERN", "dictionary": "Ein Fest begehen", "arrowword": "Party machen"},
        ],
    },
    "en": {
        "genre": "Arrowword",
        "rules": [
            "A clue has 1 to 4 words: no sentence, no relative clause.",
            "It matches the answer's part of speech and number: a verb for a verb, a plural for a plural.",
            "Wordplay and double meanings are welcome.",
            "Never the answer itself or its root.",
            "Cells hold letters only: no spaces, no hyphens.",
        ],
        "examples": [
            {"answer": "CAKE", "dictionary": "A sweet baked food eaten at celebrations", "arrowword": "Has candles"},
            {"answer": "ROSES", "dictionary": "Flowers that people often give", "arrowword": "Thorny gifts"},
            {"answer": "PALS", "dictionary": "People who are close to you", "arrowword": "Mates"},
        ],
    },
}

LEVELS = {
    "easy": {"words": "More common words in the grid.",
             "clues": "Direct clues: a synonym or a plain description, no traps. For children and beginners."},
    "medium": {"words": "The engine's usual choice of words.",
               "clues": "Classic clues, with some wordplay."},
    "hard": {"words": "The engine's usual choice of words.",
             "clues": "Double meanings, misleading part of speech, wordplay throughout: the difficulty is in the clues."},
}

NORMALIZATION = {
    "fr": "Uppercase A–Z: accents dropped (É → E), ligatures split (Œ → OE), no spaces, hyphens or apostrophes.",
    "de": "Uppercase A–Z: Ä → AE, Ö → OE, Ü → UE, ß → SS; no spaces or hyphens.",
    "en": "Uppercase A–Z: no spaces, hyphens or apostrophes.",
}


def language_json(code: str, runner: ApiRunner | None, now: datetime) -> dict:
    return {
        "code": code,
        "name": LANGUAGE_NAMES.get(code, {}).get(_lang(), code),
        "status": language_status(runner, now),
        "alphabet": langue(code).alphabet,
        "normalization": NORMALIZATION.get(code, ""),
        "style": STYLE_GUIDES.get(code),
    }


def _site_url(code: str) -> str:
    """Le site de cette langue, où mènent les liens « jouer » et « ouvrir » ; à défaut, celui-ci."""
    runner = db.session.get(ApiRunner, code)
    return runner.site_url if runner else current_app.config["FRONTEND_URL"].rstrip("/")


def _product() -> str:
    return current_app.config.get("API_PRODUCT_NAME") or current_app.config["SITE_NAME"]


def _signature() -> str:
    """L'adresse du site, sans « www. » : la signature des grilles dessinées (« Grille créée avec l'API de … »)."""
    host = urlparse(current_app.config["FRONTEND_URL"]).hostname or ""
    return host.removeprefix("www.")


# --- Les limites du demandeur ---

def _limits(key: ApiKey | None) -> dict:
    config = current_app.config
    if key is not None:
        return {"per_minute": config["API_KEY_PER_MINUTE"], "per_day": config["API_KEY_PER_DAY"],
                "words_per_day": config["API_KEY_WORDS_PER_DAY"]}
    return {"per_minute": config["API_ANON_PER_MINUTE"], "per_day": config["API_ANON_PER_DAY"],
            "words_per_day": config["API_ANON_WORDS_PER_DAY"]}


def _own_jobs(key: ApiKey | None):
    if key is not None:
        return GenerationJob.query.filter(GenerationJob.api_key_id == key.id)
    return GenerationJob.query.filter(GenerationJob.api_key_id.is_(None), GenerationJob.visitor == g.api_visitor)


def _usage_of(key: ApiKey | None, now: datetime) -> dict:
    day = _own_jobs(key).filter(GenerationJob.created_at > now - timedelta(days=1))
    return {
        "last_minute": _own_jobs(key).filter(GenerationJob.created_at > now - timedelta(minutes=1)).count(),
        "last_day": day.count(),
        "words_last_day": int(day.with_entities(db.func.coalesce(db.func.sum(GenerationJob.word_count), 0)).scalar()),
    }


def _seconds_until_window_frees(key: ApiKey | None, now: datetime, window: timedelta) -> float:
    oldest = (_own_jobs(key).filter(GenerationJob.created_at > now - window)
              .order_by(GenerationJob.created_at).first())
    return (oldest.created_at + window - now).total_seconds() if oldest else window.total_seconds()


def quota_refusal(key: ApiKey | None, settings_hash: str, now: datetime):
    """Le refus qui s'applique à cette demande, dans l'ordre où un client peut y remédier ; None si elle passe."""
    config = current_app.config
    limits = _limits(key)
    whom = who(key is not None, _lang())

    if _own_jobs(key).filter(GenerationJob.status.in_(("queued", "running"))).first() is not None:
        return refuse(429, "generation_in_progress", retry_after=POLL_AFTER_S)
    used = _usage_of(key, now)
    if used["last_minute"] >= limits["per_minute"]:
        return refuse(429, "quota_minute", params={"limit": limits["per_minute"], "who": whom},
                      retry_after=_seconds_until_window_frees(key, now, timedelta(minutes=1)))
    if used["last_day"] >= limits["per_day"]:
        return refuse(429, "quota_day", params={"limit": limits["per_day"], "who": whom},
                      retry_after=_seconds_until_window_frees(key, now, timedelta(days=1)))
    if used["words_last_day"] >= limits["words_per_day"]:
        return refuse(429, "quota_words", params={"limit": limits["words_per_day"], "who": whom},
                      retry_after=_seconds_until_window_frees(key, now, timedelta(days=1)))

    # Contre l'aspiration du lexique : les mêmes réglages, graine après graine
    repeats = (_own_jobs(key).filter(GenerationJob.settings_hash == settings_hash,
                                     GenerationJob.created_at > now - timedelta(days=1)).count())
    if repeats >= config["API_SAME_SETTINGS_PER_DAY"]:
        alerts.deliver("api_abuse", now.strftime("%Y-%m-%d"),
                       f"Réglages répétés {repeats} fois en 24 h ({key.prefix if key else 'sans clé'})",
                       f"Une clé enchaîne les mêmes réglages de génération ({repeats} fois en 24 heures) : un essai "
                       f"d'aspiration du lexique ? Clé : {key.prefix + '…' if key else 'appels sans clé'}. "
                       "Pour la fermer : flask api revoke <début de la clé>.", now=now)
        return refuse(429, "repeated_settings",
                      retry_after=_seconds_until_window_frees(key, now, timedelta(days=1)))

    # Le plafond de tout le service, qui borne le coût total ; plus bas pour les appels sans clé
    day = GenerationJob.query.filter(GenerationJob.created_at > now - timedelta(days=1))
    if day.count() >= config["API_DAILY_CAP"] or (
            key is None and day.filter(GenerationJob.api_key_id.is_(None)).count() >= config["API_ANON_DAILY_CAP"]):
        return refuse(429, "quota_global", retry_after=3600)

    queued = GenerationJob.query.filter_by(status="queued").count()
    if queued >= config["API_QUEUE_MAX"]:
        return refuse(429, "busy", retry_after=queued * config["API_TIME_BUDGET_S"])
    return None


# --- Une génération telle que le client la lit ---

def settings_hash_of(params: dict) -> str:
    settings = {name: value for name, value in params.items() if name != "seed"}
    return hashlib.sha256(json.dumps(settings, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def _explained(item: dict) -> dict:
    """Une erreur ou une alerte (`reason`, `params`, détails), avec son message dans la langue du lecteur."""
    params = item.get("params") or {}
    return {"reason": item["reason"], "message": message(item["reason"], _lang(), **params),
            **{name: value for name, value in item.items() if name not in ("reason", "params")}}


def job_json(job: GenerationJob) -> dict:
    body = {"id": job.public_id, "status": job.status, "lang": job.lang, "created_at": _iso(job.created_at),
            "expires_at": _iso(job.expires_at)}
    if job.status == "queued":
        body["queue_position"] = 1 + GenerationJob.query.filter(
            GenerationJob.status == "queued", GenerationJob.lang == job.lang,
            db.or_(GenerationJob.priority < job.priority,
                   db.and_(GenerationJob.priority == job.priority, GenerationJob.id < job.id))).count()
    if job.started_at:
        body["started_at"] = _iso(job.started_at)
    if job.finished_at:
        body["finished_at"] = _iso(job.finished_at)
    if job.status == "done":
        body["grid"] = job.result["grid"]
        if job.result.get("warnings"):
            body["warnings"] = [_explained(warning) for warning in job.result["warnings"]]
        body["next"] = ("Keep this grid file: it is yours, and deleted from our side after 24 hours. Write one clue per "
                        "word in words[].clue (fitting clue_max_chars; see GET /v1 for the style of this language and "
                        "level), then POST it to /v1/clues/check, which returns links to play or print it; "
                        "POST /v1/render draws it as SVG, PNG or PDF.")
    elif job.status == "failed":
        body["error"] = _explained(job.result or {"reason": job.reason or "internal_error"})
    else:
        body["next"] = f"Poll GET /v1/grids/{job.public_id} again after Retry-After seconds."
    return body


def _with_poll_headers(response, job: GenerationJob):
    if job.status in ("queued", "running"):
        g.api_retry_after = str(POLL_AFTER_S)
    return response


def _readable_job(public_id: str) -> GenerationJob | None:
    """La génération de ce numéro, si le demandeur peut la lire : avec sa clé si elle en a une, sinon par son numéro."""
    job = GenerationJob.query.filter_by(public_id=public_id).first() if public_id.startswith(JOB_ID_PREFIX) else None
    if job is None or job.expires_at < _utcnow():
        return None
    if job.api_key_id is not None and (g.api_key is None or g.api_key.id != job.api_key_id):
        return None
    return job


def _read_file(data: grid_file.GridFileIn):
    """Le fichier relu, ou la réponse 400 `invalid_grid` qui dit pourquoi."""
    if data.lang not in LANGUES:
        return None, refuse(400, "unsupported_lang", params={"lang": data.lang, "supported": ", ".join(sorted(LANGUES))},
                            supported=sorted(LANGUES))
    grid, problems = grid_file.read(data)
    if problems:
        return None, refuse(400, "invalid_grid", details=problems)
    return grid, None


# --- Les routes ---

@api_v1_bp.route("", methods=["GET"], strict_slashes=False)
def notice():
    """La notice : tout ce qu'un programme ou un modèle doit savoir avant son premier appel."""
    config = current_app.config
    now = _utcnow()
    known = {runner.lang: runner for runner in ApiRunner.query.all()}
    product = _product()
    return jsonify({
        "name": f"{product} API",
        "version": "1",
        "summary": ("The reference engine for arrowword puzzles (French « mots fléchés », German « Schwedenrätsel »): "
                    "grids whose clues sit in cells inside the grid, with arrows pointing to their answers. You choose "
                    "the language, the size, the level and the words; the engine builds a valid grid around them in a "
                    "few seconds, and guides you in writing the clues."),
        "what_it_does": [
            "Builds a valid arrowword grid in the language you ask for, 5 to 15 cells a side, around your words: "
            "required words (all placed, or the generation fails) and preferred words (placed when possible).",
            "Returns the grid as a JSON file that is yours (we keep nothing after 24 hours); takes that file back to "
            "check your clues, draw it (SVG, PNG, PDF) and link to a page where a person plays or prints it.",
            "Tells you, for every word, where its clue goes and how many characters fit; checks that your clues fit, "
            "do not give the answer away, and sound like arrowword clues rather than dictionary entries.",
            "Numbers the cells of a mystery word (a name, a short message) when you give one.",
            "Gives the same grid again for the same seed and the same settings.",
        ],
        "what_it_does_not": [
            "It does not write clues: you do (see your_role and languages[].style).",
            "It does not look words up: no dictionary, no pattern search, no word lists.",
            "It does not make crosswords with black squares, yet: arrowwords only (type « arrowword »).",
        ],
        "genre_rules": GENRE_RULES,
        "your_role": ("You are the puzzle author; the engine is the builder. Choose the words that make the grid "
                      "personal (a theme, a person, an event) and the level for the person who will play it. When the "
                      "grid is built, write one clue per word, in the grid's language and in the style of "
                      "languages[].style for that level, within clue_max_chars. Check them, then give the person the "
                      "links to play or print the grid, or the drawing they asked for."),
        "workflow": [
            {"step": 1, "call": "POST /v1/grids",
             "body": {"type": "arrowword", "lang": "fr", "width": 10, "height": 10, "level": "easy",
                      "required_words": ["Léa"], "preferred_words": ["anniversaire", "gâteau", "bougie"],
                      "mystery_word": "Bravo"},
             "returns": "202, with Location and Retry-After"},
            {"step": 2, "call": "GET /v1/grids/{id}",
             "note": "Every Retry-After seconds until status is « done » (a few seconds) or « failed »."},
            {"step": 3, "call": "POST /v1/clues/check", "body": {"grid": "the grid file, with words[].clue filled in"},
             "note": "Errors must be fixed; style warnings are advice. When there are no errors, it returns links to "
                     "play the grid online or open it to print, download its PDF or edit it."},
            {"step": 4, "call": "POST /v1/render",
             "body": {"grid": "the grid file", "format": "svg | png | pdf", "view": "puzzle | solution"},
             "note": "The drawn grid, signed. Show the puzzle, then the solution when the person asks."},
        ],
        "languages": [language_json(code, known.get(code), now) for code in sorted(LANGUES)],
        "levels": LEVELS,
        "formats": {"min_side": MIN_SIDE, "max_side": MAX_SIDE,
                    "recommended": [{"width": width, "height": height} for width, height in RECOMMENDED_FORMATS],
                    "max_required_words": MAX_REQUIRED_WORDS, "max_preferred_words": MAX_PREFERRED_WORDS,
                    "mystery_word_letters": {"min": MIN_LETTERS, "max": MAX_LETTERS}},
        "clues": {"max_chars_full_cell": clue_capacity("right", False),
                  "max_chars_half_cell": clue_capacity("right", True),
                  "max_length": grid_file.MAX_CLUE_LENGTH, "style_max_words": grid_file.STYLE_MAX_WORDS,
                  "use": "Only to check and draw this grid; never stored, never reused."},
        "grid_file": {"format": grid_file.FORMAT, "version": grid_file.VERSION,
                      "note": "Public and versioned. Unknown fields are ignored; clue cells, arrows and space are "
                              "recomputed from rows and word positions."},
        "limits": {"keyed": g.api_key is not None, **_limits(g.api_key), "used": _usage_of(g.api_key, now),
                   "one_generation_at_a_time": True, "time_budget_s": config["API_TIME_BUDGET_S"],
                   "results_kept_hours": int(JOB_RETENTION.total_seconds() // 3600)},
        "authentication": ("Optional. Without a key: a low anonymous level to try. With a key "
                           "(Authorization: Bearer flk_…), created in the account page of the website, valid for "
                           "every language."),
        "messages": "Every error has a stable « reason »; its « message » follows Accept-Language (en, fr, de).",
        "license": (f"Grids are free to use, including commercially. Every drawing is signed « made with the "
                    f"{_signature()} API »; "
                    f"attribution appreciated. Terms: {config['FRONTEND_URL'].rstrip('/')}/terms"),
    }), 200


@api_v1_bp.route("/limits", methods=["GET"])
def limits():
    now = _utcnow()
    return jsonify({"keyed": g.api_key is not None, "limits": _limits(g.api_key), "used": _usage_of(g.api_key, now),
                    "time_budget_s": current_app.config["API_TIME_BUDGET_S"]}), 200


def _normalized_words(words: list[str], code: str) -> tuple[list[str], list[str]]:
    """Les mots tels que la grille les écrit, et ceux dont une lettre n'est pas de l'alphabet de la langue."""
    alphabet = set(langue(code).alphabet)
    normalized, foreign = [], []
    for word in words:
        letters = normalize_word(word, code)
        if not letters or set(letters) - alphabet:
            foreign.append(word)
        else:
            normalized.append(letters)
    return normalized, foreign


@api_v1_bp.route("/grids", methods=["POST"])
def create_grid():
    config = current_app.config
    key = g.api_key
    usage.add_details(client="api", keyed=key is not None)
    payload, refusal = parse_strict(CreateGridRequest)
    if refusal:
        return refusal
    code = payload.lang
    usage.add_details(api_lang=code, level=payload.level)
    now = _utcnow()
    if code not in LANGUES:
        return refuse(400, "unsupported_lang", params={"lang": code, "supported": ", ".join(sorted(LANGUES))},
                      supported=sorted(LANGUES))
    width, height = payload.width, payload.height
    usage.add_details(format=f"{width}x{height}")
    if not all(MIN_SIDE <= side <= MAX_SIDE for side in (width, height)):
        return refuse(400, "size_out_of_range", params={"min_side": MIN_SIDE, "max_side": MAX_SIDE},
                      min_side=MIN_SIDE, max_side=MAX_SIDE)
    if not drawable(width, height):
        return refuse(422, "geometry_unavailable", params={"width": width, "height": height})

    required, foreign_required = _normalized_words(payload.required_words, code)
    preferred, foreign_preferred = _normalized_words(payload.preferred_words, code)
    foreign = foreign_required + foreign_preferred
    if foreign:
        return refuse(400, "invalid_letters", params={"lang": code, "words": ", ".join(foreign)}, words=foreign)
    odd = [word for word in required + preferred if not 2 <= len(word) <= MAX_SIDE]
    if odd:
        return refuse(400, "word_length", params={"max_side": MAX_SIDE, "words": ", ".join(odd)}, words=odd)
    required = sorted(set(required))
    preferred = sorted(set(preferred) - set(required))
    too_long = [word for word in required if len(word) > max(width, height)]
    if too_long:
        return refuse(422, "must_words", params={"words": ", ".join(too_long)},
                      details=[{"word": word, "length": len(word)} for word in too_long])
    mystery = normalize_phrase(payload.mystery_word or "", code)
    if mystery and not MIN_LETTERS <= len(letters_in(mystery)) <= MAX_LETTERS:
        return refuse(400, "mystery_word_length", params={"min_letters": MIN_LETTERS, "max_letters": MAX_LETTERS})

    runner = db.session.get(ApiRunner, code)
    status = language_status(runner, now)
    if status == "paused":
        return refuse(503, "api_paused", retry_after=(runner.paused_until - now).total_seconds())
    if status == "unavailable":
        return refuse(503, "lang_unavailable", params={"lang": code}, retry_after=60)

    params = {"type": payload.type, "lang": code, "level": payload.level, "width": width, "height": height,
              "required_words": required, "preferred_words": preferred,
              # Une graine toujours : la grille se rejoue à l'identique
              "seed": payload.seed if payload.seed is not None else secrets.randbelow(MAX_SEED + 1),
              "mystery_word": mystery or None}
    if key is not None:
        # Les demandes d'une même clé passent une à une, de la vérification à l'inscription
        key = ApiKey.query.filter_by(id=key.id).with_for_update().one()
        key.last_used_at = now

    # Une demande rejouée (même Idempotency-Key, 24 heures) rend la génération déjà inscrite
    idempotency = (request.headers.get("Idempotency-Key") or "").strip()[:80] or None
    if idempotency:
        existing = (_own_jobs(key).filter(GenerationJob.idempotency_key == idempotency,
                                          GenerationJob.created_at > now - JOB_RETENTION).first())
        if existing is not None:
            db.session.commit()
            usage.defer()
            return _accepted(existing)

    settings_hash = settings_hash_of(params)
    refusal = quota_refusal(key, settings_hash, now)
    if refusal is not None:
        db.session.commit()
        return refusal

    job = GenerationJob(public_id=JOB_ID_PREFIX + secrets.token_urlsafe(16), created_at=now,
                        expires_at=now + JOB_RETENTION, status="queued", priority=10, client="api",
                        api_key_id=key.id if key else None, visitor=g.api_visitor, lang=code, site=config["SITE"],
                        idempotency_key=idempotency, settings_hash=settings_hash, request=params)
    db.session.add(job)
    db.session.commit()
    usage.defer()  # l'événement s'écrira à la fin de la génération
    return _accepted(job)


def _accepted(job: GenerationJob):
    response = jsonify(job_json(job))
    response.status_code = 202
    response.headers["Location"] = f"/v1/grids/{job.public_id}"
    return _with_poll_headers(response, job)


@api_v1_bp.route("/grids/<public_id>", methods=["GET"])
def get_job(public_id):
    job = _readable_job(public_id)
    if job is None:
        return refuse(404, "not_found")
    return _with_poll_headers(jsonify(job_json(job)), job)


@api_v1_bp.route("/clues/check", methods=["POST"])
def check_clues():
    """Les définitions d'un fichier, mot par mot : refus et alertes de style ; si rien n'est refusé, les liens."""
    payload, refusal = parse_strict(GridFileRequest)
    if refusal:
        return refusal
    grid, refusal = _read_file(payload.grid)
    if refusal:
        return refusal
    results = []
    for word in grid["words"]:
        findings = [_explained(finding) for finding in grid_file.check_clue(word["clue"], word, grid["lang"])]
        results.append({"x": word["x"], "y": word["y"], "direction": word["direction"], "answer": word["answer"],
                        "clue": word["clue"], "ok": not any(f["level"] == "error" for f in findings),
                        "findings": findings})
    errors = sum(1 for result in results if not result["ok"])
    warnings = sum(1 for result in results for finding in result["findings"] if finding["level"] == "warning")
    body = {"ok": errors == 0, "errors": errors, "warnings": warnings, "clues": results,
            # Ce qui écarte la grille du genre : dit sans refuser, elle vient peut-être d'un autre moteur
            "genre": grid_file.genre_problems(grid)}
    if errors == 0:
        body["grid"] = grid
        body["links"] = grid_file.links(grid, _site_url(grid["lang"]))
        body["next"] = ("Give the person links.play to play the grid online, or links.open to print it, download its "
                        "PDF or edit it; or POST the grid to /v1/render to show it here.")
    return jsonify(body), 200


@api_v1_bp.route("/render", methods=["POST"])
def render():
    """Le fichier dessiné, à remplir (avec ses définitions) ou sa solution, en SVG, PNG ou PDF ; toujours signé."""
    payload, refusal = parse_strict(RenderRequest)
    if refusal:
        return refusal
    grid, refusal = _read_file(payload.grid)
    if refusal:
        return refusal
    solution = payload.view == "solution"
    usage.add_details(client="api", render=payload.format)
    if payload.format == "svg":
        return Response(render_svg(grid, None, solution=solution, lang=grid["lang"], signature=_signature()),
                        mimetype="image/svg+xml")
    svg = render_svg(grid, None, solution=solution, lang=grid["lang"], signature=_signature(), embed_font=False)
    if payload.format == "png":
        return Response(render_png(svg, payload.width or 1600), mimetype="image/png")
    response = Response(render_pdf(svg), mimetype="application/pdf")
    response.headers["Content-Disposition"] = 'inline; filename="grille.pdf"'
    return response


@api_v1_bp.route("/<path:rest>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def unknown(rest):
    return refuse(404, "not_found")
