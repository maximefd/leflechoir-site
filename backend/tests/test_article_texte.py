"""Édition du texte des articles dans la page (ADR 0027) : ouverte en développement, fermée sans dossier
monté, sans création ni traversée de chemin. Le dépôt reste la vérité : le PUT réécrit le fichier."""

import json
from datetime import datetime, timezone

import pytest

from extensions import db
from models import User
from tests.helpers import register, send

# Le même contenu que textes/<slug>.json, en version d'essai
TEXTE_ESSAI = {
    "title": "Un article d’essai",
    "description": "La description qui part dans les moteurs.",
    "chapo": "Le chapeau, sous le titre.",
    "sections": [
        {"id": "premiere-section", "title": "Première section", "paragraphs": ["Un paragraphe.", "Un autre."]},
        {"id": "seconde-section", "title": "Seconde section", "paragraphs": ["Encore un."]},
    ],
}
SLUG_ESSAI = "article-essai"


@pytest.fixture
def dossier_textes(test_app, tmp_path, monkeypatch):
    """Un dossier de textes provisoire, monté comme le fait le conteneur de développement."""
    dossier = tmp_path / "textes"
    dossier.mkdir()
    (dossier / f"{SLUG_ESSAI}.json").write_text(json.dumps(TEXTE_ESSAI, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setitem(test_app.config, "TEXTES_DIR", str(dossier))
    return dossier


@pytest.fixture
def admin_headers(client):
    """L'auteur : un compte vérifié administrateur, authentifié par jeton."""
    email, tokens = register(client)
    with client.application.app_context():
        user = User.query.filter_by(email=email).one()
        user.email_verified_at = datetime.now(timezone.utc).replace(tzinfo=None)
        user.is_admin = True
        db.session.commit()
    return {"Authorization": f"Bearer {tokens['access_token']}"}


# --- L'adresse n'existe que pour l'auteur -----------------------------------------------------------


def test_en_developpement_sans_compte(client, dossier_textes):
    """Retour de l'auteur du 07/10/2026 : en développement, le rôle d'administrateur n'ajoutait rien."""
    response = send(client, "get", f"/api/articles/{SLUG_ESSAI}/texte")
    assert response.status_code == 200
    relu = {**TEXTE_ESSAI, "chapo": "Un chapeau repris sans compte."}
    assert send(client, "put", f"/api/articles/{SLUG_ESSAI}/texte", relu).status_code == 200
    sur_disque = json.loads((dossier_textes / f"{SLUG_ESSAI}.json").read_text(encoding="utf-8"))
    assert sur_disque["chapo"] == "Un chapeau repris sans compte."


def test_en_production_404_meme_avec_un_dossier(client, dossier_textes, monkeypatch):
    monkeypatch.setitem(client.application.config, "APP_ENV", "production")
    for method in ("get", "put"):
        response = send(client, method, f"/api/articles/{SLUG_ESSAI}/texte", TEXTE_ESSAI)
        assert response.status_code == 404
    sur_disque = json.loads((dossier_textes / f"{SLUG_ESSAI}.json").read_text(encoding="utf-8"))
    assert sur_disque == TEXTE_ESSAI


# --- Édition fermée sans dossier monté (la production) ---------------------------------------------


def test_sans_dossier_monte_edition_indisponible(client, admin_headers):
    response = send(client, "get", f"/api/articles/{SLUG_ESSAI}/texte", headers=admin_headers)
    assert response.status_code == 404
    assert response.get_json()["reason"] == "edition_unavailable"
    response = send(client, "put", f"/api/articles/{SLUG_ESSAI}/texte", TEXTE_ESSAI, headers=admin_headers)
    assert response.status_code == 404
    assert response.get_json()["reason"] == "edition_unavailable"


# --- Lecture ---------------------------------------------------------------------------------------


def test_admin_lit_le_texte(client, dossier_textes, admin_headers):
    response = send(client, "get", f"/api/articles/{SLUG_ESSAI}/texte", headers=admin_headers)
    assert response.status_code == 200
    corps = response.get_json()
    assert corps["slug"] == SLUG_ESSAI
    assert corps["texte"] == TEXTE_ESSAI


def test_slug_inconnu(client, dossier_textes, admin_headers):
    response = send(client, "get", "/api/articles/n-article-de-ce-nom/texte", headers=admin_headers)
    assert response.status_code == 404
    assert response.get_json()["reason"] == "unknown_article"


def test_pas_de_traversee_de_chemin(client, dossier_textes, admin_headers):
    # Le routage lui-même refuse l'URL traversante : « %2f » devient un séparateur, aucune route ne correspond
    # et le 404 générique répond avant le blueprint
    response = send(client, "get", "/api/articles/..%2f..%2fetc%2fpasswd/texte", headers=admin_headers)
    assert response.status_code == 404
    # Un slug qui ne colle pas au motif atteint le blueprint, qui le traite en article inconnu
    response = send(client, "get", "/api/articles/Article-En-Majuscules/texte", headers=admin_headers)
    assert response.status_code == 404
    assert response.get_json()["reason"] == "unknown_article"


# --- Écriture --------------------------------------------------------------------------------------


def test_admin_reecrit_le_texte(client, dossier_textes, admin_headers):
    relu = json.loads(json.dumps(TEXTE_ESSAI))  # copie profonde
    relu["chapo"] = "Le chapeau repris depuis le téléphone."
    relu["sections"][0]["paragraphs"].append("La phrase rajoutée.")
    response = send(client, "put", f"/api/articles/{SLUG_ESSAI}/texte", relu, headers=admin_headers)
    assert response.status_code == 200
    assert response.get_json()["ok"] is True

    # Le fichier du dépôt porte exactement le texte relu (le diff, c'est lui)
    sur_disque = json.loads((dossier_textes / f"{SLUG_ESSAI}.json").read_text(encoding="utf-8"))
    assert sur_disque == relu
    # Et la relecture rend la même chose
    response = send(client, "get", f"/api/articles/{SLUG_ESSAI}/texte", headers=admin_headers)
    assert response.get_json()["texte"] == relu


def test_ecriture_sur_slug_inconnu_refusee(client, dossier_textes, admin_headers):
    response = send(client, "put", "/api/articles/n-article-de-ce-nom/texte", TEXTE_ESSAI, headers=admin_headers)
    assert response.status_code == 404
    assert response.get_json()["reason"] == "unknown_article"
    assert list(dossier_textes.iterdir()) == [dossier_textes / f"{SLUG_ESSAI}.json"]


def test_corps_invalide_refuse(client, dossier_textes, admin_headers):
    # Un titre manque, une section n'a plus de paragraphe, une ancre se répète : trois refus, fichier intact
    sans_titre = {**TEXTE_ESSAI}
    del sans_titre["title"]
    vide = {**TEXTE_ESSAI, "sections": [{**TEXTE_ESSAI["sections"][0], "paragraphs": []}]}
    ancre_double = {**TEXTE_ESSAI, "sections": [TEXTE_ESSAI["sections"][0], TEXTE_ESSAI["sections"][0]]}
    for corps in (sans_titre, vide, ancre_double):
        response = send(client, "put", f"/api/articles/{SLUG_ESSAI}/texte", corps, headers=admin_headers)
        assert response.status_code == 400, (corps, response.get_json())
    sur_disque = json.loads((dossier_textes / f"{SLUG_ESSAI}.json").read_text(encoding="utf-8"))
    assert sur_disque == TEXTE_ESSAI


# --- Les notes de relecture (ADR 0027) ---------------------------------------------------------------


@pytest.fixture
def dossier_notes(test_app, tmp_path, monkeypatch):
    """Un dossier d'annotations provisoire, monté comme le conteneur de développement."""
    dossier = tmp_path / "annotations"
    dossier.mkdir()
    monkeypatch.setitem(test_app.config, "NOTES_DIR", str(dossier))
    return dossier


def test_les_notes_se_lisent_et_se_gardent(client, dossier_textes, dossier_notes):
    response = send(client, "get", f"/api/articles/{SLUG_ESSAI}/notes")
    assert response.status_code == 200
    assert response.get_json()["notes"] == {}

    notes = {"premiere-section": "Vérifier la date de ce paragraphe.", "_article": "Trop long dans l’ensemble."}
    response = send(client, "put", f"/api/articles/{SLUG_ESSAI}/notes", {"notes": notes})
    assert response.status_code == 200
    assert response.get_json()["ok"] is True

    # Les notes vivent hors du dépôt du site : dans leur dossier à elles
    sur_disque = json.loads((dossier_notes / f"{SLUG_ESSAI}.json").read_text(encoding="utf-8"))
    assert sur_disque == {"notes": notes}
    assert list(dossier_textes.iterdir()) == [dossier_textes / f"{SLUG_ESSAI}.json"]
    response = send(client, "get", f"/api/articles/{SLUG_ESSAI}/notes")
    assert response.get_json()["notes"] == notes


def test_une_note_vide_disparait(client, dossier_textes, dossier_notes):
    send(client, "put", f"/api/articles/{SLUG_ESSAI}/notes", {"notes": {"premiere-section": "À garder."}})
    send(client, "put", f"/api/articles/{SLUG_ESSAI}/notes",
         {"notes": {"premiere-section": "À garder.", "seconde-section": "   "}})
    response = send(client, "get", f"/api/articles/{SLUG_ESSAI}/notes")
    assert response.get_json()["notes"] == {"premiere-section": "À garder."}
    # Tout vidé : plus rien à noter, plus de fichier — le dossier ne garde que le travail en cours
    send(client, "put", f"/api/articles/{SLUG_ESSAI}/notes", {"notes": {"premiere-section": ""}})
    assert not (dossier_notes / f"{SLUG_ESSAI}.json").exists()
    response = send(client, "get", f"/api/articles/{SLUG_ESSAI}/notes")
    assert response.get_json()["notes"] == {}


def test_cle_de_note_inattendue_refusee(client, dossier_textes, dossier_notes):
    # Une note s'accroche à une section (ou à l'article) : rien d'autre
    response = send(client, "put", f"/api/articles/{SLUG_ESSAI}/notes", {"notes": {"Pas Une Clé": "quoi"}})
    assert response.status_code == 400
    assert not (dossier_notes / f"{SLUG_ESSAI}.json").exists()


def test_notes_sur_slug_inconnu_refusees(client, dossier_textes, dossier_notes):
    response = send(client, "put", "/api/articles/n-article-de-ce-nom/notes", {"notes": {"_article": "x"}})
    assert response.status_code == 404
    assert response.get_json()["reason"] == "unknown_article"
    assert list(dossier_notes.iterdir()) == []


def test_sans_dossier_de_notes_edition_indisponible(client, dossier_textes):
    response = send(client, "get", f"/api/articles/{SLUG_ESSAI}/notes")
    assert response.status_code == 404
    assert response.get_json()["reason"] == "edition_unavailable"
    response = send(client, "put", f"/api/articles/{SLUG_ESSAI}/notes", {"notes": {"_article": "x"}})
    assert response.status_code == 404
    assert response.get_json()["reason"] == "edition_unavailable"
