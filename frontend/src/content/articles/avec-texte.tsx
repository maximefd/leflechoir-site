import type { Article, TexteArticle } from "@/content/articles/types";
import { Prose } from "@/components/articles/prose";

/**
 * Assemble un article (ADR 0027) : le texte vient du JSON éditable en place, la structure — dates, brouillon,
 * liens du bas, grille et ses définitions — reste dans le fichier TSX qu'on relit d'une traite.
 */
export function articleAvecTexte(
  slug: string,
  texte: TexteArticle,
  reste: Omit<Article, "slug" | "title" | "description" | "chapo" | "sections">,
): Article {
  return {
    slug,
    title: texte.title,
    description: texte.description,
    chapo: texte.chapo,
    sections: texte.sections.map((section) => ({
      id: section.id,
      title: section.title,
      body: <Prose paragraphs={section.paragraphs} />,
    })),
    ...reste,
  };
}
