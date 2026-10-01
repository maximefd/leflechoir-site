"""Mises en page proposées au catalogue (roadmap 5C) : une grille finie, faite à la main, peut être proposée."""

import json

import pytest

from extensions import db
from models import LayoutProposal
from tests.helpers import TEST_PASSWORD, auth_headers, send
from tests.paths import FIXTURE_LAYOUTS_DIR

# Le layout 5x5-001 des fixtures, sans sa case définition du coin bas droit : une forme hors catalogue
FAITE_MAIN = ["x-x-x", "-----", "x----", "-----", "x----"]


@pytest.fixture
def grid_app(test_app, small_trie, monkeypatch):
    monkeypatch.setattr(test_app, "dela_trie", small_trie)
    monkeypatch.setitem(test_app.config, "LAYOUTS_DIR", FIXTURE_LAYOUTS_DIR)
    # La base vit le temps du module : chaque test part sans proposition
    with test_app.app_context():
        LayoutProposal.query.delete()
        db.session.commit()
    return test_app


def grille(client, headers, rows=FAITE_MAIN, remplie=True) -> int:
    """Une grille vide de la taille de `rows`, ses cases définitions placées, remplie de A si demandé."""
    grid_id = send(client, "post", "/api/grids/blank", {"width": len(rows[0]), "height": len(rows)},
                   headers).get_json()["id"]
    blocks = [{"x": x, "y": y, "is_black": True} for y, row in enumerate(rows) for x, c in enumerate(row) if c == "x"]
    lettres = [{"x": x, "y": y, "char": "A"} for y, row in enumerate(rows) for x, c in enumerate(row)
               if c == "-" and remplie]
    response = send(client, "patch", f"/api/grids/{grid_id}", {"blocks": blocks, "cells": lettres}, headers)
    assert response.status_code == 200, response.get_json()
    return grid_id


def proposer(client, headers, grid_id):
    return send(client, "post", f"/api/grids/{grid_id}/propose-layout", None, headers)


def test_the_grid_says_whether_its_shape_is_in_the_catalog(grid_app, client):
    headers = auth_headers(client)
    du_catalogue = send(client, "post", "/api/grids/blank", {"layout": "5x5-001"}, headers).get_json()["id"]
    assert client.get(f"/api/grids/{du_catalogue}", headers=headers).get_json()["grid"]["catalog_layout"] == "5x5-001"

    faite_main = grille(client, headers)
    assert client.get(f"/api/grids/{faite_main}", headers=headers).get_json()["grid"]["catalog_layout"] is None


def test_a_finished_hand_made_layout_is_proposed_once(grid_app, client):
    headers = auth_headers(client)
    grid_id = grille(client, headers)
    assert client.get(f"/api/grids/{grid_id}", headers=headers).get_json()["grid"]["layout_proposed"] is False
    response = proposer(client, headers, grid_id)
    assert response.status_code == 201, response.get_json()
    assert response.get_json()["message"] == "Merci, c'est envoyé."
    assert client.get(f"/api/grids/{grid_id}", headers=headers).get_json()["grid"]["layout_proposed"] is True

    # La même forme, par un autre compte : même remerciement, une seule proposition gardée
    autre = auth_headers(client)
    assert proposer(client, autre, grille(client, autre)).status_code == 201
    with grid_app.app_context():
        propositions = LayoutProposal.query.all()
        assert [(p.width, p.height, p.rows.split("\n")) for p in propositions] == [(5, 5, FAITE_MAIN)]


def test_only_the_shape_is_kept(grid_app, client):
    headers = auth_headers(client)
    proposer(client, headers, grille(client, headers))
    with grid_app.app_context():
        assert "A" not in LayoutProposal.query.one().rows


@pytest.mark.parametrize("rows, remplie, reason, status", [
    (FAITE_MAIN, False, "grid_not_full", 400),
    (["x-x-x", "-----", "x----", "-----", "x---x"], True, "layout_in_catalog", 409),
    # La lettre du coin bas droit n'appartient à aucun mot : avertie dans l'éditeur, refusée au catalogue
    (["x-x-x", "-----", "x----", "----x", "x--x-"], True, "layout_warnings", 400),
])
def test_an_unfinished_or_known_layout_is_refused(grid_app, client, rows, remplie, reason, status):
    headers = auth_headers(client)
    response = proposer(client, headers, grille(client, headers, rows, remplie))
    assert response.status_code == status
    assert response.get_json()["reason"] == reason
    with grid_app.app_context():
        assert LayoutProposal.query.count() == 0


def test_a_layout_is_proposed_only_from_ones_own_grid(grid_app, client):
    grid_id = grille(client, auth_headers(client))
    assert proposer(client, auth_headers(client), grid_id).status_code == 404
    assert client.post(f"/api/grids/{grid_id}/propose-layout").status_code == 401


def test_proposals_leave_with_the_account(grid_app, client):
    headers = auth_headers(client)
    proposer(client, headers, grille(client, headers))
    response = send(client, "delete", "/api/users/me", {"password": TEST_PASSWORD}, headers)
    assert response.status_code == 200, response.get_json()
    with grid_app.app_context():
        assert LayoutProposal.query.count() == 0


def test_proposals_are_exported_for_the_curator(grid_app, client, runner):
    headers = auth_headers(client)
    proposer(client, headers, grille(client, headers))
    result = runner.invoke(args=["layouts", "export"])
    assert result.exit_code == 0, result.output
    export = json.loads(result.output)
    assert [(p["width"], p["height"], p["rows"]) for p in export["proposals"]] == [(5, 5, FAITE_MAIN)]
    assert "user_id" not in export["proposals"][0]


def test_a_layout_added_to_the_catalog_is_seen_at_once(grid_app, client, tmp_path, monkeypatch):
    """Les formes du catalogue sont gardées en mémoire, mais un nouveau fichier est vu sans redémarrage."""
    monkeypatch.setitem(grid_app.config, "LAYOUTS_DIR", str(tmp_path))
    (tmp_path / "5x5").mkdir()
    headers = auth_headers(client)
    grid_id = grille(client, headers)
    assert client.get(f"/api/grids/{grid_id}", headers=headers).get_json()["grid"]["catalog_layout"] is None

    (tmp_path / "5x5" / "001.txt").write_text("\n".join(FAITE_MAIN) + "\n", encoding="utf-8")
    assert client.get(f"/api/grids/{grid_id}", headers=headers).get_json()["grid"]["catalog_layout"] == "5x5-001"
