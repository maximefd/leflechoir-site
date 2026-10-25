"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { ShareBar, type SeriesColor } from "@/components/admin/charts";
import { dateTime, number, Scroll } from "@/components/admin/parts";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/** `GET /api/admin/tableau?jours=` (backend/stats.py `dashboard`, backend/seo.py `summary`, ADR 0029) */
type Figures = {
  visitors: number;
  views: number;
  sources: Record<"direct" | "google" | "bing" | "other_search" | "ai" | "other", number>;
  generations: number;
  plays: number;
  pdf: number;
  registrations: number;
};
type SeoSource = {
  configured: boolean;
  last_sync: string | null;
  error: string | null;
  indexed: number | null;
  through?: string;
  clicks?: number;
  clicks_before?: number;
  impressions?: number;
  impressions_before?: number;
  position?: number | null;
  position_before?: number | null;
  daily?: { day: string; clicks: number; impressions: number }[];
};
type SeoQuery = {
  query: string;
  clicks: number;
  impressions: number;
  position: number | null;
  clicks_before: number;
  impressions_before: number;
  position_before: number | null;
};
type Ranking = { position: number | null; clicks: number; impressions: number } | null;
export type Tableau = {
  days: number;
  current: Figures;
  previous: Figures;
  daily: { day: string; visitors: number; views: number; search: number; ai: number }[];
  seo: {
    sources: { google: SeoSource; bing: SeoSource };
    sitemap_urls: number;
    rising: SeoQuery[];
    key_searches: { search: string; google: Ranking; bing: Ranking; google_position_before: number | null; bing_position_before: number | null }[];
    asked: { query: string; clicks: number; impressions: number; position: number | null }[];
    questions: { question: string; google: Ranking; bing: Ranking }[];
  };
};

const PERIODES = [7, 30, 90] as const;
const decimal = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/** L'écart à la période d'avant : en pour cent quand il a du sens, sinon en nombre (« +3 »). */
function Ecart({ now, before, lowerIsBetter = false, unit }: { now: number; before: number; lowerIsBetter?: boolean; unit?: string }) {
  const diff = now - before;
  const better = lowerIsBetter ? diff < 0 : diff > 0;
  const tone = diff === 0 ? "text-muted-foreground" : better ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400";
  // Une position : la flèche monte quand on gagne des places (le nombre, lui, baisse)
  const Icon = diff === 0 ? Minus : (lowerIsBetter ? better : diff > 0) ? ArrowUpRight : ArrowDownRight;
  const places = Math.abs(diff);
  const text = unit
    ? `${better ? "gagne" : "perd"} ${decimal.format(places)} ${places >= 2 ? unit : unit.replace(/s$/, "")}`
    : before >= 20
      ? `${diff > 0 ? "+" : ""}${Math.round((100 * diff) / before)} %`
      : `${diff > 0 ? "+" : ""}${number.format(diff)}`;
  return (
    <p className={cn("mt-1 flex items-center gap-1 text-sm", tone)}>
      <Icon className="h-4 w-4" aria-hidden />
      <span>{diff === 0 ? "stable" : text}</span>
      <span className="text-muted-foreground">· avant : {unit ? decimal.format(before) : number.format(before)}</span>
    </p>
  );
}

