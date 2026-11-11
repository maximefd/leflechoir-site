"""Le formulaire de contact (Phase 8, #131) : un message de plus pour l'auteur, lu dans le poste de pilotage.

- `POST /api/contact` : ouvert à tous, avec ou sans compte. Cinq messages par heure et par adresse (RATELIMIT_CONTACT),
  un pot de miel (un champ caché que seul un robot remplit : il reçoit la même réponse, et rien n'est gardé), et
  pas de captcha tiers (la CSP n'autorise ni `frame-src` ni script externe).
- Connecté, le message est lié au compte : il disparaît avec lui. Sans compte, rien ne désigne son auteur, ni adresse
  IP ni empreinte : seulement l'adresse de réponse qu'il a choisi de donner.
- **L'e-mail de notification ne recopie jamais le message** : il se lit dans la boîte de réception de `/admin`
  (admin.py), et le texte ne passe donc pas par Brevo (alerts.notify_contact).
- Gardé 12 mois (usage.py, `CONTACT_RETENTION`).
- `POST /api/contact/signalement` : le signalement d'un contenu (une grille partagée et son texte), selon les articles
  16 et 17 du règlement sur les services numériques (avis juridique du 08/11/2026) : l'adresse précise du contenu, les
  raisons, le nom et l'adresse de qui signale, sa bonne foi ; un accusé de réception part aussitôt à cette adresse, et
  l'auteur examine le signalement dans la boîte de réception, comme un message.
"""

import logging

from flask import Blueprint, current_app, jsonify
from flask_jwt_extended import get_current_user, jwt_required

import alerts
from extensions import db
from mailer import send_email
from models import ContactMessage
from schemas import ContactRequest, ReportRequest, parse_body

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


@contact_bp.post("/signalement")
@jwt_required(optional=True)
def send_report():
    payload = parse_body(ReportRequest)
    if not payload.good_faith:
        return jsonify({"error": "Coche la déclaration de bonne foi : elle fait partie du signalement.",
                        "reason": "good_faith_required"}), 400
    confirmation = jsonify({"message": "Merci : ton signalement est bien arrivé. Un accusé de réception part à ton "
                                       "adresse, et nous te dirons ce que nous en avons fait."}), 201
    if payload.website:
        return confirmation  # un robot : la même réponse, et rien n'est gardé
    user = get_current_user()
    config = current_app.config
    # Le texte que l'auteur lit dans la boîte de réception : le contenu signalé, qui signale, ses raisons
    text = f"Signalement de contenu\nAdresse : {payload.url}\nSignalé par : {payload.name}\n\n{payload.explanation}"
    message = ContactMessage(site=config["SITE"], lang=config["SITE_LANG"], reason="report", message=text,
                             reply_email=payload.email, user_id=user.id if user else None,
                             details={"url": payload.url, "name": payload.name, "good_faith": True})
    db.session.add(message)
    db.session.commit()
    try:
        alerts.notify_contact(message.id)
    except Exception:
        db.session.rollback()
        logger.exception("Notification du signalement %s impossible", message.id)
    shown = payload.url if len(payload.url) <= 80 else payload.url[:77] + "…"
    sent = send_email(payload.email, f"{config['SITE_NAME']} : signalement reçu",
                      f"Bonjour {payload.name},\n\nNous avons bien reçu ton signalement concernant ce contenu :\n"
                      f"{shown}\n\nNous l'examinons sans tarder, et te dirons ce que nous avons décidé, avec les voies de "
                      f"recours.\n\n{config['SITE_NAME']}")
    if not sent:
        logger.warning("Accusé de réception du signalement %s non envoyé", message.id)
    return confirmation
