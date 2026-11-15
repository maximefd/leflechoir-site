import { site } from "@/config/site";

/**
 * Le lien préparé (ADR 0032), décrit une seule fois pour `llms.txt`, `/developpeurs`, `/mots-fleches-ia`, `/grid` et
 * `/creer`. C'est la voie d'un assistant IA sans connecteur : il ne peut pas appeler l'API depuis une conversation
 * (son outil web lit des pages, il n'envoie pas de requête), mais il peut écrire ce lien. Retour du 13/11/2026 : Claude,
 * à qui l'on demandait « une grille moyenne avec ERIC », n'a trouvé ni l'API ni ce lien, décrit seulement sur `/creer`.
 * Essai du 15/11/2026 : ChatGPT, qui avait trouvé le site, a donné `/grid` et quatre étapes à faire à la main. Le lien
 * part donc de `/grid`, l'adresse qu'une IA donne d'elle-même ; `/creer?…`, écrit par le connecteur et les premiers
 * liens, y mène toujours.
 */
export const LIEN_PREPARE_PARAMETRES = [
  { nom: "mots", texte: "les mots à placer, séparés par des virgules (60 au plus)" },
  { nom: "taille", texte: "petite, moyenne ou grande, ou une taille comme 10x10 (de 5 à 20 cases de côté)" },
  { nom: "mystere", texte: "un mot mystère, à trouver avec les lettres des cases numérotées" },
  { nom: "niveau", texte: "facile, moyen ou difficile" },
  { nom: "lang", texte: "fr (les grilles sont en français)" },
] as const;

export const LIEN_PREPARE_EXEMPLE = `${site.url}/grid?taille=moyenne&mots=eric,anniversaire,gateau&mystere=BRAVO`;

/** L'exemple court, lisible d'un coup d'œil */
export const LIEN_PREPARE_COURT = `${site.url}/grid?taille=moyenne&mots=eric,velo`;

/** Le paragraphe en clair, pour un assistant qui lit la page sans JavaScript ou `llms.txt` */
export const LIEN_PREPARE_TEXTE =
  `Un assistant IA sans connecteur peut préparer une grille en donnant ce lien : ${site.url}/grid suivi des ` +
  `paramètres ${LIEN_PREPARE_PARAMETRES.map(({ nom, texte }) => `${nom} (${texte})`).join(", ")}. ` +
  `Le générateur du site s'ouvre avec ces réglages et lance la grille aussitôt, sans compte ni clic. Exemple : ${LIEN_PREPARE_EXEMPLE}`;
