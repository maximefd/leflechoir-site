import type { Metadata } from "next";
import { site } from "@/config/site";
import type { Article } from "@/content/articles/types";
import type { GrilleJson } from "@/content/grilles/types";
import { cheminCombinaison, combinaisonsDe, indexable } from "@/content/mots/combinaisons";
import type { QuestionFaq } from "@/content/mots/faq-longueur";
import { PAGES_LONGUEUR } from "@/content/mots/longueurs";

/**
 * Référencement (#113). Deux sortes de pages :
 * - publiques : indexées, dans le sitemap, avec une adresse canonique et un aperçu de partage ;
 * - privées (compte, grilles, dictionnaires, liens reçus par e-mail) : `noindex`. Jamais de `Disallow` sur
 *   elles dans robots.txt : un robot qui ne peut pas lire la page ne voit pas son `noindex`.
 */

/** Pages publiques à adresse fixe */
const FIXED_PATHS = [
  "/",
  "/search",
  "/grid",
  "/creer-des-mots-fleches",
  "/jouer",
  "/articles",
  "/mots",
  "/a-propos",
  "/contact",
  "/legal",
  "/privacy",
  "/terms",
] as const;

/** Une page de mots : `/mots/<slug>` (liste ou outil), `/mots/<slug>/<combinaison>` (content/mots/combinaisons.ts) */
export type MotsPath = `/mots/${string}`;
export type PublicPath = (typeof FIXED_PATHS)[number] | MotsPath;

/**
 * Pages publiques, dans l'ordre du sitemap : les pages de mots suivent leur page d'index, les outils par longueur
 * (chacun suivi de ses pages « commençant par » et « finissant par »)
 */
export const PUBLIC_PATHS: readonly PublicPath[] = FIXED_PATHS.flatMap((path): PublicPath[] =>
  path === "/mots"
    ? [
        path,
        ...PAGES_LONGUEUR.flatMap((page): MotsPath[] => [
          `/mots/${page.slug}`,
          ...(page.combinaisons ? combinaisonsDe(page.slug).filter(indexable).map((combinaison): MotsPath => cheminCombinaison(page.slug, combinaison)) : []),
        ]),
      ]
    : [path],
);

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
/** Une grille à jouer (`/jouer/<date>`) : publique, dans le sitemap */
export type GrillePath = `/jouer/${string}`;

export function publicPage({ path, title, description }: {
  path: PublicPath | ArticlePath | GrillePath;
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

/** Fil d'Ariane en données structurées : l'accueil, puis chaque étape (adresse relative, sans barre finale). */
export function breadcrumbJsonLd(trail: readonly { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: site.url },
      ...trail.map(({ name, path }, index) => ({
        "@type": "ListItem",
        position: index + 2,
        name,
        item: `${site.url}${path}`,
      })),
    ],
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

// --- Les grilles à jouer (ADR 0026) ---

/** « Mots fléchés du 7 octobre 2026 » : le titre d'une grille publiée, partout le même. */
export function titreDuJour(date: string): string {
  const enLettres = new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
  // Le premier du mois s'écrit « 1er » : « Mots fléchés du 1er novembre 2026 »
  return `Mots fléchés du ${enLettres.replace(/^1 /, "1er ")}`;
}

/** Une grille à jouer : page publique, dans le sitemap (ADR 0026). */
export function jouerPage(grille: GrilleJson): Metadata {
  return publicPage({ path: `/jouer/${grille.date}`, title: titreDuJour(grille.date), description: descriptionGrille(grille) });
}

/** Données structurées d'une grille à jouer : le jeu lui-même et son fil d'Ariane. */
export function jouerJsonLd(grille: GrilleJson) {
  const url = `${site.url}/jouer/${grille.date}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Game",
        name: titreDuJour(grille.date),
        description: descriptionGrille(grille),
        inLanguage: site.lang,
        url,
        mainEntityOfPage: url,
        image: `${site.url}${OG_IMAGE.url}`,
        isAccessibleForFree: true,
        // Comme les articles : l'auteur ne publie pas son identité (docs/RGPD.md)
        author: { "@type": "Organization", name: site.name, url: site.url },
        publisher: { "@type": "Organization", name: site.name, url: site.url },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Accueil", item: site.url },
          { "@type": "ListItem", position: 2, name: "La grille du jour", item: `${site.url}/jouer` },
          { "@type": "ListItem", position: 3, name: titreDuJour(grille.date), item: url },
        ],
      },
    ],
  };
}

function descriptionGrille({ force, response: { grid } }: GrilleJson): string {
  const forceAnnoncee = force ? `, force ${force} sur 4` : "";
  return `Une grille de ${grid.width} × ${grid.height} cases${forceAnnoncee}, à jouer en ligne ou à imprimer, gratuitement. Une nouvelle grille chaque jour.`;
}

/**
 * Des questions et leurs réponses en données structurées `FAQPage` (schema.org) : les moteurs de réponse IA
 * reprennent volontiers une réponse courte qui tient seule. La réponse structurée est le texte seul, sans ses liens.
 */
export function faqPageJsonLd(questions: QuestionFaq[]) {
  return {
    "@type": "FAQPage",
    mainEntity: questions.map(({ question, reponse }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: reponse },
    })),
  };
}
