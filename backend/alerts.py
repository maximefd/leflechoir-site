"""Alertes et bilan hebdomadaire par e-mail (#132) : les problèmes viennent à l'auteur.

`flask system tick`, lancé chaque minute par un minuteur du serveur ([ADR 0022](../docs/adr/0022-echantillons-systeme-et-alertes.md)),
prend un échantillon (system_samples.py), fait le ménage du jour, puis regarde s'il faut prévenir :

- **mémoire** au-delà de 75 % sur cinq échantillons de suite, **refus « occupé »** au-delà de 5 % des générations
  et **p95** au-delà de 15 s sur 24 heures : les seuils de l'[ADR 0013](../docs/adr/0013-cible-hebergement-production.md) ;
- **pic d'erreurs 500**, **sauvegarde manquante**, **API injoignable** ;
- le lundi matin, le **bilan de la semaine**.

**Les envois sont plafonnés.** Le quota gratuit de Brevo, 300 e-mails par jour, est partagé avec les e-mails du
compte (confirmation d'adresse, mot de passe oublié) : une boucle d'alertes priverait les visiteurs de leurs liens.

- une alerte par type et par 24 heures ;
- `ALERT_DAILY_CAP` envois par 24 heures, tous types confondus, essais et bilan compris ;
- la ligne du journal (`AlertSent`) est écrite **avant** l'envoi, et sa clé unique (type, période) interdit le
  doublon même si deux minuteurs se croisent : un envoi raté ou un minuteur qui s'emballe ne renvoie rien ;
- sans destinataire (`ALERT_EMAIL`), rien ne part.

L'objet de chaque message est fixe : aucune donnée n'entre dans un en-tête (#131).
"""

import logging
import os
from collections import Counter
from datetime import datetime, timedelta, timezone

import click
from flask import current_app
from flask.cli import AppGroup
from sqlalchemy.exc import IntegrityError

import stats
import system_samples
from extensions import db
from mailer import send_email
from models import AlertSent, ContactMessage, SystemSample, UsageEvent

# Une alerte du même type ne repart pas avant ce délai, que le problème dure ou qu'il revienne
COOLDOWN = timedelta(hours=24)
# Seuils de l'ADR 0013, lus sur 24 heures pour qu'une alerte parle du présent ; il faut assez de demandes pour
# qu'un pourcentage ait un sens
WINDOW = timedelta(hours=24)
MIN_GENERATIONS = 20
# Mémoire : cinq échantillons de suite au-delà du seuil, pas une pointe d'une minute
RAM_SAMPLES = 5
# Pic d'erreurs 500 : ce nombre en un quart d'heure
SERVER_ERRORS_SPIKE = 5
SERVER_ERRORS_WINDOW = timedelta(minutes=15)
# API injoignable : trois échantillons de suite, pas un redémarrage (un déploiement la coupe une minute ou deux)
API_DOWN_SAMPLES = 3
# Messages de contact : une notification chacun jusqu'à ce nombre par 24 heures, puis une seule pour les suivants
CONTACT_NOTIFY_MAX = 5
# Bilan : le lundi, à partir de cette heure (UTC)
WEEKLY_WEEKDAY = 0
WEEKLY_HOUR = 6

SUBJECTS = {
    "ram": "Alerte : mémoire du serveur",
    "busy": "Alerte : générateur occupé",
    "p95": "Alerte : générations lentes",
    "server_errors": "Alerte : erreurs 500",
    "backup": "Alerte : sauvegarde manquante",
    "api_down": "Alerte : API injoignable",
    "test": "Alerte d'essai",
    "weekly": "Bilan de la semaine",
    "contact": "Nouveau message de contact",
    "contact_more": "Messages de contact en attente",
}

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _seconds(ms: float | None) -> str:
    return "—" if ms is None else f"{ms / 1000:.1f} s".replace(".", ",")


def _percent(share: float) -> str:
    return f"{100 * share:.1f} %".replace(".", ",")


