"use client";

import { useState } from "react";

/**
 * Graphiques du poste de pilotage : des SVG dessinés ici, sans bibliothèque. Le site est un export statique à
 * CSP stricte, et chaque dépendance coûte en poids et en mises à jour.
 *
 * Aucune valeur ne se lit seulement par la couleur ou au survol : chaque graphique a son résumé (`aria-label`)
 * et son jumeau en tableau, dans la page.
 */

/**
 * Teintes des séries, en clair et en sombre. L'ordre bleu, orange, turquoise, jaune, rose est fixe : c'est lui
 * qui garde deux voisines distinctes pour un daltonien. « neutral » sert au reste (« autre », « sans grille »),
 * « critical » à ce qui est une panne.
 */
export const SERIES = {
  blue: { fill: "fill-[#2a78d6] dark:fill-[#3987e5]", swatch: "bg-[#2a78d6] dark:bg-[#3987e5]" },
  orange: { fill: "fill-[#eb6834] dark:fill-[#d95926]", swatch: "bg-[#eb6834] dark:bg-[#d95926]" },
  aqua: { fill: "fill-[#1baf7a] dark:fill-[#199e70]", swatch: "bg-[#1baf7a] dark:bg-[#199e70]" },
  yellow: { fill: "fill-[#eda100] dark:fill-[#c98500]", swatch: "bg-[#eda100] dark:bg-[#c98500]" },
  magenta: { fill: "fill-[#e87ba4] dark:fill-[#d55181]", swatch: "bg-[#e87ba4] dark:bg-[#d55181]" },
  neutral: { fill: "fill-[#c3c2b7] dark:fill-[#64748b]", swatch: "bg-[#c3c2b7] dark:bg-[#64748b]" },
  critical: { fill: "fill-[#d03b3b] dark:fill-[#e66767]", swatch: "bg-[#d03b3b] dark:bg-[#e66767]" },
} as const;

export type SeriesColor = keyof typeof SERIES;

const integer = new Intl.NumberFormat("fr-FR");
const dayFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const shortDay = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

const hourFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "numeric", timeZone: "UTC" });
const shortHour = new Intl.DateTimeFormat("fr-FR", { hour: "numeric", timeZone: "UTC" });

/** Un jour (« 2026-10-01 ») ou une heure (« 2026-10-01T14:00:00Z »), en UTC. */
function asDate(key: string) {
  return new Date(key.includes("T") ? key : `${key}T00:00:00Z`);
}

