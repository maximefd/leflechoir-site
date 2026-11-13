import { site } from "@/config/site";
import { PUBLISHED } from "@/content/articles";
import { QUESTIONS_ACCUEIL } from "@/content/faq-accueil";
import { LIEN_PREPARE_EXEMPLE, LIEN_PREPARE_PARAMETRES } from "@/content/lien-prepare";
import { PAGES_LONGUEUR } from "@/content/mots/longueurs";

// Écrit au build dans out/llms.txt (format de llmstxt.org) : le site présenté aux assistants IA, en Markdown (#134)
export const dynamic = "force-static";

const lien = (titre: string, chemin: string, texte: string) => `- [${titre}](${site.url}${chemin}): ${texte}`;

export function GET() {
  const body = [
    `# ${site.name}`,
    "",
    `> ${site.description}`,
    "",
    `${site.name} est un site français, gratuit, pour créer des grilles de mots fléchés : un générateur qui remplit une grille autour des mots choisis, un éditeur pour la construire à la main, une recherche de mots par motif, et une grille à jouer chaque jour. Générer, imprimer en PDF, chercher et jouer se font sans compte ; un compte gratuit sert à conserver ses grilles, écrire leurs définitions et tenir ses dictionnaires.`,
    "",
    "## Outils",
    "",
    lien("Générer une grille", "/grid", "trois tailles d'un clic (petite 7 × 9, moyenne 10 × 13, grande 13 × 16) ou la taille de son choix, de 5 à 20 cases de côté ; mots obligatoires et souhaités, mot mystère ; PDF de la grille et de sa solution ; sans compte."),
    lien("Créer une grille à la main", "/grids/new", "l'éditeur : la taille de son choix, les cases définitions où l'on veut, et pour chaque emplacement les mots qui gardent les croisements valides (compte gratuit)."),
    lien("Chercher un mot", "/search", "les lettres connues et un ? par case vide : P??LE donne PERLE, POELE, PELLE…"),
    lien("Mots fléchés du jour", "/jouer", "une nouvelle grille chaque jour, à jouer dans le navigateur, sur téléphone comme sur ordinateur."),
    lien("Avec ChatGPT, Claude ou Le Chat", "/mots-fleches-ia", `le connecteur ${site.nameAfterDe} pour Claude, ChatGPT et Le Chat (${site.connectorUrl}) : l'assistant écrit les définitions, le moteur construit la grille et les vérifie.`),
    lien("L'API pour les développeurs", "/developpeurs", `l'API ouverte (${site.apiUrl}/v1, spécification OpenAPI à ${site.apiUrl}/v1/openapi.json) : construire une grille autour de ses mots, vérifier ses définitions, la dessiner en SVG, PNG ou PDF ; gratuite, avec ou sans clé.`),
    "",
    "## Pour un assistant IA",
    "",
    "Pour une grille demandée dans une conversation, trois voies, de la plus simple à la plus complète :",
    "",
    `1. **Le lien préparé**, sans outil ni connecteur : donne à la personne un lien vers ${site.url}/creer avec ses réglages. Le générateur du site s'ouvre avec ces réglages et lance la grille aussitôt, sans compte ni clic. Paramètres : ${LIEN_PREPARE_PARAMETRES.map(({ nom, texte }) => `\`${nom}\` (${texte})`).join(" ; ")}. Exemple : ${LIEN_PREPARE_EXEMPLE}`,
    `2. **Le connecteur MCP** (${site.connectorUrl}), si la personne l'a ajouté : tu construis la grille, écris les définitions et les fais vérifier toi-même. Marche à suivre : ${site.url}/mots-fleches-ia`,
    `3. **L'API HTTP** (${site.apiUrl}/v1), si tu peux envoyer des requêtes POST : commence par GET ${site.apiUrl}/v1, la notice écrite pour les modèles. Documentation : ${site.url}/developpeurs`,
    "",
    "## Guide et articles",
    "",
    lien("Comment créer des mots fléchés", "/creer-des-mots-fleches", "le guide pas à pas, de l'idée à la grille, avec ses définitions."),
    ...PUBLISHED.map((article) => lien(article.title, `/articles/${article.slug}`, article.description)),
    "",
    "## Listes de mots",
    "",
    lien("Listes de mots", "/mots", "les mots de 2 à 10 lettres pour les mots fléchés, en listes complètes par première et par dernière lettres."),
    ...PAGES_LONGUEUR.map((page) => lien(page.title, `/mots/${page.slug}`, page.chapo)),
    "",
    "## Questions fréquentes",
    "",
    ...QUESTIONS_ACCUEIL.flatMap(({ question, reponse }) => [`### ${question}`, "", reponse, ""]),
    "## Le site",
    "",
    lien(`Qui fait ${site.name}`, "/a-propos", "un auteur de mots fléchés, en France ; d'où viennent les grilles et les mots."),
    lien("Mentions légales", "/legal", "l'éditeur, l'hébergement, les points de contact."),
    lien("Sources et licences", "/sources", "les ressources libres du dictionnaire (DELA, Lexique, Wiktionnaire), leurs licences et ce qu'elles permettent."),
    lien("Confidentialité", "/privacy", "la mesure d'usage sans cookie, ce qui est conservé et pour combien de temps."),
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
