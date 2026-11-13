"""La rubrique « API » du poste de pilotage et du bilan du lundi (api_stats.py, ADR 0032 point 10)."""

import json
import os
from datetime import datetime, timedelta
from pathlib import Path

import pytest

import alerts
import api_stats
import usage_demo
from extensions import db
from models import ApiKey, UsageEvent
from tests.test_stats_tables import shape

NOW = datetime(2026, 11, 13, 15, 0)


@pytest.fixture(autouse=True)
def clean(test_app):
    for model in (UsageEvent, ApiKey):
        model.query.delete()
    db.session.commit()
    yield
    for model in (UsageEvent, ApiKey):
        model.query.delete()
    db.session.commit()


def request(outcome, hours_ago=1, client="api", assistant=None, keyed=False, queued_ms=None, status=None, **data):
    """Une demande de grille de l'API telle que l'écrit usage.py : à l'arrivée si refusée, à la fin sinon."""
    db.session.add(UsageEvent(
        created_at=NOW - timedelta(hours=hours_ago), kind="generation", outcome=outcome,
        status=status or (200 if outcome == "grid" else 429), route="/v1/grids", site="fr", lang="fr", visitor=None,
        duration_ms=900 if outcome == "grid" else 3,
        data={"client": client, "assistant": assistant, "keyed": keyed, "format": "10x13",
              **({"queued_ms": queued_ms} if queued_ms is not None else {}), **data}))


def view(path, source=None, hours_ago=1):
    db.session.add(UsageEvent(
        created_at=NOW - timedelta(hours=hours_ago), kind="page", outcome="view", status=204, route="/api/audience",
        site="fr", lang="fr", visitor="a" * 32,
        data={"path": path, "referrer": "", **({"source": source} if source else {})}))


def key(created_days_ago, used_days_ago=None, revoked=False, index=0):
    db.session.add(ApiKey(owner_site="fr", user_id=1, name="essai", prefix=f"flk_{index:06d}", key_hash=f"{index:064d}",
                          created_at=NOW - timedelta(days=created_days_ago),
                          last_used_at=NOW - timedelta(days=used_days_ago) if used_days_ago is not None else None,
                          revoked_at=NOW if revoked else None))


def seed():
    request("grid", client="mcp", assistant="claude", queued_ms=400)
    request("grid", client="mcp", assistant="claude", queued_ms=1200)
    request("grid", client="mcp", assistant="lechat?", queued_ms=300)
    request("grid", keyed=True, queued_ms=100)
    request("no_solution", status=422)
    request("quota_day")
    request("api_paused", status=503)
    request("size_out_of_range", status=400)
    request("grid", hours_ago=24 * 10, client="mcp", assistant="chatgpt")
    # Une génération du site : hors de la rubrique
    db.session.add(UsageEvent(created_at=NOW - timedelta(hours=1), kind="generation", outcome="grid", status=200,
                              route="/api/grids/generate", site="fr", lang="fr", visitor="b" * 32, data={}))
    view("/grid", source="claude.ai")
    view("/grid", source="claude.ai", hours_ago=30)
    view("/jouer")
    key(40, used_days_ago=1, index=1)
    key(3, index=2)
    key(60, revoked=True, index=3)
    db.session.commit()


def test_the_api_section_sorts_requests_by_way_assistant_and_outcome(test_app):
    seed()

    with test_app.test_request_context():
        data = api_stats.summary(NOW)

    today, week, month = data["periods"]
    assert (today["requests"], today["grids"], today["mcp"], today["http"], today["keyed"]) == (8, 4, 3, 1, 1)
    # La réussite du moteur se compte hors refus : 4 grilles sur 5 demandes qui lui sont parvenues
    assert today["success"] == pytest.approx(0.8)
    assert (today["failures"], today["quota"], today["closed"], today["invalid"]) == (1, 1, 1, 1)
    assert today["queue_p95_ms"] == 1200
    assert (today["link_views"], week["link_views"]) == (1, 2)
    assert (month["requests"], month["grids"], month["mcp"]) == (9, 5, 4)

    assert [(row["assistant"], row["requests"], row["grids"]) for row in data["assistants"]][:2] == [
        ("api", 5, 1), ("claude", 2, 2)]
    assert {row["assistant"] for row in data["assistants"]} == {"api", "claude", "lechat?", "chatgpt"}
    assert {row["outcome"]: row["category"] for row in data["outcomes"]}["quota_day"] == "quota"
    assert data["formats"] == [{"format": "10x13", "grids": 5}]
    assert data["sources"] == [{"source": "claude.ai", "views": 2}]
    assert data["keys"] == {"active": 2, "revoked": 1, "created_30d": 1, "used_7d": 1}
    assert len(data["daily"]) == 30 and data["daily"][-1]["day"] == NOW.date().isoformat()
    assert (data["daily"][-1]["mcp"], data["daily"][-1]["http"], data["daily"][-1]["refused"]) == (3, 1, 2)


def test_the_section_says_nothing_about_a_person(test_app):
    seed()

    with test_app.test_request_context():
        text = json.dumps(api_stats.summary(NOW))

    for personal in ("flk_", "visitor", "user_id", "essai", "aaaa"):
        assert personal not in text


def test_an_empty_api_gives_dashes_not_errors(test_app):
    with test_app.test_request_context():
        data = api_stats.summary(NOW)
        lines = api_stats.render_week(NOW)

    assert data["periods"][2]["requests"] == 0 and data["periods"][2]["success"] is None
    assert data["assistants"] == [] and data["keys"]["active"] == 0
    assert any("réussite du moteur" in line and "—" in line for line in lines)


def test_the_monday_report_has_an_api_paragraph(test_app):
    seed()

    with test_app.test_request_context():
        body = alerts.weekly_body(NOW)

    assert "API ouverte (ADR 0032) :" in body
    grids = next(line for line in body.splitlines() if "grilles rendues" in line)
    # Les 7 derniers jours (4 grilles), à côté des 7 précédents (celle d'il y a 10 jours)
    assert grids.split()[2] == "4" and grids.endswith("précédente : 1)")
    assert "Clés : 2 actives, 1 servies cette semaine, 1 créées en 30 jours." in body


def test_only_the_admin_reads_the_api_section(test_app, client):
    assert client.get("/api/admin/api").status_code == 404


# --- Contrat avec l'interface (comme test_stats_tables.py) ---

FRONTEND_FIXTURE = Path(__file__).resolve().parents[2] / "frontend" / "tests" / "fixtures" / "admin-api.json"


def test_the_frontend_fixture_has_the_shape_of_the_real_response(test_app):
    """`frontend/tests/admin.spec.ts` dessine la rubrique à partir de cette réponse, tirée du jeu fictif.

    La régénérer : `UPDATE_FIXTURES=1 pytest tests/test_api_stats.py -k fixture` (dépôt complet monté).
    """
    if not FRONTEND_FIXTURE.parent.parent.is_dir():
        pytest.skip("frontend/ absent (make test-backend ne monte que backend/)")
    usage_demo.seed_demo(now=NOW)
    key(40, used_days_ago=1, index=1)
    key(3, index=2)
    db.session.commit()
    with test_app.test_request_context():
        data = api_stats.summary(NOW)
    try:
        assert data["periods"][2]["grids"] > 0 and data["assistants"] and data["sources"]
        if os.environ.get("UPDATE_FIXTURES"):
            FRONTEND_FIXTURE.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        recorded = json.loads(FRONTEND_FIXTURE.read_text(encoding="utf-8"))
        assert shape(recorded) == shape(data)
    finally:
        usage_demo.clear()
