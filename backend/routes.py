# DANS backend/routes.py

import contextlib
import json
import logging
import secrets
import time
from collections import Counter
from datetime import datetime

from flask import Blueprint, Response, abort, jsonify, current_app, request, stream_with_context
from flask_jwt_extended import jwt_required, get_current_user, unset_jwt_cookies

# On importe depuis nos modules centraux
from normalization import normalize_pattern, normalize_phrase, normalize_word
from models import db, Dictionary, PersonalWord, SavedGrid
from engine.difficulty import request_difficulty, sur_mesure_difficulty
from engine.word_repository import WholeLexicon
from engine.grid_edit import (
    HOLE, allowed_letters, apply_blocks, apply_letters, cells_of_slot, fill_ratio, layout_warnings, letters_of,
    slot_at, words_from_cells,
)
from engine.mystery import (MAX_LETTERS, MIN_LETTERS, MissingLetters, broken_numbers, letters_in, place_mystery,
                            repair_mystery)
from generation_slots import GenerationBusy, generation_slot
from engine.geometry import GeometryError, generate_geometry, longest_word
from grid_generator import (GENERATED_SIDES, GEOMETRY_GENERATED, GeometryUnavailableError, GridGenerator,
                            LayoutNotFoundError, generated_must_word_problems)
from layout_catalog import (available_formats, catalog, fit_by_format, format_slot_count, must_words_fit,
                            suggest_layouts_for)
from layout_catalog import list_layouts as catalog_entries
from auth import password_matches
from schemas import (
    AccountDeletionRequest,
    BlankGridRequest,
    DictionaryCreateRequest,
    DifficultyRequest,
    GeometryRequest,
    DictionaryUpdateRequest,
    GenerateRequest,
    GridUpdateRequest,
    SaveGridRequest,
    SlotRef,
    SearchRequest,
    WordCreateRequest,
    parse_body,
)
from monitoring import report_exception
from security import HTTP_ERROR_MESSAGES, client_ip
import usage
from models import ContactMessage, LayoutProposal, UsageEvent, WordSuggestion
from suggestions import record_replaced_words

# On crée un nouveau Blueprint pour les routes principales
main_bp = Blueprint('main', __name__, url_prefix='/api')

# Budget le plus long accordé à l'orchestrateur (#209) : gunicorn coupe un worker à 60 s, Cloudflare une requête
# à 100 s ; au-delà, il faudra une tâche détachée
MAX_QUALITY_BUDGET_S = 45.0

# --- FONCTIONS UTILITAIRES ---

def escape_like(value: str) -> str:
    """Échappe les jokers SQL (%, _) et le caractère d'échappement pour une clause LIKE."""
    return value.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')

def get_owned_grid(user, grid_id):
    """Grille de l'utilisateur, ou 404 (même règle que pour les dictionnaires)."""
    return SavedGrid.query.filter_by(id=grid_id, user_id=user.id).first_or_404()

def get_owned_dictionary(user, dict_id):
    """Dictionnaire de l'utilisateur, ou 404 (on ne révèle pas l'existence des dictionnaires des autres)."""
    return Dictionary.query.filter_by(id=dict_id, user_id=user.id).first_or_404()

# Note : sur les routes @jwt_required(), get_current_user() ne renvoie jamais None.
# Un jeton dont le compte n'existe plus est rejeté en 401 (voir security.register_jwt_callbacks).

# --- MOT MYSTÈRE (#218) ---

FRENCH_COUNTS = {1: "un", 2: "deux", 3: "trois"}


def mystery_word_of(text: str | None):
    """Le mot mystère normalisé (« Joyeux Noël » → « JOYEUX NOEL »), et la réponse de refus si sa longueur ne va pas.

    `("", None)` : pas de mot mystère (champ absent ou vide).
    """
    word = normalize_phrase(text or "")
    if word and not MIN_LETTERS <= len(letters_in(word)) <= MAX_LETTERS:
        return word, (jsonify({
            "error": f"Le mot mystère doit compter de {MIN_LETTERS} à {MAX_LETTERS} lettres.",
            "reason": "mystery_word_length",
        }), 400)
    return word, None


def mystery_json(word: str, seed, positions) -> dict:
    """Le mot mystère tel qu'il est rendu et gardé : la case n° i + 1 porte la i-ième lettre."""
    return {"word": word, "seed": seed, "cells": [{"x": x, "y": y} for x, y in positions]}


def mystery_positions(mystery: dict) -> list[tuple[int, int]]:
    return [(cell["x"], cell["y"]) for cell in mystery.get("cells", [])]


def missing_letters_error(missing: list[str], advice: str) -> dict:
    """« Il manque un X et deux N dans la grille… », avec la liste des lettres pour l'écran."""
    parts = [f"{FRENCH_COUNTS.get(count, count)} {letter}" for letter, count in Counter(missing).items()]
    listed = parts[0] if len(parts) == 1 else f"{', '.join(parts[:-1])} et {parts[-1]}"
    return {"error": f"Il manque {listed} dans la grille pour écrire le mot mystère. {advice}",
            "reason": "mystery_letters_missing", "missing": missing}


def mystery_with_status(cells: list[dict], mystery: dict | None) -> dict | None:
    """Le mot mystère, et les numéros dont la case a perdu sa lettre sans case de rechange (`broken`)."""
    if not mystery:
        return None
    word = mystery.get("word", "")
    return {**mystery, "broken": broken_numbers(cells, letters_in(word), mystery_positions(mystery))}

# --- ROUTES API ---

@main_bp.route('/status', methods=['GET'])
def status_check():
    """État de l'API, lu par le healthcheck du conteneur, le test de fumée du déploiement et la surveillance.

    Une base injoignable répond 503 : l'API tourne, mais ni les comptes ni la mesure ne marchent.
    """
    dela_trie = current_app.dela_trie
    word_count = len(dela_trie.words) if dela_trie and hasattr(dela_trie, 'words') else 0
    manager = getattr(current_app, 'lexicon', None)
    lexicon = manager.info.as_dict() if manager and manager.info else None
    try:
        db.session.execute(db.text("SELECT 1"))
        database = "ok"
    except Exception:
        db.session.rollback()
        logging.exception("Base de données injoignable")
        database = "unavailable"
    body = {"status": "ok" if database == "ok" else "degraded", "database": database,
            "trie_loaded": dela_trie is not None, "word_count": word_count, "lexicon": lexicon}
    if database != "ok":
        body.update(error="La base de données est injoignable.", reason="database_unavailable")
        return jsonify(body), 503
    return jsonify(body), 200

