"""Tableaux du poste de pilotage (#129) : évolution par jour, parcours, format × issue, mots imposés, seuils.

Tout se calcule sur les événements déjà collectés : aucun champ nouveau (ADR 0016)."""

import json
import os
import re
from datetime import datetime, timedelta
from pathlib import Path

import pytest

import stats
import usage_demo
from extensions import db
from models import UsageEvent, User, VisitorSalt

from tests.helpers import register

NOW = datetime(2026, 10, 1, 15, 30)


@pytest.fixture(autouse=True)
def clean_usage(test_app):
    UsageEvent.query.delete()
    VisitorSalt.query.delete()
    db.session.commit()
    yield


def add(kind, outcome=None, status=200, days_ago=0, visitor="a" * 32, data=None, duration_ms=100, country="FR",
        route=None):
    db.session.add(UsageEvent(created_at=NOW - timedelta(days=days_ago, minutes=5), kind=kind, outcome=outcome,
                              status=status, route=route, site="fr", lang="fr", country=country, visitor=visitor,
                              duration_ms=duration_ms, cpu_ms=duration_ms, data=data or {}))


def generation(outcome, status=200, fmt="6x7", must=(), **kwargs):
    add("generation", outcome, status, route="/api/grids/generate",
        data={"format": fmt, "must": [{"length": length, "known": True} for length in must]}, **kwargs)


def figures() -> dict:
    db.session.commit()
    return stats.as_json(stats.compute(now=NOW))


# --- Seuils en trois états ---

@pytest.mark.parametrize("value, level", [(None, "unknown"), (0, "ok"), (11_999, "ok"), (12_000, "near"),
                                          (15_000, "near"), (15_001, "over")])
def test_a_threshold_turns_orange_at_80_percent_and_red_beyond(value, level):
    assert stats._level(value, 15_000) == level


def test_thresholds_are_given_for_30_and_7_days(test_app):
    generation("grid", duration_ms=16_000, days_ago=20)  # il y a 20 jours : hors des 7 derniers
    generation("grid", duration_ms=13_000, days_ago=1)
    for _ in range(8):
        generation("grid", duration_ms=2_000, days_ago=1)
    generation("busy_server", 429, days_ago=20)

    thresholds = figures()["thresholds"]

    assert (thresholds["p95_ms"], thresholds["p95_level"]) == (16_000, "over")
    assert (thresholds["week"]["p95_ms"], thresholds["week"]["p95_level"]) == (13_000, "near")
    assert thresholds["busy_level"] == "over" and thresholds["week"]["busy_level"] == "ok"
    assert thresholds["near_share"] == 0.8


def test_without_any_generation_the_thresholds_are_unknown_not_green(test_app):
    thresholds = figures()["thresholds"]

    assert (thresholds["p95_level"], thresholds["busy_level"]) == ("unknown", "unknown")


# --- Évolution par jour ---

def test_the_daily_series_covers_30_days_empty_days_included(test_app):
    add("search", "results", visitor="a" * 32)
    add("search", "results", visitor="a" * 32)
    add("search", "results", visitor="b" * 32)
    generation("grid", visitor="b" * 32, duration_ms=900)
    generation("busy_server", 429, days_ago=3)
    add("account", "register", 201, days_ago=3)
    add("grid", "saved", 201, days_ago=3)
    add("error", None, 500, days_ago=3, route="/api/grids")
    add("search", "results", days_ago=45)  # hors de la fenêtre

    daily = figures()["daily"]

    assert len(daily) == 30
    assert (daily[0]["day"], daily[-1]["day"]) == ("2026-09-02", "2026-10-01")
    assert daily[-1] == {"day": "2026-10-01", "visitors": 2, "searches": 3, "generations": 1, "grids": 1, "busy": 0,
                         "registers": 0, "saved": 0, "errors": 0, "server_errors": 0, "p95": 900}
    assert daily[-4] == {"day": "2026-09-28", "visitors": 1, "searches": 0, "generations": 1, "grids": 0, "busy": 1,
                         "registers": 1, "saved": 1, "errors": 2, "server_errors": 1, "p95": None}
    assert daily[-2]["visitors"] == 0 and daily[-2]["p95"] is None


