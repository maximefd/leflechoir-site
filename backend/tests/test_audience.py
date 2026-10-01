"""Mesure d'audience sans cookie (ADR 0016, point 3, #130) : ce que la balise écrit, ce qu'elle oublie."""

import json
from datetime import datetime, timedelta

import pytest

import audience
import stats
from extensions import db
from models import UsageEvent, VisitorSalt
from security import RATE_LIMITED_ENDPOINTS

from tests.helpers import auth_headers

BROWSER = {"User-Agent": "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Safari/605.1.15", "CF-IPCountry": "fr"}


@pytest.fixture(autouse=True)
def clean_usage(test_app):
    UsageEvent.query.delete()
    VisitorSalt.query.delete()
    db.session.commit()
    test_app.extensions.pop("usage_salt", None)
    yield


def beacon(client, body, headers=None):
    return client.post("/api/audience", data=json.dumps(body), content_type="application/json",
                       headers={**BROWSER, **(headers or {})})


def pages():
    return UsageEvent.query.filter_by(kind="page").order_by(UsageEvent.id).all()


def test_a_page_view_is_recorded_without_anything_that_names_a_person(client):
    response = beacon(client, {"kind": "view", "path": "/grid/", "referrer": "www.Google.com", "lang": "fr-FR",
                               "visible_ms": 42_000})

    assert response.status_code == 204 and response.data == b""
    [event] = pages()
    assert (event.outcome, event.status, event.site, event.lang, event.country) == ("view", 204, "fr", "fr", "FR")
    assert event.data == {"path": "/grid", "referrer": "google.com", "browser_lang": "fr", "visible_ms": 42_000}
    assert event.user_id is None
    assert event.visitor and len(event.visitor) == 32  # l'empreinte du jour, jamais l'adresse IP
    assert "127.0.0.1" not in json.dumps(event.data)


def test_a_logged_in_visitor_is_not_attached_to_the_account(client):
    headers = auth_headers(client)
    beacon(client, {"kind": "view", "path": "/grids"}, headers=headers)

    assert [event.user_id for event in pages()] == [None]


def test_the_home_page_and_a_pdf_export(client):
    beacon(client, {"kind": "view", "path": "/"})
    beacon(client, {"kind": "pdf", "path": "/grids/edit"})

    assert [(e.outcome, e.data["path"]) for e in pages()] == [("view", "/"), ("pdf", "/grids/edit")]


@pytest.mark.parametrize("body", [
    {"kind": "view", "path": "/grids/edit?id=12"},       # jamais de paramètres : un identifiant est personnel
    {"kind": "view", "path": "grids"},
    {"kind": "view", "path": "/" + "a" * 200},
    {"kind": "view", "path": "/grid", "referrer": "https://exemple.fr/recherche?q=jean+dupont"},  # le nom d'hôte seul
    {"kind": "view", "path": "/grid", "visible_ms": -1},
    {"kind": "view", "path": "/grid", "visible_ms": 99_999_999},
    {"kind": "autre", "path": "/grid"},
    {"path": "/grid"},
])
def test_an_invalid_beacon_is_refused_and_not_recorded(client, body):
    response = beacon(client, body)

    assert response.status_code == 400
    assert pages() == []
    assert "dupont" not in response.get_data(as_text=True)


def test_global_privacy_control_is_honoured_by_the_server_too(client):
    response = beacon(client, {"kind": "view", "path": "/grid"}, headers={"Sec-GPC": "1"})

    assert response.status_code == 204  # la même réponse : rien ne dit qu'on a été oublié
    assert pages() == []


def test_a_robot_is_forgotten(client):
    for agent in ("Googlebot/2.1 (+http://www.google.com/bot.html)", "Mozilla/5.0 HeadlessChrome/120"):
        beacon(client, {"kind": "view", "path": "/grid"}, headers={"User-Agent": agent})

    assert pages() == []


def test_the_beacon_never_changes_the_figures_of_the_api(client):
    for _ in range(3):
        beacon(client, {"kind": "view", "path": "/grid", "visible_ms": 10_000})

    figures = stats.compute()
    assert figures["periods"]["30 jours"]["visitors"] == 0
    assert figures["periods"]["30 jours"]["errors"] == 0
    assert figures["daily"][-1]["visitors"] == 0
    audience_today = figures["audience"]["periods"][0]
    assert (audience_today["views"], audience_today["visitors"]) == (3, 1)


def test_the_audience_is_aggregated_by_page_source_and_language(client):
    now = datetime(2026, 10, 1, 12, 0)

    def add(path, referrer, lang, visible_ms, visitor, outcome="view", days_ago=0):
        db.session.add(UsageEvent(created_at=now - timedelta(days=days_ago), kind="page", outcome=outcome,
                                  status=204, route="/api/audience", site="fr", lang="fr", visitor=visitor,
                                  data={"path": path, "referrer": referrer, "browser_lang": lang,
                                        "visible_ms": visible_ms}))

    add("/grid", "chatgpt.com", "fr", 30_000, "a" * 32)
    add("/grid", "chatgpt.com", "fr", 50_000, "a" * 32)    # même visiteur, même origine : une visite
    add("/search", "google.com", "en", 10_000, "b" * 32)
    add("/", "", "fr", 5_000, "c" * 32)
    add("/grids/edit", "", "fr", 0, "c" * 32, outcome="pdf")
    add("/grid", "", "fr", 20_000, "d" * 32, days_ago=20)
    db.session.commit()

    result = stats.compute(now)["audience"]
    today, week, month = result["periods"]
    assert (today["views"], today["visitors"], today["pdf"]) == (4, 3, 1)
    assert today["median_visible_ms"] == 30_000
    assert month["views"] == 5 and month["visitors"] == 4
    assert result["pages"][0] == {"path": "/grid", "views": 3, "median_visible_ms": 30_000}
    assert result["source_kinds"] == {"direct": 2, "search": 1, "ai": 1, "other": 0}
    assert result["sources"] == [{"host": "chatgpt.com", "kind": "ai", "visits": 1},
                                 {"host": "google.com", "kind": "search", "visits": 1}]
    assert {row["lang"]: row["views"] for row in result["langs"]} == {"fr": 4, "en": 1}
    assert result["daily"][-1] == {"day": "2026-10-01", "views": 4, "visitors": 3}


@pytest.mark.parametrize("host, kind", [
    ("", "direct"),
    ("chatgpt.com", "ai"), ("perplexity.ai", "ai"), ("copilot.microsoft.com", "ai"), ("claude.ai", "ai"),
    ("google.com", "search"), ("www.google.fr", "search"), ("fr.search.yahoo.com", "search"), ("bing.com", "search"),
    ("lemonde.fr", "other"), ("notgoogle.com", "other"),
])
def test_where_a_visit_comes_from(host, kind):
    assert audience.source_kind(host) == kind


def test_the_beacon_is_rate_limited():
    assert RATE_LIMITED_ENDPOINTS["audience.beacon"] == "RATELIMIT_AUDIENCE"
