"""Grilles conservées (#24) : sauvegarde, relecture, suppression, et cloisonnement des comptes."""

import importlib.util
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

from models import SavedGrid
from tests.paths import FIXTURE_LAYOUTS_DIR
from tests.helpers import auth_headers, default_dictionary_id, send

MYSTERY_MIGRATION = Path(__file__).resolve().parents[1] / "migrations" / "versions" / "0015_mot_mystere.py"


@pytest.fixture
def grid_app(test_app, small_trie, monkeypatch):
    """Application avec un petit lexique : les mots corrigés doivent pouvoir être jugés."""
    monkeypatch.setattr(test_app, "dela_trie", small_trie)
    monkeypatch.setitem(test_app.config, "LAYOUTS_DIR", FIXTURE_LAYOUTS_DIR)
    return test_app


def grid_payload(**overrides):
    """Une grille minuscule au format que renvoie /api/grids/generate."""
    grid = {
        "width": 3,
        "height": 2,
        "layout": "3x2-001",
        "seed": 42,
        "cells": [
            {"x": 0, "y": 0, "char": "", "is_black": True},
            {"x": 1, "y": 0, "char": "A", "is_black": False},
            {"x": 2, "y": 0, "char": "S", "is_black": False},
            {"x": 0, "y": 1, "char": "I", "is_black": False},
            {"x": 1, "y": 1, "char": "L", "is_black": False},
            {"x": 2, "y": 1, "char": "E", "is_black": False},
        ],
        "words": [
            {"text": "AS", "x": 1, "y": 0, "direction": "across", "source": "must"},
            {"text": "ILE", "x": 0, "y": 1, "direction": "across", "source": "common"},
        ],
        "fill_ratio": 1.0,
        "wish_ratio": 0.5,
        "must_words": ["AS"],
    }
    grid.update(overrides)
    return grid


def save(client, headers, name="Ma grille", **overrides):
    return send(client, "post", "/api/grids", {"name": name, "grid": grid_payload(**overrides)}, headers)


def test_saved_grid_comes_back_as_it_was(client):
    headers = auth_headers(client)

    created = save(client, headers)
    assert created.status_code == 201, created.get_json()
    summary = created.get_json()
    assert summary["name"] == "Ma grille"
    assert (summary["width"], summary["height"]) == (3, 2)
    assert summary["word_count"] == 2
    assert summary["must_words"] == ["AS"]

    listing = client.get("/api/grids", headers=headers).get_json()
    assert [g["id"] for g in listing] == [summary["id"]]
    # La liste ne transporte pas les cases : c'est tout l'intérêt d'un résumé
    assert "grid" not in listing[0]

    full = client.get(f"/api/grids/{summary['id']}", headers=headers).get_json()
    assert full["grid"]["cells"] == grid_payload()["cells"]
    assert full["grid"]["layout"] == "3x2-001"
    assert full["grid"]["seed"] == 42


def test_a_saved_grid_comes_back_with_its_arrows(client):
    """#26 : les flèches ne sont pas stockées mais recalculées, donc les grilles d'avant en ont aussi."""
    headers = auth_headers(client)
    grid_id = save(client, headers).get_json()["id"]

    clues = client.get(f"/api/grids/{grid_id}", headers=headers).get_json()["grid"]["clues"]

    # AS commence en (1,0), juste à droite de la seule case noire : flèche vers la droite
    assert {clue["text"]: (clue["cell_x"], clue["cell_y"], clue["arrow"]) for clue in clues} == {
        "AS": (0, 0, "droite"),
        "ILE": (0, 0, "coudee_bas_droite"),
    }


def test_grid_without_a_name_gets_one(client):
    headers = auth_headers(client)

    response = send(client, "post", "/api/grids", {"grid": grid_payload()}, headers)

    assert response.status_code == 201
    # Un repère plutôt qu'un numéro : le format et le jour
    assert response.get_json()["name"].startswith("3×2 du ")


