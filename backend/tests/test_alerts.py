"""Alertes et bilan hebdomadaire (#132) : ce qui déclenche un envoi, et surtout ce qui le retient.

Le quota de Brevo est partagé avec les e-mails du compte : les plafonds sont la partie qui ne doit jamais céder."""

from datetime import datetime, timedelta

import pytest

import alerts
import mailer
import system_samples
from extensions import db
from models import AlertSent, SystemDaily, SystemSample, UsageEvent, VisitorSalt

NOW = datetime(2026, 10, 1, 15, 30)  # un jeudi
MONDAY = datetime(2026, 10, 5, 6, 0)
AUTHOR = "auteur@exemple.fr"


@pytest.fixture(autouse=True)
def clean(test_app, monkeypatch):
    for model in (SystemSample, SystemDaily, AlertSent, UsageEvent, VisitorSalt):
        model.query.delete()
    db.session.commit()
    monkeypatch.setitem(test_app.config, "MAIL_BACKEND", "memory")
    monkeypatch.setitem(test_app.config, "ALERT_EMAIL", AUTHOR)
    monkeypatch.setitem(test_app.config, "ALERT_DAILY_CAP", 10)
    test_app.extensions["sent_emails"] = []
    yield


@pytest.fixture
def outbox(test_app):
    return test_app.extensions["sent_emails"]


def sample(minutes_ago=0, now=NOW, **values):
    values = {"mem_total_mb": 4000, "mem_used_mb": 1000, **values}
    db.session.add(SystemSample(created_at=now - timedelta(minutes=minutes_ago), site="fr", lang="fr", **values))


def generation(outcome="grid", status=200, duration_ms=1000, minutes_ago=30, now=NOW):
    db.session.add(UsageEvent(created_at=now - timedelta(minutes=minutes_ago), kind="generation", outcome=outcome,
                              status=status, route="/api/grids/generate", site="fr", lang="fr", visitor="a" * 32,
                              duration_ms=duration_ms, cpu_ms=duration_ms, data={"format": "6x7"}))


def kinds(now=NOW, **options) -> list[str]:
    db.session.commit()
    return [kind for kind, _ in alerts.findings(now, **options)]


# --- Seuils ---

def test_nothing_to_report_on_a_quiet_server(test_app):
    for minute in range(5):
        sample(minute, api_ok=True)
    for _ in range(30):
        generation()

    assert kinds() == []


def test_ram_alerts_after_five_samples_above_75_percent_not_on_a_spike(test_app):
    for minute in range(4):
        sample(minute, mem_used_mb=3200)
    assert kinds() == []  # quatre minutes : pas encore

    sample(4, mem_used_mb=3200)
    assert kinds() == ["ram"]

    SystemSample.query.filter_by(created_at=NOW - timedelta(minutes=2)).update({"mem_used_mb": 2900})
    assert kinds() == []  # une minute sous le seuil dans la série : c'était une pointe


def test_busy_refusals_alert_above_5_percent_of_enough_generations(test_app):
    generation("busy_server", 429)
    for _ in range(18):
        generation()
    assert kinds() == []  # 19 demandes : trop peu pour qu'un pourcentage ait un sens

    generation("busy_visitor", 429)
    assert kinds() == ["busy"]  # 2 sur 20 : 10 %

    for _ in range(20):
        generation()
    assert kinds() == []  # 2 sur 40 : 5 %, le seuil n'est pas dépassé


def test_slow_generations_alert_when_p95_exceeds_15_seconds(test_app):
    for _ in range(18):
        generation(duration_ms=2_000)
    for _ in range(2):
        generation(duration_ms=16_000)
    assert kinds() == ["p95"]

    UsageEvent.query.filter(UsageEvent.duration_ms == 16_000).update({"created_at": NOW - timedelta(hours=30)})
    assert kinds() == []  # c'était hier : la fenêtre est de 24 heures


def test_a_spike_of_500_errors_alerts(test_app):
    for minute in range(4):
        db.session.add(UsageEvent(created_at=NOW - timedelta(minutes=minute), kind="error", status=500,
                                  route="/api/grids", site="fr", lang="fr", data={}))
    db.session.add(UsageEvent(created_at=NOW - timedelta(minutes=40), kind="error", status=500, route="/api/grids",
                              site="fr", lang="fr", data={}))
    db.session.add(UsageEvent(created_at=NOW, kind="error", status=404, route="/api/grids", site="fr", lang="fr",
                              data={}))
    assert kinds() == []  # quatre dans le quart d'heure

    generation("http_500", 500, minutes_ago=1)
    assert kinds() == ["server_errors"]


