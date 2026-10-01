"""Espace d'administration (ADR 0016, point 6) : fermé à tout autre compte, rôle posé en ligne de commande."""

import json
import logging
from datetime import datetime, timezone

import pytest

from extensions import db
from models import UsageEvent, User

from tests.helpers import register, send, unique_email
from tests.paths import FIXTURE_LAYOUTS_DIR

UNKNOWN_ADDRESS = "/api/admin/cette-route-n-existe-pas"


def admin_routes(app) -> list[str]:
    """Toutes les routes du blueprint : une route ajoutée plus tard est testée d'office."""
    return sorted({rule.rule for rule in app.url_map.iter_rules() if rule.rule.startswith("/api/admin")})


def admin_endpoints(app) -> list[tuple[str, str]]:
    """Chaque route avec chacune de ses méthodes. Une méthode que la route ne connaît pas répond 405 avant le
    contrôle d'accès du blueprint : ce que le visiteur peut appeler, c'est ce que la route déclare."""
    return sorted((rule.rule, method.lower()) for rule in app.url_map.iter_rules()
                  if rule.rule.startswith("/api/admin") for method in rule.methods
                  if method in ("GET", "POST", "PUT", "PATCH", "DELETE"))


def concrete(route: str) -> str:
    """Une adresse qu'on peut appeler : un identifiant de message quelconque remplace le paramètre."""
    return route.replace("<int:message_id>", "1")


# La boîte de réception des messages de contact : seule exception à « lecture seule » (ADR 0016, point 6)
INBOX_WRITES = {("/api/admin/contact/<int:message_id>", "PATCH"), ("/api/admin/contact/<int:message_id>", "DELETE")}


def confirm(email: str, admin: bool = False) -> None:
    """Dans le contexte d'application du module (conftest), dont la session sert aussi aux requêtes et aux
    commandes : écrire depuis un autre contexte laisserait à celle-ci une copie périmée du compte."""
    user = User.query.filter_by(email=email).one()
    user.email_verified_at = datetime.now(timezone.utc).replace(tzinfo=None)
    user.is_admin = admin
    db.session.commit()


@pytest.fixture
def grid_app(test_app, small_trie, monkeypatch):
    monkeypatch.setattr(test_app, "dela_trie", small_trie)
    monkeypatch.setitem(test_app.config, "LAYOUTS_DIR", FIXTURE_LAYOUTS_DIR)
    return test_app


@pytest.fixture
def admin_headers(test_app, client):
    email, tokens = register(client)
    confirm(email, admin=True)
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def test_the_admin_space_has_routes(test_app):
    assert admin_routes(test_app) == ["/api/admin/contact", "/api/admin/contact/<int:message_id>",
                                      "/api/admin/stats", "/api/admin/suggestions", "/api/admin/system"]


def test_a_visitor_gets_the_same_404_as_an_unknown_address(test_app, client):
    unknown = client.get(UNKNOWN_ADDRESS)
    assert unknown.status_code == 404
    for route, method in admin_endpoints(test_app):  # les écritures de la boîte de réception aussi
        response = send(client, method, concrete(route), {"read": True})
        assert (response.status_code, response.get_json()) == (404, unknown.get_json()), (method, route)


def test_an_ordinary_account_gets_404_even_with_a_confirmed_address(test_app, client):
    email, tokens = register(client)
    confirm(email, admin=False)
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    for route, method in admin_endpoints(test_app):
        assert send(client, method, concrete(route), {"read": True}, headers).status_code == 404, (method, route)


@pytest.mark.parametrize("token", ["pas-un-jeton", "eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0."])
def test_a_forged_token_gets_404_not_401(test_app, client, token):
    headers = {"Authorization": f"Bearer {token}"}
    for route, method in admin_endpoints(test_app):
        assert send(client, method, concrete(route), {"read": True}, headers).status_code == 404, (method, route)