def test_most_recent_grid_comes_first(client):
    headers = auth_headers(client)

    first = save(client, headers, name="Ancienne").get_json()
    second = save(client, headers, name="Récente").get_json()

    listing = client.get("/api/grids", headers=headers).get_json()
    assert [g["id"] for g in listing] == [second["id"], first["id"]]


def test_deleted_grid_is_gone(client):
    headers = auth_headers(client)
    grid_id = save(client, headers).get_json()["id"]

    assert send(client, "delete", f"/api/grids/{grid_id}", None, headers).status_code == 200
    assert client.get(f"/api/grids/{grid_id}", headers=headers).status_code == 404
    assert client.get("/api/grids", headers=headers).get_json() == []


@pytest.mark.parametrize("method, body", [
    ("get", None),
    ("delete", None),
])
def test_another_account_never_sees_the_grid(client, method, body):
    owner = auth_headers(client)
    intruder = auth_headers(client)
    grid_id = save(client, owner, name="Privée").get_json()["id"]

    response = send(client, method, f"/api/grids/{grid_id}", body, intruder)

    # 404 et non 403 : l'existence d'une grille d'autrui ne se révèle pas
    assert response.status_code == 404
    assert client.get("/api/grids", headers=intruder).get_json() == []
    assert client.get(f"/api/grids/{grid_id}", headers=owner).status_code == 200


def test_saving_needs_an_account(client):
    assert send(client, "post", "/api/grids", {"grid": grid_payload()}).status_code == 401
    assert client.get("/api/grids").status_code == 401


@pytest.mark.parametrize("broken, expected_field", [
    ({"cells": [{"x": 0, "y": 0, "char": "A", "is_black": "oui"}]}, "grid.cells.0.is_black"),
    ({"words": [{"text": "AS", "x": 0, "y": 0, "direction": "diagonale", "source": "must"}]},
     "grid.words.0.direction"),
    ({"width": 99}, "grid.width"),
    ({"layout": ""}, "grid.layout"),
])
def test_a_malformed_grid_is_refused(client, broken, expected_field):
    headers = auth_headers(client)

    response = send(client, "post", "/api/grids", {"grid": grid_payload(**broken)}, headers)

    assert response.status_code == 400
    body = response.get_json()
    # Le refus désigne la case ou le mot fautif, et pas seulement « grille invalide »
    assert [detail["field"] for detail in body["details"]] == [expected_field], body


def test_quota_is_enforced(client, test_app):
    headers = auth_headers(client)
    previous = test_app.config["MAX_GRIDS_PER_USER"]
    test_app.config["MAX_GRIDS_PER_USER"] = 1
    try:
        assert save(client, headers, name="La première").status_code == 201
        refused = save(client, headers, name="La deuxième")
        assert refused.status_code == 400
        assert "1 grille conservée" in refused.get_json()["error"]
    finally:
        test_app.config["MAX_GRIDS_PER_USER"] = previous


def test_definitions_are_written_and_read_back(client):
    """#27 : les définitions s'écrivent au fil de la frappe, la grille elle-même ne bouge plus."""
    headers = auth_headers(client)
    grid_id = save(client, headers).get_json()["id"]

    response = send(client, "patch", f"/api/grids/{grid_id}",
                    {"definitions": {"1-0-across": "Champion", "0-1-across": "Terre entourée d'eau"}},
                    headers)

    assert response.status_code == 200
    assert response.get_json()["defined_count"] == 2
    relu = client.get(f"/api/grids/{grid_id}", headers=headers).get_json()
    assert relu["definitions"]["1-0-across"] == "Champion"


def test_an_emptied_definition_disappears(client):
    headers = auth_headers(client)
    grid_id = save(client, headers).get_json()["id"]
    send(client, "patch", f"/api/grids/{grid_id}", {"definitions": {"1-0-across": "Champion"}}, headers)

    send(client, "patch", f"/api/grids/{grid_id}", {"definitions": {"1-0-across": ""}}, headers)

    assert client.get(f"/api/grids/{grid_id}", headers=headers).get_json()["definitions"] == {}


def test_a_grid_can_be_renamed(client):
    headers = auth_headers(client)
    grid_id = save(client, headers).get_json()["id"]

    response = send(client, "patch", f"/api/grids/{grid_id}", {"name": "Spécial musique"}, headers)

    assert response.get_json()["name"] == "Spécial musique"


