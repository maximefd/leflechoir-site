"""Suggestions de mots des utilisateurs : retirer un mot du lexique, ou en proposer un (roadmap 1e, #144, #145).

- **Les visiteurs suggèrent, l'auteur décide** dans le curateur, sur son Mac ([ADR 0005]) : rien de ce qui
  arrive ici ne touche le lexique. `make suggestions-pull` exporte les suggestions en attente (`flask suggestions
  export`) ; `make deploy-lexicon` renvoie les décisions (`flask suggestions apply`), qui fixent les statuts.
- **Aucune limite pour les humains**, avec ou sans compte : un plafond anti-robot seulement (RATELIMIT_SUGGEST).
- **On compte des personnes, pas des clics** : le compte, sinon l'empreinte du jour (ADR 0016).
- **Signaux implicites**, versés au même export : mots imposés absents du lexique, mots rangés par plusieurs
  personnes dans leurs dictionnaires, mots générés remplacés à la main dans l'éditeur.
"""

import json
import logging
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import click
from flask import Blueprint, current_app, jsonify
from flask.cli import AppGroup
from flask_jwt_extended import get_current_user, jwt_required

from extensions import db
from models import Dictionary, PersonalWord, UsageEvent, WordSuggestion
from normalization import normalize_word
from schemas import SuggestionRequest, parse_body
from usage import visitor_fingerprint

suggestions_bp = Blueprint("suggestions", __name__, url_prefix="/api/suggestions")
logger = logging.getLogger(__name__)

# Un mot rangé dans son dictionnaire est une donnée personnelle : il ne devient un signal qu'à partir de
# plusieurs personnes
MIN_DICTIONARY_OWNERS = 2
# Les mots imposés gardent leur texte 90 jours (ADR 0016) : c'est la fenêtre du signal
MUST_WORDS_WINDOW_DAYS = 90


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def record(kind: str, display: str, source: str, user=None) -> WordSuggestion:
    suggestion = WordSuggestion(
        kind=kind,
        word=normalize_word(display),
        display=display.strip()[:50],
        lang=current_app.config["SITE_LANG"],
        source=source,
        user_id=user.id if user else None,
        # Avec un compte, le compte suffit : pas d'empreinte à garder en plus
        visitor=None if user else visitor_fingerprint(_utcnow().date()),
    )
    db.session.add(suggestion)
    return suggestion


@suggestions_bp.post("")
@jwt_required(optional=True)
def suggest():
    """Un clic : le mot est signalé (ou proposé). Tout est accepté, même un doublon : on compte des personnes."""
    payload = parse_body(SuggestionRequest)
    record(payload.kind, payload.word, payload.source, get_current_user())
    db.session.commit()
    return jsonify({"message": "Merci, c'est noté."}), 201


@suggestions_bp.get("/mine")
@jwt_required()
def my_suggestions():
    """Ce que sont devenues les suggestions du compte : retenue, écartée ou en attente."""
    rows = (WordSuggestion.query.filter_by(user_id=get_current_user().id)
            .filter(WordSuggestion.source != "editor_replaced")
            .order_by(WordSuggestion.created_at.desc()).limit(200).all())
    seen, suggestions = set(), []
    for row in rows:  # un mot signalé deux fois par la même personne ne s'affiche qu'une fois
        if (row.kind, row.word) not in seen:
            seen.add((row.kind, row.word))
            suggestions.append(row.to_json())
    return jsonify({"suggestions": suggestions}), 200


def record_replaced_words(user, before: list[dict] | None, after: list[dict]) -> None:
    """Signal implicite : un mot venu du lexique qui disparaît de son emplacement a été remplacé à la main.

    Le mot qui le remplace devient « manuel » (words_from_cells) : le signal ne part qu'une fois par mot.
    """
    placed = {(w["x"], w["y"], w["direction"]): w["text"] for w in after or []}
    for word in before or []:
        if word.get("source") == "common" and word.get("complete", True) is not False:
            if placed.get((word["x"], word["y"], word["direction"])) != word["text"]:
                record("remove", word["text"], "editor_replaced", user)


