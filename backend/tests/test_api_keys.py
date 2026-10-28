"""Les clés de l'API ouverte (ADR 0032, point 3) : créées dans « Mon compte », montrées une fois, gardées hachées."""

import hashlib
from datetime import datetime

import pytest

from api_keys import digest, new_key
from models import ApiKey, GenerationJob, User, db

from tests.helpers import TEST_PASSWORD, register, send


@pytest.fixture(autouse=True)
def clean(test_app, monkeypatch):
    monkeypatch.setitem(test_app.config, "API_ENABLED", True)
    GenerationJob.query.delete()
    ApiKey.query.delete()
    db.session.commit()
    yield


def verified_headers(client) -> dict:
    email, tokens = register(client)
    user = User.query.filter_by(email=email).one()
    user.email_verified_at = datetime(2026, 10, 27)
    db.session.commit()
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def create(client, headers, name="Mon agent"):
    return send(client, "post", "/api/account/api-keys", {"name": name}, headers)


def test_a_key_is_shown_once_and_kept_only_as_its_digest(client):
    headers = verified_headers(client)

    response = create(client, headers)

    assert response.status_code == 201
    body = response.get_json()
    key = body["key"]
    assert key.startswith("flk_") and len(key) == 47
    assert body["prefix"] == key[:10] and body["name"] == "Mon agent"
    [row] = ApiKey.query.all()
    assert row.key_hash == hashlib.sha256(key.encode()).hexdigest()
    assert key not in (row.prefix, row.name, row.key_hash)
    listed = client.get("/api/account/api-keys", headers=headers).get_json()
    assert listed["keys"] == [{k: v for k, v in body.items() if k != "key"}]
    assert "key" not in listed["keys"][0]


def test_a_key_needs_a_confirmed_address(client):
    _, tokens = register(client)

    response = create(client, {"Authorization": f"Bearer {tokens['access_token']}"})

    assert response.status_code == 403
    assert response.get_json()["reason"] == "email_not_verified"


def test_a_key_needs_a_session(client):
    assert create(client, {}).status_code == 401


def test_the_number_of_active_keys_is_capped(client, test_app, monkeypatch):
    monkeypatch.setitem(test_app.config, "API_MAX_KEYS_PER_USER", 2)
    headers = verified_headers(client)
    assert create(client, headers).status_code == 201
    assert create(client, headers).status_code == 201

    refused = create(client, headers)

    assert refused.status_code == 409
    assert refused.get_json()["reason"] == "too_many_keys"


def test_a_revoked_key_is_refused_at_once(client):
    headers = verified_headers(client)
    created = create(client, headers).get_json()
    bearer = {"Authorization": f"Bearer {created['key']}"}
    assert client.get("/v1/limits", headers=bearer).get_json()["keyed"] is True

    assert send(client, "delete", f"/api/account/api-keys/{created['id']}", headers=headers).status_code == 204

    refused = client.get("/v1/limits", headers=bearer)
    assert refused.status_code == 401
    assert refused.get_json()["reason"] == "invalid_api_key"
    assert refused.headers["WWW-Authenticate"].startswith("Bearer")
    assert client.get("/api/account/api-keys", headers=headers).get_json()["keys"] == []


def test_the_key_of_someone_else_cannot_be_revoked(client):
    owner = verified_headers(client)
    created = create(client, owner).get_json()

    response = send(client, "delete", f"/api/account/api-keys/{created['id']}", headers=verified_headers(client))

    assert response.status_code == 404
    assert db.session.get(ApiKey, created["id"]).revoked_at is None


@pytest.mark.parametrize("header", [
    "Bearer flk_inconnue",
    "Bearer flk_" + "A" * 43,
    "Basic dXNlcjpwYXNz",
    "flk_" + "A" * 43,
])
def test_a_malformed_or_unknown_key_is_refused_the_same_way(client, header):
    response = client.get("/v1/limits", headers={"Authorization": header})

    assert response.status_code == 401
    assert response.get_json() == {"error": "Invalid or revoked API key.", "reason": "invalid_api_key"}


def test_a_key_works_whatever_the_site_of_its_account(client):
    """Les comptes sont séparés par site, les clés non : une clé créée sur le site allemand ouvre l'API (ADR 0032)."""
    key = new_key()
    db.session.add(ApiKey(owner_site="de", user_id=12345, name="agent", prefix=key[:10], key_hash=digest(key)))
    db.session.commit()

    response = client.get("/v1/limits", headers={"Authorization": f"Bearer {key}"})

    assert response.status_code == 200 and response.get_json()["keyed"] is True


def test_the_keys_of_an_account_are_those_of_its_own_site(client, test_app, monkeypatch):
    headers = verified_headers(client)
    create(client, headers)
    monkeypatch.setitem(test_app.config, "SITE", "de")

    assert client.get("/api/account/api-keys", headers=headers).get_json()["keys"] == []


def test_a_session_token_is_not_an_api_key(client):
    """Le jeton du site ne donne rien à l'API ouverte : elle ne connaît que ses clés."""
    _, tokens = register(client)

    response = client.get("/v1/limits", headers={"Authorization": f"Bearer {tokens['access_token']}"})

    assert response.status_code == 401
    assert response.get_json()["reason"] == "invalid_api_key"


def test_the_keys_leave_with_the_account(client):
    headers = verified_headers(client)
    create(client, headers)
    assert client.get("/api/users/me", headers=headers).get_json()["api_keys"] == 1

    response = send(client, "delete", "/api/users/me", {"password": TEST_PASSWORD}, headers)

    assert response.status_code == 200
    assert ApiKey.query.count() == 0


def test_the_keys_can_be_listed_and_revoked_from_the_command_line(client, test_app):
    created = create(client, verified_headers(client)).get_json()
    runner = test_app.test_cli_runner()

    listed = runner.invoke(args=["api", "keys"])
    revoked = runner.invoke(args=["api", "revoke", created["prefix"]])

    assert created["prefix"] in listed.output and created["key"] not in listed.output
    assert revoked.exit_code == 0, revoked.output
    assert db.session.get(ApiKey, created["id"]).revoked_at is not None
