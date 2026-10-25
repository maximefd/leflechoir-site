"""Les chiffres de Google et Bing pour le poste de pilotage (seo.py, ADR 0029).

Les moteurs ne sont jamais appelés : leurs réponses sont simulées à l'endroit où seo.py parle au réseau (`_http`).
"""

import json
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

import seo
import stats
import usage_demo
from extensions import db
from models import SeoDaily, SeoQueryDaily, SeoUrlCheck, UsageEvent

from tests.helpers import register
from tests.test_admin import confirm
from tests.test_stats_tables import shape

NOW = datetime(2026, 10, 21, 8, 0)
TODAY = NOW.date()


@pytest.fixture(autouse=True)
def clean(test_app, monkeypatch):
    for model in (SeoDaily, SeoQueryDaily, SeoUrlCheck, UsageEvent):
        model.query.delete()
    db.session.commit()
    seo._token_cache.clear()
    monkeypatch.setitem(test_app.config, "FRONTEND_URL", "https://leflechoir.fr")
    monkeypatch.setitem(test_app.config, "GSC_CREDENTIALS_FILE", "")
    monkeypatch.setitem(test_app.config, "BING_WEBMASTER_API_KEY", "")
    yield


class FakeEngines:
    """Ce que Google et Bing répondent, adresse par adresse ; garde trace des appels."""

    def __init__(self, google_days=(), google_queries=(), bing=None, fail=None):
        self.google_days, self.google_queries = list(google_days), list(google_queries)
        self.bing = bing or {}
        self.fail = fail
        self.calls = []

    def __call__(self, url, *, data=None, headers=None):
        self.calls.append(url)
        if self.fail and self.fail in url:
            raise seo.SeoError(f"{self.fail} : HTTP 403")
        if "searchAnalytics" in url:
            body = json.loads(data)
            rows = self.google_queries if "query" in body["dimensions"] else self.google_days
            return {"rows": rows}
        if "urlInspection" in url:
            verdict = "PASS" if json.loads(data)["inspectionUrl"].endswith("/") else "NEUTRAL"
            return {"inspectionResult": {"indexStatusResult": {"verdict": verdict, "coverageState": "Envoyée et indexée"}}}
        for method, rows in self.bing.items():
            if f"/{method}?" in url:
                return {"d": rows}
        return {}


def google_on(test_app, monkeypatch, engines):
    monkeypatch.setitem(test_app.config, "GSC_CREDENTIALS_FILE", "/secrets/compte.json")
    monkeypatch.setattr(seo, "_google_token", lambda config: "jeton")
    monkeypatch.setattr(seo, "_http", engines)
    monkeypatch.setattr(seo, "sitemap_urls", lambda config: ["https://leflechoir.fr/", "https://leflechoir.fr/jouer"])


def bing_on(test_app, monkeypatch, engines):
    monkeypatch.setitem(test_app.config, "BING_WEBMASTER_API_KEY", "cle-bing")
    monkeypatch.setattr(seo, "_http", engines)


def ms(day: date) -> str:
    return f"/Date({int(datetime(day.year, day.month, day.day, tzinfo=timezone.utc).timestamp() * 1000)}-0700)/"


def test_queries_are_compared_without_accents_and_by_word_starts():
    groups = seo.QUESTIONS[0][1]  # créer des mots fléchés gratuitement
    assert seo.matches("Créer des MOTS FLÉCHÉS gratuits", groups)
    assert seo.matches("faire mots fleches gratuit", groups)
    assert not seo.matches("créer des mots croisés gratuits", groups)
    # « pro » est un mot entier : « programme » ne compte pas
    pros = dict(seo.QUESTIONS)["Comment les pros construisent-ils des mots fléchés ?"]
    assert seo.matches("comment les pros font des mots fléchés", pros)
    assert not seo.matches("programme mots fléchés", pros)


def test_bing_dates_are_read_in_utc():
    assert seo.bing_day("/Date(1792454400000-0700)/") == date(2026, 10, 20)
    assert seo.bing_day("") is None


def test_nothing_is_fetched_without_settings(test_app, monkeypatch):
    called = []
    monkeypatch.setattr(seo, "_http", lambda *args, **kwargs: called.append(args))
    seo.tick(NOW)
    assert called == []
    assert SeoDaily.query.count() == 0


