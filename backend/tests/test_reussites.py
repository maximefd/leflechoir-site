"""Les grilles du jour réussies, gardées avec le compte (J3) : chacun les siennes, fusionnées sans rien perdre."""

from datetime import date, datetime, timedelta, timezone

import pytest

from extensions import db
from models import GridSuccess, User

from tests.helpers import auth_headers, register, send, TEST_PASSWORD


@pytest.fixture(autouse=True)
def clean(test_app):
    GridSuccess.query.delete()
    db.session.commit()
    yield


def noter(client, headers, *reussites):
    return send(client, "post", "/api/reussites", {"reussites": list(reussites)}, headers)


def test_a_success_is_kept_with_the_account_and_read_back(client):
    headers = auth_headers(client)

    response = noter(client, headers, {"date": "2026-10-24", "ms": 200000, "le": "2026-10-24"})

    assert response.status_code == 200
    assert response.get_json() == {"reussites": {"2026-10-24": {"ms": 200000, "le": "2026-10-24"}}}
    assert client.get("/api/reussites", headers=headers).get_json() == response.get_json()
    [row] = GridSuccess.query.all()
    assert row.lang == "fr"


def test_the_browser_successes_join_the_account_without_losing_anything(client):
    """À la connexion : le meilleur temps et le premier jour l'emportent, d'où qu'ils viennent."""
    headers = auth_headers(client)
    noter(client, headers, {"date": "2026-10-20", "ms": 300000, "le": "2026-10-21"},
          {"date": "2026-10-22", "ms": None, "le": "2026-10-22"})

    response = noter(client, headers,
                     {"date": "2026-10-20", "ms": 250000, "le": "2026-10-23"},  # plus rapide, plus tard
                     {"date": "2026-10-22", "ms": 90000, "le": "2026-10-22"},  # enfin un temps
                     {"date": "2026-10-23", "ms": 120000, "le": "2026-10-23"})  # une de plus

    assert response.get_json()["reussites"] == {
        "2026-10-20": {"ms": 250000, "le": "2026-10-21"},
        "2026-10-22": {"ms": 90000, "le": "2026-10-22"},
        "2026-10-23": {"ms": 120000, "le": "2026-10-23"},
    }
    # Un temps plus lent ne remplace pas le meilleur
    slower = noter(client, headers, {"date": "2026-10-20", "ms": 999000, "le": "2026-10-20"}).get_json()
    assert slower["reussites"]["2026-10-20"] == {"ms": 250000, "le": "2026-10-20"}


def test_each_account_sees_only_its_own_successes(client):
    alice, bob = auth_headers(client), auth_headers(client)
    noter(client, alice, {"date": "2026-10-24", "ms": 1000, "le": "2026-10-24"})

    assert client.get("/api/reussites", headers=bob).get_json() == {"reussites": {}}


def test_a_grid_not_yet_published_cannot_be_a_success(client):
    headers = auth_headers(client)
    plus_tard = (datetime.now(timezone.utc).date() + timedelta(days=3)).isoformat()

    response = noter(client, headers, {"date": plus_tard, "ms": 1000, "le": plus_tard})

    assert response.status_code == 400
    assert response.get_json() == {"error": "Cette grille n'est pas encore parue.", "reason": "future_grid"}
    assert GridSuccess.query.count() == 0


def test_a_success_day_cannot_precede_its_grid(client):
    headers = auth_headers(client)

    response = noter(client, headers, {"date": "2026-10-24", "ms": 1000, "le": "2020-01-01"})

    assert response.get_json()["reussites"]["2026-10-24"]["le"] == "2026-10-24"


@pytest.mark.parametrize("body", [
    {},
    {"reussites": []},
    {"reussites": [{"date": "24/10/2026", "le": "2026-10-24"}]},
    {"reussites": [{"date": "2026-02-30", "le": "2026-02-28"}]},
    {"reussites": [{"date": "2026-10-24", "ms": -1, "le": "2026-10-24"}]},
    {"reussites": [{"date": "2026-10-24", "ms": 1000}]},
    {"reussites": [{"date": "2026-10-24", "le": "2026-10-24"}] * 501},
])
def test_malformed_successes_are_refused_in_french(client, body):
    headers = auth_headers(client)

    response = send(client, "post", "/api/reussites", body, headers)

    assert response.status_code == 400
    assert response.get_json()["error"]
    assert GridSuccess.query.count() == 0


def test_successes_leave_with_the_account(client):
    email, tokens = register(client)
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    noter(client, headers, {"date": date(2026, 10, 24).isoformat(), "ms": 1000, "le": "2026-10-24"})
    assert client.get("/api/users/me", headers=headers).get_json()["reussites"] == 1

    response = send(client, "delete", "/api/users/me", {"password": TEST_PASSWORD}, headers)

    assert response.status_code == 200
    assert GridSuccess.query.count() == 0
    assert User.query.filter_by(email=email).count() == 0
