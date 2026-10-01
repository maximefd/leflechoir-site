"""Suggestions de mots (roadmap 1e, #144, #145) : un clic, on compte des personnes, l'auteur décide."""

import json

import pytest

import suggestions
from extensions import db
from models import User, WordSuggestion

from tests.helpers import auth_headers, register, send

BROWSER = {"User-Agent": "Mozilla/5.0 (test)"}


@pytest.fixture(autouse=True)
def clean(test_app):
    WordSuggestion.query.delete()
    db.session.commit()
    yield


def suggest(client, word, kind="remove", source="search", headers=None):
    return send(client, "post", "/api/suggestions", {"kind": kind, "word": word, "source": source},
                {**BROWSER, **(headers or {})})


def test_anyone_can_flag_a_word_in_one_click(client):
    response = suggest(client, "abaca")

    assert response.status_code == 201
    [row] = WordSuggestion.query.all()
    assert (row.kind, row.word, row.display, row.lang, row.source, row.status) == (
        "remove", "ABACA", "abaca", "fr", "search", "pending")
    assert row.user_id is None and row.visitor  # sans compte : l'empreinte du jour


def test_with_an_account_the_account_counts_not_the_fingerprint(client):
    headers = auth_headers(client)
    suggest(client, "porte-monnaie", kind="add", source="search_empty", headers=headers)

    [row] = WordSuggestion.query.all()
    assert (row.word, row.kind) == ("PORTEMONNAIE", "add")
    assert row.user_id is not None and row.visitor is None


@pytest.mark.parametrize("body", [
    {"kind": "supprimer", "word": "chat", "source": "search"},
    {"kind": "remove", "word": "chat", "source": "ailleurs"},
    {"kind": "remove", "word": "x", "source": "search"},
    {"kind": "remove", "word": "<script>", "source": "search"},
])
def test_invalid_suggestions_are_refused(client, body):
    assert send(client, "post", "/api/suggestions", body, BROWSER).status_code == 400
    assert WordSuggestion.query.count() == 0


def test_people_are_counted_not_clicks(test_app, client):
    alice, bob = auth_headers(client), auth_headers(client)
    for _ in range(3):
        suggest(client, "abaca", headers=alice)
    suggest(client, "Abaca", headers=bob)
    suggest(client, "zythum", headers=bob)

    groups = {g["word"]: g for g in suggestions.grouped() if g["kind"] == "remove"}
    assert groups["ABACA"]["people"] == 2
    assert groups["ZYTHUM"]["people"] == 1
    assert [g["word"] for g in suggestions.grouped() if g["kind"] == "remove"][0] == "ABACA"


def test_contributors_see_what_became_of_their_suggestions(client):
    headers = auth_headers(client)
    suggest(client, "abaca", headers=headers)
    suggest(client, "abaca", headers=headers)
    suggest(client, "tartempion", kind="add", source="search_empty", headers=headers)

    assert suggestions.apply_decisions([{"kind": "remove", "word": "ABACA", "decision": "accepted"},
                                        {"kind": "add", "word": "TARTEMPION", "decision": "rejected"}]) == 3

    mine = send(client, "get", "/api/suggestions/mine", None, headers).get_json()["suggestions"]
    assert sorted((s["word"], s["status"]) for s in mine) == [("ABACA", "accepted"), ("TARTEMPION", "rejected")]
    assert suggestions.grouped() == []  # plus rien en attente


def test_mine_needs_an_account(client):
    assert client.get("/api/suggestions/mine").status_code == 401


def test_a_generated_word_replaced_by_hand_is_an_implicit_signal(test_app, client):
    email, _ = register(client)
    user = User.query.filter_by(email=email).one()
    before = [{"x": 0, "y": 0, "direction": "across", "text": "ABACA", "source": "common"},
              {"x": 0, "y": 1, "direction": "across", "text": "CHAT", "source": "must"}]
    after = [{"x": 0, "y": 0, "direction": "across", "text": "ABATS", "source": "manuel"},
             {"x": 0, "y": 1, "direction": "across", "text": "CHAT", "source": "must"}]

    suggestions.record_replaced_words(user, before, after)
    # La frappe suivante ne compte plus : le mot en place est désormais « manuel »
    suggestions.record_replaced_words(user, after, after)
    db.session.commit()

    [row] = WordSuggestion.query.all()
    assert (row.kind, row.word, row.source, row.user_id) == ("remove", "ABACA", "editor_replaced", user.id)


def test_a_word_in_several_personal_dictionaries_is_proposed_from_two_people(client):
    first = auth_headers(client)
    first_dictionary = send(client, "get", "/api/dictionaries", None, first).get_json()[0]["id"]
    send(client, "post", f"/api/dictionaries/{first_dictionary}/words", {"mot": "Kouign-amann"}, first)
    assert not [g for g in suggestions.grouped() if g["word"] == "KOUIGNAMANN"]

    second = auth_headers(client)
    second_dictionary = send(client, "get", "/api/dictionaries", None, second).get_json()[0]["id"]
    send(client, "post", f"/api/dictionaries/{second_dictionary}/words", {"mot": "kouign amann"}, second)
    [group] = [g for g in suggestions.grouped() if g["word"] == "KOUIGNAMANN"]
    assert (group["kind"], group["people"], group["sources"]) == ("add", 2, {"dictionaries": 2})


def test_suggestions_disappear_with_the_account(client):
    headers = auth_headers(client)
    suggest(client, "abaca", headers=headers)
    assert send(client, "delete", "/api/users/me", {"password": "password123"},
                headers).status_code == 200
    assert WordSuggestion.query.count() == 0


def test_the_curator_exports_and_the_decisions_come_back(test_app, client, runner):
    suggest(client, "abaca")
    exported = json.loads(runner.invoke(args=["suggestions", "export"]).output)
    assert exported["lang"] == "fr"
    # La base du module garde les dictionnaires des tests précédents : on regarde les retraits
    assert [(g["kind"], g["word"], g["people"]) for g in exported["suggestions"] if g["kind"] == "remove"] == [
        ("remove", "ABACA", 1)]

    applied = runner.invoke(args=["suggestions", "apply"],
                            input=json.dumps({"decisions": [{"kind": "remove", "word": "ABACA", "decision": "rejected"}]}))
    assert "1 statut" in applied.output
    assert WordSuggestion.query.one().status == "rejected"
