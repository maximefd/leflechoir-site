"""La force des grilles d'articles : chaque article a sa petite grille, et le lecteur la note de 1 à 6.

- `GET /api/articles/<slug>/force` : la moyenne et le nombre d'avis, pour la langue du site.
- `POST /api/articles/<slug>/force` `{"force": 1..6}` : ouvert à tous, sans compte. Une note par personne, par
  article et par jour : l'empreinte du jour (ADR 0016) retrouve la note d'un lecteur qui se ravise et la remplace.
  Elle s'efface le lendemain (usage.py) ; la note reste, anonyme. Jamais d'adresse IP en base.
- Un plafond anti-robot (RATELIMIT_FORCE), pas de limite pour un lecteur.
- Les articles vivent dans le site statique (frontend/src/content/articles) : leur adresse est recopiée ici, sans
  quoi l'API refuse la note (`unknown_article`). Un nouvel article s'ajoute aux deux endroits.
"""

from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify
from pydantic import Field

from extensions import db
from models import ArticleRating
from schemas import ApiModel, RequestValidationError, parse_body
from usage import visitor_fingerprint

articles_bp = Blueprint("articles", __name__, url_prefix="/api/articles")

ARTICLE_SLUGS = frozenset({
    "ecrire-une-definition-de-mots-fleches",
    "pourquoi-les-mots-fleches-reviennent",
    "mots-fleches-dans-le-monde",
})


class ForceRequest(ApiModel):
    # strict : « 3.5 » ou « "4" » sont refusés plutôt qu'arrondis en silence
    force: int = Field(ge=1, le=6, strict=True)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _unknown(slug: str):
    if slug in ARTICLE_SLUGS:
        return None
    return jsonify({"error": "Cet article n'existe pas.", "reason": "unknown_article"}), 404


def _summary(slug: str) -> dict:
    lang = current_app.config["SITE_LANG"]
    count, average = (db.session.query(db.func.count(ArticleRating.id), db.func.avg(ArticleRating.force))
                      .filter_by(slug=slug, lang=lang).one())
    return {"slug": slug, "lang": lang, "count": count, "average": round(float(average), 1) if count else None}


@articles_bp.get("/<slug>/force")
def force_summary(slug: str):
    return _unknown(slug) or (jsonify(_summary(slug)), 200)


@articles_bp.post("/<slug>/force")
def rate_force(slug: str):
    if refused := _unknown(slug):
        return refused
    try:
        payload = parse_body(ForceRequest)
    except RequestValidationError:
        return jsonify({"error": "La force se note de 1 à 6.", "reason": "invalid_force"}), 400

    now = _utcnow()
    lang = current_app.config["SITE_LANG"]
    visitor = visitor_fingerprint(now.date())
    today = datetime.combine(now.date(), datetime.min.time())
    rating = (ArticleRating.query.filter_by(slug=slug, lang=lang, visitor=visitor)
              .filter(ArticleRating.created_at >= today).first())
    if rating:
        rating.force = payload.force
    else:
        db.session.add(ArticleRating(slug=slug, lang=lang, force=payload.force, visitor=visitor, created_at=now))
    db.session.commit()
    return jsonify({"message": "Merci, c'est noté.", "force": payload.force, **_summary(slug)}), 201