def test_google_days_and_queries_are_stored_then_replaced(test_app, monkeypatch):
    yesterday = (TODAY - timedelta(days=1)).isoformat()
    engines = FakeEngines(
        google_days=[{"keys": [yesterday], "clicks": 12, "impressions": 340, "position": 9.5}],
        google_queries=[{"keys": [yesterday, "mots fléchés du jour"], "clicks": 7, "impressions": 120, "position": 6.0},
                        {"keys": [yesterday, "générateur mots fléchés"], "clicks": 5, "impressions": 220, "position": 11.0}],
    )
    google_on(test_app, monkeypatch, engines)

    assert seo.sync(NOW) == {"google": "ok"}
    day = SeoDaily.query.filter_by(source="google", day=TODAY - timedelta(days=1)).one()
    assert (day.clicks, day.impressions, day.position) == (12, 340, 9.5)
    assert SeoQueryDaily.query.count() == 2
    assert SeoUrlCheck.query.count() == 2  # les adresses du sitemap, prêtes à être inspectées

    # Le relevé suivant relit les mêmes jours : les requêtes sont remplacées, pas doublées
    engines.google_queries = engines.google_queries[:1]
    seo.sync(NOW, force=True)
    assert SeoQueryDaily.query.count() == 1


def test_the_daily_sync_runs_once_after_its_hour(test_app, monkeypatch):
    engines = FakeEngines()
    google_on(test_app, monkeypatch, engines)

    assert seo.sync(NOW.replace(hour=5)) == {}  # trop tôt : la veille n'est pas encore publiée
    assert seo.sync(NOW) == {"google": "ok"}
    assert seo.sync(NOW + timedelta(minutes=1)) == {}  # déjà fait aujourd'hui


def test_a_failed_sync_is_noted_for_the_dashboard_and_not_retried_every_minute(test_app, monkeypatch):
    google_on(test_app, monkeypatch, FakeEngines(fail="searchconsole"))

    outcome = seo.sync(NOW)
    assert outcome["google"].startswith("searchconsole : HTTP 403")
    assert seo.sync(NOW + timedelta(minutes=1)) == {}
    state = seo.summary(7, NOW)["sources"]["google"]
    assert state["error"].startswith("searchconsole : HTTP 403")
    assert state["configured"] is True


def test_url_inspection_counts_indexed_pages(test_app, monkeypatch):
    google_on(test_app, monkeypatch, FakeEngines())
    seo.sync(NOW)

    assert seo.inspect_some(NOW) == 2
    assert SeoDaily.query.filter_by(source="google", day=TODAY).one().indexed == 1  # seule l'accueil est « PASS »
    # Vues il y a moins d'une semaine : rien à refaire
    assert seo.inspect_some(NOW + timedelta(minutes=1)) == 0
    assert seo.inspect_some(NOW + timedelta(days=8)) == 2


def test_bing_traffic_index_and_queries(test_app, monkeypatch):
    yesterday = TODAY - timedelta(days=1)
    bing_on(test_app, monkeypatch, FakeEngines(bing={
        "GetRankAndTrafficStats": [{"Date": ms(yesterday), "Clicks": 3, "Impressions": 90}],
        "GetCrawlStats": [{"Date": ms(yesterday), "InIndex": 196}],
        "GetQueryStats": [{"Date": ms(yesterday), "Query": "mots fléchés à imprimer", "Clicks": 2, "Impressions": 40,
                           "AvgImpressionPosition": 7.0}],
    }))

    assert seo.sync(NOW) == {"bing": "ok"}
    state = seo.summary(7, NOW)["sources"]["bing"]
    assert (state["clicks"], state["impressions"], state["indexed"], state["position"]) == (3, 90, 196, 7.0)
    question = next(q for q in seo.summary(7, NOW)["questions"] if q["question"] == "Mots fléchés à imprimer")
    assert question["bing"] == {"position": 7.0, "clicks": 2, "impressions": 40}
    assert question["google"] is None