def test_a_missing_backup_alerts_only_where_backups_are_watched(test_app):
    sample(0, last_backup_at=NOW - timedelta(hours=30))
    assert kinds() == []  # le minuteur n'a pas passé de trace (développement) : rien à surveiller

    assert kinds(backup_watched=True) == ["backup"]

    SystemSample.query.update({"last_backup_at": NOW - timedelta(hours=12)})
    assert kinds(backup_watched=True) == []
    SystemSample.query.update({"last_backup_at": None})
    assert kinds(backup_watched=True) == ["backup"]  # trace illisible ou absente


def test_an_unreachable_api_alerts_after_three_samples_not_during_a_restart(test_app):
    sample(0, api_ok=False)
    sample(1, api_ok=False)
    sample(2, api_ok=True)
    assert kinds() == []

    SystemSample.query.update({"api_ok": False})
    assert kinds() == ["api_down"]


# --- Plafonds ---

def test_an_alert_is_sent_once_per_type_and_per_day(test_app, outbox):
    for minute in range(5):
        sample(minute, mem_used_mb=3500)
    db.session.commit()

    assert alerts.run(NOW) == ["ram"]
    for minute in range(1, 120):  # le problème dure : le minuteur repasse chaque minute
        assert alerts.run(NOW + timedelta(minutes=minute)) == []

    [message] = outbox
    assert message["To"] == AUTHOR
    assert message["Subject"] == "Alerte : mémoire du serveur — Le Fléchoir"
    body = message.get_content()
    assert "87,5 %" in body and "/admin" in body
    [entry] = AlertSent.query.all()
    assert (entry.kind, entry.period, entry.delivered, entry.site, entry.lang) == ("ram", "2026-10-01", True, "fr", "fr")


def test_the_same_alert_can_leave_again_after_24_hours(test_app, outbox):
    later = NOW + timedelta(hours=24, minutes=1)
    for now in (NOW, later):
        for minute in range(5):
            sample(minute, now=now, mem_used_mb=3500)
    db.session.commit()

    assert alerts.run(NOW) == ["ram"]
    assert alerts.run(NOW + timedelta(hours=23)) == []
    assert alerts.run(later) == ["ram"]
    assert len(outbox) == 2


def test_the_daily_cap_stops_everything_tests_included(test_app, outbox, monkeypatch):
    monkeypatch.setitem(test_app.config, "ALERT_DAILY_CAP", 3)

    results = [alerts.send_test(NOW + timedelta(seconds=second)) for second in range(6)]

    assert results == [True, True, True, False, False, False]
    assert len(outbox) == 3 and AlertSent.query.count() == 3
    # Le plafond glisse sur 24 heures : le lendemain, les envois reprennent
    assert alerts.send_test(NOW + timedelta(hours=24, minutes=1)) is True


def test_a_failed_delivery_still_counts_and_is_not_retried(test_app, outbox, monkeypatch):
    def unreachable(*args, **kwargs):
        raise OSError("serveur SMTP injoignable")

    monkeypatch.setitem(test_app.config, "MAIL_BACKEND", "smtp")
    monkeypatch.setattr(mailer.smtplib, "SMTP", unreachable)
    for minute in range(5):
        sample(minute, mem_used_mb=3500)
    db.session.commit()

    assert alerts.run(NOW) == []
    assert alerts.run(NOW + timedelta(minutes=1)) == []  # pas de nouvel essai chaque minute

    [entry] = AlertSent.query.all()
    assert (entry.kind, entry.delivered) == ("ram", False)


def test_two_timers_crossing_cannot_send_the_same_alert_twice(test_app, outbox):
    # L'autre passage vient d'écrire sa ligne, une seconde dans le futur de celui-ci : le délai de 24 heures ne
    # la voit pas forcément, la clé unique (type, période) si
    db.session.add(AlertSent(created_at=NOW - timedelta(hours=25), site="fr", lang="fr", kind="ram",
                             period="2026-10-01", summary="déjà écrite"))
    db.session.commit()

    assert alerts.deliver("ram", "2026-10-01", "Mémoire.", "Mémoire.", NOW) is False
    assert outbox == [] and AlertSent.query.count() == 1


