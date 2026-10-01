"""Mises en page proposées au catalogue (roadmap 5C) : une grille faite à la main peut servir à d'autres.

- **Tout compte propose, l'auteur décide** dans le curateur, sur son Mac : rien de ce qui arrive ici n'entre au
  catalogue. `make layouts-pull` exporte les propositions (`flask layouts export`) ; une forme acceptée devient un
  fichier de `backend/layouts/`, en service au déploiement suivant.
- **Seule la forme part**, jamais les mots ni les définitions, et seulement d'une grille finie : remplie, sans
  avertissement de mise en page, conforme aux règles du catalogue (ADR 0006), et pas déjà au catalogue.
- **Pas de retour** à celui qui propose, hormis le remerciement : pas de statut à tenir ici.
"""

import json
import os
import sys
from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify
from flask.cli import AppGroup
from flask_jwt_extended import get_current_user, jwt_required

from engine.grid_edit import layout_warnings
from engine.layout_validator import validate_text
from extensions import db
from layout_catalog import DEFAULT_LAYOUTS_DIR, list_layouts
from models import LayoutProposal, SavedGrid

layout_proposals_bp = Blueprint("layout_proposals", __name__, url_prefix="/api/grids")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def shape_of(grid: dict) -> list[str]:
    """La forme d'une grille au format du catalogue : `x` case définition, `-` case lettre."""
    width, height = grid.get("width", 0), grid.get("height", 0)
    black = {(cell["x"], cell["y"]) for cell in grid.get("cells", []) if cell.get("is_black")}
    return ["".join("x" if (x, y) in black else "-" for x in range(width)) for y in range(height)]


_shapes_cache: dict[str, tuple[tuple, dict[str, str]]] = {}


def _catalog_shapes(layouts_dir: str | None) -> dict[str, str]:
    """Forme → identifiant, pour tout le catalogue. Relu seulement quand un dossier du catalogue change :
    la question se pose à chaque lettre tapée dans l'éditeur."""
    root = layouts_dir or DEFAULT_LAYOUTS_DIR
    with os.scandir(root) as entries:
        signature = (os.stat(root).st_mtime_ns,
                     *sorted((entry.name, entry.stat().st_mtime_ns) for entry in entries if entry.is_dir()))
    cached = _shapes_cache.get(root)
    if not cached or cached[0] != signature:
        shapes = {}
        for entry in list_layouts(root):
            if entry["report"]["rows"]:
                shapes.setdefault("\n".join(entry["report"]["rows"]), entry["id"])
        cached = _shapes_cache[root] = (signature, shapes)
    return cached[1]


def find_in_catalog(rows: list[str]) -> str | None:
    """Le layout du catalogue qui a exactement cette forme, s'il y en a un."""
    return _catalog_shapes(current_app.config.get("LAYOUTS_DIR")).get("\n".join(rows))


def catalog_layout(grid: dict) -> str | None:
    return find_in_catalog(shape_of(grid))


def is_proposed(grid: dict) -> bool:
    """Cette forme attend déjà dans les propositions, envoyée par ce compte ou par un autre."""
    rows = "\n".join(shape_of(grid))
    return LayoutProposal.query.filter_by(lang=current_app.config["SITE_LANG"], rows=rows).first() is not None


def _refus(message: str, reason: str, status: int = 400):
    return jsonify({"error": message, "reason": reason}), status


@layout_proposals_bp.post("/<int:grid_id>/propose-layout")
@jwt_required()
def propose_layout(grid_id):
    """Propose au catalogue la forme d'une grille finie du compte."""
    user = get_current_user()
    saved = SavedGrid.query.filter_by(id=grid_id, user_id=user.id).first_or_404()
    grid = saved.payload or {}
    cells = grid.get("cells", [])

    if any(not cell.get("is_black") and not cell.get("char") for cell in cells):
        return _refus("Remplis d'abord toute la grille : une mise en page se propose finie.", "grid_not_full")
    # Une case définition vide reste permise : le catalogue en a, dans des coins que rien n'annonce
    if any(warning["kind"] != "case_vide" for warning in layout_warnings(cells)):
        return _refus("La mise en page a encore des avertissements à régler.", "layout_warnings")
    rows = shape_of(grid)
    report = validate_text("\n".join(rows))
    if not report["valid"]:
        return _refus("Cette mise en page ne suit pas les règles du catalogue.", "layout_invalid")
    if find_in_catalog(rows):
        return _refus("Cette mise en page est déjà au catalogue.", "layout_in_catalog", 409)

    lang, text = current_app.config["SITE_LANG"], "\n".join(rows)
    if not LayoutProposal.query.filter_by(lang=lang, rows=text).first():
        db.session.add(LayoutProposal(width=len(rows[0]), height=len(rows), rows=text, lang=lang, user_id=user.id))
        db.session.commit()
    # Une forme déjà proposée par quelqu'un d'autre : même remerciement, rien à ajouter
    return jsonify({"message": "Merci, c'est envoyé."}), 201


layouts_cli = AppGroup("layouts", help="Mises en page proposées au catalogue (roadmap 5C) : export pour le curateur.")


@layouts_cli.command("export")
def export_command():
    """Les propositions, en JSON, pour le curateur (make layouts-pull) ; il écarte lui-même celles déjà tranchées."""
    proposals = (LayoutProposal.query.filter_by(lang=current_app.config["SITE_LANG"])
                 .order_by(LayoutProposal.created_at).all())
    json.dump({"exported_at": _utcnow().isoformat(timespec="seconds") + "Z",
               "lang": current_app.config["SITE_LANG"],
               "proposals": [proposal.to_json() for proposal in proposals]},
              sys.stdout, ensure_ascii=False, indent=1)


def init_layout_proposals(app) -> None:
    app.register_blueprint(layout_proposals_bp)
    app.cli.add_command(layouts_cli)