# --- Parcours ---

def test_the_funnel_counts_visitors_of_a_day_at_each_step(test_app):
    reader, searcher, maker, keeper = ("1" * 32, "2" * 32, "3" * 32, "4" * 32)
    add("error", None, 401, visitor=reader, route="/api/users/me")  # une visite sans recherche ni génération
    add("search", "results", visitor=searcher)
    generation("timeout", 422, visitor=maker)
    generation("grid", visitor=keeper)
    add("account", "register", 201, visitor=keeper)
    add("grid", "saved", 201, visitor=keeper)
    # La même empreinte un autre jour est un autre visiteur : elle ne vit qu'un jour
    add("search", "results", visitor=searcher, days_ago=2)
    add("search", "results", visitor=searcher, days_ago=12)

    periods = {period["label"]: period["funnel"] for period in figures()["periods"]}

    assert periods["Aujourd'hui"] == {"visits": 4, "active": 3, "searched": 1, "generated": 2, "grid": 1,
                                      "registered": 1, "saved": 1}
    assert (periods["7 jours"]["visits"], periods["7 jours"]["searched"]) == (5, 2)
    assert (periods["30 jours"]["visits"], periods["30 jours"]["searched"]) == (6, 3)


# --- Générations : format × issue, mots imposés ---

def test_each_format_tells_its_outcomes_refusals_apart(test_app):
    generation("grid", duration_ms=40)
    generation("grid", duration_ms=60)
    generation("timeout", 422)
    generation("must_words", 422, must=(9,))
    generation("http_500", 500)
    generation("busy_server", 429)
    generation("grid", fmt="13x18", duration_ms=9_000)
    # Refusées avant la vue : sans format, elles n'apprennent rien sur le générateur
    add("generation", "invalid_request", 400, route="/api/grids/generate")
    add("generation", "rate_limited", 429, route="/api/grids/generate")

    small, large = figures()["formats"]

    assert small == {"format": "6x7", "total": 5, "grid": 2, "timeout": 1, "must_words": 1, "must_words_unplaced": 0,
                     "no_solution": 0, "other": 1, "refused": 1, "p50": 60, "p95": 60}
    assert (large["format"], large["total"], large["grid"], large["refused"], large["p95"]) == ("13x18", 1, 1, 0, 9_000)


def test_imposed_words_are_read_by_count_and_by_longest_length(test_app):
    generation("grid")
    generation("grid", must=(4,))
    generation("grid", must=(5, 3))
    generation("must_words_unplaced", 422, must=(8, 4))
    generation("timeout", 422, must=(12, 6, 3))
    generation("grid", must=(3, 3, 3, 3, 3, 3))
    generation("busy_visitor", 429, must=(12,))  # un refus ne dit rien de la difficulté

    data = figures()

    assert [(row["must"], row["total"], row["grid"]) for row in data["must_counts"]] == [
        (0, 1, 1), (1, 1, 1), (2, 2, 1), (3, 1, 0), (5, 1, 1)]
    assert [(row["band"], row["total"], row["grid"]) for row in data["must_lengths"]] == [
        ("2 à 4", 2, 2), ("5 à 6", 1, 1), ("7 à 8", 1, 0), ("11 et plus", 1, 0)]
    assert data["must_bands"] == ["2 à 4", "5 à 6", "7 à 8", "9 à 10", "11 et plus"]
    # Le croisement plafonne le nombre à « 3 et plus »
    assert {(cell["must"], cell["band"]): (cell["total"], cell["grid"]) for cell in data["must_matrix"]} == {
        (1, "2 à 4"): (1, 1), (2, "5 à 6"): (1, 1), (2, "7 à 8"): (1, 0), (3, "2 à 4"): (1, 1),
        (3, "11 et plus"): (1, 0)}