/** Une petite courbe, sans axes : la forme de la période, jour par jour. */
function Courbe({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const points = values.map((value, i) => `${(i / (values.length - 1)) * 120},${26 - (value / max) * 22}`).join(" ");
  return (
    <svg viewBox="0 0 120 28" preserveAspectRatio="none" className="mt-2 h-7 w-full" role="img" aria-label={label}>
      <polyline points={points} fill="none" className="stroke-[#2a78d6] dark:stroke-[#3987e5]" strokeWidth={2}
        vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Carte({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <Card className="py-4">
      <CardContent className="px-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-3xl font-semibold tabular-nums">{value}</p>
        {children}
      </CardContent>
    </Card>
  );
}

function Rubrique({ title, children, note }: { title: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
      {children}
    </section>
  );
}

const SOURCES: { key: keyof Figures["sources"]; label: string; color: SeriesColor }[] = [
  { key: "google", label: "Google", color: "blue" },
  { key: "bing", label: "Bing", color: "aqua" },
  { key: "other_search", label: "Autres moteurs", color: "yellow" },
  { key: "ai", label: "Assistants IA", color: "magenta" },
  { key: "direct", label: "Accès direct", color: "neutral" },
  { key: "other", label: "Autres sites", color: "orange" },
];

function Audience({ data }: { data: Tableau }) {
  const { current: now, previous: before, daily } = data;
  const search = (f: Figures) => f.sources.google + f.sources.bing + f.sources.other_search;
  const total = Object.values(now.sources).reduce((sum, value) => sum + value, 0);
  return (
    <>
      <Rubrique title="Audience">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Carte label="Visiteurs" value={number.format(now.visitors)}>
            <Ecart now={now.visitors} before={before.visitors} />
            <Courbe values={daily.map((d) => d.visitors)} label="Visiteurs, jour par jour" />
          </Carte>
          <Carte label="Pages vues" value={number.format(now.views)}>
            <Ecart now={now.views} before={before.views} />
            <Courbe values={daily.map((d) => d.views)} label="Pages vues, jour par jour" />
          </Carte>
          <Carte label="Venus des moteurs de recherche" value={number.format(search(now))}>
            <Ecart now={search(now)} before={search(before)} />
            <Courbe values={daily.map((d) => d.search)} label="Visites venues des moteurs, jour par jour" />
          </Carte>
          <Carte label="Venus des assistants IA" value={number.format(now.sources.ai)}>
            <Ecart now={now.sources.ai} before={before.sources.ai} />
            <Courbe values={daily.map((d) => d.ai)} label="Visites venues des assistants IA, jour par jour" />
          </Carte>
        </div>
      </Rubrique>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="py-4">
          <CardContent className="space-y-3 px-4">
            <h3 className="text-base font-semibold">D’où viennent les visites</h3>
            <ShareBar parts={SOURCES.map(({ key, label, color }) => ({ label, color, value: now.sources[key] }))} />
            <ul className="space-y-1.5 text-sm">
              {SOURCES.map(({ key, label }) => (
                <li key={key} className="flex justify-between gap-2">
                  <span>{label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {number.format(now.sources[key])}
                    {total > 0 && ` · ${Math.round((100 * now.sources[key]) / total)} %`}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="px-4">
            <h3 className="text-base font-semibold">Usage du site</h3>
            <div className="mt-3 grid grid-cols-2 gap-4">
              {([
                ["Grilles générées", "generations"],
                ["Parties jouées", "plays"],
                ["PDF imprimés", "pdf"],
                ["Comptes créés", "registrations"],
              ] as const).map(([label, key]) => (
                <div key={key}>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="text-2xl font-semibold tabular-nums">{number.format(now[key])}</p>
                  <Ecart now={now[key]} before={before[key]} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/** Branché, ou des chiffres déjà là (le jeu de données fictives de `make seed-demo`, en local) */
function aDesChiffres(data: Tableau) {
  const { google, bing } = data.seo.sources;
  return google.configured || bing.configured || Boolean(google.through || bing.through);
}

function etatSource(name: string, source: SeoSource) {
  if (!source.configured) return `${name} : pas branché${source.through ? " (données fictives)" : ""}`;
  if (source.error) return `${name} : dernier relevé en échec (${source.error})`;
  const through = source.through ? `, chiffres jusqu'au ${new Date(`${source.through}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC" })}` : "";
  return `${name} : relevé ${source.last_sync ? `le ${dateTime.format(new Date(source.last_sync))} UTC` : "pas encore fait"}${through}`;
}

function Position({ value }: { value: number | null | undefined }) {
  return <>{value == null ? "—" : decimal.format(value)}</>;
}

function Seo({ data }: { data: Tableau }) {
  const { google, bing } = data.seo.sources;
  const branche = aDesChiffres(data);
  const sum = (key: "clicks" | "impressions" | "clicks_before" | "impressions_before") => (google[key] ?? 0) + (bing[key] ?? 0);
  const note = <>{etatSource("Google", google)} · {etatSource("Bing", bing)}</>;

  if (!branche) {
    return (
      <Rubrique title="SEO · Google et Bing">
        <Card className="py-4">
          <CardContent className="px-4 text-sm text-muted-foreground">
            Pas encore branché : impressions, clics, positions et pages indexées arrivent dès que le serveur a
            ses clés (un compte de service pour la Search Console, une clé d’API Bing). Le chemin exact est dans
            docs/PRODUCTION.md, « Les chiffres de Google et Bing ».
          </CardContent>
        </Card>
      </Rubrique>
    );
  }

  return (
    <Rubrique title="SEO · Google et Bing" note={note}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Carte label="Impressions" value={number.format(sum("impressions"))}>
          <Ecart now={sum("impressions")} before={sum("impressions_before")} />
        </Carte>
        <Carte label="Clics" value={number.format(sum("clicks"))}>
          <Ecart now={sum("clicks")} before={sum("clicks_before")} />
        </Carte>
        <Carte label="Position moyenne (Google)" value={google.position == null ? "—" : decimal.format(google.position)}>
          {google.position != null && google.position_before != null && (
            <Ecart now={google.position} before={google.position_before} lowerIsBetter unit="places" />
          )}
        </Carte>
        <Carte label="Pages indexées"
          value={google.indexed == null ? "—" : `${number.format(google.indexed)} / ${number.format(data.seo.sitemap_urls)}`}>
          <p className="mt-1 text-sm text-muted-foreground">
            Google, sur le sitemap{bing.indexed != null ? ` · Bing : ${number.format(bing.indexed)}` : ""}
          </p>
        </Carte>
      </div>

      <Card className="py-4">
        <CardContent className="px-4">
          <h3 className="text-base font-semibold">Requêtes qui montent</h3>
          {data.seo.rising.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Pas encore de requête relevée sur la période.</p>
          ) : (
            <Scroll label="Requêtes qui montent">
              <table className="mt-2 w-full min-w-[32rem] text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr><th className="py-1.5 font-normal">Requête</th><th className="font-normal">Clics</th>
                    <th className="font-normal">Impressions</th><th className="font-normal">Position</th></tr>
                </thead>
                <tbody>
                  {data.seo.rising.map((query) => (
                    <tr key={query.query} className="border-t">
                      <td className="py-1.5 pr-3">{query.query}</td>
                      <td className="tabular-nums">{number.format(query.clicks)}
                        <span className="text-muted-foreground"> ({query.clicks - query.clicks_before >= 0 ? "+" : ""}{number.format(query.clicks - query.clicks_before)})</span></td>
                      <td className="tabular-nums">{number.format(query.impressions)}</td>
                      <td className="tabular-nums"><Position value={query.position} />
                        {query.position != null && query.position_before != null && query.position !== query.position_before && (
                          <span className={query.position < query.position_before ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}>
                            {" "}{query.position < query.position_before ? "▲" : "▼"} {decimal.format(Math.abs(query.position_before - query.position))}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Scroll>
          )}
        </CardContent>
      </Card>
    </Rubrique>
  );
}

function Mouvement({ now, before }: { now: number | null | undefined; before: number | null | undefined }) {
  if (now == null || before == null || now === before) return null;
  const gagne = now < before;
  return (
    <span className={gagne ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}>
      {" "}{gagne ? "▲" : "▼"} {decimal.format(Math.abs(before - now))}
    </span>
  );
}

function Classement({ ranking, before }: { ranking: Ranking; before?: number | null }) {
  if (!ranking) return <span className="text-muted-foreground">n’apparaît pas</span>;
  return (
    <>
      <span className="font-medium">{ranking.position == null ? "—" : decimal.format(ranking.position)}</span>
      <Mouvement now={ranking.position} before={before} />
      <span className="block text-xs text-muted-foreground">
        {number.format(ranking.impressions)} impr. · {number.format(ranking.clicks)} clic{ranking.clicks > 1 ? "s" : ""}
      </span>
    </>
  );
}

function TableauCadre({ label, head, children }: { label: string; head: string[]; children: React.ReactNode }) {
  return (
    <Card className="py-4">
      <CardContent className="px-4">
        <Scroll label={label}>
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>{head.map((cell) => <th key={cell} className="py-1.5 font-normal">{cell}</th>)}</tr>
            </thead>
            <tbody>{children}</tbody>
          </table>
        </Scroll>
      </CardContent>
    </Card>
  );
}

function RecherchesCles({ data }: { data: Tableau }) {
  return (
    <Rubrique title="Recherches clés" note="Position moyenne sur la période, et ce qu'elle a gagné ou perdu">
      <TableauCadre label="Recherches clés" head={["Recherche", "Google", "Bing"]}>
        {data.seo.key_searches.map((row) => (
          <tr key={row.search} className="border-t align-top">
            <td className="py-1.5 pr-3">{row.search}</td>
            <td className="py-1.5 pr-3 tabular-nums"><Classement ranking={row.google} before={row.google_position_before} /></td>
            <td className="py-1.5 tabular-nums"><Classement ranking={row.bing} before={row.bing_position_before} /></td>
          </tr>
        ))}
      </TableauCadre>
    </Rubrique>
  );
}

function QuestionsPosees({ data }: { data: Tableau }) {
  return (
    <Rubrique title="Questions posées" note="Les questions tapées dans Google et Bing qui ont montré le site">
      {data.seo.asked.length === 0 ? (
        <Card className="py-4"><CardContent className="px-4 text-sm text-muted-foreground">
          Aucune question relevée sur la période.
        </CardContent></Card>
      ) : (
        <TableauCadre label="Questions posées" head={["Question", "Impressions", "Clics", "Position"]}>
          {data.seo.asked.map((row) => (
            <tr key={row.query} className="border-t">
              <td className="py-1.5 pr-3">{row.query}</td>
              <td className="tabular-nums">{number.format(row.impressions)}</td>
              <td className="tabular-nums">{number.format(row.clicks)}</td>
              <td className="tabular-nums"><Position value={row.position} /></td>
            </tr>
          ))}
        </TableauCadre>
      )}
    </Rubrique>
  );
}

function QuestionsFaq({ data }: { data: Tableau }) {
  return (
    <Rubrique title="Les questions de notre FAQ" note="Les requêtes qui y répondent, quels que soient leurs mots">
      <TableauCadre label="Les questions de notre FAQ" head={["Question", "Google", "Bing"]}>
        {data.seo.questions.map((row) => (
          <tr key={row.question} className="border-t align-top">
            <td className="py-1.5 pr-3">{row.question}</td>
            <td className="py-1.5 pr-3 tabular-nums"><Classement ranking={row.google} /></td>
            <td className="py-1.5 tabular-nums"><Classement ranking={row.bing} /></td>
          </tr>
        ))}
      </TableauCadre>
    </Rubrique>
  );
}

/**
 * Le tableau de bord, en tête du poste de pilotage (ADR 0029) : l'essentiel en cartes et en courbes, sur 7, 30
 * ou 90 jours, comparé à la période d'avant. Le détail reste dessous.
 */
export function TableauDeBord() {
  const [days, setDays] = useState<(typeof PERIODES)[number]>(7);
  const tableau = useQuery<Tableau>({
    queryKey: ["admin-tableau", days],
    retry: false,
    queryFn: () => apiFetch(`/api/admin/tableau?jours=${days}`),
  });

  return (
    <section aria-labelledby="tableau-de-bord" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="tableau-de-bord" className="text-xl font-semibold">Tableau de bord</h2>
          <p className="text-sm text-muted-foreground">Les {days} derniers jours, comparés aux {days} d’avant.</p>
        </div>
        <div role="group" aria-label="Période" className="flex gap-1 rounded-md border p-1">
          {PERIODES.map((period) => (
            <button key={period} type="button" aria-pressed={days === period} onClick={() => setDays(period)}
              className={cn("rounded px-3 py-1.5 text-sm", days === period ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {period} jours
            </button>
          ))}
        </div>
      </div>
      {tableau.isPending ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : tableau.error || !tableau.data ? (
        <p className="text-sm text-destructive">{tableau.error?.message ?? "Tableau de bord indisponible."}</p>
      ) : (
        <>
          <Audience data={tableau.data} />
          <Seo data={tableau.data} />
          {aDesChiffres(tableau.data) && (
            <>
              <RecherchesCles data={tableau.data} />
              <QuestionsPosees data={tableau.data} />
              <QuestionsFaq data={tableau.data} />
            </>
          )}
        </>
      )}
    </section>
  );
}
