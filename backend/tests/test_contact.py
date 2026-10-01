"""Le formulaire de contact et sa boîte de réception (Phase 8, #131) : ce qui est gardé, ce qui prévient l'auteur,
ce qui ne sort jamais."""

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

import alerts
import usage
import usage_demo
from extensions import db
from models import AlertSent, ContactMessage, User

from tests.test_stats_tables import shape
from tests.helpers import TEST_PASSWORD, auth_headers, register, send, unique_email

AUTHOR = "auteur@exemple.fr"
TEXT = "Le mot ECOLE manque dans les mots de six lettres, je crois."


@pytest.fixture(autouse=True)
def clean(test_app, monkeypatch):
    for model in (ContactMessage, AlertSent):
        model.query.delete()
    db.session.commit()
    monkeypatch.setitem(test_app.config, "MAIL_BACKEND", "memory")
    monkeypatch.setitem(test_app.config, "ALERT_EMAIL", AUTHOR)
    monkeypatch.setitem(test_app.config, "ALERT_DAILY_CAP", 10)
    test_app.extensions["sent_emails"] = []
    yield


@pytest.fixture
def outbox(test_app):
    return test_app.extensions["sent_emails"]


@pytest.fixture
def admin_headers(test_app, client):
    email, tokens = register(client)
    user = User.query.filter_by(email=email).one()
    user.email_verified_at = datetime.now(timezone.utc).replace(tzinfo=None)
    user.is_admin = True
    db.session.commit()
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def write(client, body=None, headers=None):
    return client.post("/api/contact", data=json.dumps({"reason": "suggestion", "message": TEXT, **(body or {})}),
                       content_type="application/json", headers=headers or {})


def stored():
    return ContactMessage.query.order_by(ContactMessage.id).all()


# --- Écrire ---

def test_an_anonymous_message_is_kept_without_anything_that_names_the_sender(client):
    response = write(client, {"email": "Marie@Exemple.fr", "request_id": "abc-123"})

    assert response.status_code == 201
    [message] = stored()
    assert (message.reason, message.message, message.reply_email, message.request_id) == (
        "suggestion", TEXT, "marie@exemple.fr", "abc-123")
    assert (message.site, message.lang, message.user_id, message.read_at) == ("fr", "fr", None, None)


def test_the_reply_address_is_optional(client):
    assert write(client).status_code == 201
    assert stored()[0].reply_email is None


def test_a_logged_in_message_is_linked_to_the_account_and_leaves_with_it(client):
    email = unique_email()
    headers = auth_headers(client, email)
    write(client, headers=headers)
    user = User.query.filter_by(email=email).one()
    assert stored()[0].user_id == user.id

    response = send(client, "delete", "/api/users/me", {"password": TEST_PASSWORD}, headers)
    assert response.status_code == 200, response.get_json()
    assert stored() == []


@pytest.mark.parametrize("body", [
    {"reason": "autre"},
    {"message": "trop bref"},
    {"message": "x" * 2001},
    {"message": "texte avec un caractère nul \x00 interdit"},
    {"email": "pas-une-adresse"},
    {"request_id": "x y; DROP TABLE"},
    {"request_id": "a" * 65},
])
def test_an_invalid_message_is_refused_and_not_kept(client, body):
    response = write(client, body)

    assert response.status_code == 400
    assert stored() == []


def test_the_honeypot_gets_the_same_answer_and_keeps_nothing(client, outbox):
    response = write(client, {"website": "http://spam.example"})

    assert response.status_code == 201
    assert stored() == [] and outbox == []


def test_five_messages_an_hour(test_app, client, monkeypatch):
    monkeypatch.setitem(test_app.config, "RATELIMIT_ENABLED", True)
    from app import create_app  # le limiteur est lié à l'application : une neuve, avec la limite activée
    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
                      "JWT_SECRET_KEY": "test-secret-key-long-enough-for-hs256-signing", "RATELIMIT_ENABLED": True,
                      "LEXICON_LOAD": False})
    with app.app_context():
        db.create_all()
        statuses = [write(app.test_client()).status_code for _ in range(6)]
        db.drop_all()
    assert statuses == [201] * 5 + [429]


# --- Prévenir l'auteur ---

def test_the_author_is_told_but_the_message_is_never_copied(client, outbox):
    write(client, {"email": "marie@exemple.fr"})

    [mail] = outbox
    assert mail["To"] == AUTHOR
    assert mail["Subject"].startswith("Nouveau message de contact")
    text = mail.get_content()
    assert TEXT not in text and "marie@exemple.fr" not in text and "ECOLE" not in text
    assert "/admin" in text


def test_the_subject_is_fixed_whatever_the_message_says(client, outbox):
    write(client, {"message": "Bonjour\r\nBcc: quelqu-un@exemple.fr\r\nSubject: piégé", "email": "a@exemple.fr"})

    [mail] = outbox
    assert mail["Bcc"] is None and "piégé" not in mail["Subject"]


