"""La force des grilles d'articles : une note de 1 à 6, une par personne et par jour, sans adresse IP."""

import importlib.util
from datetime import datetime, timedelta
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

import usage
from articles import ARTICLE_SLUGS
from extensions import db
from models import ArticleRating

from tests.helpers import send
from tests.test_security import make_app

SLUG = "ecrire-une-definition-de-mots-fleches"
URL = f"/api/articles/{SLUG}/force"
MIGRATION = Path(__file__).resolve().parents[1] / "migrations" / "versions" / "0016_force_des_articles.py"
FRONTEND_ARTICLES = Path(__file__).resolve().parents[2] / "frontend" / "src" / "content" / "articles"


@pytest.fixture(autouse=True)
def clean(test_app):
    ArticleRating.query.delete()
    db.session.commit()
    yield


def rate(client, force, visitor="203.0.113.1", slug=SLUG):
    return send(client, "post", f"/api/articles/{slug}/force", {"force": force},
                {"User-Agent": f"navigateur {visitor}", "X-Test-Visitor": visitor})


@pytest.fixture
def visitors(monkeypatch):
    """Chaque visiteur a son empreinte : on la tire de l'en-tête de test plutôt que d'une adresse IP."""
    from flask import request
    monkeypatch.setattr("articles.visitor_fingerprint", lambda day: f"v-{request.headers.get('X-Test-Visitor')}")


def test_the_average_and_the_count_are_shown_for_the_site_language(client, visitors):
    assert client.get(URL).get_json() == {"slug": SLUG, "lang": "fr", "count": 0, "average": None}

    for visitor, force in (("a", 3), ("b", 4), ("c", 4)):
        assert rate(client, force, visitor).status_code == 201

    assert client.get(URL).get_json() == {"slug": SLUG, "lang": "fr", "count": 3, "average": 3.7}
    assert {row.lang for row in ArticleRating.query.all()} == {"fr"}


def test_a_reader_who_changes_his_mind_replaces_his_rating(client, visitors):
    rate(client, 2, "a")
    body = rate(client, 5, "a").get_json()

    assert (body["force"], body["count"], body["average"]) == (5, 1, 5.0)
    assert [row.force for row in ArticleRating.query.all()] == [5]


def test_the_next_day_the_fingerprint_is_erased_and_the_rating_stays(client, visitors):
    rate(client, 6, "a")
    row = ArticleRating.query.one()
    row.created_at -= timedelta(days=1)
    db.session.commit()

    usage._purge(datetime.utcnow().date())
    db.session.commit()

    row = ArticleRating.query.one()
    assert (row.force, row.visitor) == (6, None)


def test_nothing_that_could_name_the_reader_is_kept(client):
    rate(client, 4)

    row = ArticleRating.query.one()
    assert set(ArticleRating.__table__.columns.keys()) == {"id", "created_at", "slug", "lang", "force", "visitor"}
    assert "203.0.113.1" not in (row.visitor or "") and len(row.visitor) == 32


@pytest.mark.parametrize("body", [{"force": 0}, {"force": 7}, {"force": 3.5}, {"force": "4"}, {}, {"force": None}])
def test_a_force_outside_1_to_6_is_refused_with_a_stable_reason(client, body):
    response = send(client, "post", URL, body)

    assert response.status_code == 400
    assert response.get_json() == {"error": "La force se note de 1 à 6.", "reason": "invalid_force"}
    assert ArticleRating.query.count() == 0


def test_a_body_that_is_not_json_is_refused(client):
    response = client.post(URL, data="4", content_type="text/plain")

    assert (response.status_code, response.get_json()["reason"]) == (400, "invalid_force")


@pytest.mark.parametrize("method", ["get", "post"])
def test_an_unknown_article_is_refused(client, method):
    response = send(client, method, "/api/articles/n-existe-pas/force", {"force": 3} if method == "post" else None)

    assert response.status_code == 404
    assert response.get_json() == {"error": "Cet article n'existe pas.", "reason": "unknown_article"}


def test_rating_is_rate_limited():
    app = make_app(RATELIMIT_ENABLED=True, RATELIMIT_FORCE="3 per minute")
    with app.app_context():
        db.create_all()
        client = app.test_client()

        statuses = [send(client, "post", URL, {"force": 3}).status_code for _ in range(4)]

        assert statuses == [201, 201, 201, 429]
        assert client.get(URL).status_code == 200  # lire la moyenne n'est pas limité


def test_every_article_of_the_site_is_known_to_the_api():
    """Le site statique et l'API doivent connaître les mêmes adresses (le frontend n'est pas monté en CI : on saute)."""
    if not FRONTEND_ARTICLES.is_dir():
        pytest.skip("frontend absent")
    slugs = {path.stem for path in FRONTEND_ARTICLES.glob("*.tsx")}
    assert slugs == set(ARTICLE_SLUGS)


def test_the_migration_only_adds_a_table():
    spec = importlib.util.spec_from_file_location("migration_0016", MIGRATION)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert len(migration.revision) <= 32  # alembic_version.version_num est un VARCHAR(32)

    engine = sa.create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        columns = {column["name"] for column in sa.inspect(connection).get_columns("article_rating")}
    assert columns == set(ArticleRating.__table__.columns.keys())
