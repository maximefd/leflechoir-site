"""Jeu de données fictives du poste de pilotage (`flask usage seed-demo`) : rempli en une commande, relançable
sans doublon, refusé en production, et de la même forme que les vrais événements."""

import json
from datetime import datetime

import pytest

import stats
import system_samples
import usage_demo
from extensions import db
from models import AlertSent, SystemDaily, SystemSample, UsageEvent, User, VisitorSalt

from tests.paths import FIXTURE_LAYOUTS_DIR

NOW = datetime(2026, 10, 1, 15, 30)
REAL_VISITOR = "0123456789abcdef0123456789abcdef"


@pytest.fixture(autouse=True)
def clean_usage(test_app):
    for model in (UsageEvent, VisitorSalt, SystemSample, SystemDaily, AlertSent):
        model.query.delete()
    db.session.commit()
    test_app.extensions.pop("usage_salt", None)
    yield


def real_event() -> UsageEvent:
    event = UsageEvent(created_at=NOW, kind="search", outcome="results", status=200, route="/api/search",
                       site="fr", lang="fr", visitor=REAL_VISITOR, data={})
    db.session.add(event)
    db.session.commit()
    return event


def demo_events():
    return UsageEvent.query.filter(UsageEvent.visitor.startswith(usage_demo.DEMO_PREFIX)).all()


def test_one_command_fills_the_dashboard(test_app, runner):
    result = runner.invoke(args=["usage", "seed-demo"])

    assert result.exit_code == 0, result.output
    assert "événements fictifs sur 42 jours" in result.output
    events = UsageEvent.query.all()
    assert len(events) > 1000
    assert {e.kind for e in events} == {"generation", "search", "account", "grid", "error"}
    outcomes = {e.outcome for e in events if e.kind == "generation"}
    assert {"grid", "timeout", "busy_server", "must_words", "must_words_unplaced", "rate_limited",
            "invalid_request"} <= outcomes
    assert {e.outcome for e in events if e.kind == "account"} >= {"register", "verify", "login"}

    # Chaque rubrique du poste de pilotage a de quoi s'afficher
    figures = stats.as_json(stats.compute())
    for section in ("outcomes", "formats", "must_counts", "unknown_words", "countries", "errors", "latest"):
        assert figures[section], section
    for period in figures["periods"][1:]:  # 7 et 30 jours ; « aujourd'hui » dépend de l'heure du test
        for key in ("visitors", "searches", "generations", "grids", "register", "saved", "errors"):
            assert period[key] > 0, (period["label"], key)
    assert figures["periods"][2]["server_errors"] > 0  # le jour d'incident
    assert runner.invoke(args=["stats"]).exit_code == 0


def test_running_it_again_does_not_double_the_data_nor_touch_real_events(test_app):
    real_id = real_event().id

    first = usage_demo.seed_demo(now=NOW)
    second = usage_demo.seed_demo(now=NOW)

    assert first == second == len(demo_events())
    assert UsageEvent.query.count() == first + 1
    assert db.session.get(UsageEvent, real_id).visitor == REAL_VISITOR


def test_the_same_seed_gives_the_same_events(test_app):
    assert usage_demo.generate(now=NOW) == usage_demo.generate(now=NOW)
    assert usage_demo.generate(now=NOW, seed=1) != usage_demo.generate(now=NOW)


@pytest.mark.parametrize("args", [["usage", "seed-demo"], ["usage", "seed-demo", "--clear"]])
def test_it_refuses_to_run_in_production(test_app, runner, monkeypatch, args):
    usage_demo.seed_demo(days=2, now=NOW)
    before = UsageEvent.query.count()
    monkeypatch.setitem(test_app.config, "APP_ENV", "production")

    result = runner.invoke(args=args)

    assert result.exit_code != 0
    assert "Refusé en production" in result.output
    assert UsageEvent.query.count() == before


def test_clear_removes_the_demo_events_only(test_app, runner):
    real_event()
    usage_demo.seed_demo(days=3, now=NOW)

    result = runner.invoke(args=["usage", "seed-demo", "--clear"])

    assert result.exit_code == 0, result.output
    assert [e.visitor for e in UsageEvent.query.all()] == [REAL_VISITOR]


