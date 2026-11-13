"use client";

import { DailyColumns } from "@/components/admin/charts";
import { Empty, Group, number, percent, Scroll, seconds, Section, Tile } from "@/components/admin/parts";

/**
 * La rubrique « API » du poste de pilotage (ADR 0032, point 10 ; `GET /api/admin/api`, backend/api_stats.py) : les
 * demandes de grille de l'API ouverte, par voie (connecteur ou API HTTP) et par assistant, leurs refus, l'attente dans
 * la file, les clés, et les arrivées par un lien d'assistant. Des comptes seulement.
 */
type ApiPeriod = {
  label: string;
  days: number;
  requests: number;
  grids: number;
  success: number | null;
  failures: number;
  quota: number;
  closed: number;
  invalid: number;
  mcp: number;
  http: number;
  keyed: number;
  queue_p95_ms: number | null;
  duration_p95_ms: number | null;
  link_views: number;
};

type Category = "grid" | "failure" | "quota" | "closed" | "invalid";

export type ApiState = {
  periods: ApiPeriod[];
  daily: { day: string; mcp: number; http: number; refused: number }[];
  assistants: { assistant: string; requests: number; grids: number }[];
  outcomes: { outcome: string; category: Category; count: number }[];
  formats: { format: string; grids: number }[];
  sources: { source: string; views: number }[];
  keys: { active: number; revoked: number; created_30d: number; used_7d: number };
};

const ROWS: { label: string; value: (period: ApiPeriod) => string; indent?: boolean }[] = [
  { label: "Demandes de grille", value: (p) => number.format(p.requests) },
  { label: "grilles rendues", value: (p) => number.format(p.grids), indent: true },
  { label: "par le connecteur (assistants IA)", value: (p) => number.format(p.mcp), indent: true },
  { label: "par l'API HTTP", value: (p) => number.format(p.http), indent: true },
  { label: "avec une clé", value: (p) => number.format(p.keyed), indent: true },
  { label: "réussite du moteur (hors refus)", value: (p) => (p.success === null ? "—" : percent(p.success, 0)), indent: true },
  { label: "le moteur n'a pas trouvé", value: (p) => number.format(p.failures), indent: true },
  { label: "Refus : quotas et débit", value: (p) => number.format(p.quota) },
  { label: "Refus : API fermée ou en pause", value: (p) => number.format(p.closed) },
  { label: "Demandes invalides", value: (p) => number.format(p.invalid) },
  { label: "Attente p95 dans la file", value: (p) => seconds(p.queue_p95_ms) },
  { label: "Durée p95 du calcul", value: (p) => seconds(p.duration_p95_ms) },
  { label: "Arrivées par un lien d'assistant", value: (p) => number.format(p.link_views) },
];

const CATEGORIES: Record<Category, string> = {
  grid: "grille",
  failure: "échec du moteur",
  quota: "quota",
  closed: "fermée",
  invalid: "invalide",
};

const ASSISTANTS: Record<string, string> = {
  api: "API HTTP (sans connecteur)",
  claude: "Claude",
  chatgpt: "ChatGPT",
  lechat: "Le Chat",
  inconnu: "Connecteur, assistant inconnu",
};

/** « lechat? » : le nom que se donne un appelant d'une adresse non publiée, donc non vérifié. */
function assistantLabel(name: string) {
  const unverified = name.endsWith("?");
  const base = unverified ? name.slice(0, -1) : name;
  return `${ASSISTANTS[base] ?? base}${unverified ? " (se dit tel, non vérifié)" : ""}`;
}