# --- Ce qui mérite une alerte ---

def findings(now: datetime, backup_watched: bool = False) -> list[tuple[str, str]]:
    """Les alertes à lever maintenant : (type, ce qui se passe en une ligne). Des chiffres, rien de personnel.

    `backup_watched` : le minuteur a passé la trace de la sauvegarde (`--last-backup`), même vide. Sans cela
    (développement), une sauvegarde absente n'est pas une anomalie.
    """
    site = current_app.config["SITE"]
    found = []

    samples = (SystemSample.query.filter(SystemSample.site == site,
                                         SystemSample.created_at >= now - system_samples.STALE_AFTER * 2)
               .order_by(SystemSample.created_at.desc()).limit(RAM_SAMPLES).all())
    shares = [sample.mem_used_mb / sample.mem_total_mb for sample in samples
              if sample.mem_used_mb is not None and sample.mem_total_mb]
    if len(shares) == RAM_SAMPLES and min(shares) > system_samples.RAM_THRESHOLD:
        found.append(("ram", f"Mémoire à {_percent(shares[0])} depuis {RAM_SAMPLES} minutes "
                             f"(seuil {_percent(system_samples.RAM_THRESHOLD)})."))

    down = samples[:API_DOWN_SAMPLES]
    if len(down) == API_DOWN_SAMPLES and all(sample.api_ok is False for sample in down):
        found.append(("api_down", f"L'API ne répond plus sur /api/status depuis {API_DOWN_SAMPLES} minutes."))

    latest = samples[0] if samples else None
    if latest is not None and backup_watched:
        if latest.last_backup_at is None:
            found.append(("backup", "Aucune trace de sauvegarde copiée hors du serveur."))
        elif now - latest.last_backup_at > system_samples.BACKUP_MAX_AGE:
            found.append(("backup", f"Dernière sauvegarde copiée hors du serveur le "
                                    f"{latest.last_backup_at:%d/%m/%Y à %H:%M} UTC."))

    generations = UsageEvent.query.filter(UsageEvent.kind == "generation", UsageEvent.created_at >= now - WINDOW,
                                          UsageEvent.site == site).all()
    if len(generations) >= MIN_GENERATIONS:
        outcomes = Counter(event.outcome for event in generations)
        busy_share = sum(outcomes[outcome] for outcome in stats.BUSY) / len(generations)
        if busy_share > stats.BUSY_THRESHOLD:
            found.append(("busy", f"Refus « occupé » : {_percent(busy_share)} des {len(generations)} générations "
                                  f"des dernières 24 heures (seuil {_percent(stats.BUSY_THRESHOLD)})."))
        durations = [event.duration_ms for event in generations
                     if event.outcome == "grid" and event.duration_ms is not None]
        p95 = stats._percentile(durations, 0.95)
        if len(durations) >= MIN_GENERATIONS and p95 > stats.P95_THRESHOLD_S * 1000:
            found.append(("p95", f"Durée p95 des générations réussies : {_seconds(p95)} sur 24 heures "
                                 f"(seuil {stats.P95_THRESHOLD_S} s)."))

    errors = UsageEvent.query.filter(UsageEvent.status >= 500, UsageEvent.site == site,
                                     UsageEvent.created_at >= now - SERVER_ERRORS_WINDOW).count()
    if errors >= SERVER_ERRORS_SPIKE:
        minutes = int(SERVER_ERRORS_WINDOW.total_seconds() // 60)
        found.append(("server_errors", f"{errors} erreurs 500 en {minutes} minutes. Le détail est dans Sentry."))
    return found


# --- Envoyer, sous plafond ---

def deliver(kind: str, period: str, summary: str, body: str, now: datetime | None = None,
            cooldown: bool = True) -> bool:
    """Envoie un message à l'auteur s'il reste de la place sous les plafonds ; vrai s'il est parti.

    `cooldown=False` pour un envoi demandé à la main (essai, bilan forcé) : il échappe au délai par type, jamais
    au plafond quotidien.
    """
    now = now or _utcnow()
    config = current_app.config
    recipient = config.get("ALERT_EMAIL")
    if not recipient:
        return False
    site = config["SITE"]
    since = now - COOLDOWN
    if cooldown and AlertSent.query.filter(AlertSent.site == site, AlertSent.kind == kind,
                                           AlertSent.created_at > since).count():
        return False
    if AlertSent.query.filter(AlertSent.site == site, AlertSent.created_at > since).count() >= config["ALERT_DAILY_CAP"]:
        logger.warning("Alerte « %s » non envoyée : plafond de %s envois par 24 heures atteint", kind,
                       config["ALERT_DAILY_CAP"])
        return False

    # Écrite avant l'envoi : quoi qu'il arrive ensuite, cette alerte compte, et ne repart pas
    entry = AlertSent(created_at=now, site=site, lang=config["SITE_LANG"], kind=kind, period=period,
                      summary=summary[:200])
    db.session.add(entry)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()  # un autre passage l'a déjà écrite
        return False

    text = (f"{body}\n\nPoste de pilotage : {config['FRONTEND_URL'].rstrip('/')}/admin\n"
            f"— {config['SITE_NAME']} ({site}), message automatique.")
    entry.delivered = send_email(recipient, f"{SUBJECTS[kind]} — {config['SITE_NAME']}", text)
    db.session.commit()
    return entry.delivered


def notify_contact(message_id: int, now: datetime | None = None) -> bool:
    """Prévient l'auteur d'un message de contact, **sans le recopier** : il se lit dans le poste de pilotage.

    Une notification par message jusqu'à `CONTACT_NOTIFY_MAX` par 24 heures, puis une seule pour tous les suivants :
    un envoi en rafale ne mange ni le quota de Brevo ni la place des alertes. Toujours sous le plafond quotidien.
    """
    now = now or _utcnow()
    config = current_app.config
    sent = AlertSent.query.filter(AlertSent.site == config["SITE"], AlertSent.kind == "contact",
                                  AlertSent.created_at > now - COOLDOWN).count()
    if sent < CONTACT_NOTIFY_MAX:
        summary = "Un message est arrivé dans la boîte de réception."
        return deliver("contact", f"m{message_id}", summary,
                       f"{summary}\n\nSon texte n'est pas recopié ici : il se lit dans le poste de pilotage.",
                       now, cooldown=False)
    summary = f"Plus de {CONTACT_NOTIFY_MAX} messages de contact en 24 heures."
    return deliver("contact_more", now.strftime("%Y-%m-%d"), summary,
                   f"{summary}\n\nLes suivants ne sont plus signalés un par un : ils t'attendent dans la boîte de "
                   "réception du poste de pilotage.", now)


def run(now: datetime | None = None, backup_watched: bool = False) -> list[str]:
    """Lève les alertes du moment ; renvoie les types réellement envoyés."""
    now = now or _utcnow()
    sent = []
    for kind, summary in findings(now, backup_watched):
        body = (f"{summary}\n\nCette alerte ne sera pas répétée avant 24 heures, même si le problème dure : "
                "le poste de pilotage dit où il en est.")
        if deliver(kind, now.strftime("%Y-%m-%d"), summary, body, now):
            sent.append(kind)
    return sent


def send_test(now: datetime | None = None) -> bool:
    now = now or _utcnow()
    summary = "Alerte d'essai : si tu la lis, les alertes arrivent."
    return deliver("test", now.strftime("%Y-%m-%dT%H:%M:%S"), summary,
                   f"{summary}\n\nElle compte dans le plafond quotidien, comme les autres.", now, cooldown=False)


# --- Bilan hebdomadaire ---

def weekly_body(now: datetime) -> str:
    """La course d'abord (#201) : les quatre dernières semaines ISO complètes et leur tendance, puis les sept derniers
    jours à côté des sept précédents : visiteurs, générations, erreurs, nouveaux comptes."""
    config = current_app.config
    cpu_count = os.cpu_count() or 1
    # Les pages vues (la balise du navigateur) ont leur rubrique : les chiffres de l'API restent ceux de `flask stats`
    events = UsageEvent.query.filter(UsageEvent.created_at >= now - timedelta(days=14), UsageEvent.kind != "page",
                                     UsageEvent.site == config["SITE"]).all()
    week = stats._period_figures([e for e in events if e.created_at >= now - timedelta(days=7)], 7, cpu_count)
    before = stats._period_figures([e for e in events if e.created_at < now - timedelta(days=7)], 7, cpu_count)

    def line(label, key, fmt=str):
        return f"{label:<28} {fmt(week[key]):>10}   (semaine précédente : {fmt(before[key])})"

    lines = [
        # La semaine en cours n'y figure pas : le bilan part le lundi, elle commence à peine
        *stats.render_race(stats.race(now, config["SITE"])),
        "",
        f"Semaine du {now - timedelta(days=7):%d/%m/%Y} au {now:%d/%m/%Y} (UTC).",
        "",
        line("Visiteurs (somme par jour)", "visitors"),
        line("Recherches", "searches"),
        line("Générations demandées", "generations"),
        line("  grilles obtenues", "grids"),
        line("  taux de réussite", "success"),
        line("  durée p95", "p95", _seconds),
        line("  refus « occupé »", "busy"),
        line("Nouveaux comptes", "register"),
        line("Grilles conservées", "saved"),
        line("Erreurs (4xx et 5xx)", "errors"),
        line("  dont 5xx", "server_errors"),
    ]

    messages = ContactMessage.query.filter(ContactMessage.site == config["SITE"])
    unread = messages.filter(ContactMessage.read_at.is_(None)).count()
    received = messages.filter(ContactMessage.created_at >= now - timedelta(days=7)).count()
    lines += ["", f"Messages de contact reçus : {received} cette semaine, {unread} non lu(s) en tout."]

    system = system_samples.as_json(now)
    days = [day for day in system["days"][-7:] if day["samples"]]
    lines += ["", "Serveur :"]
    if not days:
        lines.append("  aucun échantillon cette semaine : le minuteur est à vérifier (docs/PRODUCTION.md).")
    else:
        total = next((day["mem_total_mb"] for day in reversed(days) if day["mem_total_mb"]), None)
        used = max((day["mem_used_max_mb"] for day in days if day["mem_used_max_mb"] is not None), default=None)
        cpu = [day["cpu_avg_percent"] for day in days if day["cpu_avg_percent"] is not None]
        size = next((day["db_size_mb"] for day in reversed(days) if day["db_size_mb"] is not None), None)
        if total and used is not None:
            lines.append(f"  mémoire au plus haut : {used} Mo sur {total} Mo ({_percent(used / total)}, "
                         f"seuil {_percent(system_samples.RAM_THRESHOLD)})")
        if cpu:
            lines.append(f"  CPU moyen : {_percent(sum(cpu) / len(cpu) / 100)}")
        if size is not None:
            lines.append(f"  base : {size:.0f} Mo")
        backup = system["latest"]["last_backup_at"] if system["latest"] else None
        if backup:
            lines.append(f"  dernière sauvegarde hors du serveur : {backup}")
    alerts = AlertSent.query.filter(AlertSent.site == config["SITE"], AlertSent.created_at >= now - timedelta(days=7),
                                    AlertSent.kind.notin_(("weekly", "test"))).count()
    lines += ["", f"Alertes envoyées cette semaine : {alerts}."]
    return "\n".join(lines)


def send_weekly(now: datetime | None = None, force: bool = False) -> bool:
    """Le bilan du lundi matin, une fois par semaine ; `force` l'envoie maintenant, toujours sous le plafond."""
    now = now or _utcnow()
    year, week, _ = now.isocalendar()
    period = f"{year}-W{week:02d}"
    if force:
        period += now.strftime(" %H%M%S")
    elif now.weekday() != WEEKLY_WEEKDAY or now.hour < WEEKLY_HOUR:
        return False
    elif AlertSent.query.filter_by(site=current_app.config["SITE"], kind="weekly", period=period).count():
        return False
    return deliver("weekly", period, f"Bilan de la semaine {period}.", weekly_body(now), now, cooldown=not force)


def recent(now: datetime | None = None, limit: int = 20) -> dict:
    """Le journal des envois, pour le poste de pilotage : sans le destinataire, que le serveur seul connaît."""
    now = now or _utcnow()
    config = current_app.config
    rows = (AlertSent.query.filter_by(site=config["SITE"]).order_by(AlertSent.created_at.desc()).limit(limit).all())
    return {
        "sent": [{"at": row.created_at.isoformat(timespec="seconds") + "Z", "kind": row.kind,
                  "summary": row.summary, "delivered": row.delivered} for row in rows],
        "last_24h": AlertSent.query.filter(AlertSent.site == config["SITE"],
                                           AlertSent.created_at > now - COOLDOWN).count(),
        "daily_cap": config["ALERT_DAILY_CAP"],
        "cooldown_h": int(COOLDOWN.total_seconds() // 3600),
        "enabled": bool(config.get("ALERT_EMAIL")),
    }


# --- En ligne de commande : c'est le minuteur du serveur qui appelle ---

system_cli = AppGroup("system", help="Échantillons système, alertes et bilan hebdomadaire (ADR 0022).")


@system_cli.command("tick")
@click.option("--last-backup", default=None,
              help="Trace de la dernière sauvegarde copiée hors du serveur (le contenu de backups/derniere-sauvegarde, "
                   "même vide) : la donner fait surveiller la sauvegarde.")
def tick_command(last_backup):
    """À lancer chaque minute : un échantillon, le ménage du jour, les alertes, et le bilan s'il est dû."""
    failed = False
    watched = last_backup is not None
    for label, step in (("échantillon", lambda: system_samples.take_sample(last_backup=last_backup)),
                        ("ménage", lambda: system_samples.maintain()),
                        ("alertes", lambda: run(backup_watched=watched)), ("bilan", lambda: send_weekly())):
        try:
            step()
        except Exception:
            # Une étape qui échoue n'empêche pas les suivantes : sans échantillon, une alerte reste possible
            db.session.rollback()
            logger.exception("Minuteur système : étape « %s » en échec", label)
            failed = True
    if failed:
        raise click.ClickException("Une étape a échoué : voir le journal.")


@system_cli.command("test-alert")
def test_alert_command():
    """Envoie une alerte d'essai à ALERT_EMAIL, sous le plafond quotidien."""
    if not current_app.config.get("ALERT_EMAIL"):
        raise click.ClickException("ALERT_EMAIL n'est pas renseigné : aucune alerte ne peut partir.")
    if not send_test():
        raise click.ClickException("Alerte non envoyée : plafond quotidien atteint, ou envoi en échec (voir le journal).")
    click.echo("Alerte d'essai envoyée.")


@system_cli.command("weekly-report")
def weekly_report_command():
    """Envoie le bilan de la semaine maintenant, sans attendre lundi, sous le plafond quotidien."""
    if not current_app.config.get("ALERT_EMAIL"):
        raise click.ClickException("ALERT_EMAIL n'est pas renseigné : aucun bilan ne peut partir.")
    if not send_weekly(force=True):
        raise click.ClickException("Bilan non envoyé : plafond quotidien atteint, ou envoi en échec (voir le journal).")
    click.echo("Bilan envoyé.")


def init_system_cli(app) -> None:
    app.cli.add_command(system_cli)
