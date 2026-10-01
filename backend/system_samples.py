"""Échantillons système : ce que consomme le serveur, minute par minute ([ADR 0016](../docs/adr/0016-mesure-d-usage-sans-cookie.md), point 3 ; #129).

Un échantillon dit, à un instant : la mémoire de la machine et celle de l'API, le CPU occupé depuis l'échantillon
précédent, les places de génération prises, la taille de la base, la dernière sauvegarde copiée hors du serveur,
et si l'API répond. Rien de personnel : la machine, pas ses visiteurs.

- **Qui le prend** : `flask system tick` (alerts.py), lancé chaque minute par un minuteur du serveur
  ([ADR 0022](../docs/adr/0022-echantillons-systeme-et-alertes.md), docs/PRODUCTION.md). L'API ne s'échantillonne
  pas elle-même : ses workers sont synchrones, et un fil de fond dans le processus maître ne verrait pas la base
  de la même façon qu'eux.
- **Conservation** : 30 jours, puis un résumé par jour (`SystemDaily`), gardé 13 mois. Le ménage se fait une
  fois par jour, au premier passage qui trouve la veille sans résumé.
- **Lecture** : `GET /api/admin/system` (admin.py).

Tout se lit dans `/proc`, sans dépendance de plus. Dans un conteneur, `/proc/meminfo` et `/proc/stat` décrivent
la machine entière, ce qu'on veut ici ; les processus visibles, eux, sont ceux du conteneur.
"""

import logging
import os
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone

from flask import current_app
from sqlalchemy.exc import IntegrityError

import stats
from extensions import db
from generation_slots import busy_places
from models import AlertSent, SystemDaily, SystemSample

SAMPLES_RETENTION = timedelta(days=30)
DAILY_RETENTION = timedelta(days=396)  # 13 mois, comme les événements (usage.EVENTS_RETENTION)
# Au-delà, l'échantillon précédent est trop ancien pour en déduire un taux de CPU
CPU_MAX_GAP = timedelta(minutes=10)
# Seuil de l'ADR 0013 : au-delà de 75 % de RAM, passer au VPS-2
RAM_THRESHOLD = 0.75
# La sauvegarde part chaque nuit (docs/PRODUCTION.md) : passé ce délai, il en manque une
BACKUP_MAX_AGE = timedelta(hours=26)
# Sans échantillon depuis ce délai, le minuteur ne tourne plus : le poste de pilotage le dit
STALE_AFTER = timedelta(minutes=5)
# Processus de l'API, pour sa mémoire : gunicorn en production, run.py en développement
API_PROCESSES = ("gunicorn", "run.py")
PROBE_TIMEOUT_S = 5

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# --- Lectures : chacune renvoie None plutôt que d'échouer, un échantillon partiel vaut mieux qu'aucun ---

def read_memory(proc: str = "/proc") -> tuple[int | None, int | None]:
    """Mémoire totale et utilisée de la machine, en Mo. Utilisée = totale - disponible (`MemAvailable`)."""
    try:
        with open(os.path.join(proc, "meminfo"), encoding="ascii") as handle:
            values = {line.split(":")[0]: int(line.split()[1]) for line in handle if ":" in line}
        return round(values["MemTotal"] / 1024), round((values["MemTotal"] - values["MemAvailable"]) / 1024)
    except (OSError, KeyError, ValueError, IndexError):
        return None, None


def read_cpu(proc: str = "/proc") -> tuple[int | None, int | None]:
    """Compteurs cumulés de la machine depuis son démarrage : temps occupé et temps total, tous cœurs."""
    try:
        with open(os.path.join(proc, "stat"), encoding="ascii") as handle:
            # user, nice, system, idle, iowait, irq, softirq, steal
            fields = [int(value) for value in handle.readline().split()[1:9]]
        total = sum(fields)
        return total - fields[3] - fields[4], total
    except (OSError, ValueError, IndexError):
        return None, None


