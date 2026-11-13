"""La spécification OpenAPI 3.1 de l'API ouverte (ADR 0032, lot 5 : les développeurs), servie à `/v1/openapi.json`.

Les corps de requête et le fichier de grille viennent des modèles Pydantic des routes (api_v1.py, grid_file.py) : la
spécification ne peut pas s'écarter de ce que l'API accepte. Les réponses sont décrites à la main, d'après les routes ;
un test vérifie que chaque route de `/v1` y figure. En anglais, comme la notice (`GET /v1`) : c'est la langue des
outils qui la lisent (générateurs de clients, assistants IA).
"""

from pydantic.json_schema import models_json_schema

ERROR = {"$ref": "#/components/schemas/Error"}
GRID = {"$ref": "#/components/schemas/GridFileIn"}


def _json(schema: dict, description: str, headers: dict | None = None) -> dict:
    response = {"description": description, "content": {"application/json": {"schema": schema}}}
    if headers:
        response["headers"] = headers
    return response


def _errors(*statuses: int) -> dict:
    texts = {
        400: "Invalid request or settings (see `reason`).",
        401: "Invalid or revoked API key (`invalid_api_key`).",
        404: "Unknown or expired grid (`not_found`).",
        409: "A generation of yours is still running (`generation_in_progress`).",
        411: "Content-Length missing (`length_required`).",
        413: "Body too large (`payload_too_large`).",
        415: "Content-Type must be application/json (`unsupported_media_type`).",
        429: "Quota reached (`quota_minute`, `quota_day`, `quota_words`, `quota_global`, `rate_limited`): wait "
             "Retry-After seconds.",
        503: "Language unavailable or the API paused (`lang_unavailable`, `api_paused`, `busy`, `api_disabled`).",
    }
    return {str(status): _json(ERROR, texts[status]) for status in statuses}


RETRY_AFTER = {"Retry-After": {"description": "Seconds to wait before polling again.", "schema": {"type": "integer"}}}
LIMIT_HEADERS = {
    name: {"description": text, "schema": {"type": "integer"}}
    for name, text in (("X-RateLimit-Limit", "Generations allowed per minute for this caller."),
                       ("X-RateLimit-Remaining", "Generations left this minute."),
                       ("X-RateLimit-Reset", "Seconds until the minute window resets."))
}


