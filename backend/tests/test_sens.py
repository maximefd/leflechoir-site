"""« Le sens des mots » (ADR 0028) : le sens d'un mot tiré du Wiktionnaire, jamais une définition de case."""

import sqlite3

import pytest

from tests.helpers import send

SCHEMA = """
CREATE TABLE sens (lang TEXT, lemme_norm TEXT, cle TEXT, lemme TEXT, rang INTEGER, texte TEXT);
CREATE TABLE formes (lang TEXT, norm TEXT, lemme_norm TEXT, cle TEXT);
"""


@pytest.fixture()
def sens_file(test_app, tmp_path):
    path = tmp_path / "sens.sqlite"
    with sqlite3.connect(path) as db:
        db.executescript(SCHEMA)
        db.executemany("INSERT INTO sens VALUES (?, ?, ?, ?, ?, ?)", [
            ("fr", "ADRET", "", "adret", 1, "Versant d’une montagne le mieux exposé au soleil."),
            ("fr", "ULULER", "", "ululer", 1, "Crier, en parlant des oiseaux de nuit."),
            ("fr", "NOYER", "", "noyer", 1, "Arbre à noix."),
            ("fr", "NOYER", "verb", "noyer", 1, "Asphyxier par immersion."),
            ("fr", "NOYER", "verb", "noyer", 2, "Remplir un moteur de liquide."),
            ("en", "ADRET", "", "adret", 1, "Sunny slope."),
        ])
        db.executemany("INSERT INTO formes VALUES (?, ?, ?, ?)", [
            ("fr", "ADRET", "ADRET", ""), ("fr", "ULULENT", "ULULER", ""), ("fr", "NOYANT", "NOYER", "verb"),
            ("en", "ADRET", "ADRET", ""),
        ])
    previous = test_app.config.get("SENS_PATH")
    test_app.config["SENS_PATH"] = str(path)
    yield path
    test_app.config["SENS_PATH"] = previous


def ask(client, words):
    return send(client, "post", "/api/sens", {"mots": words})


def test_le_sens_des_mots_de_la_grille(client, sens_file):
    response = ask(client, ["ADRET", "ululent", "NOYANT", "INCONNU"])

    assert response.status_code == 200
    body = response.get_json()
    assert body["source"] == "Wiktionnaire" and body["licence"] == "CC BY-SA 4.0"
    assert body["sens"] == {
        "ADRET": {"lemme": "adret", "textes": ["Versant d’une montagne le mieux exposé au soleil."]},
        # Une forme fléchie prend le sens de son lemme, et de sa nature : NOYANT, le verbe
        "ULULENT": {"lemme": "ululer", "textes": ["Crier, en parlant des oiseaux de nuit."]},
        "NOYANT": {"lemme": "noyer", "textes": ["Asphyxier par immersion.", "Remplir un moteur de liquide."]},
    }
    assert "max-age" in response.headers["Cache-Control"]


def test_trop_de_mots(client, sens_file):
    response = ask(client, ["ADRET"] * 201)

    assert response.status_code == 400
    assert response.get_json()["reason"] == "too_many_words"


def test_sans_fichier_des_sens_le_site_s_en_passe(client, test_app, tmp_path):
    previous = test_app.config.get("SENS_PATH")
    test_app.config["SENS_PATH"] = str(tmp_path / "absent.sqlite")
    try:
        response = ask(client, ["ADRET"])
    finally:
        test_app.config["SENS_PATH"] = previous

    assert response.status_code == 503
    assert response.get_json()["reason"] == "senses_unavailable"


def test_corps_invalide(client, sens_file):
    assert ask(client, []).status_code == 400
    assert send(client, "post", "/api/sens", {"mots": "ADRET"}).status_code == 400


def test_la_recherche_donne_le_sens_a_part_de_la_definition(client, test_app, sens_file, small_trie):
    test_app.dela_trie = small_trie
    try:
        response = send(client, "post", "/api/search", {"mask": "ADRET"})
    finally:
        test_app.dela_trie = None

    [result] = [r for r in response.get_json()["results"] if r["mot"] == "ADRET"]
    # `definition` reste réservée aux dictionnaires personnels : le sens du Wiktionnaire n'y entre jamais
    assert result["definition"] is None
    assert result["sens"] == {"lemme": "adret", "textes": ["Versant d’une montagne le mieux exposé au soleil."]}