@pytest.mark.parametrize("body, expected_field", [
    ({"definitions": {"AS-1-0-across": "La clé portait le texte du mot"}}, "definitions"),
    ({"definitions": {"1-0-across": "x" * 121}}, "definitions.1-0-across"),
])
def test_a_malformed_definition_is_refused(client, body, expected_field):
    headers = auth_headers(client)
    grid_id = save(client, headers).get_json()["id"]

    response = send(client, "patch", f"/api/grids/{grid_id}", body, headers)

    assert response.status_code == 400
    assert expected_field in str(response.get_json()["details"]), response.get_json()


def test_another_account_cannot_write_definitions(client):
    owner = auth_headers(client)
    intruder = auth_headers(client)
    grid_id = save(client, owner, name="Privée").get_json()["id"]

    response = send(client, "patch", f"/api/grids/{grid_id}", {"definitions": {"1-0-across": "Volée"}}, intruder)

    assert response.status_code == 404
    assert client.get(f"/api/grids/{grid_id}", headers=owner).get_json()["definitions"] == {}


def test_a_letter_can_be_corrected_by_hand(grid_app, client):
    """ADR 0012 : l'auteur change un « O » en « E », et les deux mots concernés suivent."""
    headers = auth_headers(client)
    grid_id = save(client, headers).get_json()["id"]

    response = send(client, "patch", f"/api/grids/{grid_id}", {"cells": [{"x": 1, "y": 1, "char": "O"}]}, headers)

    assert response.status_code == 200, response.get_json()
    grid = response.get_json()["grid"]
    mots = {(w["x"], w["y"], w["direction"]): (w["text"], w["source"]) for w in grid["words"]}
    # ILE devient IOE, et le mot vertical qui traverse (1,1) suit
    assert mots[(0, 1, "across")] == ("IOE", "manuel")
    assert grid["cells"][4]["char"] == "O"


def test_a_definition_survives_a_letter_change(grid_app, client):
    """La clé est la position, pas le texte : c'est tout l'intérêt de la migration 0004."""
    headers = auth_headers(client)
    grid_id = save(client, headers).get_json()["id"]
    send(client, "patch", f"/api/grids/{grid_id}", {"definitions": {"0-1-across": "Terre entourée d'eau"}}, headers)

    send(client, "patch", f"/api/grids/{grid_id}", {"cells": [{"x": 1, "y": 1, "char": "O"}]}, headers)

    relu = client.get(f"/api/grids/{grid_id}", headers=headers).get_json()
    assert relu["definitions"]["0-1-across"] == "Terre entourée d'eau"


def test_a_word_outside_the_lexicon_is_flagged_not_refused(grid_app, client):
    """L'auteur reste maître : le mot est posé, et signalé."""
    headers = auth_headers(client)
    grid_id = save(client, headers).get_json()["id"]

    response = send(client, "patch", f"/api/grids/{grid_id}", {"cells": [{"x": 1, "y": 1, "char": "Z"}]}, headers)

    grid = response.get_json()["grid"]
    assert "IZE" in grid["unknown_words"]
    assert next(w for w in grid["words"] if w["text"] == "IZE")["in_lexicon"] is False


def test_a_word_from_the_authors_dictionary_counts_as_known(grid_app, client):
    """Un mot qu'il a lui-même rangé n'a pas à être signalé comme inconnu."""
    headers = auth_headers(client)
    dict_id = default_dictionary_id(client, headers)
    client.post(f"/api/dictionaries/{dict_id}/words", json={"mot": "IZE"}, headers=headers)
    grid_id = save(client, headers).get_json()["id"]

    response = send(client, "patch", f"/api/grids/{grid_id}", {"cells": [{"x": 1, "y": 1, "char": "Z"}]}, headers)

    assert "IZE" not in response.get_json()["grid"]["unknown_words"]


