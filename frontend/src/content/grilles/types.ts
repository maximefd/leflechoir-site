import type { GeneratedGrid } from "@/lib/mini-grid";

/**
 * Une grille à jouer publiée (ADR 0026) : celle d'un jour de la bibliothèque, `/jouer/<date>`.
 *
 * La requête et la réponse du générateur sont gardées comme pour les articles : la grille se refait à
 * l'identique avec la même seed et le même lexique. Les définitions (`clues`), une par mot, sont écrites à
 * la main dans le style de l'auteur (docs/STYLE-DEFINITIONS.md) — le build refuse une grille dont un mot
 * n'a pas la sienne. Produites par `python -m tools.grilles.produire`.
 */
export type GrilleJson = {
  /** Le jour de publication (AAAA-MM-JJ) : c'est l'adresse de la page */
  date: string;
  /**
   * La force annoncée au joueur, de 1 (douce) à 4 (coriace) : seulement les grilles d'octobre 2026, dont la taille
   * faisait la force. Les grilles au format téléphone (6 × 9, 6 × 10) n'en ont pas (ADR 0026, choix du 21/10/2026).
   */
  force?: number;
  clues: Record<string, string>;
} & GeneratedGrid;
