import { CircleCheck, CircleDashed, CircleX, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Ce que partagent les rubriques du poste de pilotage : cadres, seuils en trois états, formats des nombres. */

export type Level = "ok" | "near" | "over" | "unknown";

export const LEVELS: Record<Level, { label: string; icon: typeof CircleCheck; tone: string; border: string }> = {
  ok: { label: "Dans le seuil", icon: CircleCheck, tone: "text-[#0a7a0a] dark:text-[#0ca30c]", border: "" },
  near: { label: "Proche du seuil", icon: TriangleAlert, tone: "text-[#a36a00] dark:text-[#fab219]", border: "border-[#fab219]" },
  over: { label: "Seuil dépassé", icon: CircleX, tone: "text-destructive", border: "border-destructive bg-destructive/5" },
  unknown: { label: "Pas encore de mesure", icon: CircleDashed, tone: "text-muted-foreground", border: "" },
};

export const number = new Intl.NumberFormat("fr-FR");
export const dateTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" });
export const dayMonth = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function seconds(ms: number | null) {
  return ms === null ? "—" : `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} s`;
}

export function percent(share: number, digits = 1) {
  return `${(100 * share).toLocaleString("fr-FR", { maximumFractionDigits: digits })} %`;
}

export function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function Group({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-6">
      <h2 id={id} className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Un tableau plus large que l'écran défile dans son cadre, que le clavier peut atteindre et faire défiler. */
export function Scroll({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="region" aria-label={label} tabIndex={0}
      className="overflow-x-auto rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      {children}
    </div>
  );
}

export function Empty() {
  return <p className="text-sm text-muted-foreground">Rien pour l&apos;instant.</p>;
}

/** Un seuil de l'ADR 0013 en trois états : vert, orange dès 80 % du seuil, rouge au-delà. Jamais la couleur seule. */
export function Indicator({ label, value, limit, level, note }: {
  label: string;
  value: string;
  limit: string;
  level: Level;
  /** Une ligne de plus : la tendance, ou ce que mesure le chiffre. */
  note?: string;
}) {
  const { label: state, icon: Icon, tone, border } = LEVELS[level];
  return (
    <div className={`rounded-lg border p-4 ${border}`}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm font-medium">
        <Icon aria-hidden className={`size-4 ${tone}`} />
        {state}
        <span className="font-normal text-muted-foreground">· seuil : {limit}</span>
      </p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

/** Un chiffre sans seuil : ce que fait le serveur à l'instant. */
export function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
