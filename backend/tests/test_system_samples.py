"""Échantillons système (ADR 0016, point 3 ; ADR 0022) : ce qui est lu, ce qui est gardé, ce qui s'efface."""

import importlib.util
import json
import os
from datetime import datetime, timedelta
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

import alerts
import system_samples
import usage_demo
from extensions import db
from generation_slots import busy_places, generation_slot
from models import AlertSent, SystemDaily, SystemSample

from tests.helpers import register
from tests.test_admin import admin_routes, confirm
from tests.test_stats_tables import FRONTEND_FIXTURE, shape

NOW = datetime(2026, 10, 1, 15, 30, 42)
# Les vraies lectures de /proc : la fixture les remplace par une machine connue pour tous les autres tests
read_memory, read_cpu, read_api_memory = (system_samples.read_memory, system_samples.read_cpu,
                                          system_samples.read_api_memory)
MIGRATION = Path(__file__).resolve().parents[1] / "migrations" / "versions" / "0011_systeme_et_alertes.py"


@pytest.fixture(autouse=True)
def clean_system(test_app, monkeypatch):
    for model in (SystemSample, SystemDaily, AlertSent):
        model.query.delete()
    db.session.commit()
    # Une machine connue : 4 Go dont 1 Go pris, des compteurs de CPU que chaque test fait avancer
    machine = {"memory": (4000, 1000), "cpu": (1000, 10_000), "api": 800, "db": 42.5}
    monkeypatch.setattr(system_samples, "read_memory", lambda: machine["memory"])
    monkeypatch.setattr(system_samples, "read_cpu", lambda: machine["cpu"])
    monkeypatch.setattr(system_samples, "read_api_memory", lambda: machine["api"])
    monkeypatch.setattr(system_samples, "read_database_size", lambda: machine["db"])
    yield machine


def sample(minutes_ago=0, days_ago=0, **values) -> SystemSample:
    values = {"mem_total_mb": 4000, "mem_used_mb": 1000, "slots_busy": 0, "slots_total": 2, **values}
    row = SystemSample(created_at=NOW.replace(second=0) - timedelta(days=days_ago, minutes=minutes_ago),
                       site="fr", lang="fr", **values)
    db.session.add(row)
    return row


# --- Lectures dans /proc ---

def test_memory_and_cpu_are_read_from_proc(tmp_path):
    (tmp_path / "meminfo").write_text("MemTotal:        4028916 kB\nMemFree:          200000 kB\n"
                                      "MemAvailable:    2684000 kB\n")
    (tmp_path / "stat").write_text("cpu  700 0 200 8000 100 0 0 0 0 0\ncpu0 350 0 100 4000 50 0 0 0 0 0\n")

    assert read_memory(str(tmp_path)) == (3934, 1313)
    assert read_cpu(str(tmp_path)) == (900, 9000)  # occupé : tout sauf idle et iowait


def test_api_memory_is_the_shared_aware_sum_of_its_processes(tmp_path):
    # Des numéros qu'aucun vrai processus ne porte (au-delà de pid_max) : celui du test est écarté d'office
    for pid, command, pss in (("9000011", "gunicorn: master [run:app]", 600_000), ("9000012", "gunicorn: worker", 90_000),
                              ("9000040", "flask\0system\0tick", 80_000)):
        (tmp_path / pid).mkdir()
        (tmp_path / pid / "cmdline").write_text(command)
        (tmp_path / pid / "smaps_rollup").write_text(f"Rss:  999999 kB\nPss:  {pss} kB\n")
    (tmp_path / "self").mkdir()

    # Un autre processus du conteneur (ici un second flask system tick) ne se compte pas dans l'API
    assert read_api_memory(str(tmp_path)) == round(690_000 / 1024)


def test_an_unreadable_proc_gives_a_partial_sample_not_a_crash(tmp_path):
    missing = str(tmp_path / "absent")

    assert read_memory(missing) == (None, None)
    assert read_cpu(missing) == (None, None)
    assert read_api_memory(missing) is None


def test_the_backup_trace_gives_the_date_of_the_last_offsite_copy():
    trace = "2026-10-01T03:30:12Z terminator-20261001-033000.dump.age 184320\n"

    assert system_samples.parse_backup_stamp(trace) == datetime(2026, 10, 1, 3, 30, 12)
    for unreadable in (None, "", "illisible", "01/10/2026 03:30"):
        assert system_samples.parse_backup_stamp(unreadable) is None


def test_busy_places_are_counted_without_taking_one(tmp_path):
    assert busy_places(str(tmp_path), 2) == 0
    assert list(tmp_path.iterdir()) == []  # regarder ne crée aucun fichier

    with generation_slot(str(tmp_path), "compte:1", max_concurrent=2):
        assert busy_places(str(tmp_path), 2) == 1
        # La place restante est toujours libre pour une vraie génération
        with generation_slot(str(tmp_path), "compte:2", max_concurrent=2):
            assert busy_places(str(tmp_path), 2) == 2
    assert busy_places(str(tmp_path), 2) == 0


