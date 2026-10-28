"""La façade de l'API ouverte (ADR 0032) : fermée par défaut, entrées strictes, ni CORS ni cookie ; la notice, la
vérification des définitions et le dessin, sur un fichier de grille qu'on nous renvoie (rien n'est gardé)."""

import json

import pytest

import generation_runner
import grid_file
from models import ApiRunner, GenerationJob, db

from tests.helpers import auth_headers

AGENT = {"User-Agent": "agent-de-test/1.0"}

# Une petite grille 5 × 5 juste : 3 mots, chacun avec sa case de définition
ROWS = ["#####", "#AMIS", "#R#E#", "#BALS", "#RIZ#"]
WORDS = [
    {"answer": "AMIS", "x": 1, "y": 1, "direction": "across", "clue": "Sont de la fête"},
    {"answer": "BALS", "x": 1, "y": 3, "direction": "across", "clue": "On y danse"},
    {"answer": "ARBR", "x": 1, "y": 1, "direction": "down", "clue": "Pas encore un arbre"},
]


def a_grid(**changes) -> dict:
    grid = {"format": "flechoir.grid", "version": 1, "type": "arrowword", "lang": "fr", "rows": ROWS,
            "words": [dict(word) for word in WORDS]}
    grid.update(changes)
    return grid


@pytest.fixture
def api_app(test_app, small_trie, monkeypatch, tmp_path):
    monkeypatch.setattr(test_app, "dela_trie", small_trie)
    monkeypatch.setitem(test_app.config, "API_ENABLED", True)
    monkeypatch.setitem(test_app.config, "GENERATION_LOCK_DIR", str(tmp_path))
    monkeypatch.setitem(test_app.config, "FRONTEND_URL", "https://site.test")
    GenerationJob.query.delete()
    ApiRunner.query.delete()
    db.session.commit()
    generation_runner.beat(test_app)
    return test_app


def post(client, path, body, **kwargs):
    kwargs.setdefault("content_type", "application/json")
    headers = {**AGENT, **kwargs.pop("headers", {})}
    return client.post(path, data=body if isinstance(body, (str, bytes)) else json.dumps(body), headers=headers,
                       **kwargs)


def test_the_api_is_closed_until_the_author_opens_it(test_app, client):
    assert test_app.config["API_ENABLED"] is False

    for response in (post(client, "/v1/grids", {}), client.get("/v1")):
        assert (response.status_code, response.get_json()["reason"]) == (503, "api_disabled")


def test_no_cors_on_the_open_api(api_app, client):
    """Des appels de serveur à serveur : un navigateur sur un autre site n'y a pas accès, cookies ou non."""
    origin = {"Origin": api_app.config["CORS_ORIGINS"].split(",")[0]}

    preflight = client.options("/v1/grids", headers={**origin, "Access-Control-Request-Method": "POST"})
    read = client.get("/v1", headers=origin)

    assert "Access-Control-Allow-Origin" not in preflight.headers
    assert "Access-Control-Allow-Origin" not in read.headers
    assert client.get("/api/status", headers=origin).headers["Access-Control-Allow-Origin"] == origin["Origin"]


def test_a_site_session_counts_for_nothing(api_app, client):
    # Le jeton en en-tête est refusé (test_api_keys) ; en cookie, il est ignoré (et /v1 est hors du chemin des cookies)
    client.set_cookie("access_token_cookie", auth_headers(client)["Authorization"].split()[1])

    assert client.get("/v1/limits", headers=AGENT).get_json()["keyed"] is False


def test_the_body_is_bounded_and_must_be_json(api_app, client):
    too_big = post(client, "/v1/grids", json.dumps({"preferred_words": ["mot"] * 5000}))
    as_text = post(client, "/v1/grids", json.dumps({}), content_type="text/plain")

    assert (too_big.status_code, too_big.get_json()["reason"]) == (413, "payload_too_large")
    assert (as_text.status_code, as_text.get_json()["reason"]) == (415, "unsupported_media_type")


@pytest.mark.parametrize("body, field", [
    ({"lang": "fr", "taille": 10}, "taille"),
    ({"lang": "fr", "must_words": ["MAISON"]}, "must_words"),  # le nom du site n'est pas celui de l'API
    ({"lang": "fr", "frequency_mode": "exact"}, "frequency_mode"),  # aucun réglage interne
])
def test_an_unknown_field_is_refused_by_name(api_app, client, body, field):
    response = post(client, "/v1/grids", body, headers={"Accept-Language": "fr-FR"})

    assert response.status_code == 400 and response.get_json()["reason"] == "invalid_request"
    assert response.get_json()["details"][0]["field"] == field
    assert "n'existe pas" in response.get_json()["error"]


