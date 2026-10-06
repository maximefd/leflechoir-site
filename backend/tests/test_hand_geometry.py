"""Une géométrie de style magazine tirée au hasard, pour commencer une grille à la main (#221)."""

from tests.helpers import auth_headers, send


def test_a_magazine_geometry_is_drawn_at_the_requested_size(client):
    headers = auth_headers(client)

    response = send(client, "post", "/api/grids/geometry", {"width": 7, "height": 9, "seed": 3}, headers)

    assert response.status_code == 200, response.get_json()
    rows = response.get_json()["rows"]
    assert len(rows) == 9 and all(len(row) == 7 and set(row) <= {"x", "-"} for row in rows)
    # Le coin haut gauche porte toujours des définitions ; même seed, même géométrie
    assert rows[0][0] == "x"
    assert send(client, "post", "/api/grids/geometry", {"width": 7, "height": 9, "seed": 3}, headers).get_json() == {
        "rows": rows}


def test_a_geometry_needs_an_account(client):
    assert send(client, "post", "/api/grids/geometry", {"width": 7, "height": 9}, {}).status_code == 401


def test_a_size_out_of_range_is_refused(client):
    headers = auth_headers(client)
    assert send(client, "post", "/api/grids/geometry", {"width": 4, "height": 9}, headers).status_code == 400


def test_a_size_without_any_geometry_says_why(client):
    headers = auth_headers(client)

    response = send(client, "post", "/api/grids/geometry", {"width": 5, "height": 11, "seed": 1}, headers)

    assert response.status_code == 422
    assert response.get_json()["reason"] == "geometry_unavailable"