@main_bp.route('/dictionaries', methods=['GET'])
@jwt_required()
def get_dictionaries():
    user = get_current_user()

    # AMÉLIORATION : Si l'utilisateur n'a pas de dictionnaire, on lui en crée un.
    if not user.dictionaries:
        default_dict = Dictionary(name="Dictionnaire par défaut", user_id=user.id, is_active=True)
        db.session.add(default_dict)
        db.session.commit()
        # On rafraîchit l'objet 'user' pour qu'il contienne le nouveau dictionnaire
        db.session.refresh(user)

    return jsonify([d.to_json() for d in user.dictionaries]), 200

@main_bp.route('/dictionaries', methods=['POST'])
@jwt_required()
def create_dictionary():
    user = get_current_user()
    payload = parse_body(DictionaryCreateRequest)

    max_dictionaries = current_app.config['MAX_DICTIONARIES_PER_USER']
    if len(user.dictionaries) >= max_dictionaries:
        return jsonify({'error': f"Limite atteinte : {max_dictionaries} dictionnaires maximum."}), 400
    if Dictionary.query.filter_by(user_id=user.id, name=payload.name).first():
        return jsonify({'error': f"Un dictionnaire nommé '{payload.name}' existe déjà."}), 409

    Dictionary.query.filter_by(user_id=user.id).update({'is_active': False})

    new_dict = Dictionary(name=payload.name, user_id=user.id, is_active=True)
    db.session.add(new_dict)
    db.session.commit()
    return jsonify(new_dict.to_json()), 201

@main_bp.route('/dictionaries/<int:dict_id>', methods=['PATCH'])
@jwt_required()
def update_dictionary(dict_id):
    user = get_current_user()
    dictionary = get_owned_dictionary(user, dict_id)
    payload = parse_body(DictionaryUpdateRequest)

    if payload.name is not None and payload.name != dictionary.name:
        if Dictionary.query.filter_by(user_id=user.id, name=payload.name).first():
            return jsonify({'error': f"Un dictionnaire nommé '{payload.name}' existe déjà."}), 409
        dictionary.name = payload.name

    if payload.is_active is True:
        Dictionary.query.filter(Dictionary.user_id == user.id).update({'is_active': False})
        dictionary.is_active = True

    db.session.commit()
    return jsonify(dictionary.to_json()), 200

@main_bp.route('/dictionaries/<int:dict_id>', methods=['DELETE'])
@jwt_required()
def delete_dictionary(dict_id):
    dictionary = get_owned_dictionary(get_current_user(), dict_id)
    db.session.delete(dictionary)
    db.session.commit()
    return jsonify({'message': 'Dictionnaire supprimé avec succès.'}), 200

@main_bp.route('/dictionaries/<int:dict_id>/words', methods=['GET'])
@jwt_required()
def get_words_in_dictionary(dict_id):
    dictionary = get_owned_dictionary(get_current_user(), dict_id)
    words = PersonalWord.query.filter_by(dictionary_id=dictionary.id).order_by(PersonalWord.id.desc()).all()
    return jsonify([word.to_json() for word in words]), 200

@main_bp.route('/dictionaries/<int:dict_id>/words', methods=['POST'])
@jwt_required()
def add_word_to_dictionary(dict_id):
    dictionary = get_owned_dictionary(get_current_user(), dict_id)
    payload = parse_body(WordCreateRequest)

    max_words = current_app.config['MAX_WORDS_PER_DICTIONARY']
    if PersonalWord.query.filter_by(dictionary_id=dictionary.id).count() >= max_words:
        return jsonify({'error': f"Limite atteinte : {max_words} mots maximum par dictionnaire."}), 400

    mot_upper = normalize_word(payload.mot)
    if PersonalWord.query.filter_by(dictionary_id=dictionary.id, mot=mot_upper).first():
        return jsonify({'error': f"Le mot '{payload.mot}' existe déjà."}), 409
    new_word = PersonalWord(mot=mot_upper, mot_affiche=payload.mot, definition=payload.definition or '', dictionary_id=dictionary.id)
    db.session.add(new_word)
    db.session.commit()
    return jsonify(new_word.to_json()), 201

@main_bp.route('/dictionaries/<int:dict_id>/words/<int:word_id>', methods=['DELETE'])
@jwt_required()
def delete_word_from_dictionary(dict_id, word_id):
    dictionary = get_owned_dictionary(get_current_user(), dict_id)
    word = PersonalWord.query.filter_by(id=word_id, dictionary_id=dictionary.id).first_or_404()
    db.session.delete(word)
    db.session.commit()
    return jsonify({'message': 'Mot supprimé avec succès.'}), 200

@main_bp.route('/search', methods=['POST'])
@jwt_required(optional=True)
def search_words():
    user = get_current_user()  # None pour un invité
    dela_trie = current_app.dela_trie
    payload = parse_body(SearchRequest)
    cleaned_mask = normalize_pattern(payload.mask)

    personal_results_json = []
    if user:
        active_dict = Dictionary.query.filter_by(user_id=user.id, is_active=True).first()
        if active_dict:
            # Les jokers SQL saisis par l'utilisateur sont échappés : seul « ? » est un joker
            sql_mask = escape_like(cleaned_mask).replace('?', '_')
            personal_words = (
                PersonalWord.query
                .filter(PersonalWord.dictionary_id == active_dict.id, PersonalWord.mot.like(sql_mask, escape='\\'))
                .limit(payload.limit)
                .all()
            )
            personal_results_json = [w.to_json() for w in personal_words]

    if not dela_trie: return jsonify({"error": "Dictionnaire principal non disponible."}), 503

    # Le parcours du Trie s'arrête dès que la limite est atteinte (masques très larges comme « ?????? »)
    dela_results_raw = dela_trie.search_pattern(cleaned_mask, limit=payload.limit + len(personal_results_json))
    final_results = personal_results_json
    personal_mots_set = {p['mot'] for p in personal_results_json}

    for word in dela_results_raw:
        if word not in personal_mots_set:
            final_results.append({"mot": word, "definition": None})

    results = final_results[:payload.limit]
    usage.add_details(pattern_length=len(cleaned_mask), wildcards=cleaned_mask.count('?'),
                      results=len(results), logged_in=user is not None)
    return jsonify({"results": results}), 200

@main_bp.route('/grids/formats', methods=['GET'])
def list_grid_formats():
    """Liste les formats de grille pour lesquels au moins un layout existe."""
    return jsonify({"formats": available_formats(current_app.config.get('LAYOUTS_DIR'))}), 200

