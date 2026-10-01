"""Le formulaire de contact (Phase 8, #131) : un message de plus pour l'auteur, lu dans le poste de pilotage.

- `POST /api/contact` : ouvert à tous, avec ou sans compte. Cinq messages par heure et par adresse (RATELIMIT_CONTACT),
  un pot de miel (un champ caché que seul un robot remplit : il reçoit la même réponse, et rien n'est gardé), et
  pas de captcha tiers (la CSP n'autorise ni `frame-src` ni script externe).
- Connecté, le message est lié au compte : il disparaît avec lui. Sans compte, rien ne désigne son auteur, ni adresse
  IP ni empreinte : seulement l'adresse de réponse qu'il a choisi de donner.
- **L'e-mail de notification ne recopie jamais le message** : il se lit dans la boîte de réception de `/admin`
  (admin.py), et le texte ne passe donc pas par Brevo (alerts.notify_contact).
- Gardé 12 mois (usage.py, `CONTACT_RETENTION`).
"""

import logging

from flask import Blueprint, current_app, jsonify
from flask_jwt_extended import get_current_user, jwt_required

import alerts
from extensions import db
from models import ContactMessage
from schemas import ContactRequest, parse_body

contact_bp = Blueprint("contact", __name__, url_prefix="/api/contact")
logger = logging.getLogger(__name__)


@contact_bp.post("")
@jwt_required(optional=True)
def send_message():
    payload = parse_body(ContactRequest)
    confirmation = jsonify({"message": "Merci, ton message est bien arrivé."}), 201
    if payload.website:
        return confirmation  # un robot : la même réponse, et rien n'est gardé
    user = get_current_user()
    config = current_app.config
    message = ContactMessage(site=config["SITE"], lang=config["SITE_LANG"], reason=payload.reason,
                             message=payload.message, reply_email=payload.email or None,
                             request_id=payload.request_id or None, user_id=user.id if user else None)
    db.session.add(message)
    db.session.commit()
    try:
        alerts.notify_contact(message.id)
    except Exception:
        # Le message est gardé : une notification qui échoue ne le fait pas perdre, et ne regarde pas l'expéditeur
        db.session.rollback()
        logger.exception("Notification du message de contact %s impossible", message.id)
    return confirmation
