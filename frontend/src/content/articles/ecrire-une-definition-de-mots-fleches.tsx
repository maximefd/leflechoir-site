import generated from "@/content/articles/grilles/ecrire-une-definition-de-mots-fleches.json";
import texte from "@/content/articles/textes/ecrire-une-definition-de-mots-fleches.json";
import { articleAvecTexte } from "@/content/articles/avec-texte";
import { specFromGeneration } from "@/lib/mini-grid";

/**
 * Brouillon rédigé pour l'auteur, à relire : le ton, les exemples et la méthode doivent devenir les siens.
 * Le texte se reprend dans la page, au téléphone (ADR 0027) ; ici restent les dates, le brouillon, les liens
 * du bas, la grille et ses définitions.
 */
export const article = articleAvecTexte("ecrire-une-definition-de-mots-fleches", texte, {
  published: "2026-10-06",
  draft: true,
  related: ["guide", "recherche", "generer"],
  grid: {
    title: "Une grille de 8 sur 8, vingt-deux définitions",
    // Générée par le site (8 × 8, INDICE imposé, seed 4) : voir grilles/ecrire-une-definition-de-mots-fleches.json
    spec: specFromGeneration(generated, {
      GEAI: "Bavard des bois",
      OPE: "Opération écourtée",
      TSARISME: "Régime de l’Est",
      DESSERTS: "Finissent bien",
      SE: "Réfléchi avant le verbe",
      PISTE: "Se suit ou se brouille",
      TRAC: "Saisit avant d’entrer",
      AGE: "Ne se demande pas",
      GRILLE: "Au crayon ou au charbon",
      ARS: "Village du curé",
      AIR: "Se donne ou se chante",
      ARAS: "Plumes en couleurs",
      ADN: "Signature intime",
      INDICE: "Coup de pouce",
      NIE: "Refuse l’évidence",
      SALINS: "Font le sel de la côte",
      AIL: "Chasse les vampires",
      ILE: "De Ré ou de Beauté",
      MOT: "Se croise ici",
      ON: "Tous et personne",
      CLE: "Solution, à la fin",
      SENS: "Double, s’il est bon",
    }),
  },
});