@main_bp.route('/layouts', methods=['GET'])
def list_layouts():
    """Catalogue des layouts valides, par format : identifiant, grille (x / -) et statistiques."""
    return jsonify({"formats": catalog(current_app.config.get('LAYOUTS_DIR'))}), 200

@main_bp.route('/grids/difficulty', methods=['POST'])
def grid_difficulty():
    """Ce que coûtent des mots imposés, **sans générer** : réponse immédiate, à chaque frappe.

    Les taux viennent de 2 640 générations mesurées (voir engine/difficulty.py). Donner ce chiffre
    avant de chercher vaut mieux que de laisser l'auteur attendre 20 s pour un échec. Un mot qui ne
    tient dans aucun layout du format est signalé tout de suite, avec les formats qui l'accueillent.
    """
    payload = parse_body(DifficultyRequest)
    words = [normalize_word(word) for word in payload.must_words]
    if (payload.geometry or current_app.config['GENERATION_GEOMETRY']) == GEOMETRY_GENERATED:
        return jsonify(generated_difficulty(words, payload.size)), 200
    slots = None
    if payload.size:
        slots = format_slot_count(payload.size.width, payload.size.height,
                                  current_app.config.get('LAYOUTS_DIR'))
    estimate = request_difficulty(words, slots)
    estimate["impossible"], estimate["fitting_formats"], estimate["better_format"] = [], [], None
    if payload.size and words:
        fits = fit_by_format(words, current_app.config.get('LAYOUTS_DIR'))
        fit = must_words_fit(words, payload.size.width, payload.size.height, fits=fits)
        if fit["problems"]:
            estimate.update(impossible=fit["problems"], fitting_formats=fit["formats"],
                            success_rate=0.0, level="très difficile", advice=None, size_advice=None)
        better = better_format(words, fits, estimate["success_rate"])
        if better:
            # Conseil plus précis que « une grande grille » : il nomme le format, et l'écran propose d'y passer
            estimate.update(better_format=better, size_advice=None)

    # Le moteur reste pur : c'est ici qu'on sait ce que contient le lexique chargé. Un mot qui n'y
    # figure pas se place quand même (le pool des mots imposés étend l'index), mais la mesure d'où
    # sort le taux a tiré ses mots **dans** le lexique : l'auteur doit savoir qu'il en sort.
    dela_trie = current_app.dela_trie
    known = dela_trie.words if dela_trie else set()
    for detail in estimate["words"]:
        detail["in_lexicon"] = detail["word"] in known
    estimate["unknown_words"] = [d["word"] for d in estimate["words"] if not d["in_lexicon"]]
    estimate["geometry"] = "catalogue"

    return jsonify(estimate), 200


def generated_difficulty(words: list[str], size) -> dict:
    """L'estimation d'une grille sur mesure (#219) : le taux mesuré à cette taille, et la taille conseillée.

    `best_size` : la plus petite grille qui a la meilleure probabilité de recevoir les mots imposés
    (`engine.difficulty.best_sur_mesure_size`), à proposer à l'auteur. Les impossibilités certaines restent dites (un
    mot plus long que toute géométrie dessinée de cette taille).
    """
    dela_trie = current_app.dela_trie
    known = dela_trie.words if dela_trie else set()
    impossible = generated_must_word_problems(size.width, size.height, words) if size else []
    estimate = sur_mesure_difficulty(words, size.width if size else None, size.height if size else None)
    if impossible:
        estimate.update(success_rate=0.0, level="très difficile")
    return {
        "geometry": GEOMETRY_GENERATED, "words": [], "success_rate": estimate["success_rate"],
        "level": estimate["level"], "measured": estimate["measured"], "best_size": estimate["best_size"],
        "hardest": None, "advice": None, "size_advice": None, "size_class": None,
        "impossible": impossible, "fitting_formats": [], "better_format": None,
        "unknown_words": [word for word in words if word not in known],
    }

# Écart à partir duquel conseiller un autre format : en deçà, le choix de l'auteur est déjà bon
BETTER_FORMAT_MARGIN = 0.15


def better_format(words, fits: dict[str, dict], current_rate: float) -> dict | None:
    """Le format qui donne le plus de chances à ces mots, s'il fait nettement mieux que le choix actuel.

    Les taux sont ceux de la classe de taille (par format, l'échantillon serait trop petit pour
    départager deux formats proches) : à taux égal, le plus petit format l'emporte, plus vite rempli
    et avec moins de définitions à écrire.
    """
    candidates = []
    for name, fit in fits.items():
        if fit["problems"]:
            continue
        rate = request_difficulty(words, fit["slots"])["success_rate"]
        width, height = fit["width"], fit["height"]
        candidates.append((-rate, width * height, width, name, rate))
    if not candidates:
        return None
    _, _, _, name, rate = min(candidates)
    if rate - current_rate < BETTER_FORMAT_MARGIN:
        return None
    fit = fits[name]
    return {"format": name, "width": fit["width"], "height": fit["height"], "success_rate": rate}


