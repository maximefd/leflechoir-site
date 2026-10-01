"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { NotFoundContent } from "@/components/layout/not-found-content";
import { DailyColumns, FunnelBars, Legend, RateScale, rateTone, ShareBar, type SeriesColor } from "@/components/admin/charts";
import {
  dateTime, dayMonth, Empty, Group, Indicator, LEVELS, number, percent, Scroll, seconds, Section, type Level,
} from "@/components/admin/parts";
import { SystemGroup, type SystemState } from "@/components/admin/system-group";
import { useAuth } from "@/contexts/auth-context";
import { ApiError, apiFetch } from "@/lib/api-client";
import { site } from "@/config/site";

/** Les chiffres de `GET /api/admin/stats` (backend/stats.py, `as_json`) : des agrégats seulement. */
type Funnel = { visits: number; active: number; searched: number; generated: number; grid: number; registered: number; saved: number };

type Period = {
  label: string;
  days: number;
  visitors: number;
  searches: number;
  generations: number;
  grids: number;
  success: string;
  busy: number;
  busy_server: number;
  busy_visitor: number;
  rate_limited: number;
  p50: number | null;
  p95: number | null;
  cpu_s: number;
  cpu_share: number;
  register: number;
  verify: number;
  login: number;
  delete: number;
  saved: number;
  errors: number;
  server_errors: number;
  funnel: Funnel;
};

type Day = {
  day: string;
  visitors: number;
  searches: number;
  generations: number;
  grids: number;
  busy: number;
  registers: number;
  saved: number;
  errors: number;
  server_errors: number;
  p95: number | null;
};

/** Ce que deviennent des demandes arrivées jusqu'au générateur : `total` hors refus, puis une clé par issue. */
type Outcomes = {
  total: number;
  grid: number;
  timeout: number;
  must_words: number;
  must_words_unplaced: number;
  no_solution: number;
  other: number;
};

type AdminStats = {
  now: string;
  periods: Period[];
  thresholds: {
    p95_ms: number | null;
    p95_limit_ms: number;
    p95_level: Level;
    busy_share: number;
    busy_limit: number;
    busy_level: Level;
    near_share: number;
    week: { p95_ms: number | null; p95_level: Level; busy_share: number; busy_level: Level };
  };
  daily: Day[];
  outcomes: { outcome: string; count: number }[];
  formats: ({ format: string; refused: number; p50: number | null; p95: number | null } & Outcomes)[];
  must_counts: ({ must: number } & Outcomes)[];
  must_lengths: ({ band: string } & Outcomes)[];
  must_matrix: { must: number; band: string; total: number; grid: number }[];
  must_bands: string[];
  unknown_words: { word: string; count: number }[];
  countries: { country: string; events: number; visitors: number }[];
  errors: { route: string; status: number; count: number }[];
  latest: { at: string; format: string | null; layout: string | null; outcome: string | null; duration_ms: number | null; must: number }[];
};

type Suggestions = {
  pending: { kind: "remove" | "add"; word: string; display: string; people: number; sources: Record<string, number> }[];
  counts: Record<string, number>;
};

// D'où vient une suggestion : explicite (un clic) ou implicite (un signal déjà mesuré)
const SOURCE_LABELS: Record<string, string> = {
  search: "recherche",
  search_empty: "recherche vide",
  grid: "grille générée",
  editor: "éditeur",
  editor_unknown: "éditeur, hors lexique",
  editor_replaced: "remplacé à la main",
  must_unknown: "mot imposé inconnu",
  dictionaries: "dictionnaires",
};

// Les issues d'une demande, dans l'ordre fixe de leurs teintes (charts.tsx)
const OUTCOMES: { key: Exclude<keyof Outcomes, "total">; label: string; short: string; color: SeriesColor }[] = [
  { key: "grid", label: "Grille obtenue", short: "Grilles", color: "blue" },
  { key: "timeout", label: "Délai dépassé", short: "Délai", color: "orange" },
  { key: "must_words", label: "Mots imposés qui n'entrent pas", short: "N'entrent pas", color: "aqua" },
  { key: "must_words_unplaced", label: "Mots imposés non placés", short: "Non placés", color: "yellow" },
  { key: "no_solution", label: "Sans solution", short: "Sans solution", color: "magenta" },
  { key: "other", label: "Autre (erreur, format inconnu)", short: "Autre", color: "neutral" },
];