def test_the_api_probe_reports_an_unreachable_api(test_app):
    assert system_samples.probe_api("") is None
    assert system_samples.probe_api("http://127.0.0.1:9/api/status") is False


# --- Prendre un échantillon ---

def test_a_sample_is_written_once_per_minute(test_app, clean_system, tmp_path, monkeypatch):
    monkeypatch.setitem(test_app.config, "GENERATION_LOCK_DIR", str(tmp_path / "places"))

    first = system_samples.take_sample(NOW, last_backup="2026-10-01T03:30:12Z terminator.dump.age 1")
    again = system_samples.take_sample(NOW + timedelta(seconds=10))

    assert again is None and SystemSample.query.count() == 1
    assert first.created_at == datetime(2026, 10, 1, 15, 30)
    assert (first.site, first.lang) == (test_app.config["SITE"], test_app.config["SITE_LANG"])
    assert (first.mem_total_mb, first.mem_used_mb, first.api_mem_mb, first.db_size_mb) == (4000, 1000, 800, 42.5)
    assert (first.slots_busy, first.slots_total) == (0, 2)
    assert first.last_backup_at == datetime(2026, 10, 1, 3, 30, 12)
    assert first.api_ok is None  # aucune adresse à vérifier dans les tests
    assert first.cpu_percent is None  # pas d'échantillon précédent : pas de taux


def test_cpu_is_the_share_busy_since_the_previous_sample(test_app, clean_system):
    system_samples.take_sample(NOW)
    clean_system["cpu"] = (1300, 11_200)  # 300 occupés sur 1 200 écoulés
    second = system_samples.take_sample(NOW + timedelta(minutes=1))
    clean_system["cpu"] = (50, 400)  # compteurs repartis de zéro : la machine a redémarré
    third = system_samples.take_sample(NOW + timedelta(minutes=2))
    clean_system["cpu"] = (500, 9000)
    late = system_samples.take_sample(NOW + timedelta(minutes=40))  # trop loin du précédent

    assert second.cpu_percent == 25.0
    assert third.cpu_percent is None and late.cpu_percent is None


# --- Résumés quotidiens et ménage ---

def test_finished_days_are_summarised_once(test_app):
    sample(days_ago=2, minutes_ago=5, mem_used_mb=1000, cpu_percent=10.0, slots_busy=0, db_size_mb=40.0)
    sample(days_ago=2, minutes_ago=4, mem_used_mb=3200, cpu_percent=90.0, slots_busy=2, db_size_mb=41.0, api_ok=False)
    sample(days_ago=1, mem_used_mb=1500, cpu_percent=20.0)
    sample(mem_used_mb=1100)  # aujourd'hui : pas encore fini
    db.session.commit()

    assert system_samples.maintain(NOW) == 2
    assert system_samples.maintain(NOW) == 0  # déjà fait : les autres minutes ne coûtent rien

    first, second = SystemDaily.query.order_by(SystemDaily.day).all()
    assert (first.day.isoformat(), first.samples, first.site, first.lang) == ("2026-09-29", 2, "fr", "fr")
    assert (first.mem_used_avg_mb, first.mem_used_max_mb, first.mem_total_mb) == (2100, 3200, 4000)
    assert (first.cpu_avg_percent, first.cpu_max_percent) == (50.0, 90.0)
    assert (first.slots_busy_max, first.slots_full, first.db_size_mb, first.api_down) == (2, 1, 41.0, 1)
    assert (second.day.isoformat(), second.samples) == ("2026-09-30", 1)


def test_samples_are_kept_30_days_and_summaries_13_months(test_app):
    sample(days_ago=31)
    sample(days_ago=29)
    db.session.add(SystemDaily(day=(NOW - timedelta(days=400)).date(), site="fr", lang="fr", samples=1440))
    db.session.add(SystemDaily(day=(NOW - timedelta(days=390)).date(), site="fr", lang="fr", samples=1440))
    for age in (400, 390):
        db.session.add(AlertSent(created_at=NOW - timedelta(days=age), site="fr", lang="fr", kind="ram",
                                 period=f"il y a {age} jours"))
    db.session.commit()

    system_samples.maintain(NOW)

    assert [(NOW - row.created_at).days for row in SystemSample.query.all()] == [29]
    days = sorted((NOW.date() - row.day).days for row in SystemDaily.query.all())
    # L'échantillon effacé a laissé son résumé ; le résumé de plus de 13 mois a disparu
    assert 31 in days and 390 in days and 400 not in days
    assert [row.period for row in AlertSent.query.all()] == ["il y a 390 jours"]  # le journal suit les résumés


# --- Lecture par le poste de pilotage ---

