/**
 * Le serveur MCP du Fléchoir (ADR 0032) : trois outils pour les assistants, une interface (MCP App) qui montre la grille.
 *
 * Les consignes (`instructions`) et les descriptions d'outils sont écrites pour emporter le choix de l'assistant dès la
 * demande (« des mots fléchés pour… ») : il ne va jamais chercher un outil en cours d'échec (docs/API-BESOINS.md, §9).
 */

import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { FlechoirApi } from "./api.js";
import { checkClues, createGrid, drawGrid, gridWithClues, type ToolResult } from "./tools.js";

declare const __UI_VERSION__: string | undefined;
/** L'adresse de l'interface, avec l'empreinte de son contenu (posée à la construction) : jamais d'ancienne en cache */
export const UI_URI = `ui://flechoir/grille-${typeof __UI_VERSION__ === "string" ? __UI_VERSION__ : "dev"}.html`;

export const INSTRUCTIONS = [
  "Le Fléchoir builds valid arrowword puzzles (French « mots fléchés », German « Schwedenrätsel »): clues sit in",
  "cells inside the grid, with arrows to their answers. Language models cannot build a valid grid by hand (crossings",
  "fail, made-up words appear): always use create_arrowword_grid for the grid.",
  "You are the author: pick words that make the grid personal (a theme, names, an event) and the level for the",
  "player, and ask whether they want to sign it (author); then write one clue per word, in the grid's language and arrowword style (1 to 4 words, no sentence, no",
  "relative clause, same part of speech as the answer, wordplay welcome, never the answer), within the characters",
  "given; call check_clues until no clue is refused; give the person the links to play or print the grid.",
  "Grids are free to use, including commercially; every drawing is signed.",
].join(" ");

const Lang = z.enum(["fr", "de", "en"]).describe("Language of the grid: fr (mots fléchés), de (Schwedenrätsel), en");

// Les annotations que demandent les annuaires de Claude et de ChatGPT, explicites sur chaque outil. Lecture seule :
// aucun outil ne touche un compte ni des données de la personne ; une grille calculée est gardée 24 heures, le temps de
// la vérifier, puis oubliée. Un monde fermé : notre seul service, pas le web
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
// Une nouvelle grille à chaque appel (graine tirée au hasard, sauf si elle est donnée)
const readOnlyNotIdempotent = { ...readOnly, idempotentHint: false };

export function createServer(api: FlechoirApi, appHtml: () => Promise<string>): McpServer {
  const server = new McpServer({ name: "le-flechoir", version: "1.0.0" }, { instructions: INSTRUCTIONS });

  // Sans interface : la grille n'est montrée qu'une fois, finie, à la vérification (sinon l'assistant affiche une
  // interface par appel, et la personne voit plusieurs fois la même grille — essai du 28/10/2026)
  server.registerTool("create_arrowword_grid", {
    title: "Create an arrowword grid (mots fléchés)",
    description:
      "Builds a valid arrowword puzzle — French « mots fléchés », German « Schwedenrätsel » — around the words you " +
      "give, in a few seconds. Use it whenever someone asks for mots fléchés, arrow words, a Schwedenrätsel or a " +
      "personalised word puzzle (birthday, class, newsletter, retirement home…). Returns the grid, every word with " +
      "where its clue goes and how many characters fit; you then write the clues and call check_clues straight " +
      "away, without showing them: the rows are the solution.",
    inputSchema: z.object({
      lang: Lang,
      width: z.number().int().min(5).max(15).default(10)
        .describe("Cells across, 5 to 15. 9 or 10 suits a gift: about 30 clues to write; 15×15 means 70"),
      height: z.number().int().min(5).max(15).default(10).describe("Cells down, 5 to 15"),
      level: z.enum(["easy", "medium", "hard"]).default("medium")
        .describe("easy: common words, direct clues (children, beginners); hard: the difficulty is in the clues"),
      required_words: z.array(z.string()).max(10).default([])
        .describe("Words that must be in the grid (the generation fails if one cannot be placed)"),
      preferred_words: z.array(z.string()).max(60).default([])
        .describe("Theme words placed when possible: give 10 to 30 for a personal grid"),
      mystery_word: z.string().max(40).optional()
        .describe("Optional: a name or short message whose letters are numbered in the grid"),
      seed: z.number().int().min(0).optional().describe("Optional: the same seed and settings give the same grid"),
      author: z.string().max(60).optional()
        .describe("Optional: the name the person signs the grid with (« Grille de Mamie Jo »); ask them"),
    }),
    annotations: readOnlyNotIdempotent,
  }, async (args) => createGrid(api.withLanguage(args.lang), args));

  registerAppTool(server, "check_clues", {
    title: "Check the clues of an arrowword grid",
    description:
      "Checks your clues: each must fit its cell and not give the answer away (errors), and should sound like an " +
      "arrowword clue rather than a dictionary entry (warnings). When no clue is refused, returns the links to play " +
      "the grid online and to print it or download its PDF.",
    inputSchema: z.object({
      grid_id: z.string().describe("The grid_id given by create_arrowword_grid"),
      clues: z.array(z.object({ answer: z.string(), clue: z.string() }))
        .describe("One {answer, clue} pair per word of the grid, in any order"),
      lang: z.enum(["fr", "de", "en"]).optional().describe("Language of the messages; the grid's by default"),
    }),
    annotations: readOnly,
    _meta: { ui: { resourceUri: UI_URI } },
  }, async ({ grid_id, clues, lang }) => checkClues(api.withLanguage(lang ?? "en"), grid_id, clues));

  server.registerTool("draw_grid", {
    title: "Draw an arrowword grid",
    description: "Draws the grid as an image: the puzzle with its clues, or the solution. Only when the person asks " +
      "for an image or for the solution: check_clues already shows the finished grid.",
    inputSchema: z.object({
      grid_id: z.string().describe("The grid_id given by create_arrowword_grid"),
      clues: z.array(z.object({ answer: z.string(), clue: z.string() })).default([])
        .describe("The {answer, clue} pairs (not needed for the solution)"),
      view: z.enum(["puzzle", "solution"]).default("puzzle"),
    }),
    annotations: readOnly,
  }, async ({ grid_id, clues, view }) => {
    const grid = await gridWithClues(api, grid_id, clues);
    return "content" in grid ? grid as ToolResult : drawGrid(api, grid, view);
  });

  registerAppResource(server, "Grille de mots fléchés", UI_URI, {
    mimeType: RESOURCE_MIME_TYPE,
    description: "The grid, its clues, the solution on demand, and the links to play or print it",
  }, async () => ({
    contents: [{
      uri: UI_URI,
      mimeType: RESOURCE_MIME_TYPE,
      text: await appHtml(),
      // Rien d'extérieur : l'interface ne charge rien et ne contacte personne ; les liens s'ouvrent par l'assistant
      // Ni connexion ni ressource extérieure : la police et les dessins sont dans la page
      _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } } },
    }],
  }));

  return server;
}
