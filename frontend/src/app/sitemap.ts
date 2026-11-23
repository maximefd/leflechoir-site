import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { MetadataRoute } from "next";
import { site } from "@/config/site";
import { PUBLISHED } from "@/content/articles";
import { GRILLES, aujourdhui, grilleDuJour } from "@/content/grilles";
import { CATALOGUE, entreeCatalogue } from "@/content/mots/catalogue";
import { estPageMots, PUBLIC_PATHS } from "@/lib/seo";

export const dynamic = "force-static";

/** Les outils, le guide et les articles : ce qu'on veut voir remonter dans les moteurs */
const MAIN_PATHS: readonly string[] = ["/search", "/grid", "/creer-des-mots-fleches", "/articles", "/mots-fleches-ia"];

/**
 * La date de génération des listes de mots (`make listes` ; elle ne change que quand la liste change) : celle de la
 * liste de la page, ou la plus récente pour l'index `/mots`. Un outil sans liste n'en aurait pas (toutes les longueurs de 2 à 10 en ont une depuis le 25/10/2026).
 */
function generationDesListes(path: string): string | undefined {
  if (path === "/mots") return CATALOGUE.map((entree) => entree.genere).sort().at(-1);
  const liste = path.match(/^\/mots\/([a-z]+-lettres)(?:\/|$)/)?.[1];
  return liste ? entreeCatalogue(liste)?.genere : undefined;
}

/**
 * La date du dernier commit qui a touché chaque page fixe (`scripts/dates-des-pages.mjs`, lancé avant `next dev` et
 * `next build`). Lue à la construction du sitemap, jamais dans le navigateur (export statique).
 */
function datesDesPages(): Record<string, string> {
  const fichier = join(process.cwd(), "src/content/dates-des-pages.json");
  return existsSync(fichier) ? (JSON.parse(readFileSync(fichier, "utf-8")) as Record<string, string>) : {};
}

/** La plus récente des dates connues (ISO 8601 : avec ou sans heure, elles se comparent en temps réel) */
function plusRecente(...dates: (string | undefined)[]): string | undefined {
  return dates.filter((date): date is string => Boolean(date)).sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1);
}

/**
 * Les pages publiques et les articles publiés (lib/seo.ts), chacun daté (`<lastmod>`) ; les privées, les brouillons et
 * les pages de mots (MOTS_INDEXES) sont en `noindex` et n'y sont pas.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const latest = PUBLISHED.map((article) => article.updated ?? article.published).sort().at(-1);
  const duJour = grilleDuJour(aujourdhui())?.date;
  const dates = datesDesPages();
  const pages: MetadataRoute.Sitemap = PUBLIC_PATHS.map((path) => {
    // La page elle-même, et ce qu'elle montre : le dernier article, la grille du jour, la liste de mots
    const lastModified = plusRecente(
      dates[path],
      path === "/articles" ? latest : undefined,
      path === "/jouer" ? duJour : undefined,
      generationDesListes(path),
    );
    return {
      // Comme la canonique de l'accueil : l'adresse du site, sans barre finale
      url: path === "/" ? site.url : `${site.url}${path}`,
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: path === "/articles" ? "weekly" : path === "/jouer" ? "daily" : "monthly",
      priority:
        path === "/" ? 1
        : path === "/jouer" ? 0.9
        : MAIN_PATHS.includes(path) ? 0.8
        : estPageMots(path) ? 0.6
        : path === "/contact" ? 0.5
        : 0.3,
    };
  });
  const articles: MetadataRoute.Sitemap = PUBLISHED.map((article) => ({
    url: `${site.url}/articles/${article.slug}`,
    lastModified: article.updated ?? article.published,
    changeFrequency: "monthly",
    priority: 0.7,
  }));
  // Les grilles à jouer (ADR 0026) : une page par jour, qui ne change plus une fois parue. Seulement celles déjà
  // parues au build : une grille à venir n'est pas donnée aux moteurs avant son jour (page-grille.tsx)
  const jour = aujourdhui();
  const grilles: MetadataRoute.Sitemap = GRILLES.filter((grille) => grille.date <= jour).map((grille) => ({
    url: `${site.url}/jouer/${grille.date}`,
    lastModified: grille.date,
    priority: 0.6,
  }));
  return [...pages, ...articles, ...grilles];
}