def test_the_admin_sees_aggregates_and_nothing_personal(grid_app, client, admin_headers):
    visitor_email = unique_email()
    register(client, visitor_email)
    generated = client.post("/api/grids/generate", json={"size": {"width": 5, "height": 5}, "seed": 42},
                            headers={"User-Agent": "Mozilla/5.0 (test)", "CF-IPCountry": "fr"})
    assert generated.status_code == 200, generated.get_json()

    response = client.get("/api/admin/stats", headers=admin_headers)

    assert response.status_code == 200, response.get_json()
    data = response.get_json()
    assert [period["label"] for period in data["periods"]] == ["Aujourd'hui", "7 jours", "30 jours"]
    assert data["periods"][0]["register"] >= 1
    assert data["periods"][0]["grids"] >= 1
    assert data["thresholds"]["p95_limit_ms"] == 15000
    assert [(row["format"], row["total"], row["grid"]) for row in data["formats"]] == [("5x5", 1, 1)]
    # Les dernières générations, sans rien qui désigne un visiteur
    assert data["latest"] and all(
        set(item) == {"at", "format", "layout", "outcome", "duration_ms", "must"} for item in data["latest"])
    text = json.dumps(data)
    assert visitor_email not in text
    assert "user_id" not in text


def test_writing_is_possible_only_in_the_inbox(test_app, client, admin_headers):
    """Aucune route d'écriture hors de la boîte de réception : la liste est énumérée, pas supposée."""
    writes = {(rule.rule, method) for rule in test_app.url_map.iter_rules() if rule.rule.startswith("/api/admin")
              for method in rule.methods if method in ("POST", "PUT", "PATCH", "DELETE")}
    assert writes == INBOX_WRITES
    for route in admin_routes(test_app):
        for method in ("post", "put"):
            assert send(client, method, concrete(route), {}, admin_headers).status_code in (404, 405), (method, route)


def test_each_access_is_logged_whether_allowed_or_refused(test_app, client, admin_headers, caplog):
    with caplog.at_level(logging.INFO, logger="admin"):
        client.get("/api/admin/stats", headers=admin_headers)
        client.get("/api/admin/stats")
    messages = [record.getMessage() for record in caplog.records if record.name == "admin"]
    assert any(message.startswith("Administration : GET /api/admin/stats") for message in messages)
    assert any("accès refusé" in message and "compte aucun" in message for message in messages)


def test_admin_consultations_are_not_counted_as_usage(test_app, client, admin_headers):
    before = UsageEvent.query.count()
    client.get("/api/admin/stats", headers=admin_headers)
    assert UsageEvent.query.count() == before


def test_the_role_cannot_be_given_through_the_api(test_app, client):
    email = unique_email()
    response = send(client, "post", "/api/auth/register", {"email": email, "password": "password123", "is_admin": True})
    assert response.status_code == 201
    assert User.query.filter_by(email=email).one().is_admin is False


def test_grant_requires_a_confirmed_address_then_revoke(test_app, client, runner):
    email, tokens = register(client)
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    refused = runner.invoke(args=["admin", "grant", email])
    assert refused.exit_code != 0
    assert "non confirmée" in refused.output

    confirm(email)
    granted = runner.invoke(args=["admin", "grant", email.upper()])  # l'adresse se lit sans tenir compte de la casse
    assert granted.exit_code == 0, granted.output
    assert email in runner.invoke(args=["admin", "list"]).output
    # Le rôle est relu à chaque requête : la session déjà ouverte y accède aussitôt, et le perd de même
    assert client.get("/api/admin/stats", headers=headers).status_code == 200

    assert runner.invoke(args=["admin", "revoke", email]).exit_code == 0
    assert client.get("/api/admin/stats", headers=headers).status_code == 404


def test_grant_on_an_unknown_address_fails(runner):
    result = runner.invoke(args=["admin", "grant", "personne@exemple.fr"])
    assert result.exit_code != 0
    assert "Aucun compte" in result.output
