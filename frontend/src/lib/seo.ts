import type { Metadata } from "next";
import { site } from "@/config/site";
import type { Article } from "@/content/articles/types";

/**
 * Référencement (#113). Deux sortes de pages :
 * - publiques : indexées, dans le sitemap, avec une adresse canonique et un aperçu de partage ;
 * - privées (compte, grilles, dictionnaires, liens reçus par e-mail) : `noindex`. Jamais de `Disallow` sur
 *   elles dans robots.txt : un robot qui ne peut pas lire la page ne voit pas son `noindex`.
 */

/** Pages publiques, dans l'ordre du sitemap */
export const PUBLIC_PATHS = [
  "/",
  "/search",
  "/grid",
  "/creer-des-mots-fleches",
  "/articles",
  "/contact",
  "/legal",
  "/privacy",
  "/terms",
] as const;
export type PublicPath = (typeof PUBLIC_PATHS)[number];

/** Image de partage, écrite au build par app/og.png/route.tsx */
export const OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: `${site.name} — ${site.tagline}` };

/** Aperçu de partage commun. Une page qui donne son propre `openGraph` remplace tout l'objet : elle repart d'ici. */
export const baseOpenGraph = {
  type: "website",
  siteName: site.name,
  locale: site.locale,
  images: [OG_IMAGE],
} satisfies Metadata["openGraph"];

/** Un article (`/articles/<slug>`) : public une fois publié, et dans le sitemap */
export type ArticlePath = `/articles/${string}`;

export function publicPage({ path, title, description }: {
  path: PublicPath | ArticlePath;
  /** Absent : le titre par défaut du site (accueil) */
  title?: string;
  description: string;
}): Metadata {
  const shareTitle = title ? `${title} | ${site.name}` : `${site.name} — ${site.tagline}`;
  return {
    ...(title ? { title } : {}),
    description,
    alternates: { canonical: path },
    openGraph: { ...baseOpenGraph, url: path, title: shareTitle, description },
    twitter: { card: "summary_large_image", title: shareTitle, description, images: [OG_IMAGE.url] },
  };
}

export function privatePage({ title, description }: { title: string; description: string }): Metadata {
  return { title, description, robots: { index: false, follow: false } };
}

/**
 * Un article : page publique, en aperçu « article » avec ses dates. Un brouillon reste en `noindex` (ses liens
 * sont suivis) : il n'entre ni dans les moteurs ni dans le sitemap.
 */
export function articlePage(article: Article): Metadata {
  const base = publicPage({ path: `/articles/${article.slug}`, title: article.title, description: article.description });
  return {
    ...base,
    openGraph: {
      ...base.openGraph,
      type: "article",
      publishedTime: article.published,
      modifiedTime: article.updated ?? article.published,
    },
    ...(article.draft ? { robots: { index: false, follow: true } } : {}),
  };
}

/** Données structurées d'un article : l'article lui-même et son fil d'Ariane. */
export function articleJsonLd(article: Article, words: number) {
  const url = `${site.url}/articles/${article.slug}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: article.title,
        description: article.description,
        inLanguage: site.lang,
        url,
        mainEntityOfPage: url,
        image: `${site.url}${OG_IMAGE.url}`,
        datePublished: article.published,
        dateModified: article.updated ?? article.published,
        wordCount: words,
        isAccessibleForFree: true,
        // Comme le guide : l'auteur ne publie pas son identité (docs/RGPD.md) ; à revoir s'il signe d'un nom
        author: { "@type": "Organization", name: site.name, url: site.url },
        publisher: { "@type": "Organization", name: site.name, url: site.url },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Accueil", item: site.url },
          { "@type": "ListItem", position: 2, name: "Articles", item: `${site.url}/articles` },
          { "@type": "ListItem", position: 3, name: article.title, item: url },
        ],
      },
    ],
  };
}