function rate(part: number, whole: number) {
  return whole ? `${Math.round((100 * part) / whole)} %` : "—";
}

/** « 5 à 6 » → « 5 à 6 lettres », « 11 et plus » → « 11 lettres et plus ». */
function letters(band: string) {
  return band.endsWith(" et plus") ? `${band.slice(0, -" et plus".length)} lettres et plus` : `${band} lettres`;
}

function sum(days: Day[], key: Exclude<keyof Day, "day" | "p95">) {
  return days.reduce((total, day) => total + day[key], 0);
}

const ROWS: { label: string; value: (period: Period) => string; indent?: boolean }[] = [
  { label: "Visiteurs (somme par jour)", value: (p) => number.format(p.visitors) },
  { label: "Recherches", value: (p) => number.format(p.searches) },
  { label: "Générations demandées", value: (p) => number.format(p.generations) },
  { label: "grilles obtenues", value: (p) => number.format(p.grids), indent: true },
  { label: "taux de réussite", value: (p) => p.success, indent: true },
  { label: "refus « occupé »", value: (p) => number.format(p.busy), indent: true },
  { label: "refus de limite de débit", value: (p) => number.format(p.rate_limited), indent: true },
  { label: "durée médiane (réussies)", value: (p) => seconds(p.p50), indent: true },
  { label: "durée p95 (réussies)", value: (p) => seconds(p.p95), indent: true },
  { label: "temps CPU", value: (p) => `${number.format(Math.round(p.cpu_s))} s`, indent: true },
  { label: "part de la capacité CPU", value: (p) => percent(p.cpu_share, 2), indent: true },
  { label: "Inscriptions", value: (p) => number.format(p.register) },
  { label: "Adresses confirmées", value: (p) => number.format(p.verify) },
  { label: "Connexions", value: (p) => number.format(p.login) },
  { label: "Comptes supprimés", value: (p) => number.format(p.delete) },
  { label: "Grilles conservées", value: (p) => number.format(p.saved) },
  { label: "Erreurs (4xx et 5xx)", value: (p) => number.format(p.errors) },
  { label: "dont 5xx", value: (p) => number.format(p.server_errors), indent: true },
];

const REFUSAL_ROWS: { label: string; value: (period: Period) => string; indent?: boolean }[] = [
  { label: "Refus « occupé »", value: (p) => number.format(p.busy) },
  { label: "serveur occupé (les deux places prises)", value: (p) => number.format(p.busy_server), indent: true },
  { label: "visiteur occupé (une génération déjà en cours)", value: (p) => number.format(p.busy_visitor), indent: true },
  { label: "part des générations demandées", value: (p) => (p.generations ? percent(p.busy / p.generations) : "—"), indent: true },
  { label: "Refus de limite de débit", value: (p) => number.format(p.rate_limited) },
  { label: "Erreurs (4xx et 5xx)", value: (p) => number.format(p.errors) },
  { label: "dont 5xx", value: (p) => number.format(p.server_errors), indent: true },
];

