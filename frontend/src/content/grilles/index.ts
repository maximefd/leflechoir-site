import type { GrilleJson } from "@/content/grilles/types";

/**
 * La bibliothèque des grilles à jouer (ADR 0026) : une par jour, produite hors ligne par
 * `python -m tools.grilles.produire` et publiée telle quelle. Produire une grille ajoute ici
 * sa ligne (et son chargeur), puis sa page dans `src/app/jouer/<date>`.
 */

/** Les grilles publiées, de la plus récente à la plus ancienne. La première est l'horizon du stock. */
export const GRILLES: { date: string; force?: number }[] = [
  // Novembre 2026 : le format du téléphone (6 × 9, 6 × 10), sans force annoncée (ADR 0026)
  { date: "2026-11-28" },
  { date: "2026-11-27" },
  { date: "2026-11-26" },
  { date: "2026-11-25" },
  { date: "2026-11-24" },
  { date: "2026-11-23" },
  { date: "2026-11-22" },
  { date: "2026-11-21" },
  { date: "2026-11-20" },
  { date: "2026-11-19" },
  { date: "2026-11-18" },
  { date: "2026-11-17" },
  { date: "2026-11-16" },
  { date: "2026-11-15" },
  { date: "2026-11-14" },
  { date: "2026-11-13" },
  { date: "2026-11-12" },
  { date: "2026-11-11" },
  { date: "2026-11-10" },
  { date: "2026-11-09" },
  { date: "2026-11-08" },
  { date: "2026-11-07" },
  { date: "2026-11-06" },
  { date: "2026-11-05" },
  { date: "2026-11-04" },
  { date: "2026-11-03" },
  { date: "2026-11-02" },
  { date: "2026-11-01" },
  { date: "2026-10-31", force: 4 },
  { date: "2026-10-30", force: 3 },
  { date: "2026-10-29", force: 1 },
  { date: "2026-10-28", force: 2 },
  { date: "2026-10-27", force: 4 },
  { date: "2026-10-26", force: 3 },
  { date: "2026-10-25", force: 1 },
  { date: "2026-10-24", force: 2 },
  { date: "2026-10-23", force: 4 },
  { date: "2026-10-22", force: 3 },
  { date: "2026-10-21", force: 1 },
  { date: "2026-10-20", force: 2 },
  { date: "2026-10-16", force: 3 },
  { date: "2026-10-15", force: 2 },
  { date: "2026-10-14", force: 4 },
  { date: "2026-10-13", force: 3 },
  { date: "2026-10-12", force: 1 },
  { date: "2026-10-11", force: 2 },
  { date: "2026-10-10", force: 4 },
  { date: "2026-10-09", force: 3 },
  { date: "2026-10-08", force: 1 },
  { date: "2026-10-07", force: 2 },
];

/** Le chargement d'une grille, à la demande : la page du jour ne paie pas pour toute la bibliothèque. */
export const LOADERS: Record<string, () => Promise<{ default: GrilleJson }>> = {
  "2026-11-28": () => import("./2026-11-28.json"),
  "2026-11-27": () => import("./2026-11-27.json"),
  "2026-11-26": () => import("./2026-11-26.json"),
  "2026-11-25": () => import("./2026-11-25.json"),
  "2026-11-24": () => import("./2026-11-24.json"),
  "2026-11-23": () => import("./2026-11-23.json"),
  "2026-11-22": () => import("./2026-11-22.json"),
  "2026-11-21": () => import("./2026-11-21.json"),
  "2026-11-20": () => import("./2026-11-20.json"),
  "2026-11-19": () => import("./2026-11-19.json"),
  "2026-11-18": () => import("./2026-11-18.json"),
  "2026-11-17": () => import("./2026-11-17.json"),
  "2026-11-16": () => import("./2026-11-16.json"),
  "2026-11-15": () => import("./2026-11-15.json"),
  "2026-11-14": () => import("./2026-11-14.json"),
  "2026-11-13": () => import("./2026-11-13.json"),
  "2026-11-12": () => import("./2026-11-12.json"),
  "2026-11-11": () => import("./2026-11-11.json"),
  "2026-11-10": () => import("./2026-11-10.json"),
  "2026-11-09": () => import("./2026-11-09.json"),
  "2026-11-08": () => import("./2026-11-08.json"),
  "2026-11-07": () => import("./2026-11-07.json"),
  "2026-11-06": () => import("./2026-11-06.json"),
  "2026-11-05": () => import("./2026-11-05.json"),
  "2026-11-04": () => import("./2026-11-04.json"),
  "2026-11-03": () => import("./2026-11-03.json"),
  "2026-11-02": () => import("./2026-11-02.json"),
  "2026-11-01": () => import("./2026-11-01.json"),
  "2026-10-31": () => import("./2026-10-31.json"),
  "2026-10-30": () => import("./2026-10-30.json"),
  "2026-10-29": () => import("./2026-10-29.json"),
  "2026-10-28": () => import("./2026-10-28.json"),
  "2026-10-27": () => import("./2026-10-27.json"),
  "2026-10-26": () => import("./2026-10-26.json"),
  "2026-10-25": () => import("./2026-10-25.json"),
  "2026-10-24": () => import("./2026-10-24.json"),
  "2026-10-23": () => import("./2026-10-23.json"),
  "2026-10-22": () => import("./2026-10-22.json"),
  "2026-10-21": () => import("./2026-10-21.json"),
  "2026-10-20": () => import("./2026-10-20.json"),
  "2026-10-16": () => import("./2026-10-16.json"),
  "2026-10-15": () => import("./2026-10-15.json"),
  "2026-10-14": () => import("./2026-10-14.json"),
  "2026-10-13": () => import("./2026-10-13.json"),
  "2026-10-12": () => import("./2026-10-12.json"),
  "2026-10-11": () => import("./2026-10-11.json"),
  "2026-10-10": () => import("./2026-10-10.json"),
  "2026-10-09": () => import("./2026-10-09.json"),
  "2026-10-08": () => import("./2026-10-08.json"),
  "2026-10-07": () => import("./2026-10-07.json"),
};

/** Le jour à Paris (AAAA-MM-JJ) : la grille du jour est celle que le joueur y vit, pas celle du serveur. */
export function aujourdhui(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

/** La plus récente grille déjà parue (celle du jour si elle existe) : la date du sitemap pour `/jouer`. */
export function grilleDuJour(jour: string): { date: string; force?: number } | null {
  return GRILLES.find((grille) => grille.date <= jour) ?? null;
}

/**
 * La garde du stock (ADR 0026) : au moins sept jours de grilles devant le jour du build, sinon il casse —
 * le site ne publierait plus rien dans une semaine sans que rien ne le dise. En développement, la page joue
 * quand même : la console prévient.
 */
export function verifierStock(jour: string): void {
  const horizon = GRILLES[0]?.date;
  const reste = horizon ? Math.round((Date.parse(horizon) - Date.parse(jour)) / 86_400_000) : -1;
  if (reste >= 7) return;
  const message = `Stock de grilles : ${reste} jour(s) devant nous (ADR 0026 : au moins sept). Produis-en d'autres :`
    + " python -m tools.grilles.produire AAAA-MM-JJ --size 6x9 --wish …";
  if (process.env.NODE_ENV === "production") throw new Error(message);
  console.warn(message);
}