def test_without_a_recipient_nothing_leaves_and_nothing_is_logged(test_app, outbox, monkeypatch, runner):
    monkeypatch.setitem(test_app.config, "ALERT_EMAIL", "")

    assert alerts.send_test(NOW) is False
    assert alerts.send_weekly(MONDAY) is False
    assert outbox == [] and AlertSent.query.count() == 0
    refused = runner.invoke(args=["system", "test-alert"])
    assert refused.exit_code != 0 and "ALERT_EMAIL" in refused.output


def test_subjects_are_fixed_and_carry_no_data(test_app):
    # Un saut de ligne dans un en-tête fait échouer l'envoi (#131) : aucune donnée n'entre dans l'objet
    assert set(alerts.SUBJECTS) == {"ram", "busy", "p95", "server_errors", "backup", "api_down", "test", "weekly", "contact",
                                  "contact_more"}
    for subject in alerts.SUBJECTS.values():
        assert "\n" not in subject and "{" not in subject and "%" not in subject


# --- Bilan hebdomadaire ---

def test_the_weekly_report_leaves_on_monday_morning_once(test_app, outbox):
    for _ in range(3):
        generation(now=MONDAY, minutes_ago=60)
    generation("timeout", 422, now=MONDAY, minutes_ago=60)
    db.session.add(UsageEvent(created_at=MONDAY - timedelta(days=2), kind="account", outcome="register", status=201,
                              route="/api/auth/register", site="fr", lang="fr", visitor="b" * 32, data={}))
    db.session.add(UsageEvent(created_at=MONDAY - timedelta(days=9), kind="account", outcome="register", status=201,
                              route="/api/auth/register", site="fr", lang="fr", visitor="c" * 32, data={}))
    db.session.add(SystemDaily(day=(MONDAY - timedelta(days=1)).date(), site="fr", lang="fr", samples=1440,
                               mem_total_mb=4000, mem_used_max_mb=1400, cpu_avg_percent=7.5, db_size_mb=43.0))
    db.session.commit()

    assert alerts.send_weekly(MONDAY - timedelta(days=1)) is False  # dimanche
    assert alerts.send_weekly(MONDAY.replace(hour=5)) is False  # lundi, trop tôt
    assert alerts.send_weekly(MONDAY) is True
    assert alerts.send_weekly(MONDAY + timedelta(minutes=1)) is False
    assert alerts.send_weekly(MONDAY + timedelta(hours=30)) is False  # mardi

    [message] = outbox
    assert message["Subject"] == "Bilan de la semaine — Le Fléchoir"
    body = message.get_content()
    for expected in ("Semaine du 28/09/2026 au 05/10/2026", "Visiteurs", "Générations demandées", "75 %",
                     "Nouveaux comptes", "(semaine précédente : 1)", "Erreurs", "1400 Mo sur 4000 Mo", "base : 43 Mo"):
        assert expected in body, expected
    assert AlertSent.query.filter_by(kind="weekly", period="2026-W41").count() == 1


def test_the_weekly_report_opens_with_the_race_over_the_last_four_complete_weeks(test_app, outbox):
    """#201 : les indicateurs de la course, par semaine ISO. Le lundi 5 octobre à 6 h, S40 (28/09 au 04/10) vient de
    finir ; S41 commence à peine et ne figure pas dans le bilan."""
    def add(kind, outcome, when, visitor):
        db.session.add(UsageEvent(created_at=when, kind=kind, outcome=outcome, status=200, route="/api/test",
                                  site="fr", lang="fr", visitor=visitor, data={}))

    for index in range(2):  # S39 : deux générations réussies
        add("generation", "grid", datetime(2026, 9, 22, 10), f"{index:032x}")
    for index in range(3):  # S40 : trois, un export PDF de la balise, une inscription
        add("generation", "grid", datetime(2026, 9, 29, 10), f"{index:032x}")
    add("page", "pdf", datetime(2026, 10, 2, 18), "f" * 32)
    add("account", "register", datetime(2026, 10, 4, 21), "a" * 32)
    add("account", "register", datetime(2026, 10, 5, 0, 30), "b" * 32)  # S41, lundi après minuit
    db.session.commit()

    assert alerts.send_weekly(MONDAY) is True

    [message] = outbox
    body = message.get_content()
    race, usage = body.index("La course : les 4 dernières semaines complètes"), body.index("Semaine du 28/09/2026")
    assert race < usage  # la course d'abord
    block = body[race:usage]
    for expected in ("S37", "S38", "S39", "S40", "Visiteurs (somme par jour)", "Générations réussies",
                     "Grilles terminées", "  dont exports PDF", "  dont grilles conservées", "Comptes créés",
                     "en hausse (+1, +50 %)",  # 3 générations réussies contre 2
                     "S40 : du 28/09 au 04/10/2026. Tendance : S40 contre S39."):
        assert expected in block, expected
    # Ce qui ne se mesure pas encore est annoncé, jamais chiffré
    for label in ("Parties jouées", "Grilles publiées", "Avis reçus"):
        assert any(line.startswith(label) and line.endswith("à venir") for line in block.splitlines()), label
    assert "S41" not in block and "*" not in block  # la semaine en cours attend le bilan suivant
    # Le reste du bilan est là, à sa place
    for expected in ("Générations demandées", "Nouveaux comptes", "Messages de contact reçus", "Serveur :"):
        assert expected in body, expected


