"""Se connecter avec un compte Google ou Microsoft ([ADR 0034](../docs/adr/0034-connexions-google-et-microsoft.md)).

OpenID Connect, flux « code » avec PKCE, par redirection pleine page, sans SDK : le site ne charge aucun script du
fournisseur et sa CSP ne change pas.

1. `GET /api/auth/oidc/<fournisseur>/start` : l'API tire `state`, `nonce` et le secret PKCE, les garde dans un cookie
   signé, httpOnly, de dix minutes, et renvoie le navigateur chez le fournisseur.
2. `GET /api/auth/oidc/<fournisseur>/callback` : le fournisseur revient avec un code. L'API vérifie `state`, échange
   le code (avec le secret PKCE et la clé du client), vérifie le jeton d'identité (signature, émetteur, audience,
   expiration, `nonce`), puis ouvre la session dans les cookies habituels (ADR 0015) et renvoie vers le site.

Trois intentions, toutes par ce même aller-retour :
- **se connecter** (ou s'inscrire) : un compte déjà relié s'ouvre ; sinon, l'adresse que le fournisseur **certifie**
  rattache au compte qui la porte, ou crée un compte. Une adresse non certifiée ne rattache jamais rien ;
- **relier** un fournisseur au compte connecté, depuis « Mon compte » ;
- **reconfirmer** avant de supprimer un compte sans mot de passe : le fournisseur redemande la connexion.

Relier et reconfirmer partent d'un « ticket » demandé par `apiFetch` (POST, jeton CSRF) : une page d'un autre site
ne peut pas les déclencher par un simple lien. Le ticket ne sert que dans le navigateur qui l'a demandé (cookie).

Rien du fournisseur n'est gardé que son identifiant pour notre site (`sub`) : ni nom, ni photo, ni jeton.
"""

import base64
import hashlib
import hmac
import json
import secrets
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone

import jwt
from flask import Blueprint, current_app, jsonify, redirect, request
from flask_jwt_extended import (
    create_access_token, create_refresh_token, get_current_user, jwt_required, set_access_cookies, set_refresh_cookies,
)
from itsdangerous import BadSignature, URLSafeTimedSerializer
from sqlalchemy import func

from auth import send_verification_email
from extensions import db
from models import Identity, User
from schemas import OidcTicketRequest, parse_body
import usage

oidc_bp = Blueprint('oidc', __name__, url_prefix='/api/auth')

# Le tenant des comptes Microsoft personnels (outlook.com, hotmail.com…) : Microsoft y possède l'adresse
MICROSOFT_CONSUMERS_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad"

FLOW_COOKIE = "oidc_flow"
FLOW_MAX_AGE_S = 600  # le temps de choisir son compte et de se connecter chez le fournisseur
TICKET_MAX_AGE_S = 120
# Le ticket ne sert que dans le navigateur qui l'a demandé : une adresse de départ qui fuirait (historique, journal)
# ne permettrait pas, ailleurs, de relier un autre compte Google au compte de la personne
TICKET_COOKIE = "oidc_ticket"
REAUTH_COOKIE = "oidc_reauth"
REAUTH_MAX_AGE_S = 300  # le temps de confirmer la suppression, de retour sur « Mon compte »
HTTP_TIMEOUT_S = 10
# Un compte créé par un fournisseur n'a pas de mot de passe : celui-ci n'est l'empreinte d'aucun (bcrypt refuse de le
# lire), et « Mot de passe oublié » permet d'en choisir un
UNUSABLE_PASSWORD_PREFIX = "!"

INTENTS = ("login", "link", "reauth")


@dataclass(frozen=True)
class Provider:
    key: str
    authorize_url: str
    token_url: str
    jwks_url: str


PROVIDERS = {
    "google": Provider(
        key="google",
        authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
        token_url="https://oauth2.googleapis.com/token",
        jwks_url="https://www.googleapis.com/oauth2/v3/certs",
    ),
    "microsoft": Provider(
        key="microsoft",
        # « common » : comptes personnels et comptes d'organisation (travail, école)
        authorize_url="https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        token_url="https://login.microsoftonline.com/common/oauth2/v2.0/token",
        jwks_url="https://login.microsoftonline.com/common/discovery/v2.0/keys",
    ),
}
GOOGLE_ISSUERS = ("https://accounts.google.com", "accounts.google.com")