@pytest.mark.parametrize("body, status, reason", [
    ({}, 400, "invalid_request"),  # la langue est obligatoire
    ({"lang": "es"}, 400, "unsupported_lang"),
    ({"lang": "fr", "type": "crossword"}, 400, "invalid_request"),
    ({"lang": "fr", "level": "expert"}, 400, "invalid_request"),
    ({"lang": "fr", "width": 4}, 400, "size_out_of_range"),
    ({"lang": "fr", "width": 16, "height": 10}, 400, "size_out_of_range"),
    ({"lang": "fr", "width": 5, "height": 11}, 422, "geometry_unavailable"),
    ({"lang": "fr", "required_words": ["Москва"]}, 400, "invalid_letters"),
    ({"lang": "fr", "preferred_words": ["anticonstitutionnel"]}, 400, "word_length"),
    ({"lang": "fr", "width": 6, "height": 6, "required_words": ["ABRICOTS"]}, 422, "must_words"),
    ({"lang": "fr", "required_words": ["MOT"] * 11}, 400, "invalid_request"),
    ({"lang": "fr", "preferred_words": ["<script>"]}, 400, "invalid_request"),
    ({"lang": "fr", "seed": -1}, 400, "invalid_request"),
    ({"lang": "fr", "mystery_word": "Lu"}, 400, "mystery_word_length"),
    ("[]", 400, "invalid_request"),
    ("{pas du json", 400, "invalid_request"),
])
def test_bad_requests_are_refused_with_a_stable_reason_before_queueing(api_app, client, body, status, reason):
    response = post(client, "/v1/grids", body)

    assert response.status_code == status, response.get_json()
    assert response.get_json()["reason"] == reason
    assert GenerationJob.query.count() == 0


def test_messages_follow_accept_language_and_reasons_never_change(api_app, client):
    texts = {lang: post(client, "/v1/grids", {"lang": "fr", "width": 4}, headers={"Accept-Language": lang}).get_json()
             for lang in ("en", "fr-FR,fr;q=0.9", "de", "it")}

    assert {body["reason"] for body in texts.values()} == {"size_out_of_range"}
    assert texts["en"]["error"].startswith("A grid is 5 to 15")
    assert texts["fr-FR,fr;q=0.9"]["error"].startswith("Une grille fait de 5 à 15")
    assert texts["de"]["error"].startswith("Ein Raster ist 5 bis 15")
    assert texts["it"]["error"] == texts["en"]["error"]  # l'anglais à défaut


# --- La notice ---

def test_the_notice_tells_a_model_everything_it_needs(api_app, client):
    notice = client.get("/v1", headers=AGENT).get_json()

    assert {"your_role", "genre_rules", "workflow", "languages", "levels", "formats", "clues", "grid_file", "limits",
            "license", "what_it_does_not"} <= set(notice)
    assert "You are the puzzle author" in notice["your_role"]
    assert any("language models fail" in rule for rule in notice["genre_rules"])
    languages = {language["code"]: language for language in notice["languages"]}
    assert languages["fr"]["status"] == "available" and languages["de"]["status"] == "unavailable"
    assert languages["fr"]["style"]["examples"][0]["arrowword"]
    assert set(notice["levels"]) == {"easy", "medium", "hard"}
    assert notice["limits"]["keyed"] is False
    assert notice["clues"]["max_chars_half_cell"] < notice["clues"]["max_chars_full_cell"]


def test_the_answers_are_never_cached(api_app, client):
    response = client.get("/v1", headers=AGENT)

    assert response.headers["Cache-Control"] == "no-store"
    assert "Accept-Language" in response.headers["Vary"]


# --- La vérification des définitions ---

def check(client, grid, **kwargs):
    return post(client, "/v1/clues/check", {"grid": grid}, **kwargs)


def test_good_clues_pass_and_bring_the_links_to_play_or_print(api_app, client):
    response = check(client, a_grid())

    body = response.get_json()
    assert response.status_code == 200 and body["ok"] is True and body["errors"] == 0
    assert body["links"]["play"].startswith("https://site.test/grille#mode=jouer&g=")
    assert body["links"]["open"].startswith("https://site.test/grille#g=")
    # Le lien contient la grille et ses définitions : rien n'est gardé chez nous
    carried = grid_file.decode(body["links"]["open"].split("#g=")[1])
    assert carried["rows"] == ROWS and carried["words"][0]["clue"] == "Sont de la fête"


def test_a_clue_is_refused_when_it_gives_the_answer_or_does_not_fit(api_app, client):
    words = [dict(WORDS[0], clue="Les amis de mes amis"),
             dict(WORDS[1], clue=" ".join(["Un très long texte"] * 5)),
             dict(WORDS[2], clue="")]

    body = check(client, a_grid(words=words), headers={"Accept-Language": "fr"}).get_json()

    reasons = [[finding["reason"] for finding in result["findings"] if finding["level"] == "error"]
               for result in body["clues"]]
    assert reasons == [["clue_contains_answer"], ["clue_too_long"], ["clue_missing"]]
    assert body["ok"] is False and "links" not in body
    assert "environ" in body["clues"][1]["findings"][0]["message"]


