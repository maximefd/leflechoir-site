"""Se connecter avec Google ou Microsoft (oidc.py, ADR 0034), avec un faux fournisseur : nos propres clés RSA signent
les jetons d'identité, et l'échange du code est remplacé. Tout le reste est le vrai parcours."""

import base64
import hashlib
import time
import urllib.parse
import uuid

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

import oidc
from extensions import db
from models import Identity, UsageEvent, User
from tests.helpers import TEST_PASSWORD, forget_cookies, register, send, tokens_for, unique_email

KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
PEM = KEY.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
OTHER_PEM = OTHER_KEY.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                    serialization.NoEncryption())
CLIENT_IDS = {"google": "google-client.apps", "microsoft": "11111111-2222-3333-4444-555555555555"}
WORK_TENANT = "72f988bf-0000-0000-0000-000000000000"


@pytest.fixture(autouse=True)
def providers(test_app, monkeypatch):
    for provider, client_id in CLIENT_IDS.items():
        monkeypatch.setitem(test_app.config, f"OIDC_{provider.upper()}_CLIENT_ID", client_id)
        monkeypatch.setitem(test_app.config, f"OIDC_{provider.upper()}_CLIENT_SECRET", "secret-de-test")
    monkeypatch.setattr(oidc, "_signing_key", lambda provider, token: KEY.public_key())


class FakeProvider:
    """Ce que le fournisseur renverrait à l'échange du code : un jeton d'identité signé, avec les revendications voulues."""

    def __init__(self, monkeypatch):
        self.claims: dict = {}
        self.pem = PEM
        self.verifiers: list[str] = []
        monkeypatch.setattr(oidc, "_exchange", self.exchange)

    def exchange(self, provider, code, verifier):
        self.verifiers.append(verifier)
        return {"id_token": jwt.encode(self.claims, self.pem, algorithm="RS256"), "access_token": "ignoré"}


@pytest.fixture()
def fake(monkeypatch):
    return FakeProvider(monkeypatch)


def claims(provider, nonce, sub=None, email=None, **extra):
    now = int(time.time())
    base = {"sub": sub or uuid.uuid4().hex, "aud": CLIENT_IDS[provider], "iat": now, "exp": now + 600, "nonce": nonce}
    if provider == "google":
        base.update(iss="https://accounts.google.com", email=email, email_verified=True)
    else:
        tid = extra.pop("tid", oidc.MICROSOFT_CONSUMERS_TENANT)
        base.update(iss=f"https://login.microsoftonline.com/{tid}/v2.0", tid=tid, email=email)
    base.update(extra)
    return {key: value for key, value in base.items() if value is not None}


def start(client, provider="google", **params):
    response = client.get(f"/api/auth/oidc/{provider}/start?" + urllib.parse.urlencode(params))
    assert response.status_code == 302
    return dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(response.headers["Location"]).query))


def finish(client, fake, provider="google", start_params=None, **claim_values):
    """Le parcours entier : départ, retour du fournisseur avec un code, et la réponse de l'API."""
    query = start(client, provider, **(start_params or {}))
    fake.claims = claims(provider, query["nonce"], **claim_values)
    return client.get(f"/api/auth/oidc/{provider}/callback?code=le-code&state={query['state']}"), query


def location(response):
    parts = urllib.parse.urlsplit(response.headers["Location"])
    return parts.path, dict(urllib.parse.parse_qsl(parts.query))


def user_by_email(email):
    return User.query.filter_by(email=email).first()


def test_only_configured_providers_get_a_button(client, test_app, monkeypatch):
    assert client.get("/api/auth/providers").get_json() == {"providers": ["google", "microsoft"]}

    monkeypatch.setitem(test_app.config, "OIDC_MICROSOFT_CLIENT_SECRET", "")

    assert client.get("/api/auth/providers").get_json() == {"providers": ["google"]}
    response = client.get("/api/auth/oidc/microsoft/start")
    assert location(response) == ("/login", {"erreur": "provider_unavailable"})


