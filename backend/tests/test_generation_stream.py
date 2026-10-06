"""Génération en flux SSE et réglage `quality` (#209) : progression, meilleure grille, fin, place et usage."""

import json

import pytest
import routes
from generation_slots import GenerationBusy, generation_slot
from models import UsageEvent, VisitorSalt, db

from tests.paths import FIXTURE_LAYOUTS_DIR

BROWSER = {"User-Agent": "Mozilla/5.0 (test)"}
STREAM = {**BROWSER, "Accept": "text/event-stream"}
FORMAT = {"width": 5, "height": 5}
WISH = ["MERCI", "PAIRE", "PORTE", "RADIO", "SALON", "SALUT", "TABLE"]


@pytest.fixture
def grid_app(test_app, small_trie, monkeypatch, tmp_path):
    monkeypatch.setattr(test_app, "dela_trie", small_trie)
    monkeypatch.setitem(test_app.config, "LAYOUTS_DIR", FIXTURE_LAYOUTS_DIR)
    monkeypatch.setitem(test_app.config, "GENERATION_LOCK_DIR", str(tmp_path))
    # Un orchestrateur court, et tous ses événements : le test ne dépend pas de la vitesse de la machine
    monkeypatch.setitem(test_app.config, "GENERATION_QUALITY_BUDGET_S", 1.0)
    monkeypatch.setattr(routes, "PROGRESS_INTERVAL_S", 0.0)
    monkeypatch.setattr(routes, "BEST_INTERVAL_S", 0.0)
    UsageEvent.query.delete()
    VisitorSalt.query.delete()
    db.session.commit()
    return test_app


def post(client, body, headers=STREAM, **kwargs):
    return client.post("/api/grids/generate", data=json.dumps(body), content_type="application/json",
                       headers=headers, **kwargs)


def parse(text: str) -> list[tuple[str, dict]]:
    """Les événements d'un flux SSE : [(nom, données)]."""
    parsed = []
    for block in text.strip().split("\n\n"):
        fields = dict(line.split(": ", 1) for line in block.splitlines())
        parsed.append((fields["event"], json.loads(fields["data"])))
    return parsed


def test_the_stream_ends_with_the_body_of_the_json_mode(grid_app, client):
    body = {"size": FORMAT, "seed": 42}
    streamed = post(client, body)
    streamed.get_data()  # une génération à la fois par visiteur : celle-ci va au bout avant la suivante
    plain = post(client, body, headers=BROWSER)

    assert streamed.status_code == 200
    assert streamed.mimetype == "text/event-stream"
    assert streamed.headers["Cache-Control"] == "no-cache, no-transform"
    events = parse(streamed.get_data(as_text=True))
    # Sans l'orchestrateur, la grille se fait d'un bloc : pas d'étape intermédiaire
    assert [name for name, _ in events] == ["done"]
    assert events[0][1] == plain.get_json()


def test_the_best_quality_reports_its_progress_and_its_best_grids(grid_app, client):
    response = post(client, {"size": FORMAT, "seed": 3, "quality": "best", "wish_words": WISH})

    events = parse(response.get_data(as_text=True))
    names = [name for name, _ in events]
    assert names[-1] == "done" and "progress" in names and "best" in names
    progress = [data for name, data in events if name == "progress"]
    assert [data["attempts"] for data in progress] == sorted(data["attempts"] for data in progress)
    assert all(data["words"] == len(WISH) for data in progress)
    # La fin attendue, pour la barre de progression (#220) : jamais au-delà du budget
    assert all(0 < data["expected_s"] <= 1.0 for data in progress)
    best =[data for name, data in events if name == "best"]
    assert all({"cells", "words", "layout"} <= data["grid"].keys() for data in best)
    # La grille rendue à la fin est la dernière meilleure envoyée
    assert events[-1][1]["grid"]["words"] == best[-1]["grid"]["words"]
    assert best[-1]["record"] == sum(word["source"] in ("must", "wish") for word in best[-1]["grid"]["words"])


def test_a_failure_ends_the_stream_with_the_same_reason(grid_app, client):
    response = post(client, {"size": FORMAT, "seed": 1, "use_global": False, "must_words": ["Zzzzz"]})

    [(name, data)] = parse(response.get_data(as_text=True))
    assert name == "error"
    assert (data["reason"], data["status"], data["unplaced"]) == ("must_words_unplaced", 422, ["ZZZZZ"])


def test_a_refusal_before_solving_stays_a_json_answer(grid_app, client):
    response = post(client, {"size": FORMAT, "seed": 1, "must_words": ["ABCDEFGHIJ"]})

    assert response.status_code == 422
    assert response.get_json()["reason"] == "must_words"


def test_the_quality_is_validated(grid_app, client):
    assert post(client, {"size": FORMAT, "quality": "parfaite"}, headers=BROWSER).status_code == 400


def test_the_server_setting_applies_when_the_request_says_nothing(grid_app, client, monkeypatch):
    monkeypatch.setitem(grid_app.config, "GENERATION_QUALITY", "best")

    response = post(client, {"size": FORMAT, "seed": 3, "wish_words": WISH})

    assert "progress" in [name for name, _ in parse(response.get_data(as_text=True))]


# --- La place de génération ---


def test_the_place_is_held_until_the_stream_ends(grid_app, client, tmp_path):
    response = post(client, {"size": FORMAT, "seed": 42}, buffered=False)

    with pytest.raises(GenerationBusy):
        with generation_slot(str(tmp_path), "ip:127.0.0.1", max_concurrent=2):
            pass
    response.get_data()  # le flux va jusqu'au bout
    response.close()

    with generation_slot(str(tmp_path), "ip:127.0.0.1", max_concurrent=2):
        pass


