import generated from "@/content/articles/grilles/pourquoi-les-mots-fleches-reviennent.json";
import texte from "@/content/articles/textes/pourquoi-les-mots-fleches-reviennent.json";
import { articleAvecTexte } from "@/content/articles/avec-texte";
import { specFromGeneration } from "@/lib/mini-grid";

/**
 * Brouillon rédigé pour l'auteur, à relire. À vérifier avant publication : la mention de la radio ICI
 * (relevé du 02/10/2026) et la date de Wordle (lancé en octobre 2021, racheté par le
 * New York Times en janvier 2022). Le texte se reprend dans la page, au téléphone (ADR 0027).
 */
export const article = articleAvecTexte("pourquoi-les-mots-fleches-reviennent", texte, {
  published: "2026-10-06",
  draft: true,
  related: ["mystere", "generer", "guide"],
  grid: {
    title: "Une grille pour la pause",
    // Générée par le site (7 × 7, RETOUR imposé, seed 1) : voir grilles/pourquoi-les-mots-fleches-reviennent.json
    spec: specFromGeneration(generated, {
      CAFE: "Se prend serré",
      JEU: "Il a ses règles",
      TEL: "Ainsi fait",
      PAREFEU: "Garde la forêt et l’ordi",
      REMEDE: "Pire que le mal, parfois",
      FIER: "Comme un paon",
      USINER: "Bosser dur",
      FEUILS: "Fines pellicules",
      NEM: "Se roule à table",
      ECRAN: "On le fuit avec une grille",
      CET: "Ce, devant une voyelle",
      ALU: "Papier qui brille",
      MODE: "Revient toujours",
      OR: "Vaut mieux que l’argent",
      LE: "Article très défini",
      RETOUR: "En grâce, ces temps-ci",
    }),
  },
});