# --- Pour l'auteur : le poste de pilotage et le curateur ---

def _person(row) -> str:
    return f"u{row.user_id}" if row.user_id else f"v{row.visitor}"


def grouped(status: str = "pending") -> list[dict]:
    """Les suggestions explicites et implicites, regroupées par mot et classées par nombre de personnes."""
    groups: dict[tuple[str, str], dict] = {}

    def add(kind, word, display, source, person):
        group = groups.setdefault((kind, word), {"kind": kind, "word": word, "display": display,
                                                 "people": set(), "sources": defaultdict(int)})
        group["people"].add(person)
        group["sources"][source] += 1

    for row in WordSuggestion.query.filter_by(status=status, lang=current_app.config["SITE_LANG"]).all():
        add(row.kind, row.word, row.display, row.source, _person(row))

    if status == "pending":
        # Mots imposés que le lexique ne connaît pas (le texte n'est gardé que 90 jours)
        since = _utcnow() - timedelta(days=MUST_WORDS_WINDOW_DAYS)
        for event in UsageEvent.query.filter(UsageEvent.kind == "generation", UsageEvent.created_at >= since,
                                             UsageEvent.words.isnot(None)).all():
            texts = (event.words or {}).get("must", [])
            for detail, text in zip(event.data.get("must", []), texts):
                if not detail.get("known", True):
                    add("add", normalize_word(text), text, "must_unknown",
                        f"u{event.user_id}" if event.user_id else f"v{event.visitor}")
        # Mots rangés par plusieurs personnes dans leurs dictionnaires : le curateur écarte ceux déjà au lexique
        owners = defaultdict(set)
        displays = {}
        for mot, affiche, user_id in (db.session.query(PersonalWord.mot, PersonalWord.mot_affiche, Dictionary.user_id)
                                      .join(Dictionary).all()):
            owners[mot].add(user_id)
            displays.setdefault(mot, affiche)
        for mot, users in owners.items():
            if len(users) >= MIN_DICTIONARY_OWNERS:
                for user_id in users:
                    add("add", mot, displays[mot], "dictionaries", f"u{user_id}")

    result = [{"kind": g["kind"], "word": g["word"], "display": g["display"], "people": len(g["people"]),
               "sources": dict(g["sources"])} for g in groups.values()]
    return sorted(result, key=lambda g: (-g["people"], g["word"]))


def apply_decisions(decisions: list[dict]) -> int:
    """Les décisions de l'auteur ({kind, word, decision}) fixent le statut des suggestions en attente."""
    changed = 0
    now = _utcnow()
    for decision in decisions:
        status = {"accepted": "accepted", "rejected": "rejected"}.get(decision.get("decision"))
        if not status:
            continue
        changed += (WordSuggestion.query
                    .filter_by(kind=decision["kind"], word=decision["word"], status="pending")
                    .update({"status": status, "decided_at": now}))
    db.session.commit()
    return changed


suggestions_cli = AppGroup("suggestions", help="Suggestions de mots (roadmap 1e) : export pour le curateur, décisions.")


@suggestions_cli.command("export")
def export_command():
    """Les suggestions en attente, en JSON, pour le curateur (make suggestions-pull)."""
    json.dump({"exported_at": _utcnow().isoformat(timespec="seconds") + "Z",
               "lang": current_app.config["SITE_LANG"], "suggestions": grouped()},
              sys.stdout, ensure_ascii=False, indent=1)


@suggestions_cli.command("apply")
def apply_command():
    """Lit sur l'entrée standard les décisions du curateur (JSON, make deploy-lexicon) et met à jour les statuts."""
    changed = apply_decisions(json.load(sys.stdin).get("decisions", []))
    click.echo(f"Suggestions : {changed} statut(s) mis à jour.")


def init_suggestions(app) -> None:
    app.register_blueprint(suggestions_bp)
    app.cli.add_command(suggestions_cli)