def test_the_report_can_be_forced_but_stays_under_the_cap(test_app, outbox, monkeypatch, runner):
    monkeypatch.setitem(test_app.config, "ALERT_DAILY_CAP", 2)

    assert runner.invoke(args=["system", "weekly-report"]).exit_code == 0
    assert runner.invoke(args=["system", "test-alert"]).exit_code == 0
    refused = runner.invoke(args=["system", "weekly-report"])

    assert refused.exit_code != 0 and "plafond" in refused.output
    assert [message["Subject"].split(" — ")[0] for message in outbox] == ["Bilan de la semaine", "Alerte d'essai"]


# --- Le minuteur ---

def test_a_tick_samples_cleans_and_alerts(test_app, outbox, runner, monkeypatch):
    monkeypatch.setattr(system_samples, "read_memory", lambda: (4000, 3600))
    monkeypatch.setattr(alerts, "send_weekly", lambda: False)  # sinon ce test enverrait le bilan chaque lundi
    now = system_samples._utcnow().replace(second=0, microsecond=0)
    for minute in range(1, 5):
        sample(minute, now=now, mem_used_mb=3600)
    db.session.commit()

    result = runner.invoke(args=["system", "tick"])

    assert result.exit_code == 0, result.output
    assert SystemSample.query.count() == 5
    assert [message["Subject"] for message in outbox] == ["Alerte : mémoire du serveur — Le Fléchoir"]


def test_the_timer_hands_over_the_backup_trace(test_app, outbox, runner, monkeypatch):
    monkeypatch.setattr(alerts, "send_weekly", lambda: False)
    recent = (system_samples._utcnow() - timedelta(hours=5)).strftime("%Y-%m-%dT%H:%M:%SZ")

    assert runner.invoke(args=["system", "tick", "--last-backup", f"{recent} terminator.dump.age 184320"]).exit_code == 0
    latest = SystemSample.query.one()
    assert latest.last_backup_at is not None and outbox == []

    # La trace manque sur l'hôte : le minuteur passe une chaîne vide, et l'alerte part
    SystemSample.query.delete()
    db.session.commit()
    assert runner.invoke(args=["system", "tick", "--last-backup", ""]).exit_code == 0
    assert [message["Subject"] for message in outbox] == ["Alerte : sauvegarde manquante — Le Fléchoir"]


def test_a_failing_step_does_not_stop_the_others(test_app, outbox, runner, monkeypatch):
    def broken(**options):
        raise RuntimeError("/proc illisible")

    monkeypatch.setattr(system_samples, "take_sample", broken)
    monkeypatch.setattr(alerts, "send_weekly", lambda: False)
    now = system_samples._utcnow()
    for minute in range(5):
        db.session.add(UsageEvent(created_at=now - timedelta(minutes=minute), kind="error", status=500,
                                  route="/api/grids", site="fr", lang="fr", data={}))
    db.session.commit()

    result = runner.invoke(args=["system", "tick"])

    assert result.exit_code != 0  # le minuteur le saura par son code de retour
    assert [message["Subject"] for message in outbox] == ["Alerte : erreurs 500 — Le Fléchoir"]
