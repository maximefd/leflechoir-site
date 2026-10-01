"use client";

import { DailyColumns } from "@/components/admin/charts";
import { dateTime, Empty, Group, Indicator, number, percent, Scroll, Section, Tile, type Level } from "@/components/admin/parts";

/** `GET /api/admin/system` (backend/system_samples.py, backend/alerts.py) : la machine, pas ses visiteurs. */
type Summary = {
  samples: number;
  mem_total_mb: number | null;
  mem_used_avg_mb: number | null;
  mem_used_max_mb: number | null;
  api_mem_max_mb: number | null;
  cpu_avg_percent: number | null;
  cpu_max_percent: number | null;
  slots_busy_max: number | null;
  slots_full: number;
  db_size_mb: number | null;
  last_backup_at: string | null;
  api_down: number;
};

export type SystemState = {
  now: string;
  latest: {
    at: string;
    mem_total_mb: number | null;
    mem_used_mb: number | null;
    api_mem_mb: number | null;
    cpu_percent: number | null;
    slots_busy: number | null;
    slots_total: number | null;
    db_size_mb: number | null;
    last_backup_at: string | null;
    api_ok: boolean | null;
  } | null;
  fresh: boolean;
  stale_after_s: number;
  thresholds: {
    ram_share: number | null;
    ram_limit: number;
    ram_level: Level;
    backup_age_h: number | null;
    backup_limit_h: number;
    backup_level: Level;
  };
  hours: ({ hour: string } & Summary)[];
  days: ({ day: string } & Summary)[];
  retention: { samples_days: number; daily_days: number };
  alerts: {
    sent: { at: string; kind: string; summary: string; delivered: boolean }[];
    last_24h: number;
    daily_cap: number;
    cooldown_h: number;
    enabled: boolean;
  };
};

const ALERT_KINDS: Record<string, string> = {
  ram: "Mémoire",
  busy: "Générateur occupé",
  p95: "Générations lentes",
  server_errors: "Erreurs 500",
  backup: "Sauvegarde manquante",
  api_down: "API injoignable",
  test: "Essai",
  weekly: "Bilan de la semaine",
};

function megabytes(value: number | null) {
  return value === null ? "—" : `${number.format(Math.round(value))} Mo`;
}

function ago(hours: number | null) {
  if (hours === null) return "—";
  if (hours < 1) return "il y a moins d'une heure";
  return hours < 48 ? `il y a ${number.format(Math.round(hours))} h` : `il y a ${number.format(Math.round(hours / 24))} jours`;
}

function highest(values: (number | null)[]) {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? Math.max(...known) : null;
}

