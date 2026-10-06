"""« La course » (#201, ADR 0023) : les indicateurs de la semaine, semaine ISO par semaine ISO.

Tout se relit sur les événements déjà collectés : aucun champ nouveau (ADR 0016). Ce qui ne se mesure pas encore
reste « à venir », jamais un zéro."""

import json
import re
from datetime import datetime

import pytest

import stats
from extensions import db
from models import UsageEvent, VisitorSalt

NOW = datetime(2026, 10, 7, 15, 30)  # un mercredi : la semaine ISO 41 a commencé le lundi 5 octobre
A, B, C, D, E = ("a" * 32, "b" * 32, "c" * 32, "d" * 32, "e" * 32)


@pytest.fixture(autouse=True)
def clean_usage(test_app):
    UsageEvent.query.delete()
    VisitorSalt.query.delete()
    db.session.commit()
    yield


def at(moment: str) -> datetime:
    return datetime.fromisoformat(moment)


def add(kind, outcome=None, when="2026-10-06T10:00:00", visitor=A, site="fr", status=200):
    db.session.add(UsageEvent(created_at=at(when), kind=kind, outcome=outcome, status=status, route="/api/test",
                              site=site, lang="fr", visitor=visitor, data={}))


def race(now=NOW) -> dict:
    db.session.commit()
    return stats.race(now)


def indicator(data: dict, key: str) -> dict:
    return next(row for row in data["indicators"] if row["key"] == key)


def values(data: dict, key: str) -> list[int]:
    return indicator(data, key)["values"]


# --- Les semaines ---

def test_weeks_are_iso_weeks_from_monday_to_sunday_and_the_current_one_is_apart(test_app):
    data = race()

    assert [week["week"] for week in data["weeks"]] == ["2026-W37", "2026-W38", "2026-W39", "2026-W40"]
    assert data["weeks"][-1] == {"week": "2026-W40", "label": "S40", "start": "2026-09-28", "end": "2026-10-04"}
    # Mercredi : trois jours écoulés de la semaine en cours, qui n'entre pas dans les semaines complètes
    assert data["current"] == {"week": "2026-W41", "label": "S41", "start": "2026-10-05", "end": "2026-10-11",
                               "days": 3}
    assert all(len(row["values"]) == 4 for row in data["indicators"] if row["available"])


def test_a_monday_morning_starts_the_week_and_a_sunday_night_ends_it(test_app):
    for when in ("2026-09-27T23:59:59", "2026-09-28T00:00:00", "2026-10-04T23:59:59", "2026-10-05T00:00:00"):
        add("generation", "grid", when)
    add("generation", "grid", "2026-09-06T23:59:59")  # la veille de la première semaine : hors fenêtre
    add("generation", "grid", "2026-10-07T15:30:01")  # après « maintenant »

    data = race()

    assert values(data, "grids") == [0, 0, 1, 2]  # S39 : le dimanche soir ; S40 : le lundi 0 h et le dimanche soir
    assert indicator(data, "grids")["current"] == 1  # S41 : le lundi 0 h


def test_the_weeks_follow_the_iso_calendar_across_new_year(test_app):
    now = at("2027-01-06T10:00:00")  # 2026 compte 53 semaines ISO ; la semaine 1 de 2027 commence le 4 janvier
    add("account", "register", "2026-12-28T08:00:00")  # lundi de la semaine 53
    add("account", "register", "2027-01-03T22:00:00")  # dimanche de la semaine 53
    add("account", "register", "2027-01-04T00:00:00")  # lundi de la semaine 1 de 2027, en cours

    data = race(now)

    assert [week["week"] for week in data["weeks"]] == ["2026-W50", "2026-W51", "2026-W52", "2026-W53"]
    assert [week["label"] for week in data["weeks"]] == ["S50", "S51", "S52", "S53"]
    assert data["weeks"][-1]["end"] == "2027-01-03"
    assert (data["current"]["week"], data["current"]["label"], data["current"]["days"]) == ("2027-W01", "S01", 3)
    assert values(data, "registers") == [0, 0, 0, 2]
    assert indicator(data, "registers")["current"] == 1


# --- Ce qui se compte ---

def test_visitors_are_the_daily_fingerprints_summed_over_the_week(test_app):
    add("search", "results", "2026-09-28T10:00:00", visitor=A)
    add("generation", "grid", "2026-09-28T11:00:00", visitor=A)  # la même empreinte le même jour : une seule fois
    add("search", "results", "2026-09-29T09:00:00", visitor=A)  # le lendemain, c'est une autre empreinte : deux fois
    add("error", None, "2026-09-28T12:00:00", visitor=B, status=401)
    add("search", "results", "2026-09-30T12:00:00", visitor=None)  # sans empreinte : ne compte pas
    add("search", "results", "2026-10-01T12:00:00", visitor=A, site="de")  # un autre site : ne compte pas
    add("search", "results", "2026-10-06T12:00:00", visitor=C)  # la semaine en cours

    data = race()

    assert values(data, "visitors") == [0, 0, 0, 3]
    assert indicator(data, "visitors")["current"] == 1


