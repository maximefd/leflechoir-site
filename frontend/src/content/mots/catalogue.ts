import catalogue from "./catalogue.json";

/**
 * Ce que le site sait des listes de mots sans les charger : effectifs par initiale et par terminaison (sans les
 * vides : une combinaison sans mot n'a pas de page) et date de génération, qui devient le `lastModified` du sitemap.
 * Écrit par `make listes` (tools/lexicon/listes.py) : on ne le retouche pas à la main. Léger exprès : le sitemap, les
 * pages d'index et les liens de maillage l'importent sans embarquer les mots.
 */
export type EntreeCatalogue = {
  slug: string;
  longueur: number | null;
  total: number;
  /** Jour de génération de la liste (AAAA-MM-JJ) : change seulement quand la liste change */
  genere: string;
  initiales: { lettre: string; total: number }[];
  terminaisons: { fin: string; total: number }[];
};

export const CATALOGUE: readonly EntreeCatalogue[] = catalogue.listes as EntreeCatalogue[];

export function entreeCatalogue(slug: string): EntreeCatalogue | undefined {
  return CATALOGUE.find((entree) => entree.slug === slug);
}