@main_bp.route('/grids/generate', methods=['POST'])
@jwt_required(optional=True)
def generate_grid():
    user = get_current_user()
    dela_trie = current_app.dela_trie
    if not dela_trie: return jsonify({"error": "Dictionnaire principal non disponible."}), 503

    payload = parse_body(GenerateRequest)
    width, height = payload.size.width, payload.size.height
    # Moteur v2 (#210) : une mise en page du catalogue, ou une géométrie sur mesure si la requête ou le serveur le
    # demande
    geometry = payload.geometry or current_app.config['GENERATION_GEOMETRY']
    generated = geometry == GEOMETRY_GENERATED

    # Sur mesure, aucun mot du lexique de plus de `longest_word` lettres (9) : le lexique s'arrête là. Un mot obligatoire
    # plus long a son emplacement réservé dans chaque géométrie (#222)
    longest = longest_word(width, height) if generated else max(width, height)

    # Tous les mots de longueur utile : un échantillon (ex-30 000 mots, ~4 % du DELA) rendait presque
    # tous les croisements impossibles. Désignés sans être recopiés : trier 700 000 mots à chaque
    # requête coûtait jusqu'à 0,7 s avant la première lettre posée (ADR 0013).
    common_words = WholeLexicon(longest) if payload.use_global else ()

    # Pool « souhaité » : les mots saisis, plus ceux des dictionnaires **explicitement choisis**.
    # Le dictionnaire actif n'y entre plus de lui-même ([ADR 0011](docs/adr/0011-dictionnaires-choisis.md)) :
    # une grille thématique n'a aucune raison d'hériter du dictionnaire que la recherche utilise.
    # Ces mots sont essayés avant le lexique commun et restent valides aux croisements même s'ils
    # n'y figurent pas (#17).
    wish_words = [normalize_word(word) for word in payload.wish_words]

    # Ceux de l'utilisateur connecté, et eux seuls. Un dictionnaire qui ne lui appartient pas répond
    # 404 comme partout ailleurs — on ne révèle pas son existence (ADR 0007).
    for dictionary_id in payload.wish_dictionary_ids:
        if not user:
            abort(404)
        theme = get_owned_dictionary(user, dictionary_id)
        wish_words.extend(word.mot for word in theme.words if 2 <= len(word.mot) <= longest)

    # Un mot obligatoire est aussi souhaité : inutile de le répéter dans les deux listes (ADR 0007)
    must_words = sorted({normalize_word(word) for word in payload.must_words})

    # Moteur v2 (#209) : la meilleure de plusieurs grilles, si la requête ou le serveur le demande
    quality = payload.quality or current_app.config['GENERATION_QUALITY']

    # Ce que la génération demandait (ADR 0016) : le texte des mots imposés n'est gardé que 90 jours ;
    # ensuite, il ne reste que leurs longueurs et leur présence dans le lexique
    typed_wishes = [normalize_word(word) for word in payload.wish_words]
    usage.describe("generation", words={"must": must_words, "wish": typed_wishes} if must_words or typed_wishes else None)
    usage.add_details(
        format=f"{width}x{height}",
        must=[{"length": len(word), "known": word in dela_trie.words} for word in must_words],
        wish_count=len(typed_wishes),
        dictionaries=len(payload.wish_dictionary_ids),
        use_global=payload.use_global,
        frequency_mode=payload.frequency_mode,
        quality=quality,
        geometry=geometry,
        logged_in=user is not None,
    )

    # Sur mesure, toute taille de 5 à 20 cases de côté (« Taille libre ») ; le catalogue garde ses formats
    if generated and not all(GENERATED_SIDES[0] <= side <= GENERATED_SIDES[1] for side in (width, height)):
        return jsonify({
            "error": f"Une grille sur mesure fait de {GENERATED_SIDES[0]} à {GENERATED_SIDES[1]} cases de côté.",
            "reason": "size_out_of_range",
        }), 400

    if not payload.use_global and not wish_words and not must_words:
        return jsonify({"error": "Aucun mot de taille adéquate disponible.", "reason": "no_words"}), 400

    # Le mot mystère (#218) n'est pas mesuré : c'est souvent le prénom de quelqu'un. Sa longueur se vérifie
    # avant de générer, pour ne pas faire attendre une grille qu'on ne pourrait pas lui donner.
    mystery_word, refusal = mystery_word_of(payload.mystery_word)
    if refusal:
        return refusal

    # Une génération occupe un cœur jusqu'à 20 s : au plus quelques-unes à la fois, une par visiteur
    # (ADR 0013). Un compte est un visiteur où qu'il se connecte ; un invité, une adresse.
    visitor = f"compte:{user.id}" if user else f"ip:{client_ip()}"
    # En flux (#209), la place est tenue jusqu'à la fin du flux, après le retour de la vue : elle est confiée
    # au flux, qui la rend dans son `finally` (et à la fermeture de la réponse, s'il n'a jamais démarré)
    held = contextlib.ExitStack()
    try:
        held.enter_context(generation_slot(current_app.config['GENERATION_LOCK_DIR'], visitor,
                                           current_app.config['GENERATION_MAX_CONCURRENT']))
    except GenerationBusy as busy:
        message = (
            "Une génération est déjà en cours pour toi : attends son résultat avant d'en lancer une autre."
            if busy.reason == "visitor" else
            "Le générateur est occupé. Réessaie dans quelques secondes."
        )
        response = jsonify({"error": message, "reason": f"busy_{busy.reason}"})
        response.headers["Retry-After"] = "5"
        return response, 429
    streaming = "text/event-stream" in request.headers.get("Accept", "")
    handed_over = False
    try:
        generator, refusal = prepare_generation(width, height, common_words, dela_trie, payload, wish_words,
                                                must_words, quality, geometry)
        if refusal is not None:
            return refusal
        if streaming:
            handed_over = True
            return stream_generation(generator, held, user_words=len(set(wish_words) | set(must_words)),
                                     mystery=(mystery_word, payload.seed))
        body, status = generation_outcome(generator, generator.generate())
        return jsonify(add_mystery(body, mystery_word, payload.seed) if status == 200 else body), status
    finally:
        if not handed_over:
            held.close()


def prepare_generation(width, height, common_words, dela_trie, payload, wish_words, must_words, quality, geometry):
    """Construit le générateur, ou la réponse qui refuse la demande avant toute résolution : (générateur, refus)."""
    layouts_dir = current_app.config.get('LAYOUTS_DIR')
    orchestrate = quality == "best"
    budget = (current_app.config['GENERATION_QUALITY_BUDGET_S'] if orchestrate
              else current_app.config.get('GENERATION_TIME_BUDGET_S', 20))
    generated = geometry == GEOMETRY_GENERATED

    try:
        generator = GridGenerator(
            width, height, common_words,
            prebuilt_trie=dela_trie,
            seed=payload.seed,
            layouts_dir=layouts_dir,
            time_budget_s=budget,
            wish_words=sorted(set(wish_words)),
            must_words=must_words,
            frequency_mode=payload.frequency_mode,
            orchestrate=orchestrate,
            geometry=geometry,
        )
    except LayoutNotFoundError:
        formats = available_formats(layouts_dir)
        return None, (jsonify({
            "error": f"Aucun layout disponible pour le format {width}x{height}.",
            "reason": "unknown_format",
            "available_formats": formats,
        }), 400)
    except GeometryUnavailableError:
        # Mesuré (#210) : 5×11 et 11×5 seulement, aucune géométrie conforme n'y existe
        return None, (jsonify({
            "error": f"Le moteur ne sait pas dessiner de grille sur mesure en {width} × {height} : "
                     "change une des deux dimensions.",
            "reason": "geometry_unavailable",
        }), 422)

    # Refus AVANT toute résolution : inutile de chercher 20 s un mot qui n'entre dans aucun layout
    # du format. Le générateur a examiné tous les candidats, pas seulement celui qu'il a tiré. Sur mesure,
    # seul compte le grand côté : un mot plus long que lui n'entre dans aucune grille (#222).
    problems = generator.must_word_problems
    if problems:
        return None, (jsonify({
            "error": ("Ces mots obligatoires sont trop longs pour une grille sur mesure de ce format." if generated
                      else "Ces mots obligatoires n'entrent pas dans ce layout."),
            "reason": "must_words",
            "details": problems,
            "suggested_layouts": suggest_layouts_for(must_words, layouts_dir),
        }), 422)
    return generator, None


