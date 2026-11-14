import generated from "@/content/articles/grilles/pourquoi-les-ia-ratent-leurs-mots-fleches.json";
import texte from "@/content/articles/textes/pourquoi-les-ia-ratent-leurs-mots-fleches.json";
import { articleAvecTexte } from "@/content/articles/avec-texte";
import { specFromGeneration } from "@/lib/mini-grid";

/**
 * Publié le 14/11/2026 ; titre et nom des modèles validés par l'auteur. Tous les chiffres viennent de l'essai du
 * 14/11/2026 : les réponses brutes des assistants, leur mesure par `python -m tools.articles mesurer` et le tableau
 * daté sont dans `data/essais-ia/2026-11/` (privé). Le texte se reprend dans la page, au téléphone (ADR 0027).
 */
export const article = articleAvecTexte("pourquoi-les-ia-ratent-leurs-mots-fleches", texte, {
  published: "2026-11-14",
  draft: false,
  related: ["generer", "guide", "mystere"],
  // Les grilles telles que les assistants les ont rendues (data/essais-ia/2026-11/chatgpt.txt et claude.txt) ; les
  // mots faux sont ceux que la mesure n'a trouvés dans aucun lexique
  illustrations: [
    {
      after: "ce-qu-elles-ont-rendu",
      titre: "La grille de Claude : juste, mais creuse",
      legende:
        "Six vrais mots et neuf croisements justes. Mais 16 cases noires sur 22 ne peuvent porter aucune définition : "
        + "c’est une grille de mots croisés aérée, pas une grille de mots fléchés.",
      rows: ["#######", "#STADES", "#A#M#T#", "#LAITON", "#A#R#I#", "#DIABLE", "#E#L#E#"],
      casesInutiles: true,
    },
    {
      after: "pourquoi-elles-ratent",
      titre: "La grille de ChatGPT : les lignes sont justes, les colonnes non",
      legende:
        "CAPTE, ILE, CHAT, TIGRE et MER se lisent bien de gauche à droite. De haut en bas, on lit AIHIM, TETRR et CT. "
        + "Les deux dernières lignes sont restées vides.",
      rows: ["#CAPTE#", "##ILE##", "#CHAT##", "#TIGRE#", "##MER##", "#######", "#######"],
      pasDesMots: ["AIHIM", "TETRR", "CT"],
      casesInutiles: true,
    },
  ],
  grid: {
    title: "Remplie par le moteur, définie par une IA",
    // Générée par l'API ouverte (6 × 6, niveau facile, ROBOT imposé, seed 3) : voir
    // grilles/pourquoi-les-ia-ratent-leurs-mots-fleches.json. Les définitions ont été écrites par une IA (Claude),
    // puis acceptées par POST /v1/clues/check sans erreur ni alerte de style.
    spec: specFromGeneration(generated, {
      LIRE: "Ce que tu fais",
      DEMON: "Mauvais génie",
      GLUTEN: "Suit souvent sans",
      DIRE: "Ne pas taire",
      ROBOT: "Fait le portrait",
      ROMPU: "Épuisé ou cassé",
      PUCE: "Saute ou calcule",
      DEBOUT: "Pas couché",
      ONCE: "Petite dose",
      MOT: "Fléché ici",
      EN: "Dans",
    }),
  },
});