def read_api_memory(proc: str = "/proc") -> int | None:
    """Mémoire des processus de l'API, en Mo : la somme de leurs PSS, où une page partagée ne compte qu'une fois.

    C'est la mesure de l'ADR 0013 : les workers partagent le lexique du processus maître, et ce partage peut
    s'éroder avec le temps.
    """
    total_kb, found = 0, False
    try:
        # Sans le processus qui mesure : sa propre ligne de commande ne doit pas le faire passer pour l'API
        pids = [name for name in os.listdir(proc) if name.isdigit() and name != str(os.getpid())]
    except OSError:
        return None
    for pid in pids:
        try:
            with open(os.path.join(proc, pid, "cmdline"), encoding="utf-8", errors="replace") as handle:
                command = handle.read().replace("\0", " ")
            if not any(name in command for name in API_PROCESSES):
                continue
            with open(os.path.join(proc, pid, "smaps_rollup"), encoding="ascii") as handle:
                for line in handle:
                    if line.startswith("Pss:"):
                        total_kb += int(line.split()[1])
                        found = True
        except (OSError, ValueError, IndexError):
            continue  # processus terminé entre-temps, ou qui n'est pas à nous
    return round(total_kb / 1024) if found else None


def read_database_size() -> float | None:
    """Taille de la base en Mo (PostgreSQL seulement)."""
    if db.engine.dialect.name != "postgresql":
        return None
    try:
        size = db.session.execute(db.text("SELECT pg_database_size(current_database())")).scalar()
        return round(size / 1024 / 1024, 1)
    except Exception:
        db.session.rollback()
        logger.exception("Taille de la base illisible")
        return None


def parse_backup_stamp(trace: str | None) -> datetime | None:
    """La date de la dernière sauvegarde copiée hors du serveur : le premier mot de la trace que laisse
    `tools/db/backup-offsite.sh` (« 2026-10-01T03:30:12Z nom taille »).

    La trace est un fichier de l'hôte, hors du conteneur de l'API : c'est le minuteur qui la lit et la passe
    (`flask system tick --last-backup`, tools/monitor/tick.sh). Rien n'est monté dans le conteneur.
    """
    try:
        return datetime.strptime((trace or "").split()[0], "%Y-%m-%dT%H:%M:%SZ")
    except (ValueError, IndexError):
        return None


def probe_api(url: str | None) -> bool | None:
    """L'API répond-elle 200 sur /api/status ? None si aucune adresse n'est configurée."""
    if not url:
        return None
    try:
        with urllib.request.urlopen(url, timeout=PROBE_TIMEOUT_S) as response:
            return response.status == 200
    except (urllib.error.URLError, OSError, ValueError):
        return False


def read_slots() -> tuple[int | None, int]:
    config = current_app.config
    total = config["GENERATION_MAX_CONCURRENT"]
    try:
        return busy_places(config["GENERATION_LOCK_DIR"], total), total
    except OSError:
        return None, total


# --- Prendre un échantillon ---

def take_sample(now: datetime | None = None, last_backup: str | None = None) -> SystemSample | None:
    """Écrit l'échantillon de la minute en cours ; None si elle a déjà le sien (deux minuteurs qui se croisent).

    `last_backup` : la trace de la dernière sauvegarde, lue par le minuteur sur l'hôte.
    """
    config = current_app.config
    minute = (now or _utcnow()).replace(second=0, microsecond=0)
    site = config["SITE"]
    mem_total, mem_used = read_memory()
    cpu_busy, cpu_total = read_cpu()
    slots_busy, slots_total = read_slots()

    previous = (SystemSample.query.filter(SystemSample.site == site, SystemSample.created_at < minute,
                                          SystemSample.created_at >= minute - CPU_MAX_GAP)
                .order_by(SystemSample.created_at.desc()).first())
    cpu_percent = None
    if previous is not None and None not in (cpu_busy, cpu_total, previous.cpu_busy, previous.cpu_total):
        elapsed = cpu_total - previous.cpu_total
        # Compteurs repartis de zéro : la machine a redémarré, pas de taux pour cette minute
        if elapsed > 0 and cpu_busy >= previous.cpu_busy:
            cpu_percent = round(100 * (cpu_busy - previous.cpu_busy) / elapsed, 1)

    sample = SystemSample(
        created_at=minute, site=site, lang=config["SITE_LANG"],
        mem_total_mb=mem_total, mem_used_mb=mem_used, api_mem_mb=read_api_memory(),
        cpu_busy=cpu_busy, cpu_total=cpu_total, cpu_percent=cpu_percent,
        slots_busy=slots_busy, slots_total=slots_total,
        db_size_mb=read_database_size(),
        last_backup_at=parse_backup_stamp(last_backup),
        api_ok=probe_api(config.get("MONITOR_API_URL")),
    )
    db.session.add(sample)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return None
    return sample


