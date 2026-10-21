import type { MetadataRoute } from "next";
import { site } from "@/config/site";

// Écrit au build : l'export statique n'a pas de serveur pour le produire à la demande
export const dynamic = "force-static";

/** Les robots qui collectent des textes pour entraîner des IA, pas pour amener des visiteurs. */
const ROBOTS_D_ENTRAINEMENT = [
  "GPTBot", "ClaudeBot", "anthropic-ai", "CCBot", "Google-Extended", "Applebot-Extended", "Bytespider",
  "meta-externalagent", "PerplexityBot", "Amazonbot", "cohere-ai", "Diffbot",
];

/** Tout est ouvert, y compris aux moteurs de réponse IA (#111, #113), sauf les listes de mots (`/mots/`) aux
 *  robots d'entraînement : elles sont faites pour amener des joueurs depuis la recherche, pas pour être aspirées
 *  (décision de l'auteur du 15/10/2026 ; Cloudflare bloque aussi ces robots sur `/mots/`). Les pages privées ne
 *  sont pas interdites ici : elles portent `noindex`, qu'un robot doit pouvoir lire. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: ROBOTS_D_ENTRAINEMENT, allow: "/", disallow: "/mots/" },
      { userAgent: "*", allow: "/" },
    ],
    sitemap: `${site.url}/sitemap.xml`,
  };
}
