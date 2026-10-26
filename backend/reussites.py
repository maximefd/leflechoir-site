"""Les grilles du jour réussies, gardées avec le compte (J3 ; demande de l'auteur du 26/10/2026).

- **Sans compte**, la coche du calendrier reste dans le navigateur (`frontend/src/lib/reussites.ts`) : rien ici.
- **Avec un compte**, les réussites suivent la personne d'un appareil à l'autre. À la connexion, le navigateur envoie
  celles qu'il a notées sans compte : elles rejoignent le compte (`POST`, fusion), et la réponse rend le tout.
- **La fusion ne perd rien** : le meilleur temps et le premier jour de réussite l'emportent, de quelque côté qu'ils
  viennent. Une grille datée de plus d'un jour après aujourd'hui (UTC) n'est pas encore parue, nulle part : refusée.
- Les réussites partent avec le compte (`DELETE /api/users/me`).
"""

from datetime import datetime, timedelta, timezone

from flask import Blueprint, current_app, jsonify
from flask_jwt_extended import get_current_user, jwt_required

from extensions import db
from models import GridSuccess
from schemas import ReussitesRequest, parse_body

reussites_bp = Blueprint("reussites", __name__, url_prefix="/api/reussites")


def _demain():
    """Le lendemain du jour UTC : à Paris, la grille du jour peut déjà dater de demain pour le serveur."""
    return datetime.now(timezone.utc).date() + timedelta(days=1)


def _toutes(user) -> dict:
    rows = GridSuccess.query.filter_by(user_id=user.id, lang=current_app.config["SITE_LANG"]).all()
    return {row.grid_date.isoformat(): row.to_json() for row in rows}


@reussites_bp.get("")
@jwt_required()
def mes_reussites():
    """Les grilles réussies du compte, par date : la coche du calendrier et la série."""
    return jsonify({"reussites": _toutes(get_current_user())}), 200


@reussites_bp.post("")
@jwt_required()
def noter():
    """Une réussite de plus (fin de partie), ou toutes celles du navigateur (connexion) ; rend le tout, fusionné."""
    payload = parse_body(ReussitesRequest)
    demain = _demain()
    if any(reussite.date > demain for reussite in payload.reussites):
        return jsonify({"error": "Cette grille n'est pas encore parue.", "reason": "future_grid"}), 400

    user, lang = get_current_user(), current_app.config["SITE_LANG"]
    existantes = {row.grid_date: row for row in GridSuccess.query.filter_by(user_id=user.id, lang=lang)}
    for reussite in payload.reussites:
        # Une grille ne se réussit ni avant sa parution, ni après demain
        premier = min(max(reussite.le, reussite.date), demain)
        row = existantes.get(reussite.date)
        if row is None:
            row = GridSuccess(user_id=user.id, lang=lang, grid_date=reussite.date, best_ms=reussite.ms,
                              first_day=premier)
            db.session.add(row)
            existantes[reussite.date] = row
            continue
        if reussite.ms is not None and (row.best_ms is None or reussite.ms < row.best_ms):
            row.best_ms = reussite.ms
        row.first_day = min(row.first_day, premier)
    db.session.commit()
    return jsonify({"reussites": _toutes(user)}), 200