class OidcError(Exception):
    """Un échec du parcours, avec son code `reason` stable : le site le traduit en message."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


# --- Configuration ---

def _client(provider: str) -> tuple[str, str] | None:
    prefix = f"OIDC_{provider.upper()}"
    client_id = current_app.config.get(f"{prefix}_CLIENT_ID", "")
    secret = current_app.config.get(f"{prefix}_CLIENT_SECRET", "")
    return (client_id, secret) if client_id and secret else None


def configured_providers() -> list[str]:
    return [key for key in PROVIDERS if _client(key)]


def _redirect_uri(provider: str) -> str:
    # Derrière le tunnel, l'API se voit en http : l'adresse publique vient de la configuration
    base = current_app.config.get("OIDC_REDIRECT_BASE") or request.host_url
    return f"{base.rstrip('/')}/api/auth/oidc/{provider}/callback"


def _serializer(salt: str) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt=salt)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# --- Le compte ---

def has_password(user: User) -> bool:
    return not (user.password or "").startswith(UNUSABLE_PASSWORD_PREFIX)


def unusable_password() -> str:
    return UNUSABLE_PASSWORD_PREFIX + secrets.token_urlsafe(24)


def _safe_next(value: str | None) -> str:
    """Un chemin interne du site, jamais un tremplin vers un autre (comme `nextPath` côté site)."""
    if not value or not value.startswith("/") or value.startswith("//") or len(value) > 300:
        return "/"
    if any(char in value for char in "\\\r\n\t") or any(ord(char) < 32 for char in value):
        return "/"
    return value


def _frontend(path: str, **params) -> str:
    base = current_app.config["FRONTEND_URL"].rstrip("/")
    query = urllib.parse.urlencode({key: value for key, value in params.items() if value})
    separator = "&" if "?" in path else "?"
    return f"{base}{path}{separator + query if query else ''}"


def _open_session(response, user: User):
    set_access_cookies(response, create_access_token(identity=str(user.id)))
    set_refresh_cookies(response, create_refresh_token(identity=str(user.id)))
    return response


# --- Les échanges avec le fournisseur (remplacés dans les tests) ---

def _exchange(provider: Provider, code: str, verifier: str) -> dict:
    """Le code contre les jetons, au point d'accès du fournisseur (client authentifié, PKCE)."""
    client_id, secret = _client(provider.key)
    body = urllib.parse.urlencode({
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": _redirect_uri(provider.key),
        "client_id": client_id,
        "client_secret": secret,
        "code_verifier": verifier,
    }).encode("ascii")
    req = urllib.request.Request(provider.token_url, data=body, method="POST", headers={
        "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json",
        "User-Agent": "connexion-oidc",
    })
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_S) as response:
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        current_app.logger.warning("OIDC %s : échange du code refusé (%s)", provider.key, type(error).__name__)
        raise OidcError("oidc_failed") from error


_jwks_clients: dict[str, jwt.PyJWKClient] = {}


def _signing_key(provider: Provider, id_token: str):
    """La clé publique qui a signé le jeton, lue (et gardée en cache) dans le jeu de clés du fournisseur."""
    client = _jwks_clients.get(provider.key)
    if client is None:
        client = _jwks_clients[provider.key] = jwt.PyJWKClient(provider.jwks_url, cache_keys=True, lifespan=3600,
                                                               timeout=HTTP_TIMEOUT_S)
    try:
        return client.get_signing_key_from_jwt(id_token).key
    except jwt.PyJWKClientError as error:
        raise OidcError("oidc_failed") from error


def _claims(provider: Provider, id_token: str, nonce: str) -> dict:
    client_id, _ = _client(provider.key)
    try:
        claims = jwt.decode(id_token, _signing_key(provider, id_token), algorithms=["RS256"], audience=client_id,
                            leeway=60, options={"require": ["exp", "iat", "iss", "aud", "sub"]})
    except jwt.InvalidTokenError as error:
        current_app.logger.warning("OIDC %s : jeton d'identité refusé (%s)", provider.key, type(error).__name__)
        raise OidcError("oidc_failed") from error
    if provider.key == "google":
        valid_issuer = claims["iss"] in GOOGLE_ISSUERS
    else:  # Microsoft : l'émetteur porte le tenant de la personne
        valid_issuer = bool(claims.get("tid")) and claims["iss"] == f"https://login.microsoftonline.com/{claims['tid']}/v2.0"
    if not valid_issuer or not hmac.compare_digest(str(claims.get("nonce", "")), nonce):
        raise OidcError("oidc_failed")
    return claims


def certified_email(provider: str, claims: dict) -> tuple[str | None, bool]:
    """L'adresse que donne le fournisseur, et s'il en certifie la possession.

    Google le dit (`email_verified`). Microsoft ne le dit que pour ses comptes personnels (il y possède l'adresse) ou
    par `xms_edov` (le domaine de l'adresse appartient à l'organisation) : ailleurs, une organisation peut écrire
    n'importe quelle adresse dans le profil d'un de ses comptes.
    """
    email = (claims.get("email") or "").strip().lower() or None
    if not email:
        return None, False
    if provider == "google":
        return email, claims.get("email_verified") is True
    edov = claims.get("xms_edov") in (True, 1, "1", "true", "True")
    return email, edov or claims.get("tid") == MICROSOFT_CONSUMERS_TENANT


