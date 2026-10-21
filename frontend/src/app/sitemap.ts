import type { MetadataRoute } from "next";
import { site } from "@/config/site";
import { PUBLISHED } from "@/content/articles";
import { GRILLES, aujourdhui, grilleDuJour } from "@/content/grilles";
import { CATALOGUE, entreeCatalogue } from "@/content/mots/catalogue";
import { PUBLIC_PATHS } from "@/lib/seo";

export const dynamic = "force-static";

/** Les outils, le guide et les articles : ce qu'on veut voir remonter dans les moteurs */
const MAIN_PATHS: readonly string[] = ["/search", "/grid", "/creer-des-mots-fleches", "/articles"];

/**
 * La date de génération des listes de mots (`make listes` ; elle ne change que quand la liste change) : celle de la
 * liste de la page, ou la plus récente pour l'index `/mots`. Les outils sans liste (4, 7 à 10 lettres) n'en ont pas.
 */
function generationDesListes(path: string): string | undefined {
  if (path === "/mots") return CATALOGUE.map((entree) => entree.genere).sort().at(-1);
  const liste = path.match(/^\/mots\/([a-z]+-lettres)(?:\/|$)/)?.[1];
  return liste ? entreeCatalogue(liste)?.genere : undefined;
}

/** Les pages publiques et les articles publiés (lib/seo.ts) ; les privées et les brouillons sont en `noindex`. */
export default function sitemap(): MetadataRoute.Sitemap {
  const latest = PUBLISHED.map((article) => article.updated ?? article.published).sort().at(-1);
  const duJour = grilleDuJour(aujourdhui())?.date;
  const pages: MetadataRoute.Sitemap = PUBLIC_PATHS.map((path) => ({
    // Comme la canonique de l'accueil : l'adresse du site, sans barre finale
    url: path === "/" ? site.url : `${site.url}${path}`,
    ...(path === "/articles" && latest ? { lastModified: latest } : {}),
    ...(path === "/jouer" && duJour ? { lastModified: duJour } : {}),
    ...(generationDesListes(path) ? { lastModified: generationDesListes(path) } : {}),
    changeFrequency: path === "/articles" ? "weekly" : path === "/jouer" ? "daily" : "monthly",
    priority:
      path === "/" ? 1
      : path === "/jouer" ? 0.9
      : MAIN_PATHS.includes(path) ? 0.8
      : path.startsWith("/mots") ? 0.6
      : path === "/contact" ? 0.5
      : 0.3,
  }));
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