# --- Résumés quotidiens et ménage ---

def _average(values: list) -> float | None:
    return sum(values) / len(values) if values else None


def _summary(samples: list[SystemSample]) -> dict:
    """Le résumé d'un groupe d'échantillons (une journée, une heure)."""
    def known(name):
        return [getattr(sample, name) for sample in samples if getattr(sample, name) is not None]

    used, cpu, api, busy = known("mem_used_mb"), known("cpu_percent"), known("api_mem_mb"), known("slots_busy")
    totals, sizes, backups = known("mem_total_mb"), known("db_size_mb"), known("last_backup_at")
    cpu_avg = _average(cpu)
    return {
        "samples": len(samples),
        "mem_total_mb": totals[-1] if totals else None,
        "mem_used_avg_mb": round(_average(used)) if used else None,
        "mem_used_max_mb": max(used) if used else None,
        "api_mem_max_mb": max(api) if api else None,
        "cpu_avg_percent": round(cpu_avg, 1) if cpu_avg is not None else None,
        "cpu_max_percent": max(cpu) if cpu else None,
        "slots_busy_max": max(busy) if busy else None,
        "slots_full": sum(1 for sample in samples if sample.slots_busy is not None and sample.slots_total
                          and sample.slots_busy >= sample.slots_total),
        "db_size_mb": sizes[-1] if sizes else None,
        "last_backup_at": max(backups) if backups else None,
        "api_down": sum(1 for sample in samples if sample.api_ok is False),
    }


def _samples_between(start: datetime, end: datetime) -> list[SystemSample]:
    return (SystemSample.query.filter(SystemSample.site == current_app.config["SITE"],
                                      SystemSample.created_at >= start, SystemSample.created_at < end)
            .order_by(SystemSample.created_at).all())


def aggregate_day(day: date) -> SystemDaily:
    """Écrit, ou réécrit, le résumé d'une journée à partir de ses échantillons."""
    config = current_app.config
    start = datetime.combine(day, datetime.min.time())
    summary = _summary(_samples_between(start, start + timedelta(days=1)))
    row = SystemDaily.query.filter_by(site=config["SITE"], day=day).first()
    if row is None:
        row = SystemDaily(day=day, site=config["SITE"], lang=config["SITE_LANG"])
        db.session.add(row)
    for key, value in summary.items():
        setattr(row, key, value)
    return row


def maintain(now: datetime | None = None) -> int:
    """Le ménage du jour : résume les journées finies qui ne le sont pas encore, puis efface les échantillons de
    plus de 30 jours, les résumés et le journal des alertes de plus de 13 mois. Renvoie le nombre de journées résumées.

    Ne coûte presque rien les autres minutes : une journée résumée n'est plus regardée.
    """
    now = now or _utcnow()
    today = now.date()
    site = current_app.config["SITE"]
    first = (db.session.query(db.func.min(SystemSample.created_at)).filter(SystemSample.site == site).scalar())
    if first is None:
        return 0
    done = {row.day for row in SystemDaily.query.filter(SystemDaily.site == site, SystemDaily.day >= first.date())}
    pending = [first.date() + timedelta(days=offset) for offset in range((today - first.date()).days)]
    pending = [day for day in pending if day not in done]
    if not pending:
        return 0
    for day in pending:
        aggregate_day(day)
    # Résumer d'abord, effacer ensuite : aucun échantillon ne disparaît sans son résumé
    SystemSample.query.filter(SystemSample.created_at < now - SAMPLES_RETENTION).delete(synchronize_session=False)
    SystemDaily.query.filter(SystemDaily.day < (now - DAILY_RETENTION).date()).delete(synchronize_session=False)
    # Le journal des alertes suit les résumés : au-delà, il ne plafonne plus rien et n'apprend plus rien
    AlertSent.query.filter(AlertSent.created_at < now - DAILY_RETENTION).delete(synchronize_session=False)
    db.session.commit()
    return len(pending)


