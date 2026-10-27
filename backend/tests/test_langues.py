"""Le socle « moteur et API » de l'international (ADR 0031) : un site = une langue = une API.

Le français ne change pas (les valeurs du moteur d'avant ; `make bench` le vérifie sur 20 graines). L'allemand
normalise Ä → AE, Ö → OE, Ü → UE, ß → SS ; la langue part dans les réponses, et le client ne la choisit jamais.
"""

import pytest

from app import create_app
from engine.difficulty import RARE_LETTERS, request_difficulty, word_difficulty
from engine.grid_edit import allowed_letters
from engine.grid_solver import GridSolver
from engine.langues import DE, EN, FR, LANGUES, langue
from normalization import normalize_pattern, normalize_phrase, normalize_word

from tests.helpers import send
from tests.test_grid_edit import PETITE
from engine.grid_edit import slot_at


def test_french_keeps_the_values_of_the_engine_before_languages():
    assert GridSolver.LETTER_SCORES == FR.scores
    assert FR.scores["E"] == 13 and FR.scores["K"] == 0 and FR.scores["Z"] == 1
    assert RARE_LETTERS == FR.lettres_rares == frozenset("ZWKXQYJ")
    assert FR.difficulte_mesuree


@pytest.mark.parametrize("code", ["fr", "de", "en"])
def test_every_language_scores_its_whole_alphabet(code):
    assert set(LANGUES[code].scores) == set(LANGUES[code].alphabet)
    assert LANGUES[code].lettres_rares <= set(LANGUES[code].alphabet)


def test_an_unknown_language_is_a_configuration_error():
    with pytest.raises(ValueError, match="Langue inconnue"):
        langue("xx")


@pytest.mark.parametrize("text, fr, de", [
    ("Größe", "GROSSE", "GROESSE"),
    ("Müller", "MULLER", "MUELLER"),
    ("Ölkännchen", "OLKANNCHEN", "OELKAENNCHEN"),
    ("STRAẞE", "STRASSE", "STRASSE"),
    ("cœur", "COEUR", "COEUR"),
    ("l'été", "LETE", "LETE"),
    ("Ñandú", "NANDU", "NANDU"),
])
def test_words_are_normalized_by_language(text, fr, de):
    assert normalize_word(text, "fr") == fr
    assert normalize_word(text, "de") == de
    assert normalize_word(text, "en") == fr


def test_patterns_and_phrases_follow_the_language():
    assert normalize_pattern("Mü??er", "de") == "MUE??ER"
    assert normalize_phrase("Schöne Grüße", "de") == "SCHOENE GRUESSE"


def test_rare_letters_and_measured_tables_depend_on_the_language():
    assert word_difficulty("KAYAK")["rare_letters"] == ["K", "Y"]
    assert word_difficulty("KAYAK", DE)["rare_letters"] == ["Y"]
    assert word_difficulty("QUIZ", EN)["rare_letters"] == ["Q", "Z"]
    # Les tables sont mesurées sur le français : ailleurs, l'estimation le dit
    assert request_difficulty(["MAISON"], None, FR)["measured"] is True
    assert request_difficulty(["HAUS"], None, DE)["measured"] is False


def test_the_editor_proposes_only_letters_of_the_alphabet_it_is_given():
    lexique = {"AS", "OS", "AL", "OL", "ILE", "SE"}
    slot = slot_at(PETITE, 1, 0, "across")

    assert allowed_letters(PETITE, slot, lambda word: word in lexique)[0] == {"A", "O"}
    # Un alphabet sans O (une langue dont les mots n'en auraient pas) : seul A reste
    assert allowed_letters(PETITE, slot, lambda word: word in lexique, "ABCDEFGHIJKLMNPQRSTUVWXYZ")[0] == {"A"}


def test_the_site_language_goes_out_with_the_responses(client):
    response = client.get("/api/status")

    assert response.headers["Content-Language"] == "fr"
    assert response.get_json()["lang"] == "fr" and response.get_json()["site"] == "fr"


def test_search_results_carry_the_language(client):
    response = send(client, "post", "/api/search", {"mask": "CH?T"})

    assert response.status_code in (200, 503)
    if response.status_code == 200:
        assert response.get_json()["lang"] == "fr"


def test_a_site_in_an_unknown_language_does_not_start():
    with pytest.raises(ValueError, match="Langue inconnue"):
        create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite://", "SITE_LANG": "xx",
                    "LEXICON_LOAD": False})


def test_a_german_site_normalizes_the_german_way():
    import normalization
    try:
        create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite://", "SITE_LANG": "de", "SITE": "de",
                    "LEXICON_LOAD": False})
        assert normalize_word("Größe") == "GROESSE"
    finally:
        normalization.definir_langue("fr")
    assert normalize_word("Größe") == "GROSSE"