def spec(api_url: str, site_url: str, terms_version: str) -> dict:
    """La spécification, pour l'adresse publique de l'API et celle du site (documentation, conditions)."""
    from api_v1 import CheckRequest, CreateGridRequest, RenderRequest
    from grid_file import GridFileIn

    _, schemas = models_json_schema(
        [(model, "validation") for model in (CreateGridRequest, CheckRequest, RenderRequest, GridFileIn)],
        ref_template="#/components/schemas/{model}")
    components = schemas.get("$defs", {})
    components["Error"] = {
        "type": "object", "required": ["error", "reason"],
        "properties": {
            "error": {"type": "string", "description": "Human-readable message, in the language of Accept-Language "
                                                       "(en, fr, de)."},
            "reason": {"type": "string", "description": "Stable code: branch on this, never on the message."},
        },
        "additionalProperties": True,
    }
    components["Job"] = {
        "type": "object", "required": ["id", "status", "lang"],
        "properties": {
            "id": {"type": "string", "pattern": "^gen_[A-Za-z0-9_-]{8,40}$"},
            "status": {"type": "string", "enum": ["queued", "running", "done", "failed"]},
            "lang": {"type": "string"},
            "created_at": {"type": "string", "format": "date-time"},
            "expires_at": {"type": "string", "format": "date-time"},
            "started_at": {"type": "string", "format": "date-time"},
            "finished_at": {"type": "string", "format": "date-time"},
            "queue_position": {"type": "integer", "description": "While queued."},
            "grid": {**GRID, "description": "When done: the grid file, yours to keep (deleted on our side after 24 "
                                            "hours). Each word gives its clue_max_chars."},
            "warnings": {"type": "array", "items": {"type": "object"}},
            "error": {**ERROR, "description": "When failed (`no_solution`, `timeout`, `must_words_unplaced`…)."},
            "next": {"type": "string", "description": "What to do next, in plain words."},
        },
    }
    components["CheckResult"] = {
        "type": "object", "required": ["ok", "errors", "warnings", "clues"],
        "properties": {
            "ok": {"type": "boolean", "description": "True when no clue is refused."},
            "errors": {"type": "integer"},
            "warnings": {"type": "integer"},
            "clues": {"type": "array", "items": {"type": "object", "properties": {
                "x": {"type": "integer"}, "y": {"type": "integer"},
                "direction": {"type": "string", "enum": ["across", "down"]},
                "answer": {"type": "string"}, "clue": {"type": ["string", "null"]}, "ok": {"type": "boolean"},
                "findings": {"type": "array", "items": {"type": "object", "properties": {
                    "reason": {"type": "string"}, "message": {"type": "string"},
                    "level": {"type": "string", "enum": ["error", "warning"]}}}}}}},
            "genre": {"type": "array", "items": {"type": "object"}},
            "grid": {**GRID, "description": "When ok: the checked grid file."},
            "links": {"type": "object", "description": "When ok: `play` (play online) and `open` (print, PDF, edit).",
                      "properties": {"play": {"type": "string", "format": "uri"},
                                     "open": {"type": "string", "format": "uri"}}},
        },
    }

    return {
        "openapi": "3.1.0",
        "info": {
            "title": "Arrowword grid API",
            "version": "1",
            "summary": "Builds valid arrowword grids (mots fléchés) around your words; checks and draws them.",
            "description": (
                "The engine builds the grid; you (or your AI) write the clues. Free, with or without a key. "
                f"Start with GET /v1: it explains the genre, the style of clues per language and your quotas. "
                f"Documentation: {site_url}/developpeurs"),
            "termsOfService": f"{site_url}/terms#api",
            "x-terms-version": terms_version,
        },
        "externalDocs": {"description": "Documentation", "url": f"{site_url}/developpeurs"},
        "servers": [{"url": api_url}],
        "security": [{}, {"apiKey": []}],
        "components": {
            "securitySchemes": {"apiKey": {
                "type": "http", "scheme": "bearer", "bearerFormat": "flk_…",
                "description": "Optional. Created in the account page of the website; higher quotas."}},
            "schemas": components,
        },
        "paths": {
            "/v1": {"get": {
                "operationId": "getNotice", "summary": "The notice: genre rules, clue style, formats, your quotas.",
                "responses": {"200": _json({"type": "object"}, "The notice, for a program or a language model.")},
            }},
            "/v1/openapi.json": {"get": {
                "operationId": "getOpenApi", "summary": "This specification.",
                "responses": {"200": _json({"type": "object"}, "OpenAPI 3.1.")},
            }},
            "/v1/limits": {"get": {
                "operationId": "getLimits", "summary": "Your quotas and what you used.",
                "responses": {"200": _json({"type": "object", "properties": {
                    "keyed": {"type": "boolean"}, "limits": {"type": "object"}, "used": {"type": "object"},
                    "time_budget_s": {"type": "number"}}}, "Quotas.")},
            }},
            "/v1/grids": {"post": {
                "operationId": "createGrid", "summary": "Start building a grid around your words.",
                "requestBody": {"required": True, "content": {"application/json": {
                    "schema": {"$ref": "#/components/schemas/CreateGridRequest"},
                    "example": {"type": "arrowword", "lang": "fr", "width": 10, "height": 10, "level": "medium",
                                "required_words": ["Eric"], "preferred_words": ["anniversaire", "gateau"]}}}},
                "responses": {
                    "202": _json({"$ref": "#/components/schemas/Job"}, "Queued: poll the Location.", {
                        "Location": {"description": "GET this address for the result.", "schema": {"type": "string"}},
                        **RETRY_AFTER, **LIMIT_HEADERS}),
                    **_errors(400, 401, 409, 411, 413, 415, 429, 503),
                },
            }},
            "/v1/grids/{id}": {"get": {
                "operationId": "getGrid", "summary": "The state of a generation; the grid file when done.",
                "parameters": [{"name": "id", "in": "path", "required": True,
                                "schema": {"type": "string", "pattern": "^gen_[A-Za-z0-9_-]{8,40}$"}}],
                "responses": {
                    "200": _json({"$ref": "#/components/schemas/Job"}, "Queued, running, done or failed.",
                                 RETRY_AFTER),
                    **_errors(401, 404),
                },
            }},
            "/v1/clues/check": {"post": {
                "operationId": "checkClues",
                "summary": "Check your clues: they must fit and not give the answer away. Returns play/print links.",
                "requestBody": {"required": True, "content": {"application/json": {
                    "schema": {"$ref": "#/components/schemas/CheckRequest"},
                    "example": {"id": "gen_9PK9G9I9u-BrvxMsnuGE5g",
                                "clues": [{"answer": "ERIC", "clue": "Prénom du jour"}]}}}},
                "responses": {
                    "200": _json({"$ref": "#/components/schemas/CheckResult"}, "Clue by clue."),
                    **_errors(400, 401, 404, 411, 413, 415),
                },
            }},
            "/v1/render": {"post": {
                "operationId": "renderGrid", "summary": "Draw the grid (puzzle or solution) as SVG, PNG or PDF.",
                "requestBody": {"required": True, "content": {"application/json": {
                    "schema": {"$ref": "#/components/schemas/RenderRequest"}}}},
                "responses": {
                    "200": {"description": "The drawing, signed.", "content": {
                        "image/svg+xml": {"schema": {"type": "string"}},
                        "image/png": {"schema": {"type": "string", "contentEncoding": "binary"}},
                        "application/pdf": {"schema": {"type": "string", "contentEncoding": "binary"}}}},
                    **_errors(400, 401, 411, 413, 415),
                },
            }},
        },
    }