def test_the_start_sends_to_the_provider_with_state_nonce_and_pkce(client, test_app):
    response = client.get("/api/auth/oidc/google/start?next=/grids")

    url = urllib.parse.urlsplit(response.headers["Location"])
    query = dict(urllib.parse.parse_qsl(url.query))
    assert f"{url.scheme}://{url.netloc}{url.path}" == "https://accounts.google.com/o/oauth2/v2/auth"
    assert query["client_id"] == CLIENT_IDS["google"] and query["scope"] == "openid email"
    assert query["redirect_uri"] == "http://localhost/api/auth/oidc/google/callback"
    assert query["code_challenge_method"] == "S256" and len(query["state"]) >= 32 and len(query["nonce"]) >= 32
    assert query["prompt"] == "select_account"
    cookie = next(value for value in response.headers.getlist("Set-Cookie") if value.startswith("oidc_flow="))
    assert "oidc_flow=" in cookie and "HttpOnly" in cookie and "Path=/api/auth/oidc/" in cookie


def test_the_public_address_of_the_api_is_the_return_address(client, test_app, monkeypatch):
    monkeypatch.setitem(test_app.config, "OIDC_REDIRECT_BASE", "https://api.exemple.fr/")

    assert start(client)["redirect_uri"] == "https://api.exemple.fr/api/auth/oidc/google/callback"


def test_a_new_google_account_is_created_certified_and_opened(client, test_app, fake):
    email = unique_email()

    response, query = finish(client, fake, email=email, start_params={"next": "/grids"})

    assert response.status_code == 302
    assert response.headers["Location"] == f"{test_app.config['FRONTEND_URL'].rstrip('/')}/grids"
    cookies = " ".join(response.headers.getlist("Set-Cookie"))
    assert "access_token_cookie=" in cookies and "refresh_token_cookie=" in cookies
    # Le secret PKCE renvoyé à l'échange est bien celui du défi envoyé au départ
    challenge = base64.urlsafe_b64encode(hashlib.sha256(fake.verifiers[0].encode()).digest()).rstrip(b"=").decode()
    assert challenge == query["code_challenge"]
    user = user_by_email(email)
    assert user.email_verified_at is not None and not oidc.has_password(user)
    assert [(identity.provider, identity.subject) for identity in user.identities] == [("google", fake.claims["sub"])]
    event = UsageEvent.query.filter_by(user_id=user.id, kind="account").one()
    assert (event.outcome, event.data) == ("register", {"method": "google"})
    # Sans mot de passe, le formulaire de connexion refuse comme pour un mauvais mot de passe
    forget_cookies(client)
    refused = send(client, "post", "/api/auth/login", {"email": email, "password": user.password})
    assert refused.status_code == 401


def test_the_next_login_opens_the_same_account(client, fake):
    sub, email = uuid.uuid4().hex, unique_email()
    finish(client, fake, sub=sub, email=email)
    forget_cookies(client)

    # L'adresse a changé chez Google : c'est l'identifiant qui compte
    response, _ = finish(client, fake, sub=sub, email=unique_email())

    assert response.status_code == 302 and location(response)[0] == "/"
    assert User.query.filter(User.id == Identity.query.filter_by(subject=sub).one().user_id).one().email == email


def test_a_certified_email_opens_the_password_account_that_has_it(client, fake):
    email, tokens = register(client)

    response, _ = finish(client, fake, email=email.upper())

    assert location(response)[0] == "/"
    user = user_by_email(email)
    assert oidc.has_password(user) and user.email_verified_at is not None
    assert [identity.provider for identity in user.identities] == ["google"]


def test_an_uncertified_address_never_opens_the_account_that_has_it(client, fake):
    email, _ = register(client)

    response, _ = finish(client, fake, provider="microsoft", email=email, tid=WORK_TENANT)

    assert location(response) == ("/login", {"erreur": "email_unverified_taken"})
    assert user_by_email(email).identities == []
    assert "access_token_cookie=" not in " ".join(response.headers.getlist("Set-Cookie"))


def test_microsoft_certifies_personal_accounts_and_owned_domains(client, fake):
    personal, _ = register(client)
    work, _ = register(client)

    finish(client, fake, provider="microsoft", email=personal)
    forget_cookies(client)
    finish(client, fake, provider="microsoft", email=work, tid=WORK_TENANT, xms_edov=True)

    assert [identity.provider for identity in user_by_email(personal).identities] == ["microsoft"]
    assert [identity.provider for identity in user_by_email(work).identities] == ["microsoft"]