def test_after_five_notifications_a_single_one_covers_the_rest(client, outbox):
    for _ in range(9):
        assert write(client).status_code == 201

    subjects = [mail["Subject"] for mail in outbox]
    assert sum(subject.startswith("Nouveau message de contact") for subject in subjects) == 5
    assert sum(subject.startswith("Messages de contact en attente") for subject in subjects) == 1
    assert len(stored()) == 9  # aucun message perdu


def test_contact_notifications_leave_room_for_the_alerts(client, outbox):
    for _ in range(12):
        write(client)

    assert len(outbox) == 6  # cinq messages et un résumé, sur dix envois par 24 heures


def test_a_failing_notification_does_not_lose_the_message(test_app, client, monkeypatch):
    monkeypatch.setattr(alerts, "notify_contact", lambda message_id: 1 / 0)

    assert write(client).status_code == 201
    assert len(stored()) == 1


# --- Lire ---

def test_the_inbox_lists_messages_newest_first_without_naming_the_account(client, admin_headers):
    headers = auth_headers(client)
    write(client, {"message": "Premier message pour l'auteur."})
    write(client, {"message": "Second message, depuis un compte."}, headers=headers)

    data = client.get("/api/admin/contact", headers=admin_headers).get_json()

    assert data["unread"] == 2
    assert [m["message"] for m in data["messages"]] == ["Second message, depuis un compte.",
                                                        "Premier message pour l'auteur."]
    assert [m["from_account"] for m in data["messages"]] == [True, False]
    assert {key for m in data["messages"] for key in m} == {
        "id", "at", "reason", "message", "reply_email", "request_id", "from_account", "read"}


def test_marking_read_and_deleting(client, admin_headers):
    write(client)
    [message] = stored()

    read = send(client, "patch", f"/api/admin/contact/{message.id}", {"read": True}, admin_headers)
    assert read.status_code == 200
    assert client.get("/api/admin/contact", headers=admin_headers).get_json()["unread"] == 0
    send(client, "patch", f"/api/admin/contact/{message.id}", {"read": False}, admin_headers)
    assert client.get("/api/admin/contact", headers=admin_headers).get_json()["unread"] == 1

    gone = client.delete(f"/api/admin/contact/{message.id}", headers=admin_headers)
    assert gone.status_code == 204
    assert stored() == []
    assert client.delete(f"/api/admin/contact/{message.id}", headers=admin_headers).status_code == 404


def test_an_ordinary_account_cannot_read_the_inbox(client):
    write(client)
    headers = auth_headers(client)

    assert client.get("/api/admin/contact", headers=headers).status_code == 404
    [message] = stored()
    assert send(client, "patch", f"/api/admin/contact/{message.id}", {"read": True}, headers).status_code == 404
    assert client.delete(f"/api/admin/contact/{message.id}", headers=headers).status_code == 404
    assert len(stored()) == 1 and stored()[0].read_at is None


# --- Garder douze mois ---

def test_messages_are_purged_after_twelve_months(client):
    write(client)
    write(client)
    old, recent = stored()
    old.created_at = datetime.now(timezone.utc).replace(tzinfo=None) - usage.CONTACT_RETENTION - timedelta(days=1)
    db.session.commit()

    usage.purge()

    assert [m.id for m in stored()] == [recent.id]


def test_the_weekly_report_counts_the_messages(client):
    write(client)
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    assert "Messages de contact reçus : 1 cette semaine, 1 non lu(s) en tout." in alerts.weekly_body(now)


# --- Contrat avec l'interface ---

FRONTEND_FIXTURE = Path(__file__).resolve().parents[2] / "frontend" / "tests" / "fixtures" / "admin-contact.json"
NOW = datetime(2026, 10, 1, 15, 30)


def test_the_frontend_fixture_has_the_shape_of_the_real_response(client, admin_headers):
    """`frontend/tests/admin.spec.ts` dessine la boîte de réception à partir de cette réponse enregistrée.

    La régénérer : `UPDATE_FIXTURES=1 pytest tests/test_contact.py -k fixture` (dépôt complet monté).
    """
    if not FRONTEND_FIXTURE.parent.is_dir():
        pytest.skip("frontend/ absent (make test-backend ne monte que backend/)")
    usage_demo.seed_contact(NOW, "fr", "fr")
    db.session.commit()
    data = client.get("/api/admin/contact", headers=admin_headers).get_json()
    if os.environ.get("UPDATE_FIXTURES"):
        FRONTEND_FIXTURE.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    recorded = json.loads(FRONTEND_FIXTURE.read_text(encoding="utf-8"))

    assert shape(recorded) == shape(data)
    assert recorded["unread"] == data["unread"] > 0