def test_a_dictionary_style_clue_gets_a_warning_not_a_refusal(api_app, client):
    words = [dict(WORDS[0], clue="Personnes avec qui l'on partage un bon moment")] + WORDS[1:]

    body = check(client, a_grid(words=words)).get_json()

    first = body["clues"][0]
    assert first["ok"] is True and body["ok"] is True
    assert {finding["reason"] for finding in first["findings"]} == {"clue_style_long", "clue_style_relative"}
    assert body["warnings"] == 2


def test_a_file_that_lies_about_its_letters_is_refused(api_app, client):
    words = [dict(WORDS[0], answer="AMIE")] + WORDS[1:]

    response = check(client, a_grid(words=words))

    assert (response.status_code, response.get_json()["reason"]) == (400, "invalid_grid")
    assert response.get_json()["details"] == [{"word": 0, "problem": "letters_mismatch"}]


def test_clue_cells_and_space_are_recomputed_not_trusted(api_app, client):
    lying = [dict(WORDS[0], clue_cell={"x": 4, "y": 4}, clue_max_chars=500, arrow="down")] + WORDS[1:]

    grid = check(client, a_grid(words=lying)).get_json()["grid"]

    first = grid["words"][0]
    assert first["clue_cell"] == {"x": 0, "y": 1} and first["arrow"] == "right" and first["clue_max_chars"] < 100


def test_a_grid_from_elsewhere_is_read_and_its_departures_from_the_genre_are_said(api_app, client):
    """Toute grille valide se lit (décision de l'auteur) ; ce qui l'écarte du genre est dit, sans refus."""
    body = check(client, a_grid(words=WORDS[:2])).get_json()

    assert body["ok"] is True
    assert {"x": 1, "y": 1, "direction": "down", "problem": "undeclared_word"} in body["genre"]


# --- Le dessin ---

def render(client, **body):
    return post(client, "/v1/render", {"grid": a_grid(), **body})


def test_the_grid_is_drawn_as_svg_and_signed(api_app, client):
    response = render(client)

    svg = response.get_data(as_text=True)
    assert response.status_code == 200 and response.mimetype == "image/svg+xml"
    assert svg.startswith("<svg") and "SONT DE" in svg and "FÊTE" in svg
    assert "Grille créée avec l&apos;API de site.test" in svg or "Grille créée avec l'API de site.test" in svg
    assert "<script" not in svg


def test_the_solution_shows_letters_not_clues(api_app, client):
    svg = render(client, view="solution").get_data(as_text=True)

    assert ">A</text>" in svg and "SONT" not in svg


def test_a_clue_cannot_inject_markup_into_the_drawing(api_app, client):
    words = [dict(WORDS[0], clue="Fête & cie")] + WORDS[1:]

    svg = post(client, "/v1/render", {"grid": a_grid(words=words)}).get_data(as_text=True)

    assert "&amp;" in svg and "& " not in svg


@pytest.mark.parametrize("fmt, mimetype, magic", [("png", "image/png", b"\x89PNG"), ("pdf", "application/pdf", b"%PDF")])
def test_the_grid_is_drawn_as_png_or_pdf(api_app, client, fmt, mimetype, magic):
    response = render(client, format=fmt, width=600)

    assert response.status_code == 200 and response.mimetype == mimetype
    assert response.get_data().startswith(magic)


def test_an_svg_is_never_an_input(api_app, client):
    response = post(client, "/v1/render", {"grid": "<svg/>"})

    assert (response.status_code, response.get_json()["reason"]) == (400, "invalid_request")


def test_the_rate_limiter_does_not_rewrite_the_api_headers(small_trie, tmp_path):
    """Le limiteur réécrit Retry-After sur toute réponse : un 202 doit garder ses 2 s, sans les X-RateLimit."""
    from app import create_app

    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
                      "JWT_SECRET_KEY": "test-secret-key-long-enough-for-hs256-signing", "RATELIMIT_ENABLED": True,
                      "API_ENABLED": True, "GENERATION_LOCK_DIR": str(tmp_path), "RATELIMIT_API_CREATE": "2 per minute"})
    app.dela_trie = small_trie
    with app.app_context():
        db.create_all()
        generation_runner.beat(app)
        client = app.test_client()
        body = {"lang": "fr", "width": 5, "height": 5}

        accepted = post(client, "/v1/grids", body)
        busy = post(client, "/v1/grids", body)
        limited = post(client, "/v1/grids", body)

        assert (accepted.status_code, accepted.headers["Retry-After"]) == (202, "2")
        assert not any(name.startswith("X-RateLimit") for name in accepted.headers.keys())
        assert (busy.get_json()["reason"], busy.headers["Retry-After"]) == ("generation_in_progress", "2")
        assert limited.status_code == 429 and limited.get_json()["reason"] == "rate_limited"
        assert 1 <= int(limited.headers["Retry-After"]) <= 60