def test_a_stream_closed_before_it_starts_gives_its_place_back(grid_app, client, tmp_path):
    response = post(client, {"size": FORMAT, "seed": 42}, buffered=False)

    response.close()

    with generation_slot(str(tmp_path), "ip:127.0.0.1", max_concurrent=2):
        pass


def test_a_busy_visitor_gets_the_json_refusal(grid_app, client, tmp_path):
    with generation_slot(str(tmp_path), "ip:127.0.0.1", max_concurrent=2):
        response = post(client, {"size": FORMAT, "seed": 42})

    assert response.status_code == 429
    assert response.get_json()["reason"] == "busy_visitor"


# --- Mesure d'usage, en fin de flux ---


def test_the_stream_is_recorded_once_at_its_end(grid_app, client):
    response = post(client, {"size": FORMAT, "seed": 3, "quality": "best", "wish_words": WISH})
    response.get_data()

    [event] = UsageEvent.query.filter_by(kind="generation").all()
    assert (event.outcome, event.status) == ("grid", 200)
    assert event.data["quality"] == "best" and event.data["attempts"] >= 1
    assert event.duration_ms is not None


def test_a_failed_stream_is_recorded_with_its_reason(grid_app, client):
    post(client, {"size": FORMAT, "seed": 1, "use_global": False, "must_words": ["Zzzzz"]}).get_data()

    [event] = UsageEvent.query.filter_by(kind="generation").all()
    assert (event.outcome, event.status) == ("must_words_unplaced", 422)


def test_a_grid_kept_before_the_end_counts_as_a_grid(grid_app, client):
    response = post(client, {"size": FORMAT, "seed": 3, "quality": "best", "wish_words": WISH}, buffered=False)
    for chunk in response.response:  # « Garder celle-ci » : le site coupe le flux dès une meilleure grille
        if b"event: best" in (chunk if isinstance(chunk, bytes) else chunk.encode()):
            break
    response.close()

    [event] = UsageEvent.query.filter_by(kind="generation").all()
    assert event.outcome == "grid" and event.data["quality"] == "best"


def test_the_json_mode_records_the_quality_too(grid_app, client):
    post(client, {"size": FORMAT, "seed": 42}, headers=BROWSER)

    [event] = UsageEvent.query.filter_by(kind="generation").all()
    assert event.data["quality"] == "first"


# --- Mot mystère (#218), dans tous les modes du moteur v2 ---

def mystery_holds(payload: dict, word: str) -> bool:
    """La grille porte le mot (chaque case numérotée a sa lettre), ou l'erreur dit vrai sur les lettres absentes.

    Vrai quand le mot est placé : les deux issues sont justes, mais un test doit voir la première au moins une fois.
    """
    grid = payload["grid"]
    letters = {(cell["x"], cell["y"]): cell["char"] for cell in grid["cells"] if not cell["is_black"]}
    if grid.get("mystery"):
        cells = [(cell["x"], cell["y"]) for cell in grid["mystery"]["cells"]]
        assert [letters[cell] for cell in cells] == list(word) and len(set(cells)) == len(word)
        assert "mystery_error" not in payload
        return True
    error = payload["mystery_error"]
    assert error["reason"] == "mystery_letters_missing"
    for letter in set(error["missing"]):
        assert list(letters.values()).count(letter) < word.count(letter)
    return False


@pytest.mark.parametrize("quality, geometry", [
    ("first", "catalogue"), ("best", "catalogue"), ("first", "sur_mesure"), ("best", "sur_mesure"),
])
def test_every_grid_of_the_stream_tells_its_mystery_word(grid_app, client, quality, geometry):
    """Chaque `best` porte son mot mystère, ou dit quelles lettres lui manquent : « Garder celle-ci » garde une
    grille déjà numérotée. `done` de même."""
    response = post(client, {"size": FORMAT, "seed": 3, "quality": quality, "geometry": geometry,
                             "wish_words": WISH, "mystery_word": "Esé"})

    events = [(name, data) for name, data in parse(response.get_data(as_text=True)) if name in ("best", "done")]
    assert events[-1][0] == "done"
    for _, data in events:
        mystery_holds(data, "ESE")


@pytest.mark.parametrize("geometry", ["catalogue", "sur_mesure"])
def test_the_mystery_word_is_numbered_in_the_json_and_at_the_end_of_the_stream(grid_app, client, geometry):
    """Le mot est fait des lettres de la grille (en `first`, même seed, même grille) : il s'y écrit par construction."""
    request = {"size": FORMAT, "seed": 3, "geometry": geometry}
    plain = post(client, request, headers=BROWSER).get_json()["grid"]
    word = "".join(cell["char"] for cell in plain["cells"] if not cell["is_black"])[:4]

    body = post(client, {**request, "mystery_word": word}, headers=BROWSER).get_json()
    streamed = parse(post(client, {**request, "mystery_word": word}).get_data(as_text=True))

    assert mystery_holds(body, word) and body["grid"]["mystery"]["seed"] == 3
    assert streamed[-1][0] == "done" and mystery_holds(streamed[-1][1], word)
    assert streamed[-1][1]["grid"]["mystery"] == body["grid"]["mystery"]


@pytest.mark.parametrize("budget, patience, improved, expected", [
    (5.0, 1.5, None, 5.0),  # aucune grille encore : le budget
    (5.0, 1.5, 0.8, 2.3),  # une grille à 0,8 s : arrêt attendu 1,5 s plus tard
    (5.0, 1.5, 4.2, 5.0),  # jamais au-delà du budget
    (5.0, None, 0.8, 5.0),  # sans arrêt anticipé : le budget
    (None, 1.5, 0.8, None),  # sans budget : aucune fin à annoncer
])
def test_the_expected_end_of_the_search(budget, patience, improved, expected):
    assert routes.expected_end(budget, patience, improved) == expected