def test_a_letter_on_a_definition_cell_is_refused(grid_app, client):
    headers = auth_headers(client)
    grid_id = save(client, headers).get_json()["id"]

    response = send(client, "patch", f"/api/grids/{grid_id}", {"cells": [{"x": 0, "y": 0, "char": "Z"}]}, headers)

    assert response.status_code == 400
    assert "case définition" in str(response.get_json()["details"])


def test_suggestions_keep_the_crossings_valid(grid_app, client):
    """On ne propose que des mots qui laissent les mots perpendiculaires valides."""
    headers = auth_headers(client)
    grid_id = save(client, headers).get_json()["id"]

    response = send(client, "post", f"/api/grids/{grid_id}/suggestions",
                    {"x": 0, "y": 1, "direction": "across"}, headers)

    body = response.get_json()
    assert response.status_code == 200, body
    assert body["current"] == "ILE"
    # Chaque mot proposé respecte les lettres autorisées case par case
    for mot in body["words"]:
        assert len(mot) == 3
        for index, lettres in enumerate(body["allowed"]):
            assert not lettres or mot[index] in lettres


def test_notes_and_archiving_are_kept(grid_app, client):
    headers = auth_headers(client)
    grid_id = save(client, headers).get_json()["id"]

    send(client, "patch", f"/api/grids/{grid_id}", {"notes": "Idée : thème musique", "archived": True}, headers)

    relu = client.get(f"/api/grids/{grid_id}", headers=headers).get_json()
    assert relu["notes"] == "Idée : thème musique"
    assert relu["archived"] is True
    # Archivée : hors de la liste de travail, mais toujours là
    assert client.get("/api/grids?archived=false", headers=headers).get_json() == []
    assert len(client.get("/api/grids?archived=true", headers=headers).get_json()) == 1
    assert len(client.get("/api/grids", headers=headers).get_json()) == 1


def test_a_letter_can_be_erased_and_the_word_keeps_its_length(grid_app, client):
    """Retour arrière : la case se vide, le mot garde sa longueur et n'est plus jugé (ADR 0012)."""
    headers = auth_headers(client)
    grid_id = save(client, headers).get_json()["id"]

    response = send(client, "patch", f"/api/grids/{grid_id}", {"cells": [{"x": 1, "y": 1, "char": ""}]}, headers)

    assert response.status_code == 200, response.get_json()
    grid = response.get_json()["grid"]
    mot = next(w for w in grid["words"] if (w["x"], w["y"], w["direction"]) == (0, 1, "across"))
    assert mot["text"] == "I?E" and mot["length"] == 3 and mot["complete"] is False
    # Un mot inachevé n'est pas un mot inconnu : il ne doit pas être signalé comme tel
    assert mot["in_lexicon"] is None
    assert "I?E" not in grid["unknown_words"]
    assert grid["fill_ratio"] < 1


def test_suggestions_fill_the_holes_by_default(grid_app, client):
    """Le geste de l'auteur : effacer deux lettres, puis voir ce qui vient les remplacer."""
    headers = auth_headers(client)
    grid_id = save(client, headers).get_json()["id"]
    send(client, "patch", f"/api/grids/{grid_id}", {"cells": [{"x": 1, "y": 1, "char": ""}]}, headers)

    garde = send(client, "post", f"/api/grids/{grid_id}/suggestions",
                 {"x": 0, "y": 1, "direction": "across"}, headers).get_json()

    assert garde["current"] == "I?E"
    # Les lettres restées en place sont gardées : le motif ne touche qu'au trou
    assert garde["pattern"][0] == "I" and garde["pattern"][2] == "E"
    assert all(mot[0] == "I" and mot[2] == "E" for mot in garde["words"])

    remplace = send(client, "post", f"/api/grids/{grid_id}/suggestions",
                    {"x": 0, "y": 1, "direction": "across", "keep_letters": False}, headers).get_json()

    # En remplacement, plus rien n'est imposé par les lettres en place
    assert remplace["pattern"].count("?") >= garde["pattern"].count("?")


