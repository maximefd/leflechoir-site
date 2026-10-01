"""Une seule normalisation des mots (#127) : lexique, recherche, mots imposés, dictionnaires, suggestions."""

import importlib.util
from pathlib import Path

import pytest
from sqlalchemy import text

from extensions import db
from normalization import normalize_pattern, normalize_word
from trie_engine import DictionnaireTrie

from tests.helpers import auth_headers, send

MIGRATION = Path(__file__).resolve().parents[1] / "migrations" / "versions" / "0009_normalisation_unique.py"


@pytest.mark.parametrize("typed, expected", [
    ("porte-monnaie", "PORTEMONNAIE"),
    ("Porte monnaie", "PORTEMONNAIE"),
    ("aujourd'hui", "AUJOURDHUI"),
    ("aujourd’hui", "AUJOURDHUI"),
    ("cœur", "COEUR"),
    ("Œuvre", "OEUVRE"),
    ("ex æquo", "EXAEQUO"),
    ("à l'été", "ALETE"),
    (None, ""),
])
def test_one_form_for_every_way_of_typing_a_word(typed, expected):
    assert normalize_word(typed) == expected
    # Le lexique (Trie) et l'API ne peuvent plus diverger
    assert DictionnaireTrie._normalize(typed) == expected


def test_a_pattern_keeps_its_unknown_letters():
    assert normalize_pattern("porte-?onnaie") == "PORTE?ONNAIE"
    assert normalize_pattern("c?ur") == "C?UR"


def test_a_personal_word_is_stored_in_the_common_form_and_found_by_a_pattern(test_app, client, small_trie, monkeypatch):
    monkeypatch.setattr(test_app, "dela_trie", small_trie)
    headers = auth_headers(client)
    dictionary_id = send(client, "get", "/api/dictionaries", None, headers).get_json()[0]["id"]

    added = send(client, "post", f"/api/dictionaries/{dictionary_id}/words", {"mot": "porte-monnaie"}, headers)
    assert added.status_code == 201
    assert (added.get_json()["mot"], added.get_json()["mot_affiche"]) == ("PORTEMONNAIE", "porte-monnaie")
    # Écrit autrement, c'est le même mot
    assert send(client, "post", f"/api/dictionaries/{dictionary_id}/words", {"mot": "Porte monnaie"}, headers).status_code == 409

    found = send(client, "post", "/api/search", {"mask": "porte-?onnaie"}, headers).get_json()["results"]
    assert "PORTEMONNAIE" in [word["mot"] for word in found]


def test_the_migration_normalizes_existing_words_and_merges_duplicates(test_app, client):
    headers = auth_headers(client)
    dictionary_id = send(client, "get", "/api/dictionaries", None, headers).get_json()[0]["id"]
    rows = [("PORTE-MONNAIE", "porte-monnaie", ""), ("PORTEMONNAIE", "portemonnaie", "Petite bourse"),
            ("CŒUR", "cœur", "Organe"), ("CHAT", "chat", "")]
    for position, (mot, affiche, definition) in enumerate(rows):
        db.session.execute(text(
            "INSERT INTO personal_word (mot, mot_affiche, definition, dictionary_id, date_ajout) "
            f"VALUES (:m, :a, :d, :i, '2026-09-0{position + 1} 10:00:00')"
        ), {"m": mot, "a": affiche, "d": definition, "i": dictionary_id})
    db.session.commit()

    spec = importlib.util.spec_from_file_location("migration_0009", MIGRATION)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with db.engine.begin() as connection:
        migration.normalize_personal_words(connection)
    db.session.expire_all()

    words = db.session.execute(text(
        "SELECT mot, mot_affiche, definition FROM personal_word WHERE dictionary_id = :i ORDER BY mot"
    ), {"i": dictionary_id}).fetchall()
    # Le plus ancien reste, avec la définition du doublon qu'il n'avait pas
    assert [tuple(row) for row in words] == [
        ("CHAT", "chat", ""), ("COEUR", "cœur", "Organe"), ("PORTEMONNAIE", "porte-monnaie", "Petite bourse"),
    ]
