import { isValidElement, type ReactNode } from "react";
import type { MiniGridSpec } from "@/lib/mini-grid";

/**
 * Un article : écrit à la première personne, signé « je », relu par l'auteur.
 *
 * Le contenu est du TSX, et non du MDX : le site est un export statique sans chargeur de plus, et un article
 * reste un fichier qu'on relit d'une traite. Le nom du fichier est l'adresse de l'article (`slug`) ; l'API
 * en garde la liste (`backend/articles.py`) pour accepter la note de force de sa grille.
 */
export type ArticleSection = { id: string; title: string; body: ReactNode };

/** Les fonctions du site vers lesquelles un article peut renvoyer, en fin de page */
export type RelatedFeature = "generer" | "recherche" | "mystere" | "guide";

export type Article = {
  slug: string;
  /** Le titre de la page (h1, titre des moteurs et des partages) */
  title: string;
  /** La description des moteurs de recherche et des partages : 120 à 160 caractères */
  description: string;
  /** Le chapeau, sous le titre */
  chapo: string;
  /** Dates ISO (AAAA-MM-JJ) : première mise en ligne, et dernière retouche de fond */
  published: string;
  updated?: string;
  /**
   * Brouillon : en `noindex`, hors du sitemap et de la liste publique. En production, la page ne montre pas
   * le texte, seulement qu'il est en préparation. Pour publier, l'auteur passe `draft` à `false` et met
   * `published` à la date du jour.
   */
  draft: boolean;
  sections: ArticleSection[];
  /** La petite grille de l'article, jouée après la section `after` (à la fin si absente) */
  grid: { title: string; spec: MiniGridSpec; after?: string };
  related: RelatedFeature[];
};

const WORDS_PER_MINUTE = 230;

/** Le texte d'un nœud React, pour compter les mots : chaînes, listes, et enfants des éléments (liens compris). */
export function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

export function wordCount(article: Article): number {
  const text = [article.chapo, ...article.sections.map((section) => `${section.title} ${textOf(section.body)}`)].join(" ");
  return text.split(/\s+/).filter(Boolean).length;
}

export function readingMinutes(article: Article): number {
  return Math.max(1, Math.round(wordCount(article) / WORDS_PER_MINUTE));
}

/** Les brouillons se lisent en développement (relecture de l'auteur), ou au build avec NEXT_PUBLIC_SHOW_DRAFTS=1. */
export const SHOW_DRAFTS = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_SHOW_DRAFTS === "1";