def test_the_list_carries_the_shape_of_each_grid(grid_app, client):
    """Une miniature vaut mieux qu'une ligne de texte quand on a cent grilles : on envoie la forme."""
    headers = auth_headers(client)
    save(client, headers)

    resume = client.get("/api/grids", headers=headers).get_json()[0]

    # 3x2 : la seule case définition est en haut à gauche
    assert resume["shape"] == ["x--", "---"]
    # La forme suffit à dessiner : ni lettres ni mots ne transitent
    assert "cells" not in resume and "words" not in resume


def test_a_cleared_cell_can_become_a_definition(grid_app, client):
    """Roadmap 5A : l'auteur efface une lettre, puis fait de la case une case définition."""
    headers = auth_headers(client)
    grid_id = save(client, headers).get_json()["id"]

    refus = send(client, "patch", f"/api/grids/{grid_id}", {"blocks": [{"x": 2, "y": 1, "is_black": True}]}, headers)
    assert refus.status_code == 400

    send(client, "patch", f"/api/grids/{grid_id}", {"cells": [{"x": 2, "y": 1, "char": ""}]}, headers)
    response = send(client, "patch", f"/api/grids/{grid_id}", {"blocks": [{"x": 2, "y": 1, "is_black": True}]}, headers)

    assert response.status_code == 200, response.get_json()
    grid = response.get_json()["grid"]
    mots = {(w["x"], w["y"], w["direction"]): w["text"] for w in grid["words"]}
    assert mots[(0, 1, "across")] == "IL"
    assert isinstance(grid["layout_warnings"], list)


def test_a_preview_says_what_the_change_would_break_without_saving(grid_app, client):
    """L'auteur est prévenu avant : l'aperçu ne touche pas à la grille."""
    headers = auth_headers(client)
    grid_id = save(client, headers).get_json()["id"]
    avant = client.get(f"/api/grids/{grid_id}", headers=headers).get_json()["grid"]["cells"]

    response = send(client, "patch", f"/api/grids/{grid_id}",
                    {"blocks": [{"x": 0, "y": 0, "is_black": False}], "preview": True}, headers)

    assert response.status_code == 200
    assert {w["kind"] for w in response.get_json()["layout_warnings"]} >= {"mot_sans_definition"}
    assert client.get(f"/api/grids/{grid_id}", headers=headers).get_json()["grid"]["cells"] == avant


# --- Grille à la main (roadmap, point 5B) ---

def test_a_blank_grid_can_be_created_from_a_size(grid_app, client):
    headers = auth_headers(client)

    response = send(client, "post", "/api/grids/blank", {"width": 4, "height": 5}, headers)

    assert response.status_code == 201, response.get_json()
    grid = client.get(f"/api/grids/{response.get_json()['id']}", headers=headers).get_json()["grid"]
    assert (grid["width"], grid["height"], grid["layout"]) == (4, 5, "manuel")
    assert len(grid["cells"]) == 20 and not any(c["is_black"] or c["char"] for c in grid["cells"])
    # Pas encore de case définition : chaque ligne et chaque colonne est un mot à écrire
    assert {(w["direction"], w["length"]) for w in grid["words"]} == {("across", 4), ("down", 5)}


def test_a_grid_can_start_from_a_catalogue_layout(grid_app, client):
    headers = auth_headers(client)

    response = send(client, "post", "/api/grids/blank", {"layout": "5x5-001"}, headers)

    assert response.status_code == 201, response.get_json()
    grid = client.get(f"/api/grids/{response.get_json()['id']}", headers=headers).get_json()["grid"]
    assert grid["layout"] == "5x5-001" and sum(c["is_black"] for c in grid["cells"]) > 0
    assert all(not w["complete"] for w in grid["words"])


@pytest.mark.parametrize("body", [{"width": 3, "height": 6}, {"width": 21, "height": 6}, {},
                                  {"layout": "5x5-001", "width": 5, "height": 5}, {"layout": "../etc"}])
def test_a_blank_grid_request_is_validated(grid_app, client, body):
    response = send(client, "post", "/api/grids/blank", body, auth_headers(client))
    assert response.status_code == 400


def test_an_unknown_layout_is_not_found(grid_app, client):
    response = send(client, "post", "/api/grids/blank", {"layout": "5x5-999"}, auth_headers(client))
    assert response.status_code == 404


