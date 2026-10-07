import type { MetadataRoute } from "next";
import { site } from "@/config/site";
import { PUBLISHED } from "@/content/articles";
import { PUBLIC_PATHS } from "@/lib/seo";

export const dynamic = "force-static";

/** Les outils, le guide et les articles : ce qu'on veut voir remonter dans les moteurs */
const MAIN_PATHS: readonly string[] = ["/search", "/grid", "/creer-des-mots-fleches", "/articles"];

/** Les pages publiques et les articles publiés (lib/seo.ts) ; les privées et les brouillons sont en `noindex`. */
export default function sitemap(): MetadataRoute.Sitemap {
  const latest = PUBLISHED.map((article) => article.updated ?? article.published).sort().at(-1);
  const pages: MetadataRoute.Sitemap = PUBLIC_PATHS.map((path) => ({
    // Comme la canonique de l'accueil : l'adresse du site, sans barre finale
    url: path === "/" ? site.url : `${site.url}${path}`,
    ...(path === "/articles" && latest ? { lastModified: latest } : {}),
    changeFrequency: path === "/articles" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : MAIN_PATHS.includes(path) ? 0.8 : path === "/contact" ? 0.5 : 0.3,
  }));
  const articles: MetadataRoute.Sitemap = PUBLISHED.map((article) => ({
    url: `${site.url}/articles/${article.slug}`,
    lastModified: article.updated ?? article.published,
    changeFrequency: "monthly",
    priority: 0.7,
  }));
  return [...pages, ...articles];
}
