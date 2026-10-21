import generated from "@/content/articles/grilles/mots-fleches-dans-le-monde.json";
import texte from "@/content/articles/textes/mots-fleches-dans-le-monde.json";
import { articleAvecTexte } from "@/content/articles/avec-texte";
import { specFromGeneration } from "@/lib/mini-grid";

/**
 * Relu et publié par l'auteur le 07/10/2026. Faits relus avant publication : la grille d'Arthur Wynne
 * (New York World, 21 décembre 1913), les noms étrangers du jeu (Schwedenrätsel, Zweedse puzzel, autodefinido,
 * arrowword), La Settimana Enigmistica (1932), les grilles de Georges Perec pour un hebdomadaire.
 * Le texte se reprend dans la page, au téléphone (ADR 0027).
 */
export const article = articleAvecTexte("mots-fleches-dans-le-monde", texte, {
  published: "2026-10-07",
  draft: false,
  related: ["guide", "recherche", "generer"],
  grid: {
    title: "Une grille qui voyage un peu",
    // Générée par le site (7 × 7, LANGUE imposé, seed 8) : voir grilles/mots-fleches-dans-le-monde.json
    spec: specFromGeneration(generated, {
      HOLA: "Salut ibérique",
      LENTO: "Pas pressé, en musique",
      CRU: "Sans cuisson ni détour",
      GO: "Se joue sur un goban",
      EARL: "Ferme en société",
      AGENTS: "Secrets ou de la circulation",
      LEGERE: "Comme une plume",
      LANGUE: "Se donne au chat",
      ARMEE: "Prête à tirer",
      CARTE: "Du monde ou du restaurant",
      MONDE: "On en fait le tour",
      DIT: "Autrement appelé",
      VIE: "Se gagne en travaillant",
      ID: "Le ça, chez Freud",
      TIR: "Au but ou à l’arc",
      DEISTE: "Croit sans Église",
    }),
  },
});