def test_a_blank_grid_needs_an_account(grid_app, client):
    assert client.post("/api/grids/blank", json={"width": 6, "height": 6}).status_code == 401


def test_shorter_words_leave_room_for_a_definition_cell(grid_app, client):
    """Roadmap 5B : sur une ligne vide, des mots plus courts, qui ne laissent pas de lettre seule au bout."""
    headers = auth_headers(client)
    grid_id = send(client, "post", "/api/grids/blank", {"width": 6, "height": 4}, headers).get_json()["id"]

    response = send(client, "post", f"/api/grids/{grid_id}/suggestions",
                    {"x": 0, "y": 0, "direction": "across", "shorter": True}, headers)

    assert response.status_code == 200, response.get_json()
    body = response.get_json()
    assert body["shorter"] and body["words"]
    # 6 cases : un mot de 4 laisse une lettre seule au bout, permise ici car un mot vertical la traverse
    assert 4 in {len(mot) for mot in body["words"]}
    assert max(len(mot) for mot in body["words"]) <= 5


def test_shorter_words_never_isolate_the_last_letter(grid_app, client):
    """Une ligne d'une seule rangée : la dernière lettre n'aurait aucun mot vertical, le mot de 4 est écarté."""
    headers = auth_headers(client)
    grid_id = send(client, "post", "/api/grids/blank", {"width": 6, "height": 4}, headers).get_json()["id"]
    # La dernière colonne devient des cases définitions, sauf la case du haut : elle n'a plus de mot vertical
    blocks = [{"x": 5, "y": y, "is_black": True} for y in (1, 2, 3)]
    send(client, "patch", f"/api/grids/{grid_id}", {"blocks": blocks}, headers)

    body = send(client, "post", f"/api/grids/{grid_id}/suggestions",
                {"x": 0, "y": 0, "direction": "across", "shorter": True}, headers).get_json()
    assert 4 not in {len(mot) for mot in body["words"]}


def test_the_authors_dictionary_definitions_are_offered(grid_app, client):
    """#91 : une définition déjà écrite dans un dictionnaire est proposée, pas recopiée d'office."""
    headers = auth_headers(client)
    dict_id = default_dictionary_id(client, headers)
    client.post(f"/api/dictionaries/{dict_id}/words", json={"mot": "ile", "definition": "Terre entourée d'eau"},
                headers=headers)
    client.post(f"/api/dictionaries/{dict_id}/words", json={"mot": "AS", "definition": "  "}, headers=headers)
    autre = send(client, "post", "/api/dictionaries", {"name": "Voyages"}, headers).get_json()["id"]
    client.post(f"/api/dictionaries/{autre}/words", json={"mot": "ILE", "definition": "Escale du marin"}, headers=headers)
    grid_id = save(client, headers).get_json()["id"]

    relu = client.get(f"/api/grids/{grid_id}", headers=headers).get_json()

    proposees = relu["grid"]["dictionary_definitions"]
    assert sorted(d["definition"] for d in proposees["ILE"]) == ["Escale du marin", "Terre entourée d'eau"]
    assert {d["dictionary"] for d in proposees["ILE"]} >= {"Voyages"}
    assert "AS" not in proposees  # une définition vide n'est pas une définition
    assert relu["definitions"] == {}


def test_another_accounts_definitions_are_never_offered(grid_app, client):
    autre = auth_headers(client)
    dict_id = default_dictionary_id(client, autre)
    client.post(f"/api/dictionaries/{dict_id}/words", json={"mot": "ILE", "definition": "Secret"}, headers=autre)

    headers = auth_headers(client)
    grid_id = save(client, headers).get_json()["id"]
    assert client.get(f"/api/grids/{grid_id}", headers=headers).get_json()["grid"]["dictionary_definitions"] == {}


# --- Mot mystère (#218) ---

# AS, ILE : S en (2, 0), E en (2, 1), L en (1, 1)
SEL = {"word": "SEL", "seed": 42, "cells": [{"x": 2, "y": 0}, {"x": 2, "y": 1}, {"x": 1, "y": 1}]}


