import type { Clue } from "@/components/grid/grid-svg";

/**
 * Les étapes de la grille du guide, du croisement de départ à la grille définie.
 *
 * `rows` : « # » case définition, une lettre, « . » case encore vide, « - » hors de la grille (avant qu'on
 * trace le rectangle). Les flèches ont été calculées par `engine/arrows.py` à partir de ces lignes, pour
 * les seuls mots complets. La grille finale suit exactement le layout 7x9-001 du catalogue, et tous ses
 * mots sont des mots courants du lexique.
 */
export type GuideStep = {
  caption: string;
  rows: string[];
  lit: string[];
  clues: Clue[];
  definitions: Record<string, string>;
};

export const GUIDE_STEPS: GuideStep[] = [
  {
    caption: "CONTREBAS et BLASON, croisés sur le B, avec leurs cases définitions.",
    rows: ["#C-----", "-O-----", "-N-----", "-T-----", "-R-----", "-E-----", "#BLASON", "-A-----", "-S-----"],
    lit: ["1-6"],
    clues: [
      { text: "BLASON", x: 1, y: 6, direction: "across", length: 6, cell_x: 0, cell_y: 6, arrow: "droite", exit: "right" },
      { text: "CONTREBAS", x: 1, y: 0, direction: "down", length: 9, cell_x: 0, cell_y: 0, arrow: "coudee_droite_bas", exit: "right" },
    ],
    definitions: {},
  },
  {
    caption: "Le cadre de 7 sur 9, et les cases définitions de la première ligne et de la première colonne.",
    rows: ["#C#.#.#", ".O.....", "#N.....", ".T.....", "#R.....", ".E.....", "#BLASON", ".A.....", "#S....."],
    lit: [],
    clues: [
      { text: "BLASON", x: 1, y: 6, direction: "across", length: 6, cell_x: 0, cell_y: 6, arrow: "droite", exit: "right" },
      { text: "CONTREBAS", x: 1, y: 0, direction: "down", length: 9, cell_x: 0, cell_y: 0, arrow: "coudee_droite_bas", exit: "right" },
    ],
    definitions: {},
  },
  {
    caption: "L’impasse : après MORCEAU, la dernière colonne devrait s’écrire U????N??, et aucun mot courant ne s’y prête.",
    rows: ["#C#.#.#", "MORCEAU", "#N.....", ".T.....", "#R.....", ".E.....", "#BLASON", ".A.....", "#S....."],
    lit: ["6-1", "6-2", "6-3", "6-4", "6-5", "6-6", "6-7", "6-8"],
    clues: [
      { text: "MORCEAU", x: 0, y: 1, direction: "across", length: 7, cell_x: 0, cell_y: 0, arrow: "coudee_bas_droite", exit: "bottom" },
      { text: "BLASON", x: 1, y: 6, direction: "across", length: 6, cell_x: 0, cell_y: 6, arrow: "droite", exit: "right" },
      { text: "CONTREBAS", x: 1, y: 0, direction: "down", length: 9, cell_x: 0, cell_y: 0, arrow: "coudee_droite_bas", exit: "right" },
    ],
    definitions: {},
  },
  {
    caption: "MORCEAU gommé : SONORES, puis SOUTENUE dans la dernière colonne.",
    rows: ["#C#.#.#", "SONORES", "#N....O", ".T....U", "#R....T", ".E....E", "#BLASON", ".A....U", "#S....E"],
    lit: [],
    clues: [
      { text: "SONORES", x: 0, y: 1, direction: "across", length: 7, cell_x: 0, cell_y: 0, arrow: "coudee_bas_droite", exit: "bottom" },
      { text: "BLASON", x: 1, y: 6, direction: "across", length: 6, cell_x: 0, cell_y: 6, arrow: "droite", exit: "right" },
      { text: "CONTREBAS", x: 1, y: 0, direction: "down", length: 9, cell_x: 0, cell_y: 0, arrow: "coudee_droite_bas", exit: "right" },
      { text: "SOUTENUE", x: 6, y: 1, direction: "down", length: 8, cell_x: 6, cell_y: 0, arrow: "bas", exit: "bottom" },
    ],
    definitions: {},
  },
  {
    caption: "La grille remplie : vingt mots, douze cases définitions, aucune collée à une autre.",
    rows: ["#C#N#M#", "SONORES", "#NUMERO", "OTE#PEU", "#REEL#T", "LE#MINE", "#BLASON", "PAON#EU", "#SIECLE"],
    lit: [],
    clues: [
      { text: "SONORES", x: 0, y: 1, direction: "across", length: 7, cell_x: 0, cell_y: 0, arrow: "coudee_bas_droite", exit: "bottom" },
      { text: "NUMERO", x: 1, y: 2, direction: "across", length: 6, cell_x: 0, cell_y: 2, arrow: "droite", exit: "right" },
      { text: "OTE", x: 0, y: 3, direction: "across", length: 3, cell_x: 0, cell_y: 2, arrow: "coudee_bas_droite", exit: "bottom" },
      { text: "PEU", x: 4, y: 3, direction: "across", length: 3, cell_x: 3, cell_y: 3, arrow: "droite", exit: "right" },
      { text: "REEL", x: 1, y: 4, direction: "across", length: 4, cell_x: 0, cell_y: 4, arrow: "droite", exit: "right" },
      { text: "LE", x: 0, y: 5, direction: "across", length: 2, cell_x: 0, cell_y: 4, arrow: "coudee_bas_droite", exit: "bottom" },
      { text: "MINE", x: 3, y: 5, direction: "across", length: 4, cell_x: 2, cell_y: 5, arrow: "droite", exit: "right" },
      { text: "BLASON", x: 1, y: 6, direction: "across", length: 6, cell_x: 0, cell_y: 6, arrow: "droite", exit: "right" },
      { text: "PAON", x: 0, y: 7, direction: "across", length: 4, cell_x: 0, cell_y: 6, arrow: "coudee_bas_droite", exit: "bottom" },
      { text: "EU", x: 5, y: 7, direction: "across", length: 2, cell_x: 4, cell_y: 7, arrow: "droite", exit: "right" },
      { text: "SIECLE", x: 1, y: 8, direction: "across", length: 6, cell_x: 0, cell_y: 8, arrow: "droite", exit: "right" },
      { text: "CONTREBAS", x: 1, y: 0, direction: "down", length: 9, cell_x: 0, cell_y: 0, arrow: "coudee_droite_bas", exit: "right" },
      { text: "NUEE", x: 2, y: 1, direction: "down", length: 4, cell_x: 2, cell_y: 0, arrow: "bas", exit: "bottom" },
      { text: "LOI", x: 2, y: 6, direction: "down", length: 3, cell_x: 2, cell_y: 5, arrow: "bas", exit: "bottom" },
      { text: "NOM", x: 3, y: 0, direction: "down", length: 3, cell_x: 2, cell_y: 0, arrow: "coudee_droite_bas", exit: "right" },
      { text: "EMANE", x: 3, y: 4, direction: "down", length: 5, cell_x: 3, cell_y: 3, arrow: "bas", exit: "bottom" },
      { text: "REPLIS", x: 4, y: 1, direction: "down", length: 6, cell_x: 4, cell_y: 0, arrow: "bas", exit: "bottom" },
      { text: "MERE", x: 5, y: 0, direction: "down", length: 4, cell_x: 4, cell_y: 0, arrow: "coudee_droite_bas", exit: "right" },
      { text: "NOEL", x: 5, y: 5, direction: "down", length: 4, cell_x: 5, cell_y: 4, arrow: "bas", exit: "bottom" },
      { text: "SOUTENUE", x: 6, y: 1, direction: "down", length: 8, cell_x: 6, cell_y: 0, arrow: "bas", exit: "bottom" },
    ],
    definitions: {},
  },
  {
    caption: "La grille prête à jouer, avec ses vingt définitions.",
    rows: ["#C#N#M#", "SONORES", "#NUMERO", "OTE#PEU", "#REEL#T", "LE#MINE", "#BLASON", "PAON#EU", "#SIECLE"],
    lit: [],
    clues: [
      { text: "SONORES", x: 0, y: 1, direction: "across", length: 7, cell_x: 0, cell_y: 0, arrow: "coudee_bas_droite", exit: "bottom" },
      { text: "NUMERO", x: 1, y: 2, direction: "across", length: 6, cell_x: 0, cell_y: 2, arrow: "droite", exit: "right" },
      { text: "OTE", x: 0, y: 3, direction: "across", length: 3, cell_x: 0, cell_y: 2, arrow: "coudee_bas_droite", exit: "bottom" },
      { text: "PEU", x: 4, y: 3, direction: "across", length: 3, cell_x: 3, cell_y: 3, arrow: "droite", exit: "right" },
      { text: "REEL", x: 1, y: 4, direction: "across", length: 4, cell_x: 0, cell_y: 4, arrow: "droite", exit: "right" },
      { text: "LE", x: 0, y: 5, direction: "across", length: 2, cell_x: 0, cell_y: 4, arrow: "coudee_bas_droite", exit: "bottom" },
      { text: "MINE", x: 3, y: 5, direction: "across", length: 4, cell_x: 2, cell_y: 5, arrow: "droite", exit: "right" },
      { text: "BLASON", x: 1, y: 6, direction: "across", length: 6, cell_x: 0, cell_y: 6, arrow: "droite", exit: "right" },
      { text: "PAON", x: 0, y: 7, direction: "across", length: 4, cell_x: 0, cell_y: 6, arrow: "coudee_bas_droite", exit: "bottom" },
      { text: "EU", x: 5, y: 7, direction: "across", length: 2, cell_x: 4, cell_y: 7, arrow: "droite", exit: "right" },
      { text: "SIECLE", x: 1, y: 8, direction: "across", length: 6, cell_x: 0, cell_y: 8, arrow: "droite", exit: "right" },
      { text: "CONTREBAS", x: 1, y: 0, direction: "down", length: 9, cell_x: 0, cell_y: 0, arrow: "coudee_droite_bas", exit: "right" },
      { text: "NUEE", x: 2, y: 1, direction: "down", length: 4, cell_x: 2, cell_y: 0, arrow: "bas", exit: "bottom" },
      { text: "LOI", x: 2, y: 6, direction: "down", length: 3, cell_x: 2, cell_y: 5, arrow: "bas", exit: "bottom" },
      { text: "NOM", x: 3, y: 0, direction: "down", length: 3, cell_x: 2, cell_y: 0, arrow: "coudee_droite_bas", exit: "right" },
      { text: "EMANE", x: 3, y: 4, direction: "down", length: 5, cell_x: 3, cell_y: 3, arrow: "bas", exit: "bottom" },
      { text: "REPLIS", x: 4, y: 1, direction: "down", length: 6, cell_x: 4, cell_y: 0, arrow: "bas", exit: "bottom" },
      { text: "MERE", x: 5, y: 0, direction: "down", length: 4, cell_x: 4, cell_y: 0, arrow: "coudee_droite_bas", exit: "right" },
      { text: "NOEL", x: 5, y: 5, direction: "down", length: 4, cell_x: 5, cell_y: 4, arrow: "bas", exit: "bottom" },
      { text: "SOUTENUE", x: 6, y: 1, direction: "down", length: 8, cell_x: 6, cell_y: 0, arrow: "bas", exit: "bottom" },
    ],
    definitions: {
      "0-1-across": "Bien audibles",
      "1-2-across": "Sacré personnage",
      "0-3-across": "Retiré",
      "4-3-across": "Pas beaucoup",
      "1-4-across": "Il dépasse parfois la fiction",
      "0-5-across": "Article défini",
      "3-5-across": "S'use au bout du crayon",
      "1-6-across": "Redoré quand on se rattrape",
      "0-7-across": "Fait la roue",
      "5-7-across": "Participe d'avoir",
      "1-8-across": "Grand, sous Louis XIV",
      "1-0-down": "Contrebasse écourtée",
      "2-1-down": "Nuage de sauterelles",
      "2-6-down": "Dure, mais c'est elle",
      "3-0-down": "Commun ou propre",
      "3-4-down": "Se dégage",
      "4-1-down": "Retraites stratégiques",
      "5-0-down": "Fêtée au printemps",
      "5-5-down": "Père de décembre",
      "6-1-down": "Comme une langue de salon",
    },
  },
];