def generation_outcome(generator, succeeded) -> tuple[dict, int]:
    """Corps et statut de la réponse, en JSON comme en fin de flux (#209) : mêmes `reason`."""
    if generator.attempts:
        # Avec l'orchestrateur, le layout retenu est celui de la meilleure grille, pas celui du dernier essai ; sur
        # mesure, « sur-mesure », jamais le nom d'un essai
        layout = (generator.layout_name if generator.geometry == GEOMETRY_GENERATED
                  or (succeeded and generator.orchestration) else generator.attempts[-1]["layout"])
        usage.add_details(layout=layout, attempts=len(generator.attempts))
    if not succeeded:
        if generator.unplaced_must_words:
            return {
                "error": "Impossible de placer tous les mots obligatoires dans le temps imparti.",
                "reason": "must_words_unplaced",
                "unplaced": generator.unplaced_must_words,
            }, 422
        if generator.budget_exceeded:
            return {
                "error": "La génération a dépassé le temps imparti. Réessaie (nouveau tirage) ou choisis un autre format.",
                "reason": "timeout",
            }, 422
        return {
            "error": "Impossible de générer une grille avec les mots fournis.",
            "reason": "no_solution",
        }, 422

    return {"grid": generator.get_grid_data()}, 200


def add_mystery(body: dict, mystery_word: str, seed) -> dict:
    """Numérote les cases du mot mystère dans la grille rendue (#218), sans toucher à la génération.

    Une lettre absente ne coûte pas la grille, qui est bien là : elle revient avec `mystery_error` (l'explication,
    les lettres manquantes, le conseil de relancer). Sert au JSON, à l'événement `done` et à chaque `best` du flux.
    """
    grid = body.get("grid")
    if not mystery_word or not grid:
        return body
    try:
        positions = place_mystery(grid["cells"], grid["words"], mystery_word, seed)
        grid["mystery"] = mystery_json(mystery_word, seed, positions)
    except MissingLetters as missing:
        body["mystery_error"] = missing_letters_error(
            missing.missing, "Relance la génération : une autre grille les aura peut-être.")
    return body


