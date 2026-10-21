/**
 * La navigation du site, en rubriques (maquettes du 07/10/2026, `docs/maquettes/navigation-2026-10/`, retenues par
 * l'auteur le 21/10/2026 sans le nouveau style) : Accueil, Créer, Jouer, Articles, Outils, et « Mes grilles » à
 * part. Sur téléphone, l'accueil passe par le logo. Les pages « Créer » et « Outils » listent leurs liens ici, que
 * le menu du téléphone reprend.
 */
export type Lien = { href: string; label: string; texte: string };

export type Rubrique = {
  label: string;
  href: string;
  /** Les adresses qui allument la rubrique : elle-même, et les pages qu'elle regroupe */
  pages: readonly string[];
};

/** Une adresse appartient à une page si c'est elle, ou l'une de ses sous-pages (`/mots/cinq-lettres` dans `/mots`) */
export function dans(pathname: string, page: string): boolean {
  return page === "/" ? pathname === "/" : pathname === page || pathname.startsWith(`${page}/`);
}

export const ACCUEIL: Rubrique = { label: "Accueil", href: "/", pages: ["/"] };

/** Les rubriques, dans l'ordre de la barre ; le téléphone n'affiche pas l'accueil (le logo y ramène) */
export const RUBRIQUES: readonly Rubrique[] = [
  { label: "Créer", href: "/creer", pages: ["/creer", "/grid", "/grids/new"] },
  { label: "Jouer", href: "/jouer", pages: ["/jouer"] },
  { label: "Articles", href: "/articles", pages: ["/articles", "/creer-des-mots-fleches"] },
  { label: "Outils", href: "/outils", pages: ["/outils", "/search", "/mots", "/dictionaries"] },
];

/** « Mes grilles », à droite de la barre : la liste et l'édition d'une grille conservée (pas la création, dans Créer) */
export const MES_GRILLES: Rubrique = { label: "Mes grilles", href: "/grids", pages: ["/grids/edit"] };

export function rubriqueActive(pathname: string): string | null {
  if (pathname === "/grids" || MES_GRILLES.pages.some((page) => dans(pathname, page))) return MES_GRILLES.href;
  if (dans(pathname, ACCUEIL.href)) return ACCUEIL.href;
  return RUBRIQUES.find((rubrique) => rubrique.pages.some((page) => dans(pathname, page)))?.href ?? null;
}

export const LIENS_CREER: readonly Lien[] = [
  { href: "/grid", label: "Générer une grille", texte: "Choisis une taille, ajoute tes mots si tu veux : le site remplit la grille." },
  { href: "/grids/new", label: "Créer à la main", texte: "Dessine ta grille case par case." },
  { href: "/grids", label: "Mes grilles", texte: "Reprendre une grille, écrire ses définitions, l’imprimer." },
];

/** Dans « Créer », ce qui aide à faire une grille, même sur papier */
export const LIENS_AIDE: readonly Lien[] = [
  { href: "/search", label: "Chercher un mot", texte: "Les lettres que tu as, un ? pour chaque case vide : L?S?E." },
  { href: "/dictionaries", label: "Mes dictionnaires", texte: "Tes mots par thème, avec leurs définitions." },
];

export const LIENS_OUTILS: readonly Lien[] = [
  { href: "/search", label: "Chercher un mot", texte: "Les lettres que tu as, un ? pour chaque case vide : L?S?E." },
  { href: "/mots", label: "Listes de mots", texte: "Les mots de 2 à 10 lettres, par première et par dernière lettres." },
  { href: "/dictionaries", label: "Mes dictionnaires", texte: "Tes mots par thème, avec leurs définitions." },
];