# --- Erreurs et pays ---

def test_busy_refusals_are_split_and_countries_are_counted_in_visitors(test_app):
    generation("busy_server", 429, visitor="a" * 32)
    generation("busy_server", 429, visitor="a" * 32)
    generation("busy_visitor", 429, visitor="b" * 32, country="BE")
    add("search", "results", visitor="c" * 32, country=None)

    data = figures()
    today = data["periods"][0]

    assert (today["busy"], today["busy_server"], today["busy_visitor"]) == (3, 2, 1)
    assert data["countries"] == [{"country": "FR", "events": 2, "visitors": 1},
                                 {"country": "BE", "events": 1, "visitors": 1},
                                 {"country": "?", "events": 1, "visitors": 1}]


# --- Sur le jeu de données fictives, par la route ---

def test_every_table_is_filled_from_the_demo_data_and_names_nobody(test_app, client):
    from tests.test_admin import confirm

    email, tokens = register(client)
    confirm(email, admin=True)
    usage_demo.seed_demo()

    response = client.get("/api/admin/stats", headers={"Authorization": f"Bearer {tokens['access_token']}"})

    assert response.status_code == 200, response.get_json()
    data = response.get_json()
    for section in ("daily", "formats", "must_counts", "must_lengths", "must_matrix", "countries", "errors"):
        assert data[section], section
    month = data["periods"][2]["funnel"]
    assert month["visits"] > month["active"] > month["grid"] > month["registered"] > 0
    # 30 jours calendaires d'un côté, 30 × 24 h de l'autre : la série ne compte pas le bout de jour le plus ancien
    assert 0 < sum(day["visitors"] for day in data["daily"]) <= data["periods"][2]["visitors"]
    assert sum(row["total"] for row in data["formats"]) == sum(row["total"] for row in data["must_counts"])
    # Des agrégats seulement : ni empreinte, ni compte
    text = json.dumps(data)
    assert usage_demo.DEMO_PREFIX not in text.lower() and not re.search(r"[0-9a-f]{28}", text)
    assert email not in text and "user_id" not in text
    assert User.query.filter_by(email=email).one().is_admin


# --- Contrat avec l'interface ---

FRONTEND_FIXTURE = Path(__file__).resolve().parents[2] / "frontend" / "tests" / "fixtures" / "admin-stats.json"


def shape(value):
    """La forme d'une réponse : ses clés, et la forme du premier élément de chaque liste."""
    if isinstance(value, dict):
        return {key: shape(item) for key, item in value.items()}
    if isinstance(value, list):
        return [shape(value[0])] if value else []
    return "nombre" if isinstance(value, (int, float)) and not isinstance(value, bool) else type(value).__name__


def test_the_frontend_fixture_has_the_shape_of_the_real_response(test_app):
    """`frontend/tests/admin.spec.ts` dessine le poste de pilotage à partir de cette réponse enregistrée : si la
    route change de forme, le test de l'interface ne doit pas continuer de passer sur une forme périmée.

    La régénérer : `UPDATE_FIXTURES=1 pytest tests/test_stats_tables.py -k fixture` (dépôt complet monté).
    """
    if not FRONTEND_FIXTURE.parent.parent.is_dir():
        pytest.skip("frontend/ absent (make test-backend ne monte que backend/)")
    usage_demo.seed_demo(now=NOW)
    data = stats.as_json(stats.compute(now=NOW, cpu_count=2))
    if os.environ.get("UPDATE_FIXTURES"):
        FRONTEND_FIXTURE.parent.mkdir(exist_ok=True)
        FRONTEND_FIXTURE.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    recorded = json.loads(FRONTEND_FIXTURE.read_text(encoding="utf-8"))

    assert shape(recorded) == shape(data)