def test_an_uncertified_new_address_creates_an_unconfirmed_account(client, fake):
    email = unique_email()

    response, _ = finish(client, fake, provider="microsoft", email=email, tid=WORK_TENANT)

    assert location(response)[0] == "/"
    assert user_by_email(email).email_verified_at is None  # l'e-mail de confirmation est parti, comme à l'inscription


@pytest.mark.parametrize("tamper, reason", [
    ({"nonce": "un-autre"}, "oidc_failed"),
    ({"aud": "le-client-d-un-autre-site"}, "oidc_failed"),
    ({"iss": "https://faux.exemple.fr"}, "oidc_failed"),
    ({"exp": int(time.time()) - 3600}, "oidc_failed"),
])
def test_a_doubtful_identity_token_is_refused(client, fake, tamper, reason):
    query = start(client)
    fake.claims = {**claims("google", query["nonce"], email=unique_email()), **tamper}

    response = client.get(f"/api/auth/oidc/google/callback?code=c&state={query['state']}")

    assert location(response) == ("/login", {"erreur": reason})


def test_a_token_signed_by_someone_else_is_refused(client, fake):
    fake.pem = OTHER_PEM

    response, _ = finish(client, fake, email=unique_email())

    assert location(response) == ("/login", {"erreur": "oidc_failed"})


def test_a_return_without_its_flow_is_refused(client, fake):
    query = start(client)
    fake.claims = claims("google", query["nonce"], email=unique_email())

    wrong_state = client.get("/api/auth/oidc/google/callback?code=c&state=devine")
    forget_cookies(client)
    no_cookie = client.get(f"/api/auth/oidc/google/callback?code=c&state={query['state']}")

    assert location(wrong_state) == ("/login", {"erreur": "oidc_state"})
    assert location(no_cookie) == ("/login", {"erreur": "oidc_state"})
    assert fake.verifiers == []  # le code n'a jamais été échangé


def test_giving_up_at_the_provider_comes_back_to_the_login(client, fake):
    query = start(client)

    response = client.get(f"/api/auth/oidc/google/callback?error=access_denied&state={query['state']}")

    assert location(response) == ("/login", {"erreur": "oidc_cancelled"})


@pytest.mark.parametrize("next_path", ["//exemple.com", "https://exemple.com", "/\\exemple.com", "grids"])
def test_the_return_stays_on_the_site(client, fake, next_path):
    response, _ = finish(client, fake, email=unique_email(), start_params={"next": next_path})

    assert location(response)[0] == "/"


def linking(client, headers, provider="google", intent="link"):
    response = send(client, "post", f"/api/auth/oidc/{provider}/ticket", {"intent": intent}, headers)
    assert response.status_code == 200, response.get_json()
    return dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(response.get_json()["url"]).query))


def test_an_account_links_a_provider_from_its_settings(client, fake):
    email, tokens = register(client)
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    response, _ = finish(client, fake, email=unique_email(), start_params=linking(client, headers))

    assert location(response) == ("/account", {"relie": "google"})
    me = client.get("/api/users/me", headers=headers).get_json()
    assert me["has_password"] is True and [identity["provider"] for identity in me["identities"]] == ["google"]


def test_a_provider_account_links_to_one_account_only(client, fake):
    sub = uuid.uuid4().hex
    finish(client, fake, sub=sub, email=unique_email())
    forget_cookies(client)
    _, tokens = register(client)

    response, _ = finish(client, fake, sub=sub, email=unique_email(),
                         start_params=linking(client, {"Authorization": f"Bearer {tokens['access_token']}"}))

    assert location(response) == ("/account", {"erreur": "identity_taken"})


def test_a_ticket_is_signed_short_and_for_one_provider(client):
    _, tokens = register(client)
    ticket = linking(client, {"Authorization": f"Bearer {tokens['access_token']}"})["ticket"]

    forged = client.get("/api/auth/oidc/google/start?ticket=" + ticket[:-2] + "xx")
    other = client.get("/api/auth/oidc/microsoft/start?ticket=" + ticket)

    assert location(forged) == ("/account", {"erreur": "oidc_state"})
    assert location(other) == ("/account", {"erreur": "oidc_state"})