def test_the_beacon_does_not_blend_into_the_visitors_of_the_api(test_app):
    """Les pages vues ont leur rubrique « Audience » : leurs empreintes ne s'ajoutent pas à celles de l'API (ADR 0016)."""
    add("page", "view", "2026-09-29T10:00:00", visitor=B)
    add("page", "view", "2026-09-29T10:05:00", visitor=C)
    add("page", "pdf", "2026-09-29T10:06:00", visitor=C)
    add("search", "results", "2026-09-29T10:07:00", visitor=A)

    data = race()

    assert values(data, "visitors") == [0, 0, 0, 1]
    assert values(data, "pdf") == [0, 0, 0, 1]  # mais l'export PDF, lui, est bien compté


def test_only_successful_generations_new_accounts_and_kept_grids_count(test_app):
    for outcome, status in (("grid", 200), ("grid", 200), ("timeout", 422), ("busy_server", 429),
                            ("rate_limited", 429), ("must_words", 422), ("http_500", 500)):
        add("generation", outcome, "2026-09-30T10:00:00", status=status)
    for outcome in ("register", "verify", "login", "login", "delete"):
        add("account", outcome, "2026-09-30T10:00:00")
    add("grid", "saved", "2026-09-30T10:00:00")
    add("search", "results", "2026-09-30T10:00:00")
    add("error", None, "2026-09-30T10:00:00", status=404)

    data = race()

    assert values(data, "grids") == [0, 0, 0, 2]
    assert values(data, "registers") == [0, 0, 0, 1]
    assert values(data, "saved") == [0, 0, 0, 1]


def test_finished_grids_are_the_pdf_exports_of_the_beacon_plus_the_kept_grids(test_app):
    add("page", "pdf", "2026-09-22T10:00:00")
    add("page", "pdf", "2026-09-29T10:00:00")
    add("page", "pdf", "2026-09-29T10:01:00", visitor=B)
    add("page", "view", "2026-09-29T10:02:00")  # une page vue n'est pas un export
    add("grid", "saved", "2026-09-29T11:00:00")
    add("grid", "saved", "2026-09-30T11:00:00")
    add("grid", "saved", "2026-10-06T11:00:00")  # la semaine en cours

    data = race()

    assert values(data, "pdf") == [0, 0, 1, 2]
    assert values(data, "saved") == [0, 0, 0, 2]
    assert values(data, "finished") == [0, 0, 1, 4]
    assert indicator(data, "finished")["current"] == 1
    # Les deux parts sont des lignes de détail de leur total
    assert [(row["key"], row["detail"]) for row in data["indicators"][2:5]] == [
        ("finished", False), ("pdf", True), ("saved", True)]


def test_what_is_not_measured_yet_reads_coming_soon_never_zero(test_app):
    add("generation", "grid")

    data = race()

    assert [row["key"] for row in data["indicators"]] == [
        "visitors", "grids", "finished", "pdf", "saved", "registers", "games", "published", "feedback"]
    assert [row["label"] for row in data["indicators"][-3:]] == ["Parties jouées", "Grilles publiées", "Avis reçus"]
    for key in ("games", "published", "feedback"):
        assert indicator(data, key) == {"key": key, "label": indicator(data, key)["label"], "detail": False,
                                        "available": False, "values": None, "current": None, "trend": None}


def test_a_lot_that_ships_its_function_fills_its_row_by_declaring_its_event(test_app, monkeypatch):
    monkeypatch.setitem(stats.RACE_COUNTED, ("game", "played"), "games")
    add("game", "played", "2026-09-29T10:00:00")
    add("game", "played", "2026-09-29T10:00:00", visitor=B)
    add("game", "abandoned", "2026-09-29T10:00:00")

    games = indicator(race(), "games")

    assert (games["available"], games["values"], games["current"]) == (True, [0, 0, 0, 2], 0)
    assert games["trend"] == {"change": 2, "share": None, "direction": "up"}
    assert indicator(race(), "published")["available"] is False  # les autres attendent toujours


# --- La tendance ---