def two_s_grid():
    """Deux S : quand l'un perd sa lettre, son numéro a une case de rechange."""
    return {"cells": [
        {"x": 0, "y": 0, "char": "", "is_black": True},
        {"x": 1, "y": 0, "char": "A", "is_black": False},
        {"x": 2, "y": 0, "char": "S", "is_black": False},
        {"x": 0, "y": 1, "char": "S", "is_black": False},
        {"x": 1, "y": 1, "char": "E", "is_black": False},
        {"x": 2, "y": 1, "char": "L", "is_black": False},
    ], "words": [
        {"text": "AS", "x": 1, "y": 0, "direction": "across", "source": "common"},
        {"text": "SEL", "x": 0, "y": 1, "direction": "across", "source": "common"},
    ], "must_words": []}


def letters_under(grid: dict) -> str:
    letters = {(cell["x"], cell["y"]): cell["char"] for cell in grid["cells"]}
    return "".join(letters[(cell["x"], cell["y"])] for cell in grid["mystery"]["cells"])


def test_a_mystery_word_is_kept_with_the_grid(client):
    headers = auth_headers(client)
    created = save(client, headers, mystery=SEL)
    assert created.status_code == 201, created.get_json()

    grid = client.get(f"/api/grids/{created.get_json()['id']}", headers=headers).get_json()["grid"]

    assert grid["mystery"] == {**SEL, "broken": []}
    # À part des cases : le contenu de la grille reste celui qu'on a toujours gardé
    assert "mystery" not in grid_payload()


def test_a_mystery_word_that_does_not_match_the_grid_is_refused(client):
    headers = auth_headers(client)
    faux = {**SEL, "cells": [{"x": 1, "y": 0}, {"x": 2, "y": 1}, {"x": 1, "y": 1}]}  # A n'est pas S

    response = save(client, headers, mystery=faux)

    assert response.status_code == 400
    assert response.get_json()["reason"] == "mystery_mismatch"


def test_the_editor_sets_changes_and_removes_the_mystery_word(grid_app, client):
    headers = auth_headers(client)
    grid_id = save(client, headers).get_json()["id"]

    posed = send(client, "patch", f"/api/grids/{grid_id}", {"mystery_word": "sel"}, headers)
    assert posed.status_code == 200, posed.get_json()
    grid = posed.get_json()["grid"]
    assert grid["mystery"]["word"] == "SEL" and letters_under(grid) == "SEL"
    assert grid["mystery"]["broken"] == []

    changed = send(client, "patch", f"/api/grids/{grid_id}", {"mystery_word": "Lie"}, headers).get_json()["grid"]
    assert letters_under(changed) == "LIE"

    removed = send(client, "patch", f"/api/grids/{grid_id}", {"mystery_word": ""}, headers)
    assert removed.status_code == 200
    assert client.get(f"/api/grids/{grid_id}", headers=headers).get_json()["grid"]["mystery"] is None


def test_the_editor_says_which_letters_are_missing(grid_app, client):
    headers = auth_headers(client)
    grid_id = save(client, headers, mystery=SEL).get_json()["id"]

    response = send(client, "patch", f"/api/grids/{grid_id}", {"mystery_word": "Zoé"}, headers)

    assert response.status_code == 422
    body = response.get_json()
    assert (body["reason"], body["missing"]) == ("mystery_letters_missing", ["Z", "O"])
    assert body["error"].startswith("Il manque un Z et un O")
    # Rien n'a bougé : l'ancien mot mystère est toujours là
    assert client.get(f"/api/grids/{grid_id}", headers=headers).get_json()["grid"]["mystery"]["word"] == "SEL"


