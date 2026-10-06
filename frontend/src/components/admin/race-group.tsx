"use client";

import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Group, LEVELS, number, percent, Scroll, Section } from "@/components/admin/parts";

/**
 * « La course » : `race` de `GET /api/admin/stats` (backend/stats.py), les indicateurs du cap de l'ADR 0023, par
 * semaine ISO (du lundi au dimanche, UTC). Des nombres seulement. Une ligne `available: false` n'est pas encore
 * mesurée : elle se lit « à venir », jamais zéro.
 */
type Week = { week: string; label: string; start: string; end: string };

type Trend = { change: number; share: number | null; direction: "up" | "down" | "flat" };

export type Race = {
  /** Les semaines complètes, de la plus ancienne à la plus récente. */
  weeks: Week[];
  /** La semaine en cours : jamais dans la tendance. */
  current: Week & { days: number };
  /** En deçà de cet écart d'une semaine à l'autre, la tendance est « stable ». */
  flat_share: number;
  indicators: {
    key: string;
    label: string;
    /** Une ligne de détail de la précédente (« dont exports PDF »). */
    detail: boolean;
    available: boolean;
    values: number[] | null;
    current: number | null;
    trend: Trend | null;
  }[];
};

const shortDay = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

function range(week: Week) {
  return `${shortDay.format(new Date(`${week.start}T00:00:00Z`))} – ${shortDay.format(new Date(`${week.end}T00:00:00Z`))}`;
}

/** « +6 », « -3 » : l'écart porte toujours son signe. */
function signed(change: number) {
  return `${change > 0 ? "+" : ""}${number.format(change)}`;
}

/** Une décimale sous 10 %, pour ne pas lire « 0 % » d'un recul de quelques unités sur des centaines. */
function signedPercent(share: number) {
  return `${share > 0 ? "+" : "-"}${percent(Math.abs(share), Math.abs(share) < 0.1 ? 1 : 0)}`;
}

// Jamais la couleur seule : l'icône et le mot disent le sens. Les teintes sont celles des seuils (parts.tsx).
const TRENDS = {
  up: { word: "en hausse", icon: TrendingUp, tone: LEVELS.ok.tone },
  down: { word: "en baisse", icon: TrendingDown, tone: LEVELS.over.tone },
  flat: { word: "stable", icon: Minus, tone: "text-muted-foreground" },
} as const;

function TrendCell({ trend }: { trend: Trend | null }) {
  if (!trend) return <span className="text-muted-foreground">—</span>;
  const { word, icon: Icon, tone } = TRENDS[trend.direction];
  return (
    <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
      <Icon aria-hidden className={`size-4 ${tone}`} />
      <span className={`font-medium ${tone}`}>{word}</span>
      {trend.change !== 0 && (
        <>
          {" "}
          <span className="text-muted-foreground tabular-nums">
            ({signed(trend.change)}{trend.share !== null && `, ${signedPercent(trend.share)}`})
          </span>
        </>
      )}
    </span>
  );
}

export function RaceGroup({ race }: { race: Race }) {
  const { weeks, current, indicators } = race;
  const last = weeks[weeks.length - 1];
  const before = weeks[weeks.length - 2];

  return (
    <Group id="course" title="La course">
      <Section title="Semaine par semaine"
        description={`Du lundi au dimanche (UTC) : les ${weeks.length} dernières semaines complètes, puis la semaine en cours, qui reste hors de la tendance. La tendance compare ${last.label} à ${before.label} ; elle est « stable » sous ${percent(race.flat_share, 0)} d'écart.`}>
        <div className="space-y-4">
          <Scroll label="Indicateurs de la course par semaine">
            <table className="w-full text-sm">
              <caption className="sr-only">Indicateurs de la course, par semaine ISO</caption>
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="py-2 pr-4 font-medium"><span className="sr-only">Indicateur</span></th>
                  {weeks.map((week) => (
                    <th key={week.week} scope="col" className="py-2 pl-4 text-right font-medium whitespace-nowrap">
                      {week.label}
                      <span className="block text-xs font-normal">{range(week)}</span>
                    </th>
                  ))}
                  <th scope="col" className="py-2 pl-4 text-right font-medium whitespace-nowrap">
                    {current.label} en cours
                    <span className="block text-xs font-normal">{current.days} jour{current.days > 1 ? "s" : ""} sur 7</span>
                  </th>
                  <th scope="col" className="py-2 pl-4 text-right font-medium">Tendance</th>
                </tr>
              </thead>
              <tbody>
                {indicators.map((row) => (
                  <tr key={row.key} className="border-b last:border-0">
                    <th scope="row" className={`py-1.5 pr-4 text-left font-normal whitespace-nowrap ${row.detail ? "pl-4 text-muted-foreground" : ""}`}>
                      {row.detail ? `dont ${row.label}` : row.label}
                    </th>
                    {row.values === null ? (
                      <td colSpan={weeks.length + 2} className="py-1.5 pl-4 text-muted-foreground">à venir</td>
                    ) : (
                      <>
                        {row.values.map((value, index) => (
                          <td key={weeks[index].week} className="py-1.5 pl-4 text-right tabular-nums">{number.format(value)}</td>
                        ))}
                        <td className="py-1.5 pl-4 text-right text-muted-foreground tabular-nums">{number.format(row.current ?? 0)}</td>
                        <td className="py-1.5 pl-4 text-right"><TrendCell trend={row.trend} /></td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroll>

          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Visiteurs</span> : la somme, jour après jour, des empreintes du jour
              qui ont appelé l&apos;API (recherche, génération, compte, grille), comme dans « Usage ». Qui ne fait que lire
              une page n&apos;y figure pas : voir « Audience ».
            </li>
            <li>
              <span className="font-medium text-foreground">Grilles terminées</span> : les exports PDF vus par la balise (hors
              opposition) et les grilles conservées. Une grille conservée puis exportée compte deux fois.
            </li>
            <li>
              <span className="font-medium text-foreground">Comptes créés</span> : les inscriptions ; celles d&apos;un compte
              supprimé disparaissent avec lui.
            </li>
            <li>
              <span className="font-medium text-foreground">À venir</span> : pas encore mesuré. La ligne se remplira quand la
              fonction existera.
            </li>
          </ul>
        </div>
      </Section>
    </Group>
  );
}