@pytest.mark.parametrize("before, last, change, share, direction", [
    (4, 6, 2, 0.5, "up"),
    (10, 7, -3, -0.3, "down"),
    (5, 5, 0, 0.0, "flat"),
    (0, 3, 3, None, "up"),  # depuis zéro, une part n'a pas de sens, et toute hausse compte
    (0, 0, 0, None, "flat"),
    # Sous 5 % d'écart, la tendance est « stable » : le seuil lui-même compte déjà comme un mouvement
    (100, 104, 4, 0.04, "flat"),
    (100, 105, 5, 0.05, "up"),
    (100, 96, -4, -0.04, "flat"),
    (100, 95, -5, -0.05, "down"),
])
def test_the_trend_compares_the_last_complete_week_to_the_one_before(test_app, before, last, change, share, direction):
    for week_start, count in (("2026-09-21", before), ("2026-09-28", last)):
        for index in range(count):
            add("account", "register", f"{week_start}T10:00:00", visitor=f"{index:032x}")

    trend = indicator(race(), "registers")["trend"]

    assert trend == {"change": change, "share": share, "direction": direction}


def test_the_week_in_progress_never_enters_the_trend(test_app):
    add("account", "register", "2026-09-29T10:00:00")
    add("account", "register", "2026-09-30T10:00:00")
    add("account", "register", "2026-10-05T10:00:00")  # ce lundi-là : « en baisse » si elle comptait
    before = indicator(race(), "registers")["trend"]

    assert before == {"change": 2, "share": None, "direction": "up"}  # S40 contre S39 (vide)
    assert indicator(race(), "registers")["current"] == 1


# --- Le même bloc partout ---

def test_the_admin_json_carries_the_race_and_names_nobody(test_app):
    add("generation", "grid", "2026-09-29T10:00:00", visitor=A)
    add("account", "register", "2026-09-29T10:00:00", visitor=B)
    db.session.commit()

    data = stats.as_json(stats.compute(now=NOW))

    assert data["race"] == stats.race(NOW)
    text = json.dumps(data["race"])
    assert not re.search(r"[0-9a-f]{28}", text)  # aucune empreinte
    assert '"visitor"' not in text and "user_id" not in text  # que des nombres, par semaine


def test_the_text_block_is_the_one_of_the_report(test_app):
    for index in range(4):
        add("generation", "grid", "2026-09-29T10:00:00", visitor=f"{index:032x}")
    for index in range(7):
        add("generation", "grid", "2026-10-01T10:00:00", visitor=f"{index:032x}")
    add("page", "pdf", "2026-10-02T10:00:00")
    add("account", "register", "2026-10-02T10:00:00")
    add("account", "register", "2026-10-06T10:00:00")
    data = race()

    assert stats.render_race(data) == [
        "La course : les 4 dernières semaines complètes, du lundi au dimanche (UTC)",
        "                               S37   S38   S39   S40   tendance",
        "Visiteurs (somme par jour)       0     0     0    12   en hausse (+12)",
        "Générations réussies             0     0     0    11   en hausse (+11)",
        "Grilles terminées                0     0     0     1   en hausse (+1)",
        "  dont exports PDF               0     0     0     1   en hausse (+1)",
        "  dont grilles conservées        0     0     0     0   stable",
        "Comptes créés                    0     0     0     1   en hausse (+1)",
        "Parties jouées              à venir",
        "Grilles publiées            à venir",
        "Avis reçus                  à venir",
        "S40 : du 28/09 au 04/10/2026. Tendance : S40 contre S39.",
    ]
    # `flask stats` y ajoute la semaine en cours, marquée d'une étoile et hors tendance
    with_current = stats.render_race(data, current=True)
    assert with_current[1].endswith("  S41*   tendance")
    assert with_current[-1] == "* S41 : semaine en cours, 3 jour(s) sur 7, hors tendance."
    assert with_current[7].startswith("Comptes créés") and "     1   en hausse (+1)" in with_current[7]


@pytest.mark.parametrize("trend, text", [
    ({"change": 6, "share": 0.241, "direction": "up"}, "en hausse (+6, +24 %)"),
    ({"change": -24, "share": -0.072, "direction": "down"}, "en baisse (-24, -7,2 %)"),
    ({"change": -1, "share": -0.0041, "direction": "flat"}, "stable (-1, -0,4 %)"),
    ({"change": 2, "share": 1.5, "direction": "up"}, "en hausse (+2, +150 %)"),
    ({"change": 3, "share": None, "direction": "up"}, "en hausse (+3)"),
    ({"change": 0, "share": 0.0, "direction": "flat"}, "stable"),
])
def test_a_trend_reads_in_words_with_its_figures(trend, text):
    assert stats._trend_text(trend) == text


def test_flask_stats_shows_the_race(test_app, runner):
    add("generation", "grid", "2026-10-06T10:00:00")
    db.session.commit()

    result = runner.invoke(args=["stats"])

    assert result.exit_code == 0, result.output
    assert "La course : les 4 dernières semaines complètes" in result.output
    assert "Parties jouées" in result.output and "à venir" in result.output
