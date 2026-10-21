import { site } from "@/config/site";
import { PUBLISHED } from "@/content/articles";
import { QUESTIONS_ACCUEIL } from "@/content/faq-accueil";
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
    lien("Générer une grille", "/grid", "onze formats, du 6 × 6 au 13 × 18 ; mots obligatoires et souhaités ; PDF de la grille et de sa solution."),
    lien("Créer une grille à la main", "/grids/new", "l'éditeur : la taille de son choix, les cases définitions où l'on veut, et pour chaque emplacement les mots qui gardent les croisements valides (compte gratuit)."),
    lien("Chercher un mot", "/search", "les lettres connues et un ? par case vide : P??LE donne PERLE, POELE, PELLE…"),
    lien("Mots fléchés du jour", "/jouer", "une nouvelle grille chaque jour, à jouer dans le navigateur, force annoncée de 1 à 4."),
    "",
    "## Guide et articles",
    "",
    lien("Comment créer des mots fléchés", "/creer-des-mots-fleches", "le guide pas à pas, de l'idée à la grille, avec ses définitions."),
    ...PUBLISHED.map((article) => lien(article.title, `/articles/${article.slug}`, article.description)),
    "",
    "## Listes de mots",
    "",
    lien("Listes de mots", "/mots", "les mots de 2 à 10 lettres pour les mots fléchés ; de 2 à 8, des listes par première et par dernière lettres."),
    ...PAGES_LONGUEUR.map((page) => lien(page.title, `/mots/${page.slug}`, page.chapo)),
    "",
    "## Questions fréquentes",
    "",
    ...QUESTIONS_ACCUEIL.flatMap(({ question, reponse }) => [`### ${question}`, "", reponse, ""]),
    "## Le site",
    "",
    lien(`Qui fait ${site.name}`, "/a-propos", "un auteur de mots fléchés, en France ; d'où viennent les grilles et les mots."),
    lien("Mentions légales et crédits", "/legal", "l'éditeur, l'hébergement, les sources du lexique et leurs licences."),
    lien("Confidentialité", "/privacy", "la mesure d'usage sans cookie, ce qui est conservé et pour combien de temps."),
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