# --- Lecture, pour le poste de pilotage ---

def _iso(moment: datetime | None) -> str | None:
    return moment.isoformat(timespec="seconds") + "Z" if moment else None


def _public(summary: dict) -> dict:
    return {**summary, "last_backup_at": _iso(summary["last_backup_at"])}


def as_json(now: datetime | None = None) -> dict:
    """Le système vu du poste de pilotage : le dernier échantillon, ses seuils, 24 heures et 30 jours."""
    now = now or _utcnow()
    config = current_app.config
    site = config["SITE"]
    latest = SystemSample.query.filter_by(site=site).order_by(SystemSample.created_at.desc()).first()
    recent = _samples_between(now - timedelta(hours=24), now + timedelta(minutes=1))

    hours = []
    for offset in range(23, -1, -1):
        start = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=offset)
        group = [sample for sample in recent if start <= sample.created_at < start + timedelta(hours=1)]
        hours.append({"hour": _iso(start), **_public(_summary(group))})

    today = now.date()
    start_of_today = datetime.combine(today, datetime.min.time())
    stored = {row.day: row for row in SystemDaily.query.filter(SystemDaily.site == site,
                                                             SystemDaily.day >= today - timedelta(days=29))}
    keys = _summary([]).keys()
    days = []
    for offset in range(29, 0, -1):
        day = today - timedelta(days=offset)
        row = stored.get(day)
        summary = {key: getattr(row, key) for key in keys} if row else _summary([])
        days.append({"day": day.isoformat(), **_public(summary)})
    # Aujourd'hui n'a pas encore son résumé : il se calcule sur ses échantillons
    days.append({"day": today.isoformat(),
                 **_public(_summary([sample for sample in recent if sample.created_at >= start_of_today]))})

    fresh = latest is not None and now - latest.created_at <= STALE_AFTER
    ram_share = (latest.mem_used_mb / latest.mem_total_mb
                 if latest and latest.mem_used_mb is not None and latest.mem_total_mb else None)
    backup_at = latest.last_backup_at if latest else None
    backup_age_h = round((now - backup_at).total_seconds() / 3600, 1) if backup_at else None
    return {
        "now": _iso(now),
        "latest": None if latest is None else {
            "at": _iso(latest.created_at),
            "mem_total_mb": latest.mem_total_mb, "mem_used_mb": latest.mem_used_mb, "api_mem_mb": latest.api_mem_mb,
            "cpu_percent": latest.cpu_percent, "slots_busy": latest.slots_busy, "slots_total": latest.slots_total,
            "db_size_mb": latest.db_size_mb, "last_backup_at": _iso(latest.last_backup_at), "api_ok": latest.api_ok,
        },
        # Sans échantillon récent, rien ne dit que le serveur va bien : le minuteur est à vérifier
        "fresh": fresh,
        "stale_after_s": int(STALE_AFTER.total_seconds()),
        "thresholds": {
            "ram_share": ram_share,
            "ram_limit": RAM_THRESHOLD,
            "ram_level": stats._level(ram_share, RAM_THRESHOLD) if fresh else "unknown",
            "backup_age_h": backup_age_h,
            "backup_limit_h": BACKUP_MAX_AGE.total_seconds() / 3600,
            # Une sauvegarde est faite ou ne l'est pas : pas d'orange. Sans trace (développement, ou minuteur
            # lancé sans --last-backup), rien n'est affirmé
            "backup_level": "unknown" if backup_age_h is None or not fresh
            else ("over" if backup_age_h > BACKUP_MAX_AGE.total_seconds() / 3600 else "ok"),
        },
        "hours": hours,
        "days": days,
        "retention": {"samples_days": SAMPLES_RETENTION.days, "daily_days": DAILY_RETENTION.days},
    }