def test_summary_compares_with_the_previous_period_and_ranks_rising_queries(test_app):
    def day(offset, clicks, impressions, position):
        db.session.add(SeoDaily(site="fr", lang="fr", source="google", day=TODAY - timedelta(days=offset),
                                clicks=clicks, impressions=impressions, position=position))

    def query(offset, text, clicks, impressions, position):
        db.session.add(SeoQueryDaily(site="fr", lang="fr", source="google", day=TODAY - timedelta(days=offset),
                                     search=text, clicks=clicks, impressions=impressions, position=position))

    for offset in range(3, 10):  # les 7 derniers jours publiés (Google a 3 jours de retard)
        day(offset, 10, 100, 8.0)
    for offset in range(10, 17):  # les 7 d'avant
        day(offset, 5, 80, 12.0)
    query(3, "mot de 5 lettres finissant par ez", 9, 200, 4.0)
    query(12, "mot de 5 lettres finissant par ez", 1, 50, 9.0)
    query(4, "générateur de mots fléchés", 2, 60, 7.0)
    db.session.commit()

    google = seo.summary(7, NOW)["sources"]["google"]
    assert google["through"] == (TODAY - timedelta(days=3)).isoformat()
    assert (google["clicks"], google["clicks_before"]) == (70, 35)
    assert (google["impressions"], google["impressions_before"]) == (700, 560)
    assert (google["position"], google["position_before"]) == (8.0, 12.0)
    assert len(google["daily"]) == 7

    rising = seo.summary(7, NOW)["rising"]
    assert rising[0] == {"query": "mot de 5 lettres finissant par ez", "clicks": 9, "impressions": 200,
                         "position": 4.0, "clicks_before": 1, "impressions_before": 50, "position_before": 9.0}
    lettres = next(q for q in seo.summary(7, NOW)["key_searches"] if q["search"] == "mot de N lettres (les listes)")
    assert lettres["google"]["position"] == 4.0


def test_key_searches_match_their_words_in_any_order_and_any_number():
    groups = seo.phrase_groups("créer une grille de mots fléchés")
    assert seo.matches("creer grille mots fleches", groups)
    assert seo.matches("grille de mot fléché à créer", groups)
    assert not seo.matches("créer des mots fléchés", groups)  # sans « grille »


def test_questions_are_recognized_by_their_shape():
    assert seo.is_question("comment faire des mots fléchés")
    assert seo.is_question("Quel site pour créer des mots fléchés")
    assert seo.is_question("mots fléchés gratuits ?")
    assert not seo.is_question("générateur mots fléchés")


def test_summary_shows_key_searches_and_the_questions_people_ask(test_app):
    def query(offset, text, clicks, impressions, position, source="google"):
        db.session.add(SeoQueryDaily(site="fr", lang="fr", source=source, day=TODAY - timedelta(days=offset),
                                     search=text, clicks=clicks, impressions=impressions, position=position))
        db.session.add(SeoDaily(site="fr", lang="fr", source=source, day=TODAY - timedelta(days=offset),
                                clicks=0, impressions=impressions, position=position))

    query(3, "générateur de mots fléchés", 4, 300, 6.0)
    query(10, "générateur mots fléchés gratuit", 1, 100, 14.0)  # la période d'avant
    query(4, "comment créer des mots fléchés", 2, 150, 9.0)
    query(5, "quel site pour faire des mots fleches", 1, 40, 12.0)
    query(5, "générateur de mots fléchés", 1, 50, 8.0, source="bing")
    db.session.commit()

    summary = seo.summary(7, NOW)
    key = {entry["search"]: entry for entry in summary["key_searches"]}
    assert key["générateur de mots fléchés"]["google"] == {"position": 6.0, "clicks": 4, "impressions": 300}
    assert key["générateur de mots fléchés"]["google_position_before"] == 14.0
    assert key["générateur de mots fléchés"]["bing"]["position"] == 8.0
    assert key["créer une grille de mots fléchés"]["google"] is None  # on n'y apparaît pas
    assert [q["query"] for q in summary["asked"]] == ["comment créer des mots fléchés",
                                                      "quel site pour faire des mots fleches"]


def test_the_service_account_signs_its_token_request(test_app, monkeypatch, tmp_path):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                            serialization.NoEncryption()).decode()
    account = tmp_path / "compte.json"
    account.write_text(json.dumps({"client_email": "pilote@projet.iam.gserviceaccount.com", "private_key": pem,
                                   "token_uri": "https://oauth2.googleapis.com/token"}))
    sent = {}

    def token_endpoint(url, *, data=None, headers=None):
        sent["form"] = dict(pair.split("=", 1) for pair in data.decode().split("&"))
        return {"access_token": "jeton-google", "expires_in": 3600}

    monkeypatch.setattr(seo, "_http", token_endpoint)
    config = {**test_app.config, "GSC_CREDENTIALS_FILE": str(account)}

    assert seo._google_token(config) == "jeton-google"
    claims = jwt.decode(sent["form"]["assertion"], key.public_key(), algorithms=["RS256"],
                        audience="https://oauth2.googleapis.com/token")
    assert claims["iss"] == "pilote@projet.iam.gserviceaccount.com"
    assert claims["scope"] == seo.GOOGLE_SCOPE  # lecture seule
    assert seo._google_token(config) == "jeton-google"  # gardé en mémoire tant qu'il vaut


