"""Mises en page proposées au catalogue : la proposition est retirée du site (#221), les données reçues restent."""

from extensions import db
from models import LayoutProposal, User
from tests.helpers import TEST_PASSWORD, auth_headers, send


def blank_grid(client, headers) -> int:
    return send(client, "post", "/api/grids/blank", {"width": 5, "height": 5}, headers).get_json()["id"]


def test_a_layout_can_no_longer_be_proposed(client):
    headers = auth_headers(client)
    grid_id = blank_grid(client, headers)

    assert send(client, "post", f"/api/grids/{grid_id}/propose-layout", None, headers).status_code in (404, 405)
    grid = client.get(f"/api/grids/{grid_id}", headers=headers).get_json()["grid"]
    assert "catalog_layout" not in grid and "layout_proposed" not in grid


def test_proposals_received_before_leave_with_the_account(test_app, client):
    headers = auth_headers(client, "propose@test.com")
    with test_app.app_context():
        user = User.query.filter_by(email="propose@test.com").one()
        db.session.add(LayoutProposal(width=3, height=1, rows="x--", lang=test_app.config["SITE_LANG"], user_id=user.id))
        db.session.commit()

    response = send(client, "delete", "/api/users/me", {"password": TEST_PASSWORD}, headers)

    assert response.status_code == 200, response.get_json()
    with test_app.app_context():
        assert LayoutProposal.query.filter_by(rows="x--").count() == 0