# --- Routes ---

@oidc_bp.get('/providers')
def providers():
    """Les fournisseurs configurés : le site n'affiche que leurs boutons."""
    return jsonify({"providers": configured_providers()}), 200


@oidc_bp.post('/oidc/<provider>/ticket')
@jwt_required()
def ticket(provider):
    """Un ticket de deux minutes pour relier un fournisseur ou reconfirmer : l'adresse de départ à ouvrir."""
    payload = parse_body(OidcTicketRequest)
    if provider not in PROVIDERS or not _client(provider):
        return jsonify({"error": "Cette connexion n'est pas disponible.", "reason": "provider_unavailable"}), 404
    user = get_current_user()
    if payload.intent == "reauth" and not any(identity.provider == provider for identity in user.identities):
        return jsonify({"error": "Ce compte n'est pas relié à ce fournisseur.", "reason": "identity_missing"}), 409
    bind = secrets.token_urlsafe(24)
    token = _serializer("oidc-ticket").dumps({"u": user.id, "i": payload.intent, "p": provider, "b": bind})
    base = current_app.config.get("OIDC_REDIRECT_BASE") or request.host_url
    url = f"{base.rstrip('/')}/api/auth/oidc/{provider}/start?" + urllib.parse.urlencode({"ticket": token})
    response = jsonify({"url": url})
    response.set_cookie(TICKET_COOKIE, bind, max_age=TICKET_MAX_AGE_S, path="/api/auth/oidc/", httponly=True,
                        secure=current_app.config["JWT_COOKIE_SECURE"], samesite="Lax")
    return response, 200


def _error_page(intent: str, reason: str):
    return redirect(_frontend("/account" if intent in ("link", "reauth") else "/login", erreur=reason), 302)


@oidc_bp.get('/oidc/<provider>/start')
def start(provider):
    intent, user_id = "login", None
    if request.args.get("ticket"):
        try:
            data = _serializer("oidc-ticket").loads(request.args["ticket"], max_age=TICKET_MAX_AGE_S)
        except BadSignature:
            return _error_page("link", "oidc_state")
        bound = hmac.compare_digest(request.cookies.get(TICKET_COOKIE, ""), str(data.get("b", "")))
        if data.get("p") != provider or data.get("i") not in ("link", "reauth") or not bound:
            return _error_page("link", "oidc_state")
        intent, user_id = data["i"], data["u"]
    if provider not in PROVIDERS or not _client(provider):
        return _error_page(intent, "provider_unavailable")

    state, nonce, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(32), secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).rstrip(b"=").decode()
    params = {
        "response_type": "code",
        "client_id": _client(provider)[0],
        "redirect_uri": _redirect_uri(provider),
        "scope": "openid email",
        "state": state,
        "nonce": nonce,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        # Reconfirmer, c'est se reconnecter vraiment ; sinon, choisir son compte (plusieurs comptes Google au foyer)
        "prompt": "login" if intent == "reauth" else "select_account",
    }
    if intent == "reauth":
        params["max_age"] = "0"
    response = redirect(f"{PROVIDERS[provider].authorize_url}?{urllib.parse.urlencode(params)}", 302)
    flow = _serializer("oidc-flow").dumps({"p": provider, "s": state, "n": nonce, "v": verifier, "i": intent,
                                           "u": user_id, "next": _safe_next(request.args.get("next"))})
    if request.cookies.get(TICKET_COOKIE):
        response.delete_cookie(TICKET_COOKIE, path="/api/auth/oidc/")
    response.set_cookie(FLOW_COOKIE, flow, max_age=FLOW_MAX_AGE_S, path="/api/auth/oidc/", httponly=True,
                        secure=current_app.config["JWT_COOKIE_SECURE"], samesite="Lax")
    return response


@oidc_bp.get('/oidc/<provider>/callback')
def callback(provider):
    try:
        flow = _serializer("oidc-flow").loads(request.cookies.get(FLOW_COOKIE, ""), max_age=FLOW_MAX_AGE_S)
    except BadSignature:
        flow = None
    intent = flow.get("i", "login") if flow else "login"
    try:
        if not flow or flow.get("p") != provider or not hmac.compare_digest(request.args.get("state", ""), flow["s"]):
            raise OidcError("oidc_state")
        if request.args.get("error"):  # la personne a renoncé chez le fournisseur, ou il a refusé
            raise OidcError("oidc_cancelled")
        if provider not in PROVIDERS or not _client(provider) or not request.args.get("code"):
            raise OidcError("oidc_failed")
        tokens = _exchange(PROVIDERS[provider], request.args["code"], flow["v"])
        if not tokens.get("id_token"):
            raise OidcError("oidc_failed")
        claims = _claims(PROVIDERS[provider], tokens["id_token"], flow["n"])
        response = {"login": _login, "link": _link, "reauth": _reauth}[intent](provider, claims, flow)
    except OidcError as error:
        response = _error_page(intent, error.reason)
    response.delete_cookie(FLOW_COOKIE, path="/api/auth/oidc/")
    return response