def test_another_seed_gives_the_same_word_other_cells_when_there_are_some(grid_app, client):
    """Une grille 6 × 6 de A : des dizaines de répartitions aussi bonnes l'une que l'autre, la seed choisit."""
    headers = auth_headers(client)
    cells = [{"x": x, "y": y, "char": "A", "is_black": False} for y in range(6) for x in range(6)]
    grid_id = save(client, headers, width=6, height=6, cells=cells, words=[], must_words=[]).get_json()["id"]

    def cells_for(seed):
        mystery = send(client, "patch", f"/api/grids/{grid_id}", {"mystery_word": "AAA", "mystery_seed": seed},
                       headers).get_json()["grid"]["mystery"]
        assert mystery["seed"] == seed
        return tuple((cell["x"], cell["y"]) for cell in mystery["cells"])

    assert cells_for(5) == cells_for(5)
    assert len({cells_for(seed) for seed in range(12)}) > 1


def test_a_letter_edit_moves_only_the_number_that_lost_its_letter(grid_app, client):
    headers = auth_headers(client)
    grid_id = save(client, headers, **two_s_grid()).get_json()["id"]
    before = send(client, "patch", f"/api/grids/{grid_id}", {"mystery_word": "SEL"}, headers).get_json()["grid"]
    s = before["mystery"]["cells"][0]

    after = send(client, "patch", f"/api/grids/{grid_id}", {"cells": [{**s, "char": "T"}]}, headers).get_json()["grid"]

    # Le numéro 1 passe sur l'autre S ; E et L n'ont pas bougé
    assert after["mystery"]["cells"][0] != s and letters_under(after) == "SEL"
    assert after["mystery"]["cells"][1:] == before["mystery"]["cells"][1:]
    assert after["mystery"]["broken"] == []

    # Plus aucun S : le numéro garde sa case, et la grille le signale
    other = after["mystery"]["cells"][0]
    broken = send(client, "patch", f"/api/grids/{grid_id}", {"cells": [{**other, "char": "T"}]}, headers).get_json()
    assert broken["grid"]["mystery"]["cells"][0] == other
    assert broken["grid"]["mystery"]["broken"] == [1]


def test_another_account_cannot_touch_the_mystery_word(grid_app, client):
    owner = auth_headers(client)
    intruder = auth_headers(client)
    grid_id = save(client, owner, mystery=SEL).get_json()["id"]

    for body in ({"mystery_word": "Lie"}, {"mystery_word": ""}):
        assert send(client, "patch", f"/api/grids/{grid_id}", body, intruder).status_code == 404
    assert send(client, "patch", f"/api/grids/{grid_id}", {"mystery_word": "Lie"}).status_code == 401
    assert client.get(f"/api/grids/{grid_id}", headers=owner).get_json()["grid"]["mystery"]["word"] == "SEL"


def test_the_migration_adds_an_empty_mystery_column_to_existing_grids():
    """Additive (ADR 0010) : les grilles déjà conservées n'ont pas de mot mystère, et l'ancien code insère encore."""
    spec = importlib.util.spec_from_file_location("migration_0015", MYSTERY_MIGRATION)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert len(migration.revision) <= 32  # alembic_version.version_num est un VARCHAR(32)

    engine = sa.create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE saved_grid (id INTEGER PRIMARY KEY, name VARCHAR(100))"))
        connection.execute(sa.text("INSERT INTO saved_grid (id, name) VALUES (1, 'Ancienne')"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        columns = {column["name"]: column for column in sa.inspect(connection).get_columns("saved_grid")}
        assert columns["mystery"]["nullable"] is True
        assert connection.execute(sa.text("SELECT mystery FROM saved_grid")).scalar() is None
        connection.execute(sa.text("INSERT INTO saved_grid (id, name) VALUES (2, 'Sans le connaître')"))
    assert SavedGrid.__table__.c.mystery.nullable


@pytest.mark.parametrize("body, reason", [
    ({"mystery_word": "Lo"}, "mystery_word_length"),
    ({"mystery_word": "L3S"}, None),
    ({"mystery_word": "SEL", "mystery_seed": -1}, None),
])
def test_the_mystery_word_of_the_editor_is_validated(grid_app, client, body, reason):
    headers = auth_headers(client)
    grid_id = save(client, headers).get_json()["id"]

    response = send(client, "patch", f"/api/grids/{grid_id}", body, headers)

    assert response.status_code == 400
    assert response.get_json().get("reason") == reason