export function Legend({ items }: { items: { label: string; color: SeriesColor }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden className={`inline-block size-2.5 rounded-xs ${SERIES[item.color].swatch}`} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

type DailySeries = { label: string; color: SeriesColor; values: (number | null)[] };

/**
 * Une colonne par jour (ou par heure), empilée s'il y a plusieurs séries. Le survol (ou le toucher) d'une colonne
 * affiche ses valeurs à la place du résumé ; le tableau des 30 jours, plus bas dans la page, donne celles de l'usage.
 */
export function DailyColumns({ title, summary, days, series, format = integer.format, limit, unit = "day" }: {
  title: string;
  /** Ce que dit le graphique en une phrase : affiché hors survol, et lu par les lecteurs d'écran. */
  summary: string;
  /** Les colonnes, de la plus ancienne à la plus récente : des jours, ou des heures avec `unit="hour"`. */
  days: string[];
  unit?: "day" | "hour";
  /** De bas en haut. */
  series: DailySeries[];
  format?: (value: number) => string;
  /** Un seuil, tracé comme une ligne. */
  limit?: { value: number; label: string };
}) {
  const [active, setActive] = useState<number | null>(null);
  const [full, short] = unit === "hour" ? [hourFormat, shortHour] : [dayFormat, shortDay];
  const width = 300;
  const height = 100;
  const slot = width / Math.max(1, days.length);
  const bar = Math.min(8, slot * 0.6);
  const totals = days.map((_, index) => series.reduce((sum, serie) => sum + (serie.values[index] ?? 0), 0));
  const max = Math.max(1, ...totals, limit?.value ?? 0);
  const scale = (height - 4) / max; // 4 unités d'air au-dessus de la plus haute colonne
  const gap = 1;

  return (
    <figure className="space-y-2">
      <figcaption className="space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="min-h-8 text-xs text-muted-foreground sm:min-h-4" aria-hidden={active !== null}>
          {active === null ? summary : (
            <>
              <span className="font-medium text-foreground">{full.format(asDate(days[active]))}</span>
              {" : "}
              {series.map((serie) => {
                const value = serie.values[active];
                return `${value === null ? "—" : format(value)}${series.length > 1 ? ` ${serie.label.toLowerCase()}` : ""}`;
              }).join(", ")}
            </>
          )}
        </p>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${title}. ${summary}`}
        className="h-28 w-full" onPointerLeave={() => setActive(null)}>
        {days.map((day, index) => {
          let top = height;
          const x = index * slot + (slot - bar) / 2;
          const visible = series.filter((serie) => (serie.values[index] ?? 0) > 0);
          return (
            <g key={day}>
              {active === index && <rect x={index * slot} y={0} width={slot} height={height} className="fill-muted" />}
              {visible.map((serie, position) => {
                const size = Math.max(1.5, (serie.values[index] ?? 0) * scale - (position > 0 ? gap : 0));
                top -= size + (position > 0 ? gap : 0);
                // Seul le bout de la colonne est arrondi : sa base reste droite, posée sur l'axe
                const round = position === visible.length - 1 ? Math.min(1.5, size) : 0;
                return (
                  <path key={serie.label} className={SERIES[serie.color].fill}
                    d={`M${x},${top + size}V${top + round}Q${x},${top} ${x + round},${top}H${x + bar - round}Q${x + bar},${top} ${x + bar},${top + round}V${top + size}Z`} />
                );
              })}
            </g>
          );
        })}
        <line x1={0} x2={width} y1={height} y2={height} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {limit && (
          <line x1={0} x2={width} y1={height - limit.value * scale} y2={height - limit.value * scale}
            className="stroke-[#d03b3b] dark:stroke-[#e66767]" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        )}
        {/* Zones de survol : toute la hauteur du jour, bien plus larges que la colonne */}
        {days.map((day, index) => (
          <rect key={day} aria-hidden x={index * slot} y={0} width={slot} height={height} fill="transparent"
            onPointerEnter={() => setActive(index)} onPointerDown={() => setActive(index)} />
        ))}
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums" aria-hidden>
        <span>{days.length ? short.format(asDate(days[0])) : ""}</span>
        <span>max. {format(Math.max(0, ...totals))}{limit ? ` · ${limit.label}` : ""}</span>
        <span>{days.length ? short.format(asDate(days[days.length - 1])) : ""}</span>
      </div>
      {series.length > 1 && <Legend items={series.map(({ label, color }) => ({ label, color }))} />}
    </figure>
  );
}

/** Une barre de répartition : des parts d'un tout, de gauche à droite, séparées par un filet de fond. */
export function ShareBar({ parts }: { parts: { label: string; color: SeriesColor; value: number }[] }) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const visible = parts.filter((part) => part.value > 0);
  if (!total) return <span className="text-muted-foreground">—</span>;
  const gap = 0.8;
  const room = 100 - gap * (visible.length - 1);
  let x = 0;
  return (
    <svg viewBox="0 0 100 10" preserveAspectRatio="none" role="img" className="h-2.5 w-full min-w-28 rounded-xs"
      aria-label={visible.map((part) => `${part.label} ${Math.round((100 * part.value) / total)} %`).join(", ")}>
      {visible.map((part) => {
        const size = (part.value / total) * room;
        const start = x;
        x += size + gap;
        return (
          <rect key={part.label} x={start} y={0} width={size} height={10} className={SERIES[part.color].fill}>
            <title>{`${part.label} : ${integer.format(part.value)} (${Math.round((100 * part.value) / total)} %)`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/** Les étapes d'un parcours, chacune rapportée à la première. */
export function FunnelBars({ steps }: { steps: { label: string; value: number; note?: string }[] }) {
  const first = steps[0]?.value ?? 0;
  return (
    <ol className="space-y-2 text-sm">
      {steps.map((step) => {
        const share = first ? step.value / first : 0;
        return (
          <li key={step.label} className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1">
            <span>
              {step.label}
              {step.note && <span className="text-muted-foreground"> ({step.note})</span>}
            </span>
            <span className="tabular-nums">
              <span className="font-medium">{integer.format(step.value)}</span>{" "}
              <span className="text-muted-foreground">
                {first ? `${(100 * share).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "—"}
              </span>
            </span>
            <svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden className="col-span-2 h-2.5 w-full">
              <rect x={0} y={0} width={100} height={10} className="fill-muted" />
              <rect x={0} y={0} width={Math.max(share ? 0.6 : 0, 100 * share)} height={10} className={SERIES.blue.fill} />
            </svg>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Fond d'une case selon un taux, en cinq pas d'un seul bleu : plus le taux est haut, plus la case s'éloigne du
 * fond de la page (plus foncée en clair, plus claire en sombre). Le texte de la case porte toujours le chiffre.
 */
const RATE_TONES = [
  "bg-[#cde2fb] text-[#0b0b0b] dark:bg-[#0d366b] dark:text-white",
  "bg-[#9ec5f4] text-[#0b0b0b] dark:bg-[#184f95] dark:text-white",
  "bg-[#6da7ec] text-[#0b0b0b] dark:bg-[#256abf] dark:text-white",
  "bg-[#256abf] text-white dark:bg-[#5598e7] dark:text-[#0b0b0b]",
  "bg-[#184f95] text-white dark:bg-[#9ec5f4] dark:text-[#0b0b0b]",
];

export function rateTone(rate: number) {
  return RATE_TONES[Math.min(RATE_TONES.length - 1, Math.floor(rate * RATE_TONES.length))];
}

export function RateScale() {
  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>0 %</span>
      <span aria-hidden className="flex gap-0.5">
        {RATE_TONES.map((tone) => <span key={tone} className={`inline-block h-2.5 w-5 ${tone}`} />)}
      </span>
      <span>100 % de réussite</span>
    </p>
  );
}