def _identity(provider: str, subject: str) -> Identity | None:
    return Identity.query.filter_by(provider=provider, subject=subject).first()


def _login(provider: str, claims: dict, flow: dict):
    identity = _identity(provider, claims["sub"])
    created = False
    if identity:
        user = identity.user
    else:
        email, certified = certified_email(provider, claims)
        if not email:
            raise OidcError("email_missing")
        user = User.query.filter(func.lower(User.email) == email).first()
        if user and not certified:
            # Une adresse que le fournisseur ne garantit pas n'ouvre pas le compte qui la porte
            raise OidcError("email_unverified_taken")
        if not user:
            user = User(email=email, password=unusable_password(), email_verified_at=_utcnow() if certified else None)
            db.session.add(user)
            created = True
        elif user.email_verified_at is None:
            user.email_verified_at = _utcnow()  # le fournisseur vient de le certifier
        identity = Identity(user=user, provider=provider, subject=claims["sub"])
        db.session.add(identity)
    identity.last_used_at = user.last_login_at = _utcnow()
    db.session.commit()
    if created and user.email_verified_at is None:
        send_verification_email(user)
    usage.describe("account", "register" if created else "login", user=user, data={"method": provider})
    return _open_session(redirect(_frontend(flow.get("next") or "/"), 302), user)


def _flow_user(flow: dict) -> User:
    user = db.session.get(User, flow.get("u")) if flow.get("u") else None
    if user is None:
        raise OidcError("session_required")
    return user


def _link(provider: str, claims: dict, flow: dict):
    user = _flow_user(flow)
    identity = _identity(provider, claims["sub"])
    if identity and identity.user_id != user.id:
        raise OidcError("identity_taken")
    if not identity:
        if any(existing.provider == provider for existing in user.identities):
            raise OidcError("provider_already_linked")
        db.session.add(Identity(user=user, provider=provider, subject=claims["sub"], last_used_at=_utcnow()))
        db.session.commit()
        usage.describe("account", "link", user=user, data={"method": provider})
    return redirect(_frontend("/account", relie=provider), 302)


def _reauth(provider: str, claims: dict, flow: dict):
    user = _flow_user(flow)
    identity = _identity(provider, claims["sub"])
    if not identity or identity.user_id != user.id:
        raise OidcError("identity_mismatch")
    auth_time = claims.get("auth_time")
    if isinstance(auth_time, (int, float)) and _utcnow().timestamp() - auth_time > REAUTH_MAX_AGE_S + 60:
        raise OidcError("oidc_failed")
    response = redirect(_frontend("/account", confirme=provider), 302)
    response.set_cookie(REAUTH_COOKIE, _serializer("oidc-reauth").dumps({"u": user.id}), max_age=REAUTH_MAX_AGE_S,
                        path="/api/users/me", httponly=True, secure=current_app.config["JWT_COOKIE_SECURE"],
                        samesite="Lax")
    return response


def recently_confirmed(user: User) -> bool:
    """La personne vient-elle de se reconnecter chez un de ses fournisseurs (pour supprimer son compte) ?"""
    try:
        data = _serializer("oidc-reauth").loads(request.cookies.get(REAUTH_COOKIE, ""), max_age=REAUTH_MAX_AGE_S)
    except BadSignature:
        return False
    return data.get("u") == user.id


def forget_reauth(response) -> None:
    response.delete_cookie(REAUTH_COOKIE, path="/api/users/me")


@oidc_bp.delete('/identities/<provider>')
@jwt_required()
def unlink(provider):
    """Délie un fournisseur, s'il reste une autre façon d'entrer : un mot de passe ou un autre fournisseur."""
    user = get_current_user()
    identity = next((identity for identity in user.identities if identity.provider == provider), None)
    if identity is None:
        return jsonify({"error": "Ce compte n'est pas relié à ce fournisseur.", "reason": "identity_missing"}), 404
    if not has_password(user) and len(user.identities) == 1:
        return jsonify({"error": "C'est ta seule façon de te connecter : choisis d'abord un mot de passe.",
                        "reason": "last_login_method"}), 409
    db.session.delete(identity)
    db.session.commit()
    return jsonify({"message": "Connexion déliée."}), 200