def test_the_property_defaults_to_the_domain_of_the_site(test_app):
    assert seo.google_property(test_app.config) == "sc-domain:leflechoir.fr"
    assert seo.bing_site(test_app.config) == "https://leflechoir.fr/"


def event(kind, outcome, when, visitor="v1", referrer=""):
    data = {"path": "/", "referrer": referrer} if kind == "page" else {}
    db.session.add(UsageEvent(kind=kind, outcome=outcome, status=200, site="fr", lang="fr", created_at=when,
                              visitor=visitor, data=data))


def test_dashboard_figures_compare_two_periods(test_app):
    now = datetime(2026, 10, 21, 12, 0)
    for visitor, referrer in (("a", "google.com"), ("b", "bing.com"), ("c", "chatgpt.com"), ("d", "")):
        event("page", "view", now - timedelta(days=1), visitor, referrer)
    event("page", "view", now - timedelta(days=1), "a", "google.com")  # même visiteur, même jour : une visite
    event("page", "play", now - timedelta(days=2))
    event("page", "pdf", now - timedelta(days=2))
    event("generation", "grid", now - timedelta(days=3))
    event("account", "register", now - timedelta(days=3))
    event("page", "view", now - timedelta(days=10), "z", "google.fr")  # la période d'avant
    db.session.commit()

    figures = stats.dashboard(7, now)
    current = figures["current"]
    assert (current["visitors"], current["views"]) == (4, 5)
    assert current["sources"] == {"direct": 1, "google": 1, "bing": 1, "other_search": 0, "ai": 1, "other": 0}
    assert (current["generations"], current["plays"], current["pdf"], current["registrations"]) == (1, 1, 1, 1)
    assert figures["previous"]["visitors"] == 1
    assert len(figures["daily"]) == 7
    assert figures["daily"][-2] == {"day": "2026-10-20", "visitors": 4, "views": 5, "search": 2, "ai": 1}


def test_the_dashboard_route_is_for_the_administrator_and_knows_its_periods(test_app, client):
    assert client.get("/api/admin/tableau").status_code == 404  # personne : l'adresse n'existe pas
    email, tokens = register(client)
    confirm(email, admin=True)
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    answer = client.get("/api/admin/tableau?jours=30", headers=headers)
    assert answer.status_code == 200
    body = answer.get_json()
    assert body["days"] == 30 and len(body["daily"]) == 30
    assert body["seo"]["sources"]["google"]["configured"] is False
    assert len(body["seo"]["questions"]) == len(seo.QUESTIONS)

    refused = client.get("/api/admin/tableau?jours=12", headers=headers)
    assert refused.status_code == 400
    assert refused.get_json()["reason"] == "unknown_period"


FRONTEND_FIXTURE = Path(__file__).resolve().parents[2] / "frontend" / "tests" / "fixtures" / "admin-tableau.json"


def test_the_frontend_fixture_has_the_shape_of_the_real_response(test_app):
    """`frontend/tests/admin.spec.ts` dessine le tableau de bord à partir de cette réponse enregistrée, tirée du jeu de
    données fictives. La régénérer : `UPDATE_FIXTURES=1 pytest tests/test_seo.py -k fixture` (dépôt complet monté)."""
    if not FRONTEND_FIXTURE.parent.parent.is_dir():
        pytest.skip("frontend/ absent (make test-backend ne monte que backend/)")
    usage_demo.seed_demo(now=NOW)
    data = {"days": 7, **stats.dashboard(7, NOW), "seo": seo.summary(7, NOW)}
    assert data["seo"]["sources"]["google"]["through"]  # le jeu fictif remplit bien le SEO
    if os.environ.get("UPDATE_FIXTURES"):
        FRONTEND_FIXTURE.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    assert shape(json.loads(FRONTEND_FIXTURE.read_text(encoding="utf-8"))) == shape(data)