def sse(event: str, data: dict) -> str:
    """Un événement SSE : son nom, puis ses données en JSON sur une ligne."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, separators=(',', ':'))}\n\n"


# Rythme du flux (#209) : la progression toutes les 0,5 s, la meilleure grille au plus une fois par seconde
PROGRESS_INTERVAL_S = 0.5
BEST_INTERVAL_S = 1.0


def expected_end(budget: float | None, patience: float | None, improved_s: float | None) -> float | None:
    """Quand la recherche devrait s'arrêter, en secondes depuis son début (#220) : de quoi dessiner une barre.

    Le budget, ou plus tôt la dernière amélioration plus la patience (arrêt anticipé, #219). Une estimation : une
    grille meilleure repousse la fin, et une grille complète l'avance.
    """
    if budget is None:
        return None
    if patience and improved_s is not None:
        return round(min(budget, improved_s + patience), 1)
    return round(budget, 1)


def stream_generation(generator, held: contextlib.ExitStack, user_words: int, mystery=("", None)):
    """Flux SSE de la génération (#209), sur la même route que le JSON.

    `progress` (essais, grilles trouvées, record, `expected_s` : la fin attendue, #220) toutes les 0,5 s, `best` (la meilleure grille du moment) à chaque
    amélioration, au plus une fois par seconde, puis `done` (le corps du mode JSON) ou `error` (mêmes `reason`,
    plus le statut qu'aurait eu la réponse JSON). La place de génération est rendue à la fin du flux, et
    l'événement d'usage enregistré à ce moment-là, avec la durée réelle.
    """
    def events():
        # Fermé avant la fin (« Garder celle-ci », onglet fermé) : la grille gardée compte comme une grille
        status, body = 499, {"error": "Génération interrompue.", "reason": "client_closed"}
        sent_best = None
        # Barre de progression (#220) : la fin attendue, le budget ou, dès qu'une grille existe, sa dernière
        # amélioration plus la patience (le moteur s'arrête alors), au plus le budget
        budget = generator.time_budget_s
        patience = getattr(generator, "patience_s", None)
        seen_best, improved_s = None, None
        try:
            last_progress = last_best = float("-inf")
            for progress in generator.iterate():
                now = time.monotonic()
                best = progress.best
                if best is not None and best is not seen_best:
                    seen_best, improved_s = best, progress.elapsed_s
                record = 0 if best is None else best.score.must_placed + best.score.wish_placed
                if best is not None and best is not sent_best and now - last_best >= BEST_INTERVAL_S:
                    # Avec son mot mystère : « Garder celle-ci » garde une grille déjà numérotée (#218)
                    event = sse("best", add_mystery({"grid": generator.best_grid_data(best), "attempts": progress.attempts,
                                                     "record": record, "words": user_words}, *mystery))
                    # Retenu avant l'envoi : le site peut couper le flux dès cet événement reçu
                    sent_best, last_best = best, now
                    yield event
                if now - last_progress >= PROGRESS_INTERVAL_S:
                    yield sse("progress", {"attempts": progress.attempts, "grids": progress.grids_found,
                                           "record": record if best else None, "words": user_words,
                                           "elapsed_s": round(progress.elapsed_s, 1),
                                           "expected_s": expected_end(budget, patience, improved_s)})
                    last_progress = now
            body, status = generation_outcome(generator, generator.succeeded)
            yield sse("done", add_mystery(body, *mystery)) if status == 200 else sse("error", {**body, "status": status})
        except GeneratorExit:
            if sent_best is not None:
                status, body = 200, {"kept": True}
            raise
        except Exception as error:
            logging.exception("Erreur pendant le flux de génération")
            report_exception(error)
            status, body = 500, {"error": HTTP_ERROR_MESSAGES[500], "reason": "internal_error"}
            yield sse("error", {**body, "status": status})
        finally:
            held.close()
            usage.record_stream(status, body)

    response = Response(stream_with_context(events()), mimetype="text/event-stream")
    response.headers["Cache-Control"] = "no-cache, no-transform"
    # Aucun proxy ne doit retenir les événements jusqu'à la fin
    response.headers["X-Accel-Buffering"] = "no"
    # Si le flux n'a jamais démarré (client parti tout de suite), la place est rendue à la fermeture
    response.call_on_close(held.close)
    return response


# --- GRILLES CONSERVÉES ---

@main_bp.route('/grids', methods=['POST'])
@jwt_required()
def save_grid():
    """Conserve une grille générée, telle qu'elle a été produite (voir SavedGrid)."""
    user = get_current_user()
    payload = parse_body(SaveGridRequest)

    maximum = current_app.config['MAX_GRIDS_PER_USER']
    if SavedGrid.query.filter_by(user_id=user.id).count() >= maximum:
        accord = "s" if maximum > 1 else ""
        return jsonify({'error': f"Limite atteinte : {maximum} grille{accord} conservée{accord} au maximum."}), 400

    grid = payload.grid
    # Sans nom choisi, un repère vaut mieux qu'« Grille 37 » : le format et le jour
    name = payload.name or f"{grid.width}×{grid.height} du {datetime.now():%d/%m/%Y}"

    # Le mot mystère est gardé tel que l'auteur l'a vu, à condition que chaque case porte bien sa lettre
    mystery = None
    if grid.mystery is not None:
        mystery = mystery_json(grid.mystery.word, grid.mystery.seed, [(c.x, c.y) for c in grid.mystery.cells])
        letters = letters_in(grid.mystery.word)
        cells = [cell.model_dump() for cell in grid.cells]
        if (len(mystery["cells"]) != len(letters) or not MIN_LETTERS <= len(letters) <= MAX_LETTERS
                or broken_numbers(cells, letters, mystery_positions(mystery))):
            return jsonify({"error": "Le mot mystère ne correspond pas aux lettres de la grille.",
                            "reason": "mystery_mismatch"}), 400

    saved = SavedGrid(
        name=name,
        layout_id=grid.layout,
        width=grid.width,
        height=grid.height,
        seed=grid.seed,
        payload=grid.model_dump(exclude={"mystery"}),
        mystery=mystery,
        user_id=user.id,
    )
    db.session.add(saved)
    db.session.commit()
    usage.describe("grid", "saved", user=user, data={"format": f"{grid.width}x{grid.height}"})
    return jsonify(saved.summary()), 201


@main_bp.route('/grids/blank', methods=['POST'])
@jwt_required()
def create_blank_grid():
    """Une grille à remplir à la main (roadmap, point 5B) : les cases d'un layout du catalogue, ou toute vide.

    Toute vide, elle n'a encore aucune case définition : l'auteur les pose lui-même dans l'éditeur.
    """
    user = get_current_user()
    payload = parse_body(BlankGridRequest)
    maximum = current_app.config['MAX_GRIDS_PER_USER']
    if SavedGrid.query.filter_by(user_id=user.id).count() >= maximum:
        accord = "s" if maximum > 1 else ""
        return jsonify({'error': f"Limite atteinte : {maximum} grille{accord} conservée{accord} au maximum."}), 400

    if payload.layout:
        entry = next((e for e in catalog_entries(current_app.config.get('LAYOUTS_DIR'))
                      if e["id"] == payload.layout and e["report"]["valid"]), None)
        if entry is None:
            return jsonify({"error": "Mise en page introuvable.", "reason": "layout_not_found"}), 404
        rows = entry["report"]["rows"]
        width, height, layout = entry["width"], entry["height"], payload.layout
    else:
        width, height, layout = payload.width, payload.height, "manuel"
        rows = ["-" * width] * height
    cells = [{"x": x, "y": y, "char": "", "is_black": char == "x"}
             for y, row in enumerate(rows) for x, char in enumerate(row)]
    grid = {"width": width, "height": height, "layout": layout, "seed": None, "cells": cells,
            "words": words_from_cells(cells), "fill_ratio": 0.0, "wish_ratio": 0.0, "must_words": []}

    saved = SavedGrid(name=payload.name or f"{width}×{height} à la main du {datetime.now():%d/%m/%Y}",
                      layout_id=layout, width=width, height=height, seed=None, payload=grid, user_id=user.id)
    db.session.add(saved)
    db.session.commit()
    # Le même événement qu'une grille conservée, mêmes champs : rien de nouveau n'est mesuré (ADR 0016)
    usage.describe("grid", "saved", user=user, data={"format": f"{width}x{height}"})
    return jsonify(saved.summary()), 201


@main_bp.route('/grids/geometry', methods=['POST'])
@jwt_required()
def draw_geometry():
    """Une géométrie de style magazine tirée au hasard (#221) : le troisième départ du tutoriel de la grille à la main.

    Rangées au format du catalogue (`x` case définition, `-` case lettre), tirées par le moteur (`generate_geometry`) ;
    l'éditeur les pose ensuite comme toute modification de la grille, que l'on peut annuler. Rien n'est enregistré ici.
    """
    payload = parse_body(GeometryRequest)
    seed = payload.seed if payload.seed is not None else secrets.randbelow(2**31)
    try:
        rows = generate_geometry(payload.width, payload.height, seed)
    except GeometryError:
        return jsonify({
            "error": f"Le moteur ne sait pas dessiner de grille en {payload.width} × {payload.height} : "
                     "pars de la première ligne et de la première colonne, ou d'une grille vierge.",
            "reason": "geometry_unavailable",
        }), 422
    return jsonify({"rows": rows}), 200


def known_words(user, words: set[str]) -> set[str]:
    """Parmi ces mots, ceux que l'auteur peut considérer comme connus : le lexique, plus les siens.

    Un mot qu'il a lui-même ajouté à un dictionnaire n'a pas à être signalé comme inconnu — c'est
    précisément là qu'il range ce que le lexique n'a pas.
    """
    dela_trie = current_app.dela_trie
    known = {word for word in words if dela_trie and word in dela_trie.words}
    reste = words - known
    if user and reste:
        personnels = (PersonalWord.query
                      .join(Dictionary, PersonalWord.dictionary_id == Dictionary.id)
                      .filter(Dictionary.user_id == user.id, PersonalWord.mot.in_(reste))
                      .all())
        known |= {word.mot for word in personnels}
    return known


def dictionary_definitions(user, words: set[str]) -> dict[str, list[dict]]:
    """Les définitions que l'auteur a déjà écrites pour ces mots dans ses dictionnaires (#91).

    Proposées dans l'éditeur, jamais recopiées d'office. Une même définition rangée dans deux dictionnaires
    n'est proposée qu'une fois.
    """
    if not user or not words:
        return {}
    rows = (db.session.query(PersonalWord.mot, PersonalWord.definition, Dictionary.name)
            .join(Dictionary, PersonalWord.dictionary_id == Dictionary.id)
            .filter(Dictionary.user_id == user.id, PersonalWord.mot.in_(words),
                    PersonalWord.definition.isnot(None))
            .order_by(Dictionary.name, PersonalWord.id)
            .all())
    found: dict[str, list[dict]] = {}
    for mot, definition, dictionary in rows:
        texte = (definition or "").strip()
        if texte and texte not in {d["definition"] for d in found.get(mot, [])}:
            found.setdefault(mot, []).append({"definition": texte, "dictionary": dictionary})
    return found


def annotated_grid(user, grid: SavedGrid) -> dict:
    """La grille, ses flèches, et ce que le lexique dit de chacun de ses mots.

    Un mot **inachevé** — l'auteur a effacé des lettres pour retravailler la zone — n'est pas jugé :
    « P?RTE » n'est pas un mot inconnu, c'est un mot en cours.
    """
    data = grid.to_json()
    mots = data["grid"].get("words", [])
    termines = {word["text"] for word in mots if word.get("complete", HOLE not in word["text"])}
    connus = known_words(user, termines)
    for word in mots:
        word["in_lexicon"] = word["text"] in connus if word["text"] in termines else None
    data["grid"]["unknown_words"] = sorted(termines - connus)
    data["grid"]["dictionary_definitions"] = dictionary_definitions(user, termines)
    # Cases définitions déplacées par l'auteur : ce qui sort des conventions est signalé, pas refusé
    data["grid"]["layout_warnings"] = layout_warnings(data["grid"].get("cells", []))
    # Un numéro dont la case a perdu sa lettre, faute d'autre case pour lui : l'écran le dit (#218)
    data["grid"]["mystery"] = mystery_with_status(data["grid"].get("cells", []), grid.mystery)
    return data


@main_bp.route('/grids', methods=['GET'])
@jwt_required()
def list_grids():
    """Les grilles conservées, la plus récente d'abord, sans leurs cases.

    Les archivées sont écartées par défaut : elles restent en base, hors de la liste de travail.
    """
    user = get_current_user()
    query = SavedGrid.query.filter_by(user_id=user.id)
    archived = request.args.get('archived')
    if archived in ('true', 'false'):
        query = query.filter(SavedGrid.archived.is_(archived == 'true'))
    grids = query.order_by(SavedGrid.date_creation.desc(), SavedGrid.id.desc()).all()
    return jsonify([grid.summary() for grid in grids]), 200


@main_bp.route('/grids/<int:grid_id>', methods=['GET'])
@jwt_required()
def get_grid(grid_id):
    user = get_current_user()
    return jsonify(annotated_grid(user, get_owned_grid(user, grid_id))), 200


def shorter_suggestions(grid_cells: list[dict], slot: dict, motif: str, allowed: list[set[str]], posees: dict,
                        limite: int) -> dict:
    """Des mots plus courts que l'emplacement, chacun suivi d'une case définition (roadmap 5B).

    Sans eux, une grille vide se remplit de mots qui courent d'un bord à l'autre. Un mot de `k` lettres
    n'est proposé que si la case qui le suit est vide (elle deviendra case définition) et s'il ne laisse
    pas, au bout de l'emplacement, une lettre **isolée** : une lettre seule qui appartient à un mot dans
    l'autre sens est permise (retour de l'auteur). Les plus courants d'abord, toutes longueurs mêlées.
    """
    dela_trie = current_app.dela_trie
    positions = cells_of_slot(slot)
    perpendicular = "down" if slot["direction"] == "across" else "across"
    retenus = []
    for k in range(slot["length"] - 1, 1, -1):
        reste = slot["length"] - k - 1
        if posees.get(positions[k]):
            continue
        if reste == 1 and slot_at(grid_cells, positions[-1][0], positions[-1][1], perpendicular) is None:
            continue
        for mot in dela_trie.search_pattern(motif[:k], limit=limite * 10):
            if all(not lettres or mot[i] in lettres for i, lettres in enumerate(allowed[:k])):
                retenus.append(mot)
    retenus.sort(key=lambda mot: (-dela_trie.frequency(mot), mot))
    return {"pattern": motif, "allowed": ["".join(sorted(lettres)) for lettres in allowed],
            "words": retenus[:limite], "truncated": len(retenus) > limite,
            "current": "".join(posees.get(position) or HOLE for position in positions), "shorter": True}


@main_bp.route('/grids/<int:grid_id>/suggestions', methods=['POST'])
@jwt_required()
def grid_suggestions(grid_id):
    """Les mots qui entreraient à cet emplacement **sans casser ses croisements** (ADR 0012).

    C'est la cohérence d'arc du solveur ramenée à un seul emplacement : on calcule d'abord, case par
    case, les lettres qui laissent le mot perpendiculaire valide, puis on ne garde que les mots du
    lexique qui les respectent toutes. Proposer un mot qui casse un croisement ne rendrait service
    à personne.
    """
    user = get_current_user()
    grid = get_owned_grid(user, grid_id)
    payload = parse_body(SlotRef)
    dela_trie = current_app.dela_trie
    if not dela_trie:
        return jsonify({"error": "Dictionnaire principal non disponible."}), 503

    cells = (grid.payload or {}).get("cells", [])
    slot = slot_at(cells, payload.x, payload.y, payload.direction)
    if slot is None:
        return jsonify({"error": "Aucun mot ne passe par cette case dans ce sens."}), 404

    allowed = allowed_letters(cells, slot, lambda word: word in dela_trie.words)
    # Par défaut on **comble les trous** : les lettres déjà posées restent, seules les cases vides
    # sont à remplir. C'est le geste de l'auteur qui efface deux lettres pour retravailler une zone.
    # `keep_letters: false` propose au contraire de remplacer le mot entier.
    posees = letters_of(cells)
    motif = ""
    for index, position in enumerate(cells_of_slot(slot)):
        lettre = posees.get(position) or ""
        if payload.keep_letters and lettre:
            motif += lettre
        elif len(allowed[index]) == 1:
            # Une case dont le croisement n'admet qu'une lettre : autant la fixer dans le motif
            motif += next(iter(allowed[index]))
        else:
            motif += "?"

    limite = current_app.config['MAX_SUGGESTIONS']
    if payload.shorter:
        return jsonify(shorter_suggestions(cells, slot, motif, allowed, posees, limite)), 200
    candidats = dela_trie.search_pattern(motif, limit=limite * 20)
    retenus = [
        mot for mot in candidats
        if all(not lettres or mot[i] in lettres for i, lettres in enumerate(allowed))
    ]
    # Les mots les plus courants d'abord : ce sont ceux qu'un lecteur reconnaîtra
    retenus.sort(key=lambda mot: (-dela_trie.frequency(mot), mot))

    return jsonify({
        "pattern": motif,
        "allowed": ["".join(sorted(lettres)) for lettres in allowed],
        "words": retenus[:limite],
        "truncated": len(retenus) > limite,
        "current": "".join(posees.get(position) or HOLE for position in cells_of_slot(slot)),
        "keep_letters": payload.keep_letters,
    }), 200


@main_bp.route('/grids/<int:grid_id>', methods=['PATCH'])
@jwt_required()
def update_grid(grid_id):
    """Renomme une grille conservée, enregistre ses définitions, corrige ses lettres, pose ou retire son mot mystère."""
    grid = get_owned_grid(get_current_user(), grid_id)
    payload = parse_body(GridUpdateRequest)

    if payload.name is not None:
        grid.name = payload.name
    if payload.definitions is not None:
        # Une définition vidée disparaît : on ne garde pas de chaînes vides en base
        grid.definitions = {key: text for key, text in payload.definitions.items() if text}
    if payload.notes is not None:
        grid.notes = payload.notes
    if payload.archived is not None:
        grid.archived = payload.archived

    if payload.cells is not None or payload.blocks is not None:
        contenu = dict(grid.payload or {})
        words_before = contenu.get("words")
        cells, problemes = apply_blocks(contenu.get("cells", []),
                                        [edit.model_dump() for edit in payload.blocks or []])
        if not problemes:
            cells, problemes = apply_letters(cells, [edit.model_dump() for edit in payload.cells or []])
        if problemes:
            return jsonify({"error": "Modification refusée.", "details": problemes}), 400
        if payload.preview:
            return jsonify({"layout_warnings": layout_warnings(cells)}), 200
        contenu["cells"] = cells
        # Les mots se recalculent depuis les lettres : c'est la règle de l'ADR 0012
        contenu["words"] = words_from_cells(cells, contenu.get("words"))
        # Signal implicite pour la curation : un mot du lexique remplacé à la main (roadmap 1e)
        record_replaced_words(get_current_user(), words_before, contenu["words"])
        # Une grille trouée n'est plus pleine : le taux de remplissage doit le dire
        contenu["fill_ratio"] = fill_ratio(cells)
        grid.payload = contenu
        # Une lettre numérotée a changé : son numéro passe sur une autre case qui porte la bonne lettre, les
        # autres ne bougent pas. Sans case de rechange, il reste où il est, et l'écran le signale (#218).
        if grid.mystery and payload.mystery_word is None:
            mystery = grid.mystery
            try:
                positions = repair_mystery(cells, contenu["words"], mystery.get("word", ""),
                                           mystery_positions(mystery), mystery.get("seed"))
            except MissingLetters:
                positions = mystery_positions(mystery)  # données d'une autre forme : on n'y touche pas
            grid.mystery = mystery_json(mystery.get("word", ""), mystery.get("seed"), positions)

    if payload.mystery_word is not None:
        word, refusal = mystery_word_of(payload.mystery_word)
        if refusal:
            return refusal
        if not word:
            grid.mystery = None
        else:
            contenu = grid.payload or {}
            seed = payload.mystery_seed if payload.mystery_seed is not None else grid.seed
            try:
                positions = place_mystery(contenu.get("cells", []), contenu.get("words", []), word, seed)
            except MissingLetters as missing:
                return jsonify(missing_letters_error(
                    missing.missing, "Change une lettre de la grille, ou choisis un autre mot.")), 422
            grid.mystery = mystery_json(word, seed, positions)

    db.session.commit()
    if payload.cells is not None or payload.blocks is not None or payload.mystery_word is not None:
        return jsonify(annotated_grid(get_current_user(), grid)), 200
    return jsonify(grid.summary()), 200


@main_bp.route('/grids/<int:grid_id>', methods=['DELETE'])
@jwt_required()
def delete_grid(grid_id):
    grid = get_owned_grid(get_current_user(), grid_id)
    db.session.delete(grid)
    db.session.commit()
    return jsonify({'message': 'Grille supprimée.'}), 200


# --- COMPTE ---

@main_bp.route('/users/me', methods=['GET'])
@jwt_required()
def get_self():
    """Le compte connecté et ce qu'il contient : ce que sa suppression effacerait (#79)."""
    user = get_current_user()
    words = (db.session.query(db.func.count(PersonalWord.id))
             .join(Dictionary).filter(Dictionary.user_id == user.id).scalar())
    return jsonify({
        "email": user.email,
        "email_verified": user.email_verified_at is not None,
        "dictionaries": len(user.dictionaries),
        "words": words,
        "grids": len(user.grids),
    }), 200


# ROUTE RGPD : droit à l'effacement
@main_bp.route('/users/me', methods=['DELETE'])
@jwt_required()
def delete_self():
    """Supprime définitivement le compte de l'utilisateur et toutes ses données.

    Le mot de passe est redemandé : avec le jeton seul, quiconque l'aurait volé (le jeton vit dans le
    navigateur) pourrait effacer le compte. Un mauvais mot de passe répond 403 et non 401 : le frontend
    lit un 401 comme une session expirée et déconnecterait l'utilisateur.
    """
    user = get_current_user()
    payload = parse_body(AccountDeletionRequest)
    if not password_matches(user.password, payload.password):
        return jsonify({"error": "Mot de passe incorrect."}), 403
    # Suppression via l'ORM : la cascade User -> Dictionary -> PersonalWord efface aussi
    # dictionnaires et mots (une suppression SQL en masse laissait les mots orphelins).
    # Les événements d'usage liés au compte partent avec lui (ADR 0016).
    UsageEvent.query.filter_by(user_id=user.id).delete()
    WordSuggestion.query.filter_by(user_id=user.id).delete()
    ContactMessage.query.filter_by(user_id=user.id).delete()
    # Les mises en page proposées avant le retrait de la proposition (#221) restent en base : elles partent avec le compte
    LayoutProposal.query.filter_by(user_id=user.id).delete()
    db.session.delete(user)
    db.session.commit()
    usage.describe("account", "delete")
    response = jsonify({"message": "Ton compte et toutes tes données ont été supprimés avec succès."})
    unset_jwt_cookies(response)  # les jetons d'un compte supprimé sont refusés : autant effacer les cookies
    return response, 200
