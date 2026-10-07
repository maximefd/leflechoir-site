import { article as definition } from "@/content/articles/ecrire-une-definition-de-mots-fleches";
import { article as world } from "@/content/articles/mots-fleches-dans-le-monde";
import { article as comeback } from "@/content/articles/pourquoi-les-mots-fleches-reviennent";
import { SHOW_DRAFTS, type Article } from "@/content/articles/types";

/** Tous les articles, du plus récent au plus ancien. Un nouvel article s'ajoute ici et dans `backend/articles.py`. */
export const ARTICLES: Article[] = [definition, comeback, world].sort((a, b) => b.published.localeCompare(a.published));

/** Les articles publiés : la liste publique, le sitemap */
export const PUBLISHED = ARTICLES.filter((article) => !article.draft);

/** Ce que la liste montre : les publiés, et les brouillons en relecture (développement) */
export const LISTED = SHOW_DRAFTS ? ARTICLES : PUBLISHED;