def test_a_ticket_only_works_in_the_browser_that_asked_for_it(client):
    _, tokens = register(client)
    ticket = linking(client, {"Authorization": f"Bearer {tokens['access_token']}"})["ticket"]
    forget_cookies(client)  # l'adresse de départ, ouverte ailleurs

    response = client.get("/api/auth/oidc/google/start?ticket=" + ticket)

    assert location(response) == ("/account", {"erreur": "oidc_state"})


def test_unlinking_keeps_a_way_in(client, fake):
    email = unique_email()
    finish(client, fake, email=email)
    forget_cookies(client)
    headers = {"Authorization": f"Bearer {tokens_for(client, email)['access_token']}"}

    refused = send(client, "delete", "/api/auth/identities/google", None, headers)
    missing = send(client, "delete", "/api/auth/identities/microsoft", None, headers)

    assert (refused.status_code, refused.get_json()["reason"]) == (409, "last_login_method")
    assert (missing.status_code, missing.get_json()["reason"]) == (404, "identity_missing")

    _, tokens = register(client)
    password_headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    finish(client, fake, email=unique_email(), start_params=linking(client, password_headers))
    assert send(client, "delete", "/api/auth/identities/google", None, password_headers).status_code == 200
    assert client.get("/api/users/me", headers=password_headers).get_json()["identities"] == []


def test_an_account_without_password_reconfirms_at_its_provider_before_deletion(client, fake):
    sub, email = uuid.uuid4().hex, unique_email()
    finish(client, fake, sub=sub, email=email)
    forget_cookies(client)
    headers = {"Authorization": f"Bearer {tokens_for(client, email)['access_token']}"}

    refused = send(client, "delete", "/api/users/me", {}, headers)
    assert (refused.status_code, refused.get_json()["reason"]) == (403, "reauth_required")

    query = start(client, **linking(client, headers, intent="reauth"))
    assert query["prompt"] == "login" and query["max_age"] == "0"
    fake.claims = claims("google", query["nonce"], sub=sub, email=email)
    back = client.get(f"/api/auth/oidc/google/callback?code=c&state={query['state']}")
    assert location(back) == ("/account", {"confirme": "google"})

    deleted = send(client, "delete", "/api/users/me", {}, headers)

    assert deleted.status_code == 200
    assert user_by_email(email) is None and Identity.query.filter_by(subject=sub).count() == 0


def test_reconfirming_with_another_provider_account_is_refused(client, fake):
    email = unique_email()
    finish(client, fake, email=email)
    forget_cookies(client)
    headers = {"Authorization": f"Bearer {tokens_for(client, email)['access_token']}"}

    response, _ = finish(client, fake, email=email, start_params=linking(client, headers, intent="reauth"))

    assert location(response) == ("/account", {"erreur": "identity_mismatch"})
    assert send(client, "delete", "/api/users/me", {}, headers).status_code == 403


def test_a_password_account_still_deletes_with_its_password(client):
    email, tokens = register(client)
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    assert send(client, "delete", "/api/users/me", {}, headers).get_json()["reason"] == "wrong_password"
    assert send(client, "delete", "/api/users/me", {"password": TEST_PASSWORD}, headers).status_code == 200


def test_reauth_needs_a_linked_provider(client):
    _, tokens = register(client)

    response = send(client, "post", "/api/auth/oidc/google/ticket", {"intent": "reauth"},
                    {"Authorization": f"Bearer {tokens['access_token']}"})

    assert (response.status_code, response.get_json()["reason"]) == (409, "identity_missing")


def test_nothing_from_the_provider_is_kept_but_its_identifier(client, fake):
    email = unique_email()

    finish(client, fake, email=email, name="Marie Curie", picture="https://exemple.fr/photo.jpg")

    columns = {column.name for column in Identity.__table__.columns}
    assert columns == {"id", "user_id", "provider", "subject", "created_at", "last_used_at"}
    db.session.expire_all()
    assert "Curie" not in repr([(e.data, e.outcome) for e in UsageEvent.query.all()])