/** La rubrique « Système » : ce que consomme le serveur, et ce que les alertes ont envoyé. */
export function SystemGroup({ system }: { system?: SystemState }) {
  if (!system) {
    return (
      <Group id="systeme" title="Système">
        <Section title="Serveur"><p className="text-sm text-muted-foreground">Chargement…</p></Section>
      </Group>
    );
  }
  const { latest, thresholds, hours, days, alerts } = system;
  const total = latest?.mem_total_mb ?? highest(days.map((day) => day.mem_total_mb));
  const ramLimit = total ? { value: thresholds.ram_limit * total, label: `seuil ${megabytes(thresholds.ram_limit * total)}` } : undefined;
  const hourKeys = hours.map((hour) => hour.hour);
  const dayKeys = days.map((day) => day.day);
  const fullMinutes = hours.reduce((sum, hour) => sum + hour.slots_full, 0);

  return (
    <Group id="systeme" title="Système">
      {!latest ? (
        <Section title="Serveur">
          <p className="text-sm text-muted-foreground">
            Aucun échantillon pour l&apos;instant : le minuteur du serveur, qui lance <code>flask system tick</code> chaque
            minute, n&apos;est pas encore installé (docs/PRODUCTION.md).
          </p>
        </Section>
      ) : (
        <>
          {!system.fresh && (
            <p role="status" className="rounded-lg border border-destructive bg-destructive/5 p-4 text-sm">
              <span className="font-medium">Le minuteur ne tourne plus.</span> Dernier échantillon
              le {dateTime.format(new Date(latest.at))} UTC : les chiffres ci-dessous datent de ce moment, et aucune
              alerte ne peut partir.
            </p>
          )}

          <section aria-label="État du serveur" className="grid gap-4 sm:grid-cols-2">
            <Indicator label="Mémoire du serveur" level={thresholds.ram_level}
              value={thresholds.ram_share === null ? "—" : percent(thresholds.ram_share)}
              limit={percent(thresholds.ram_limit, 0)}
              note={`${megabytes(latest.mem_used_mb)} utilisés sur ${megabytes(latest.mem_total_mb)}, dont ${megabytes(latest.api_mem_mb)} pour l'API.`} />
            <Indicator label="Dernière sauvegarde copiée hors du serveur" level={thresholds.backup_level}
              value={thresholds.backup_age_h !== null ? ago(thresholds.backup_age_h) : "Aucune trace"}
              limit={`${number.format(thresholds.backup_limit_h)} h`}
              note={latest.last_backup_at ? `Le ${dateTime.format(new Date(latest.last_backup_at))} UTC.`
                : "Le minuteur n'a pas transmis de trace de sauvegarde (docs/PRODUCTION.md)."} />
          </section>

          <section aria-label="Dernier échantillon" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="CPU, dernière minute" value={latest.cpu_percent === null ? "—" : percent(latest.cpu_percent / 100)}
              note="Part occupée, tous cœurs confondus." />
            <Tile label="Places de génération prises"
              value={latest.slots_busy === null ? "—" : `${latest.slots_busy} sur ${latest.slots_total ?? "?"}`}
              note={`Toutes prises pendant ${number.format(fullMinutes)} minute${fullMinutes > 1 ? "s" : ""} en 24 heures.`} />
            <Tile label="Taille de la base" value={megabytes(latest.db_size_mb)} />
            <Tile label="API" note={`Échantillon du ${dateTime.format(new Date(latest.at))} UTC.`}
              value={latest.api_ok === null ? "Non vérifiée" : latest.api_ok ? "Répond" : "Ne répond pas"} />
          </section>

          <Section title="Les dernières 24 heures" description="Heure par heure (UTC), à partir d'un échantillon par minute.">
            <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
              <DailyColumns title="Mémoire, au plus haut de l'heure" days={hourKeys} unit="hour" format={megabytes} limit={ramLimit}
                summary={`Au plus haut : ${megabytes(highest(hours.map((hour) => hour.mem_used_max_mb)))} sur ${megabytes(total)}.`}
                series={[{ label: "Mémoire", color: "blue", values: hours.map((hour) => hour.mem_used_max_mb) }]} />
              <DailyColumns title="CPU, en moyenne de l'heure" days={hourKeys} unit="hour"
                format={(value) => percent(value / 100)}
                summary={`Au plus haut sur une minute : ${percent((highest(hours.map((hour) => hour.cpu_max_percent)) ?? 0) / 100)}.`}
                series={[{ label: "CPU", color: "blue", values: hours.map((hour) => hour.cpu_avg_percent) }]} />
            </div>
          </Section>

          <Section title="Les 30 derniers jours"
            description={`Un résumé par jour. Les échantillons sont gardés ${system.retention.samples_days} jours, les résumés 13 mois.`}>
            <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
              <DailyColumns title="Mémoire, au plus haut du jour" days={dayKeys} format={megabytes} limit={ramLimit}
                summary={`Au plus haut : ${megabytes(highest(days.map((day) => day.mem_used_max_mb)))} sur ${megabytes(total)}.`}
                series={[{ label: "Mémoire", color: "blue", values: days.map((day) => day.mem_used_max_mb) }]} />
              <DailyColumns title="Mémoire de l'API, au plus haut du jour" days={dayKeys} format={megabytes}
                summary="Le lexique est partagé entre les workers : si ce partage s'érode, la courbe monte (ADR 0013)."
                series={[{ label: "API", color: "blue", values: days.map((day) => day.api_mem_max_mb) }]} />
              <DailyColumns title="CPU, en moyenne du jour" days={dayKeys} format={(value) => percent(value / 100)}
                summary={`Au plus haut sur une minute : ${percent((highest(days.map((day) => day.cpu_max_percent)) ?? 0) / 100)}.`}
                series={[{ label: "CPU", color: "blue", values: days.map((day) => day.cpu_avg_percent) }]} />
              <DailyColumns title="Taille de la base" days={dayKeys} format={megabytes}
                summary={`Aujourd'hui : ${megabytes(latest.db_size_mb)}.`}
                series={[{ label: "Base", color: "blue", values: days.map((day) => day.db_size_mb) }]} />
            </div>
          </Section>
        </>
      )}

      <Section title="Alertes et bilans envoyés"
        description={alerts.enabled
          ? `${number.format(alerts.last_24h)} envoi${alerts.last_24h > 1 ? "s" : ""} en 24 heures, plafond de ${number.format(alerts.daily_cap)} ; une alerte par type et par ${alerts.cooldown_h} heures.`
          : "Aucun destinataire (ALERT_EMAIL) : rien ne part."}>
        {alerts.sent.length === 0 ? <Empty /> : (
          <Scroll label="Alertes et bilans envoyés">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="py-2 pr-4 font-medium">Quand (UTC)</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Type</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Ce qui s&apos;est passé</th>
                  <th scope="col" className="py-2 font-medium">Envoi</th>
                </tr>
              </thead>
              <tbody>
                {alerts.sent.map((alert) => (
                  <tr key={`${alert.at}-${alert.kind}`} className="border-b last:border-0">
                    <td className="py-1.5 pr-4 whitespace-nowrap tabular-nums">{dateTime.format(new Date(alert.at))}</td>
                    <td className="py-1.5 pr-4 whitespace-nowrap">{ALERT_KINDS[alert.kind] ?? alert.kind}</td>
                    <td className="py-1.5 pr-4">{alert.summary}</td>
                    <td className="py-1.5 whitespace-nowrap">{alert.delivered ? "Parti" : "En échec"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroll>
        )}
      </Section>
    </Group>
  );
}