function PeriodTable({ label, periods, rows }: { label: string; periods: Period[]; rows: typeof ROWS }) {
  return (
    <Scroll label={label}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-4 font-medium" scope="col"><span className="sr-only">Mesure</span></th>
            {periods.map((period) => (
              <th key={period.label} className="py-2 pl-4 text-right font-medium" scope="col">{period.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b last:border-0">
              <th scope="row" className={`py-1.5 pr-4 text-left font-normal ${row.indent ? "pl-4 text-muted-foreground" : ""}`}>
                {row.label}
              </th>
              {periods.map((period) => (
                <td key={period.label} className="py-1.5 pl-4 text-right tabular-nums">{row.value(period)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Scroll>
  );
}

/** Des groupes de demandes et leurs issues : la barre montre la répartition, les colonnes donnent les nombres. */
function OutcomeTable<Row extends Outcomes>({ caption, header, rows, name, extra = [] }: {
  caption: string;
  header: string;
  rows: Row[];
  name: (row: Row) => string;
  extra?: { label: string; value: (row: Row) => string }[];
}) {
  if (rows.length === 0) return <Empty />;
  return (
    <div className="space-y-3">
      <Legend items={OUTCOMES.map(({ label, color }) => ({ label, color }))} />
      <Scroll label={caption}>
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="py-2 pr-4 font-medium">{header}</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Demandes</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Réussite</th>
              <th scope="col" className="w-1/4 py-2 pr-4 font-medium">Répartition</th>
              {OUTCOMES.slice(1).map((outcome) => (
                <th key={outcome.key} scope="col" className="py-2 pr-4 text-right font-medium">{outcome.short}</th>
              ))}
              {extra.map((column) => (
                <th key={column.label} scope="col" className="py-2 pr-4 text-right font-medium last:pr-0">{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={name(row)} className="border-b last:border-0 tabular-nums">
                <th scope="row" className="py-1.5 pr-4 text-left font-medium whitespace-nowrap">{name(row)}</th>
                <td className="py-1.5 pr-4 text-right">{number.format(row.total)}</td>
                <td className="py-1.5 pr-4 text-right">{rate(row.grid, row.total)}</td>
                <td className="py-1.5 pr-4">
                  <ShareBar parts={OUTCOMES.map(({ key, label, color }) => ({ label, color, value: row[key] }))} />
                </td>
                {OUTCOMES.slice(1).map((outcome) => (
                  <td key={outcome.key} className="py-1.5 pr-4 text-right">{number.format(row[outcome.key])}</td>
                ))}
                {extra.map((column) => (
                  <td key={column.label} className="py-1.5 pr-4 text-right last:pr-0">{column.value(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Scroll>
    </div>
  );
}

/** Nombre de mots imposés × longueur du plus long : le taux de réussite de chaque croisement, et son effectif. */
function MustMatrix({ cells, bands }: { cells: AdminStats["must_matrix"]; bands: string[] }) {
  if (cells.length === 0) return <Empty />;
  const counts = [...new Set(cells.map((cell) => cell.must))].sort((a, b) => a - b);
  return (
    <div className="space-y-3">
      <Scroll label="Taux de réussite selon le nombre et la longueur des mots imposés">
        <table className="w-full border-separate border-spacing-0.5 text-sm">
          <caption className="sr-only">Taux de réussite selon le nombre de mots imposés et la longueur du plus long</caption>
          <thead>
            <tr className="text-muted-foreground">
              <th scope="col" className="py-2 pr-4 text-left font-medium">Mots imposés</th>
              {bands.map((band) => (
                <th key={band} scope="col" className="px-2 py-2 text-center font-medium whitespace-nowrap">{letters(band)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {counts.map((count) => (
              <tr key={count}>
                <th scope="row" className="py-1.5 pr-4 text-left font-medium whitespace-nowrap">
                  {count >= 3 ? "3 et plus" : count}
                </th>
                {bands.map((band) => {
                  const cell = cells.find((item) => item.must === count && item.band === band);
                  if (!cell || cell.total === 0) {
                    return <td key={band} className="px-2 py-1.5 text-center text-muted-foreground">—</td>;
                  }
                  return (
                    <td key={band} className={`rounded-sm px-2 py-1.5 text-center tabular-nums ${rateTone(cell.grid / cell.total)}`}>
                      <span className="font-semibold">{rate(cell.grid, cell.total)}</span>{" "}
                      <span className="text-xs">sur {number.format(cell.total)}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Scroll>
      <RateScale />
    </div>
  );
}

const DAILY_COLUMNS: { label: string; value: (day: Day) => string }[] = [
  { label: "Visiteurs", value: (day) => number.format(day.visitors) },
  { label: "Recherches", value: (day) => number.format(day.searches) },
  { label: "Générations", value: (day) => number.format(day.generations) },
  { label: "Grilles", value: (day) => number.format(day.grids) },
  { label: "p95", value: (day) => seconds(day.p95) },
  { label: "Refus « occupé »", value: (day) => number.format(day.busy) },
  { label: "Inscriptions", value: (day) => number.format(day.registers) },
  { label: "Grilles conservées", value: (day) => number.format(day.saved) },
  { label: "Erreurs", value: (day) => number.format(day.errors) },
  { label: "dont 5xx", value: (day) => number.format(day.server_errors) },
];

/** Le jumeau en tableau de tous les graphiques par jour : chaque valeur s'y lit sans survol ni couleur. */
function DailyTable({ daily }: { daily: Day[] }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">Les 30 jours en tableau</summary>
      <div className="mt-3">
        <Scroll label="Chiffres par jour">
        <table className="w-full text-sm">
          <caption className="sr-only">Chiffres par jour (UTC), du plus récent au plus ancien</caption>
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="py-2 pr-4 font-medium">Jour (UTC)</th>
              {DAILY_COLUMNS.map((column) => (
                <th key={column.label} scope="col" className="py-2 pl-4 text-right font-medium whitespace-nowrap">{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...daily].reverse().map((day) => (
              <tr key={day.day} className="border-b last:border-0 tabular-nums">
                <th scope="row" className="py-1.5 pr-4 text-left font-normal whitespace-nowrap">
                  {dayMonth.format(new Date(`${day.day}T00:00:00Z`))}
                </th>
                {DAILY_COLUMNS.map((column) => (
                  <td key={column.label} className="py-1.5 pl-4 text-right">{column.value(day)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        </Scroll>
      </div>
    </details>
  );
}

function funnelSteps(funnel: Funnel) {
  return [
    { label: "Visites", value: funnel.visits, note: "au moins un appel à l'API" },
    { label: "Recherche ou génération", value: funnel.active,
      note: `${number.format(funnel.searched)} ont cherché, ${number.format(funnel.generated)} ont demandé une grille` },
    { label: "Grille obtenue", value: funnel.grid },
    { label: "Compte créé", value: funnel.registered },
    { label: "Grille conservée", value: funnel.saved, note: "comptes déjà créés compris" },
  ];
}

function Dashboard({ stats, suggestions, system }: { stats: AdminStats; suggestions?: Suggestions; system?: SystemState }) {
  const { thresholds, daily } = stats;
  // Le titre statique est celui de la page 404 (app/admin/page.tsx) : le vrai n'apparaît qu'ici
  useEffect(() => {
    document.title = `Poste de pilotage | ${site.name}`;
  }, []);
  const days = daily.map((day) => day.day);
  const week = stats.periods.find((period) => period.days === 7);
  const month = stats.periods.find((period) => period.days === 30);
  const slowDays = daily.filter((day) => day.p95 !== null && day.p95 > thresholds.p95_limit_ms).length;

  return (
    <main className="container mx-auto max-w-6xl space-y-10 p-4 md:p-8">
      <header>
        <h1 className="text-3xl font-bold">Poste de pilotage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mesure d&apos;usage au {dateTime.format(new Date(stats.now))} UTC, sans cookie ni adresse IP (ADR 0016).
          Un visiteur est une empreinte du jour : sur 7 ou 30 jours, c&apos;est la somme des visiteurs de chaque jour.
        </p>
      </header>

      <section aria-label="Seuils de l'ADR 0013" className="grid gap-4 sm:grid-cols-2">
        <Indicator label="Durée p95 des générations réussies (30 jours)" value={seconds(thresholds.p95_ms)}
          limit={seconds(thresholds.p95_limit_ms)} level={thresholds.p95_level}
          note={`7 derniers jours : ${seconds(thresholds.week.p95_ms)} (${LEVELS[thresholds.week.p95_level].label.toLowerCase()})`} />
        <Indicator label="Refus « occupé » (30 jours)" value={percent(thresholds.busy_share)}
          limit={percent(thresholds.busy_limit, 0)} level={thresholds.busy_level}
          note={`7 derniers jours : ${percent(thresholds.week.busy_share)} (${LEVELS[thresholds.week.busy_level].label.toLowerCase()})`} />
        <p className="text-xs text-muted-foreground sm:col-span-2">
          Au-delà d&apos;un seuil, l&apos;ADR 0013 prévoit de passer au serveur supérieur. L&apos;indicateur prévient
          dès {percent(thresholds.near_share, 0)} du seuil.
        </p>
      </section>

      <Group id="usage" title="Usage">
        <Section title="Chiffres" description="Aujourd'hui depuis minuit UTC, puis les 7 et 30 derniers jours.">
          <PeriodTable label="Chiffres par période" periods={stats.periods} rows={ROWS} />
        </Section>

        <Section title="Évolution par jour" description="Les 30 derniers jours (UTC). Survole un jour pour lire ses chiffres.">
          <div className="grid gap-x-8 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
            <DailyColumns title="Visiteurs" days={days}
              summary={`${number.format(sum(daily, "visitors"))} visiteurs d'un jour en 30 jours.`}
              series={[{ label: "Visiteurs", color: "blue", values: daily.map((day) => day.visitors) }]} />
            <DailyColumns title="Recherches" days={days}
              summary={`${number.format(sum(daily, "searches"))} recherches en 30 jours.`}
              series={[{ label: "Recherches", color: "blue", values: daily.map((day) => day.searches) }]} />
            <DailyColumns title="Générations" days={days}
              summary={`${number.format(sum(daily, "generations"))} demandes en 30 jours, dont ${number.format(sum(daily, "grids"))} grilles obtenues.`}
              series={[
                { label: "Grilles obtenues", color: "blue", values: daily.map((day) => day.grids) },
                { label: "Sans grille (échecs et refus)", color: "neutral", values: daily.map((day) => day.generations - day.grids) },
              ]} />
            <DailyColumns title="Comptes créés" days={days}
              summary={`${number.format(sum(daily, "registers"))} inscriptions en 30 jours.`}
              series={[{ label: "Inscriptions", color: "blue", values: daily.map((day) => day.registers) }]} />
            <DailyColumns title="Grilles conservées" days={days}
              summary={`${number.format(sum(daily, "saved"))} grilles conservées en 30 jours.`}
              series={[{ label: "Grilles conservées", color: "blue", values: daily.map((day) => day.saved) }]} />
          </div>
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Parcours"
            description="En visiteurs d'un jour : une empreinte ne vit qu'un jour, qui revient le lendemain compte à nouveau. Qui ne fait que lire une page n'est pas vu.">
            {!week || !month ? <Empty /> : (
              <div className="space-y-6">
                {[week, month].map((period) => (
                  <div key={period.label} className="space-y-2">
                    <p className="text-sm font-medium">{period.label}</p>
                    {period.funnel.visits === 0 ? <Empty /> : <FunnelBars steps={funnelSteps(period.funnel)} />}
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Pays" description="30 jours (CF-IPCountry). Sources et langues des navigateurs : pas encore mesurées.">
            {stats.countries.length === 0 ? <Empty /> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th scope="col" className="py-2 pr-4 font-medium">Pays</th>
                    <th scope="col" className="py-2 pl-4 text-right font-medium">Visiteurs</th>
                    <th scope="col" className="py-2 pl-4 text-right font-medium">Événements</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.countries.map((item) => (
                    <tr key={item.country} className="border-b last:border-0 tabular-nums">
                      <th scope="row" className="py-1.5 pr-4 text-left font-normal">{item.country === "?" ? "Inconnu" : item.country}</th>
                      <td className="py-1.5 pl-4 text-right">{number.format(item.visitors)}</td>
                      <td className="py-1.5 pl-4 text-right">{number.format(item.events)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </div>
      </Group>

      <Group id="generations" title="Générations">
        <Section title="Formats et issues"
          description="30 jours. Les demandes arrivées jusqu'au générateur ; les refus (occupé, limite de débit) sont comptés à part, hors du taux de réussite.">
          <OutcomeTable caption="Issues des générations par format" header="Format" rows={stats.formats}
            name={(row) => row.format}
            extra={[
              { label: "Refus", value: (row) => number.format(row.refused) },
              { label: "Médiane", value: (row) => seconds(row.p50) },
              { label: "p95", value: (row) => seconds(row.p95) },
            ]} />
        </Section>

        <Section title="Selon le nombre de mots imposés" description="30 jours, hors refus.">
          <OutcomeTable caption="Issues des générations selon le nombre de mots imposés" header="Mots imposés"
            rows={stats.must_counts} name={(row) => (row.must >= 5 ? "5 et plus" : String(row.must))} />
        </Section>

        <Section title="Selon la longueur du plus long mot imposé"
          description="30 jours, demandes avec au moins un mot imposé. C'est la longueur qui pèse, plus que le nombre (#73).">
          <div className="space-y-8">
            <OutcomeTable caption="Issues des générations selon la longueur du plus long mot imposé" header="Plus long mot"
              rows={stats.must_lengths} name={(row) => letters(row.band)} />
            <div className="space-y-2">
              <p className="text-sm font-medium">Nombre × longueur : taux de réussite</p>
              <MustMatrix cells={stats.must_matrix} bands={stats.must_bands} />
            </div>
          </div>
        </Section>

        <Section title="Durée par jour" description="p95 des générations réussies, jour par jour.">
          <DailyColumns title="Durée p95" days={days} format={(value) => seconds(value)}
            summary={slowDays ? `${slowDays} jour${slowDays > 1 ? "s" : ""} au-delà du seuil de ${seconds(thresholds.p95_limit_ms)} en 30 jours.`
              : `Aucun jour au-delà du seuil de ${seconds(thresholds.p95_limit_ms)} en 30 jours.`}
            limit={{ value: thresholds.p95_limit_ms, label: `seuil ${seconds(thresholds.p95_limit_ms)}` }}
            series={[{ label: "p95", color: "blue", values: daily.map((day) => day.p95) }]} />
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Mots imposés absents du lexique" description="30 jours : de quoi nourrir la curation.">
            {stats.unknown_words.length === 0 ? <Empty /> : (
              <ul className="flex flex-wrap gap-2 text-sm">
                {stats.unknown_words.map((item) => (
                  <li key={item.word} className="rounded-md border px-2 py-0.5">
                    {item.word} <span className="text-muted-foreground tabular-nums">× {item.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Toutes les issues" description="30 jours, refus et requêtes invalides compris.">
            {stats.outcomes.length === 0 ? <Empty /> : (
              <ul className="space-y-1 text-sm">
                {stats.outcomes.map((item) => (
                  <li key={item.outcome} className="flex justify-between gap-4 tabular-nums">
                    <span>{item.outcome}</span>
                    <span>{number.format(item.count)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <Section title="Dernières générations">
          {stats.latest.length === 0 ? <Empty /> : (
            <Scroll label="Dernières générations">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th scope="col" className="py-2 pr-4 font-medium">Quand (UTC)</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Format</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Mise en page</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Issue</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">Durée</th>
                    <th scope="col" className="py-2 text-right font-medium">Mots imposés</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.latest.map((item, index) => (
                    <tr key={`${item.at}-${index}`} className="border-b last:border-0 tabular-nums">
                      <td className="py-1.5 pr-4">{dateTime.format(new Date(item.at))}</td>
                      <td className="py-1.5 pr-4">{item.format ?? "?"}</td>
                      <td className="py-1.5 pr-4">{item.layout ?? "—"}</td>
                      <td className="py-1.5 pr-4">{item.outcome ?? "?"}</td>
                      <td className="py-1.5 pr-4 text-right">{seconds(item.duration_ms)}</td>
                      <td className="py-1.5 text-right">{item.must}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Scroll>
          )}
        </Section>
      </Group>

      <Group id="erreurs" title="Erreurs et refus">
        <Section title="Refus et erreurs" description="Aujourd'hui depuis minuit UTC, puis les 7 et 30 derniers jours.">
          <PeriodTable label="Refus et erreurs par période" periods={stats.periods} rows={REFUSAL_ROWS} />
        </Section>

        <Section title="Par jour" description="Les 30 derniers jours (UTC).">
          <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
            <DailyColumns title="Refus « occupé »" days={days}
              summary={`${number.format(sum(daily, "busy"))} refus en 30 jours.`}
              series={[{ label: "Refus", color: "blue", values: daily.map((day) => day.busy) }]} />
            <DailyColumns title="Erreurs" days={days}
              summary={`${number.format(sum(daily, "errors"))} erreurs en 30 jours, dont ${number.format(sum(daily, "server_errors"))} erreurs 5xx.`}
              series={[
                { label: "Erreurs 5xx (pannes)", color: "critical", values: daily.map((day) => day.server_errors) },
                { label: "Erreurs 4xx", color: "neutral", values: daily.map((day) => day.errors - day.server_errors) },
              ]} />
          </div>
        </Section>

        <Section title="Erreurs par route" description="30 jours.">
          {stats.errors.length === 0 ? <Empty /> : (
            <ul className="space-y-1 text-sm">
              {stats.errors.map((item) => (
                <li key={`${item.route} ${item.status}`} className="flex justify-between gap-4 tabular-nums">
                  <span className="break-all"><span className="font-medium">{item.status}</span> {item.route}</span>
                  <span>{number.format(item.count)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </Group>

      <SystemGroup system={system} />

      <Group id="details" title="Détail">
        <Section title="Jour par jour">
          <DailyTable daily={daily} />
        </Section>

        <Section title="Suggestions de mots en attente"
          description={`À trancher dans le curateur (make suggestions-pull), classées par nombre de personnes. Déjà tranchées : ${number.format((suggestions?.counts.accepted ?? 0) + (suggestions?.counts.rejected ?? 0))}.`}>
          {!suggestions ? <Empty /> : suggestions.pending.length === 0 ? <Empty /> : (
            <ul className="space-y-1 text-sm">
              {suggestions.pending.slice(0, 50).map((item) => (
                <li key={`${item.kind}-${item.word}`} className="flex flex-wrap items-baseline justify-between gap-x-4 tabular-nums">
                  <span>
                    <span className="font-mono font-semibold">{item.word}</span>{" "}
                    <span className="text-muted-foreground">{item.kind === "remove" ? "à retirer" : "à ajouter"}</span>
                  </span>
                  <span className="text-muted-foreground">
                    {number.format(item.people)} personne{item.people > 1 ? "s" : ""} ·{" "}
                    {Object.entries(item.sources).map(([source, count]) => `${SOURCE_LABELS[source] ?? source} ${count}`).join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </Group>
    </main>
  );
}

/**
 * Le poste de pilotage (ADR 0016, point 6). La page est dans l'export statique, donc publique : c'est l'API
 * qui garde les chiffres, et qui répond 404 à tout autre compte. Ici, tout autre visiteur voit la page 404.
 */
export function AdminDashboard() {
  const { isAuthenticated, isLoading } = useAuth();
  const stats = useQuery<AdminStats>({
    queryKey: ["admin-stats"],
    enabled: isAuthenticated,
    retry: false,
    queryFn: async () => {
      // /api/admin répond 404 à un jeton expiré, jamais 401 : apiFetch ne renouvellerait pas la session.
      // Une lecture ordinaire la renouvelle d'abord si besoin.
      await apiFetch("/api/users/me");
      return apiFetch("/api/admin/stats");
    },
  });

  const suggestions = useQuery<Suggestions>({
    queryKey: ["admin-suggestions"],
    enabled: stats.isSuccess,
    retry: false,
    queryFn: () => apiFetch("/api/admin/suggestions"),
  });

  const system = useQuery<SystemState>({
    queryKey: ["admin-system"],
    enabled: stats.isSuccess,
    retry: false,
    queryFn: () => apiFetch("/api/admin/system"),
  });

  if (isLoading || (isAuthenticated && stats.isPending)) {
    return <main className="container mx-auto p-4 py-16 text-center text-muted-foreground md:p-8">Chargement…</main>;
  }
  if (!isAuthenticated || (stats.error instanceof ApiError && stats.error.status === 404)) {
    return <NotFoundContent />;
  }
  if (stats.error || !stats.data) {
    return (
      <main className="container mx-auto p-4 py-16 text-center md:p-8">
        <p className="text-destructive">{stats.error?.message ?? "Chiffres indisponibles."}</p>
      </main>
    );
  }
  return <Dashboard stats={stats.data} suggestions={suggestions.data} system={system.data} />;
}