def test_the_system_view_gives_the_latest_sample_and_its_thresholds(test_app):
    sample(minutes_ago=61, mem_used_mb=900, cpu_percent=12.0)
    sample(minutes_ago=1, mem_used_mb=3300, cpu_percent=55.0, slots_busy=2, api_ok=True, db_size_mb=42.5,
           last_backup_at=NOW - timedelta(hours=30))
    db.session.commit()

    view = system_samples.as_json(NOW)

    assert view["fresh"] is True
    assert view["latest"]["mem_used_mb"] == 3300 and view["latest"]["slots_busy"] == 2
    thresholds = view["thresholds"]
    assert (round(thresholds["ram_share"], 3), thresholds["ram_limit"], thresholds["ram_level"]) == (0.825, 0.75, "over")
    assert (thresholds["backup_age_h"], thresholds["backup_level"]) == (30.0, "over")
    assert len(view["hours"]) == 24 and len(view["days"]) == 30
    assert (view["hours"][-1]["mem_used_max_mb"], view["hours"][-2]["mem_used_max_mb"]) == (3300, 900)
    assert view["hours"][0]["samples"] == 0 and view["hours"][0]["mem_used_max_mb"] is None
    assert (view["days"][-1]["day"], view["days"][-1]["samples"], view["days"][-1]["slots_full"]) == ("2026-10-01", 2, 1)
    assert view["retention"] == {"samples_days": 30, "daily_days": 396}


@pytest.mark.parametrize("used, level", [(2000, "ok"), (2500, "near"), (3000, "near"), (3001, "over")])
def test_the_ram_threshold_has_three_states(test_app, used, level):
    sample(mem_used_mb=used)
    db.session.commit()

    assert system_samples.as_json(NOW)["thresholds"]["ram_level"] == level


def test_without_a_recent_sample_nothing_is_reported_green(test_app):
    empty = system_samples.as_json(NOW)
    assert (empty["latest"], empty["fresh"], empty["thresholds"]["ram_level"]) == (None, False, "unknown")

    sample(minutes_ago=20, mem_used_mb=500, last_backup_at=NOW - timedelta(hours=2))
    db.session.commit()
    stale = system_samples.as_json(NOW)

    # Le minuteur ne tourne plus : le dernier chiffre reste lisible, mais aucun seuil n'est déclaré tenu
    assert stale["fresh"] is False and stale["latest"]["mem_used_mb"] == 500
    assert (stale["thresholds"]["ram_level"], stale["thresholds"]["backup_level"]) == ("unknown", "unknown")


def test_the_admin_reads_the_system_and_nobody_else(test_app, client):
    assert "/api/admin/system" in admin_routes(test_app)
    sample(minutes_ago=1)
    db.session.commit()
    email, tokens = register(client)
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    assert client.get("/api/admin/system").status_code == 404
    assert client.get("/api/admin/system", headers=headers).status_code == 404
    confirm(email, admin=True)
    response = client.get("/api/admin/system", headers=headers)

    assert response.status_code == 200, response.get_json()
    data = response.get_json()
    assert data["latest"]["mem_total_mb"] == 4000
    assert set(data["alerts"]) == {"sent", "last_24h", "daily_cap", "cooldown_h", "enabled"}
    assert email not in response.get_data(as_text=True)


# --- La migration décrit les mêmes tables que les modèles ---

def test_the_migration_creates_the_tables_of_the_models():
    """Les tests tournent sur `db.create_all()` : sans ce contrôle, un modèle changé sans sa migration passerait."""
    spec = importlib.util.spec_from_file_location("migration_0011", MIGRATION)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert len(migration.revision) <= 32  # alembic_version.version_num est un VARCHAR(32)

    engine = sa.create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        inspector = sa.inspect(connection)
        for model in (SystemSample, SystemDaily, AlertSent):
            table = model.__table__
            migrated = {column["name"]: column for column in inspector.get_columns(table.name)}
            assert set(migrated) == {column.name for column in table.columns}, table.name
            for column in table.columns:
                assert migrated[column.name]["nullable"] == column.nullable, (table.name, column.name)
            uniques = {tuple(sorted(unique["column_names"])) for unique in inspector.get_unique_constraints(table.name)}
            expected = {tuple(sorted(column.name for column in constraint.columns))
                        for constraint in table.constraints if isinstance(constraint, sa.UniqueConstraint)}
            assert uniques == expected, table.name


# --- Contrat avec l'interface ---

def test_the_frontend_fixture_has_the_shape_of_the_real_response(test_app, monkeypatch):
    """Comme pour `/api/admin/stats` (test_stats_tables.py) : `frontend/tests/admin.spec.ts` dessine la rubrique
    « Système » à partir de cette réponse enregistrée, sur le jeu de données fictives.

    La régénérer : `UPDATE_FIXTURES=1 pytest tests/test_system_samples.py -k fixture` (dépôt complet monté).
    """
    fixture = FRONTEND_FIXTURE.with_name("admin-system.json")
    if not fixture.parent.parent.is_dir():
        pytest.skip("frontend/ absent (make test-backend ne monte que backend/)")
    moment = datetime(2026, 10, 1, 15, 30)
    monkeypatch.setitem(test_app.config, "ALERT_EMAIL", "auteur@exemple.fr")  # jamais dans la réponse
    usage_demo.seed_demo(now=moment)
    data = {**system_samples.as_json(moment), "alerts": alerts.recent(moment)}
    if os.environ.get("UPDATE_FIXTURES"):
        fixture.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    recorded = json.loads(fixture.read_text(encoding="utf-8"))

    assert shape(recorded) == shape(data)
