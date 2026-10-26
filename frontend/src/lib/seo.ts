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

/**
 * Une grille à jouer : page publique, dans le sitemap (ADR 0026). Le titre de la page reste « Mots fléchés du 24
 * octobre 2026 » ; celui des résultats de recherche ajoute « gratuits », le mot que l'on tape (57 caractères au plus
 * avec le nom du site, sous la coupe de Google).
 */
export function jouerPage(grille: GrilleJson): Metadata {
  const titre = titreDuJour(grille.date).replace("Mots fléchés du ", "Mots fléchés gratuits du ");
  return publicPage({ path: `/jouer/${grille.date}`, title: titre, description: descriptionGrille(grille) });
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
        // Le jour de parution (la grille paraît à minuit, heure de Paris)
        datePublished: grille.date,
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

/**
 * La description qu'affichent Google et Bing sous le titre : une définition de la grille pour piquer la curiosité
 * (jamais sa réponse, seulement sa longueur), puis ce qui fait jouer. La définition est la première de plus de deux
 * mots, dans l'ordre du JSON : la même à chaque build. 155 caractères au plus (mesuré sur le stock du 26/10/2026),
 * sous la coupe des moteurs.
 */
export function descriptionGrille({ force, clues, response: { grid } }: GrilleJson): string {
  const accroche = Object.entries(clues ?? {}).find(([, definition]) => definition.trim().split(/\s+/).length > 2);
  const question = accroche ? `« ${accroche[1].trim()} », en ${accroche[0].length} lettres ? ` : "";
  const details = [
    `${grid.words.length} définitions malignes`,
    grid.mystery ? "un mot mystère" : "",
    force ? `force ${force} sur 4` : "",
  ].filter(Boolean).join(", ");
  return `${question}${details}. Gratuit, sans inscription, sur écran ou papier.`;
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
