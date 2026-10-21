import { entreeCatalogue } from "./catalogue";
import { PAGES_LONGUEUR } from "./longueurs";

/**
 * Les pages « commençant par » et « finissant par » d'une longueur (`/mots/cinq-lettres/commencant-par-a`,
 * `/mots/cinq-lettres/finissant-par-ez`). Elles viennent du catalogue : seules les combinaisons qui ont des mots
 * existent. Ce fichier est léger (aucun mot) : le sitemap et le maillage l'importent.
 */
export type TypeCombinaison = "commencant" | "finissant";

export type Combinaison = {
  type: TypeCombinaison;
  /** La lettre ou la terminaison, en capitales : `A`, `EZ` */
  cle: string;
  /** Dernier segment de l'adresse : `commencant-par-a` */
  slug: string;
  total: number;
  /** Le motif de recherche équivalent : `A????`, `???EZ` */
  motif: string;
};

const PREFIXE: Record<TypeCombinaison, string> = { commencant: "commencant-par", finissant: "finissant-par" };

export function slugCombinaison(type: TypeCombinaison, cle: string): string {
  return `${PREFIXE[type]}-${cle.toLowerCase()}`;
}

function motifDe(type: TypeCombinaison, cle: string, longueur: number): string {
  const jokers = "?".repeat(longueur - cle.length);
  return type === "commencant" ? cle + jokers : jokers + cle;
}

/** Les combinaisons d'une longueur, les initiales d'abord (A à Z), puis les terminaisons dans l'ordre du catalogue */
/**
 * En dessous de ce nombre de mots, une page de combinaison existe (l'outil y répond, et « aucun mot » est une réponse
 * utile) mais reste hors des moteurs : `noindex` et absente du sitemap, pour ne pas passer pour une page creuse.
 */
export const MIN_MOTS_INDEXES = 5;

export function indexable(combinaison: Combinaison): boolean {
  return combinaison.total >= MIN_MOTS_INDEXES;
}

export function combinaisonsDe(listeSlug: string, type?: TypeCombinaison): Combinaison[] {
  const entree = entreeCatalogue(listeSlug);
  if (!entree || entree.longueur === null) return [];
  const { longueur } = entree;
  const initiales: Combinaison[] = entree.initiales.map(({ lettre, total }) => ({
    type: "commencant",
    cle: lettre,
    slug: slugCombinaison("commencant", lettre),
    total,
    motif: motifDe("commencant", lettre, longueur),
  }));
  const terminaisons: Combinaison[] = entree.terminaisons.map(({ fin, total }) => ({
    type: "finissant",
    cle: fin,
    slug: slugCombinaison("finissant", fin),
    total,
    motif: motifDe("finissant", fin, longueur),
  }));
  return [...initiales, ...terminaisons].filter((combinaison) => !type || combinaison.type === type);
}

export function combinaisonDe(listeSlug: string, slug: string): Combinaison | undefined {
  return combinaisonsDe(listeSlug).find((combinaison) => combinaison.slug === slug);
}

/** `/mots/cinq-lettres/commencant-par-a` */
export function cheminCombinaison(listeSlug: string, combinaison: Pick<Combinaison, "slug">): `/mots/${string}/${string}` {
  return `/mots/${listeSlug}/${combinaison.slug}`;
}

/** « Mots de 5 lettres commençant par A » : le H1, et l'intitulé des liens */
export function titreCombinaison(longueur: number, combinaison: Pick<Combinaison, "type" | "cle">): string {
  return `Mots de ${longueur} lettres ${combinaison.type === "commencant" ? "commençant" : "finissant"} par ${combinaison.cle}`;
}

/** Tous les chemins de combinaisons des longueurs qui en ont, dans l'ordre : pour le sitemap */
export function cheminsCombinaisons(): string[] {
  return PAGES_LONGUEUR.filter((page) => page.combinaisons).flatMap((page) =>
    combinaisonsDe(page.slug).map((combinaison) => cheminCombinaison(page.slug, combinaison)),
  );
}
