"""Les clés de l'API ouverte ([ADR 0032](../docs/adr/0032-api-ouverte.md), point 3).

Une clé : « flk_ » suivi de 32 octets tirés au hasard (43 caractères). Elle n'est montrée qu'une fois, à sa
création ; la base n'en garde que l'empreinte SHA-256 et le début. Une clé ne sert qu'à l'API ouverte (`/v1/`), dans
l'en-tête `Authorization: Bearer flk_…`, pour toutes les langues, quel que soit le site où son compte a été créé ;
elle ne donne aucun droit sur le compte (grilles, dictionnaires).

Gestion depuis « Mon compte » (session du site, cookies et CSRF comme le reste du compte) :
- `GET /api/account/api-keys` : les clés actives ;
- `POST /api/account/api-keys` : une clé de plus, rendue en clair cette seule fois ;
- `DELETE /api/account/api-keys/<id>` : la révoquer, aussitôt et pour toujours.
"""

import hashlib
import hmac
import secrets
from datetime import datetime, timezone
from typing import Annotated

import click
from flask import Blueprint, current_app, jsonify
from flask_jwt_extended import get_current_user, jwt_required
from pydantic import StringConstraints

import usage
from models import ApiKey, GenerationJob, User, db
from schemas import ApiModel, parse_body

PREFIX = "flk_"
# « flk_ » et six caractères : ce que l'interface et les journaux montrent d'une clé
SHOWN_LENGTH = len(PREFIX) + 6
KEY_LENGTH = len(PREFIX) + 43

api_keys_bp = Blueprint("api_keys", __name__, url_prefix="/api/account/api-keys")


class ApiKeyRequest(ApiModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60,
                                           pattern=r"^[\w '’().,:&!/-]+$")]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def digest(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def new_key() -> str:
    return PREFIX + secrets.token_urlsafe(32)


def authenticate(header: str | None) -> tuple[ApiKey | None, str | None]:
    """La clé active désignée par l'en-tête `Authorization`, ou la raison du refus.

    `(None, None)` : pas d'en-tête, l'appel est anonyme. Une clé mal formée, inconnue ou révoquée est refusée de la
    même façon (`invalid_api_key`) : rien ne dit à un curieux laquelle de ses clés a existé.
    """
    if not header:
        return None, None
    scheme, _, key = header.partition(" ")
    key = key.strip()
    if scheme.lower() != "bearer" or not key.startswith(PREFIX) or len(key) != KEY_LENGTH:
        return None, "invalid_api_key"
    expected = digest(key)
    found = ApiKey.query.filter_by(key_hash=expected).first()
    # L'index trouve la ligne ; la comparaison en temps constant ne laisse rien deviner de plus
    if found is None or not hmac.compare_digest(found.key_hash, expected) or found.revoked_at is not None:
        return None, "invalid_api_key"
    return found, None


def owned_by(user):
    """Les clés d'un compte de ce site : l'espace des clés est commun à tous les sites, les comptes non."""
    return ApiKey.query.filter(ApiKey.owner_site == current_app.config["SITE"], ApiKey.user_id == user.id)


def forget_account(user) -> None:
    """À la suppression du compte : ses clés, et les générations demandées avec elles (sans valider)."""
    key_ids = [key.id for key in owned_by(user)]
    if key_ids:
        GenerationJob.query.filter(GenerationJob.api_key_id.in_(key_ids)).delete(synchronize_session=False)
    owned_by(user).delete(synchronize_session=False)


@api_keys_bp.route("", methods=["GET"])
@jwt_required()
def list_keys():
    user = get_current_user()
    keys = (owned_by(user).filter(ApiKey.revoked_at.is_(None))
            .order_by(ApiKey.created_at.desc()).all())
    return jsonify({"keys": [key.to_json() for key in keys],
                    "max_keys": current_app.config["API_MAX_KEYS_PER_USER"]}), 200


@api_keys_bp.route("", methods=["POST"])
@jwt_required()
def create_key():
    user = get_current_user()
    payload = parse_body(ApiKeyRequest)
    # Une adresse confirmée : une clé se rattache à quelqu'un qu'on peut prévenir avant de la suspendre
    if user.email_verified_at is None:
        return jsonify({"error": "Confirme d'abord ton adresse e-mail : le lien est dans le message reçu à "
                                 "l'inscription.", "reason": "email_not_verified"}), 403
    active = owned_by(user).filter(ApiKey.revoked_at.is_(None)).count()
    if active >= current_app.config["API_MAX_KEYS_PER_USER"]:
        return jsonify({"error": f"Tu as déjà {active} clés actives : révoque celle qui ne sert plus.",
                        "reason": "too_many_keys"}), 409
    key = new_key()
    entry = ApiKey(owner_site=current_app.config["SITE"], user_id=user.id, name=payload.name,
                   prefix=key[:SHOWN_LENGTH], key_hash=digest(key))
    db.session.add(entry)
    db.session.commit()
    usage.describe("account", "api_key_created", user=user)
    # La seule fois où la clé paraît en clair
    return jsonify({**entry.to_json(), "key": key}), 201


@api_keys_bp.route("/<int:key_id>", methods=["DELETE"])
@jwt_required()
def revoke_key(key_id):
    user = get_current_user()
    entry = owned_by(user).filter(ApiKey.id == key_id, ApiKey.revoked_at.is_(None)).first_or_404()
    entry.revoked_at = _utcnow()
    db.session.commit()
    usage.describe("account", "api_key_revoked", user=user)
    return "", 204


def init_api_keys_cli(app) -> None:
    """`flask api keys` et `flask api revoke PREFIXE` : voir et fermer une clé sans passer par le compte."""
    group = click.Group("api", help="Les clés de l'API ouverte (ADR 0032).")

    @group.command("keys")
    def keys_command():
        """Les clés actives : début, nom, propriétaire, dernière utilisation."""
        site = current_app.config["SITE"]
        for key in ApiKey.query.filter_by(revoked_at=None).order_by(ApiKey.created_at).all():
            # Le compte d'un autre site est dans une autre base : on n'en dit que le site
            owner = db.session.get(User, key.user_id) if key.owner_site == site else None
            click.echo(f"{key.prefix}…  {key.name}  {owner.email if owner else 'compte du site ' + key.owner_site}  "
                       f"{key.plan}  dernière utilisation : {key.last_used_at or 'jamais'}")

    @group.command("revoke")
    @click.argument("prefix")
    def revoke_command(prefix):
        """Révoque la clé active qui commence par PREFIXE (tel que `flask api keys` l'affiche)."""
        found = ApiKey.query.filter(ApiKey.prefix == prefix[:SHOWN_LENGTH], ApiKey.revoked_at.is_(None)).all()
        if len(found) != 1:
            raise click.ClickException(f"{len(found)} clé(s) active(s) commencent par {prefix} : rien de fait.")
        found[0].revoked_at = _utcnow()
        db.session.commit()
        click.echo(f"Clé {found[0].prefix}… révoquée.")

    app.cli.add_command(group)