def test_demo_events_are_recognisable_and_tied_to_nobody(test_app):
    users = User.query.count()
    usage_demo.seed_demo(days=30, now=NOW)

    events = demo_events()
    assert len(events) == UsageEvent.query.count()
    for event in events:
        assert len(event.visitor) == 32 and event.user_id is None
        assert (event.site, event.lang) == (test_app.config["SITE"], test_app.config["SITE_LANG"])
        assert event.created_at <= NOW
        assert event.duration_ms is not None and event.cpu_ms is not None
    # Une vraie empreinte est hexadécimale (usage.visitor_fingerprint) : elle ne peut pas commencer par « demo »
    assert not all(char in "0123456789abcdef" for char in usage_demo.DEMO_PREFIX)
    # Seule la table des événements est écrite : ni compte ni sel fictifs
    assert (User.query.count(), VisitorSalt.query.count()) == (users, 0)


def test_demo_events_have_the_shape_of_real_ones(test_app, client, small_trie, small_words, monkeypatch):
    """Le tableau de bord développé sur ces données doit lire les vraies : mêmes clés, mêmes routes."""
    monkeypatch.setattr(test_app, "dela_trie", small_trie)
    monkeypatch.setitem(test_app.config, "LAYOUTS_DIR", FIXTURE_LAYOUTS_DIR)
    known = next(word for word in small_words if len(word) == 4)
    browser = {"User-Agent": "Mozilla/5.0 (test)"}
    client.post("/api/grids/generate", headers=browser, content_type="application/json",
                data=json.dumps({"size": {"width": 5, "height": 5}, "seed": 42, "must_words": [known]}))
    client.post("/api/search", headers=browser, content_type="application/json", data=json.dumps({"mask": "p??le"}))
    real = {event.kind: event for event in UsageEvent.query.all()}
    assert real["generation"].outcome == "grid"

    demo = usage_demo.generate(now=NOW)

    def one(kind, outcome, with_words=False):
        return next(e for e in demo if (e["kind"], e["outcome"]) == (kind, outcome) and bool(e["words"]) == with_words)

    generation, search = one("generation", "grid", with_words=True), one("search", "results")
    assert set(generation["data"]) == set(real["generation"].data)
    assert set(generation["data"]["must"][0]) == set(real["generation"].data["must"][0])
    assert set(generation["words"]) == set(real["generation"].words)
    assert set(search["data"]) == set(real["search"].data)
    assert (generation["route"], search["route"]) == (real["generation"].route, real["search"].route)
    # Les routes citées existent toutes dans l'API
    routes = {rule.rule for rule in test_app.url_map.iter_rules()}
    assert {event["route"] for event in demo} <= routes


# --- Le serveur fictif : échantillons, résumés, journal des alertes ---

def test_the_system_section_is_filled_too(test_app):
    usage_demo.seed_demo(now=NOW)

    assert SystemSample.query.count() == 48 * 60 + 1  # deux jours, à la minute
    assert SystemDaily.query.count() == 42 - 1  # un résumé par jour fini, y compris les deux jours échantillonnés
    assert {row.kind for row in AlertSent.query.all()} == {"ram", "server_errors", "busy", "weekly", "test"}
    view = system_samples.as_json(NOW)
    assert view["fresh"] and view["thresholds"]["ram_level"] in ("ok", "near")
    assert all(hour["samples"] == 60 for hour in view["hours"][:-1])
    assert all(day["samples"] for day in view["days"])
    # Le jour d'incident se voit : la mémoire y dépasse le seuil de 75 %
    incident = view["days"][-1 - usage_demo.INCIDENT_DAYS_AGO]
    assert incident["mem_used_max_mb"] / incident["mem_total_mb"] > system_samples.RAM_THRESHOLD
    # Le ménage de production est déjà passé sur les deux jours échantillonnés : il n'a plus rien à faire
    assert system_samples.maintain(NOW) == 0


def test_running_it_again_replaces_the_system_data_and_keeps_real_alerts(test_app):
    db.session.add(AlertSent(created_at=NOW, site="fr", lang="fr", kind="backup", period="2026-10-01",
                             summary="Une vraie alerte."))
    db.session.commit()

    usage_demo.seed_demo(now=NOW)
    first = (SystemSample.query.count(), SystemDaily.query.count(), AlertSent.query.count())
    usage_demo.seed_demo(now=NOW)

    assert (SystemSample.query.count(), SystemDaily.query.count(), AlertSent.query.count()) == first
    usage_demo.clear()
    assert (SystemSample.query.count(), SystemDaily.query.count()) == (0, 0)
    assert [row.summary for row in AlertSent.query.all()] == ["Une vraie alerte."]