export function ApiGroup({ api }: { api?: ApiState }) {
  if (!api) {
    return (
      <Group id="api" title="API ouverte">
        <Section title="Demandes"><p className="text-sm text-muted-foreground">Chargement…</p></Section>
      </Group>
    );
  }
  const days = api.daily.map((day) => day.day);
  const month = api.periods.find((period) => period.days === 30);
  const total = (key: "mcp" | "http" | "refused") => api.daily.reduce((sum, day) => sum + day[key], 0);

  return (
    <Group id="api" title="API ouverte">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Grilles rendues (30 jours)" value={number.format(month?.grids ?? 0)}
          note={`${number.format(month?.mcp ?? 0)} par le connecteur, ${number.format(month?.http ?? 0)} par l'API HTTP`} />
        <Tile label="Clés actives" value={number.format(api.keys.active)}
          note={`${number.format(api.keys.used_7d)} servies en 7 jours, ${number.format(api.keys.created_30d)} créées en 30 jours`} />
        <Tile label="Refus (30 jours)" value={number.format((month?.quota ?? 0) + (month?.closed ?? 0))}
          note={`${number.format(month?.quota ?? 0)} de quotas, ${number.format(month?.closed ?? 0)} API fermée`} />
        <Tile label="Arrivées par un lien d'assistant" value={number.format(month?.link_views ?? 0)}
          note="30 jours, pages vues avec utm_source" />
      </div>

      <Section title="Chiffres" description="Aujourd'hui depuis minuit UTC, puis les 7 et 30 derniers jours. Les générations de l'API comptent aussi dans « Usage ».">
        <Scroll label="Chiffres de l'API par période">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium" scope="col"><span className="sr-only">Mesure</span></th>
                {api.periods.map((period) => (
                  <th key={period.label} className="py-2 pl-4 text-right font-medium" scope="col">{period.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} className="border-b last:border-0">
                  <th scope="row" className={`py-1.5 pr-4 text-left font-normal ${row.indent ? "pl-4 text-muted-foreground" : ""}`}>
                    {row.label}
                  </th>
                  {api.periods.map((period) => (
                    <td key={period.label} className="py-1.5 pl-4 text-right tabular-nums">{row.value(period)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Scroll>
      </Section>

      <Section title="Par jour" description="Les 30 derniers jours (UTC). Survole un jour pour lire ses chiffres.">
        <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
          <DailyColumns title="Grilles rendues" days={days}
              summary={`${number.format(total("mcp") + total("http"))} grilles en 30 jours, dont ${number.format(total("mcp"))} par le connecteur.`}
              series={[
                { label: "Connecteur", color: "blue", values: api.daily.map((day) => day.mcp) },
                { label: "API HTTP", color: "aqua", values: api.daily.map((day) => day.http) },
              ]} />
          <DailyColumns title="Refus (quotas, API fermée)" days={days}
            summary={`${number.format(total("refused"))} refus en 30 jours.`}
            series={[{ label: "Refus", color: "orange", values: api.daily.map((day) => day.refused) }]} />
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Par assistant" description="30 jours. L'assistant est reconnu à son adresse publiée ; jamais une personne.">
          {api.assistants.length === 0 ? <Empty /> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium" scope="col">Voie</th>
                  <th className="py-2 pl-4 text-right font-medium" scope="col">Demandes</th>
                  <th className="py-2 pl-4 text-right font-medium" scope="col">Grilles</th>
                </tr>
              </thead>
              <tbody>
                {api.assistants.map((row) => (
                  <tr key={row.assistant} className="border-b last:border-0 tabular-nums">
                    <th scope="row" className="py-1.5 pr-4 text-left font-normal">{assistantLabel(row.assistant)}</th>
                    <td className="py-1.5 pl-4 text-right">{number.format(row.requests)}</td>
                    <td className="py-1.5 pl-4 text-right">{number.format(row.grids)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="Issues" description="30 jours, par code reason de l'API (docs : /developpeurs).">
          {api.outcomes.length === 0 ? <Empty /> : (
            <ul className="space-y-1 text-sm">
              {api.outcomes.map((row) => (
                <li key={row.outcome} className="flex items-baseline justify-between gap-4 tabular-nums">
                  <span><span className="font-mono">{row.outcome}</span>{" "}
                    <span className="text-muted-foreground">{CATEGORIES[row.category]}</span></span>
                  <span>{number.format(row.count)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Formats demandés" description="30 jours, grilles rendues.">
          {api.formats.length === 0 ? <Empty /> : (
            <ul className="space-y-1 text-sm">
              {api.formats.map((row) => (
                <li key={row.format} className="flex justify-between gap-4 tabular-nums">
                  <span>{row.format.replace("x", " × ")}</span><span>{number.format(row.grids)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Liens d'assistant" description="30 jours : pages vues dont l'adresse portait utm_source (le lien préparé, les liens du connecteur).">
          {api.sources.length === 0 ? <Empty /> : (
            <ul className="space-y-1 text-sm">
              {api.sources.map((row) => (
                <li key={row.source} className="flex justify-between gap-4 tabular-nums">
                  <span className="font-mono">{row.source}</span><span>{number.format(row.views)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </Group>
  );
}
