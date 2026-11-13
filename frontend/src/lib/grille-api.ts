import { tailleNommee } from "@/lib/tailles";
import type { MiniGridSpec } from "@/lib/mini-grid";

/**
 * Les grilles de l'API ouverte sur le site (ADR 0032) : on ne les stocke pas, elles voyagent dans le lien.
 *
 * - `/grille#g=…` : une grille entière (le fichier de grille de l'API, compressé en zlib puis en base64 d'adresse),
 *   après le « # » : le navigateur ne l'envoie jamais au serveur. La page la fait jouer, imprimer, ou l'enregistre
 *   dans un compte (« Mes grilles ») pour la retoucher.
 * - `/creer?lang=…&taille=…&mots=…&mystere=…&niveau=…` : le lien préparé qu'une IA écrit sans outil. On le lit avec
 *   tolérance : une IA oublie parfois un « & » (essai du 27/10/2026, docs/API-BESOINS.md).
 */

/** Le lien de la grille ouverte, gardé le temps de l'onglet (dans le navigateur seul) : il survit au détour par la
 * connexion */
export const GRILLE_LINK_KEY = "terminator:grille-api";

export type GridFileWord = {
  answer: string;
  x: number;
  y: number;
  direction: "across" | "down";
  source?: string;
  clue?: string | null;
};

export type GridFile = {
  format?: string;
  version?: number;
  type?: string;
  lang: string;
  level?: string;
  seed?: number | null;
  rows: string[];
  words: GridFileWord[];
  mystery?: { word: string; cells: { x: number; y: number }[] };
  /** Facultatif : le nom dont la personne a signé sa grille */
  author?: string;
};

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Les paramètres du fragment d'adresse (« #mode=jouer&g=… »). */
export function fragmentParams(hash: string): URLSearchParams {
  return new URLSearchParams(hash.replace(/^#/, ""));
}

/** Le fichier de grille contenu dans un lien ; une erreur si le lien est abîmé ou ne contient pas une grille. */
export async function decodeGrid(data: string): Promise<GridFile> {
  const stream = new Blob([fromBase64Url(data) as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
  const grid = JSON.parse(await new Response(stream).text()) as GridFile;
  const width = grid.rows?.[0]?.length ?? 0;
  if (!Array.isArray(grid.rows) || !grid.rows.length || grid.rows.some((row) => row.length !== width || !/^[#A-Z]+$/.test(row))
      || !Array.isArray(grid.words)) {
    throw new Error("Ce lien ne contient pas une grille lisible.");
  }
  return grid;
}

/** La grille pour le lecteur du site (celui de la grille du jour) : les lignes, une définition par mot. */
export function specOf(grid: GridFile): MiniGridSpec {
  const clues: Record<string, string> = {};
  for (const word of grid.words) {
    if (word.clue) clues[word.answer] = word.clue;
  }
  return { rows: grid.rows, clues, mystery: grid.mystery?.cells.length ? grid.mystery : undefined };
}

export const missingClues = (grid: GridFile) => grid.words.filter((word) => !word.clue).length;

const SOURCES: Record<string, string> = { required: "must", preferred: "wish", lexicon: "common" };

/**
 * La grille telle que « Conserver » l'enregistre (`POST /api/grids`), et ses définitions par position, pour
 * `PATCH /api/grids/{id}` : la copie facultative passe par les grilles conservées qui existent déjà.
 */
export function savedGridOf(grid: GridFile) {
  const height = grid.rows.length;
  const width = grid.rows[0].length;
  const cells = grid.rows.flatMap((row, y) =>
    [...row].map((char, x) => ({ x, y, char: char === "#" ? "" : char, is_black: char === "#" })));
  const words = grid.words.map((word) => ({
    text: word.answer, x: word.x, y: word.y, direction: word.direction, source: SOURCES[word.source ?? ""] ?? "common",
  }));
  const definitions = Object.fromEntries(
    grid.words.filter((word) => word.clue).map((word) => [`${word.x}-${word.y}-${word.direction}`, word.clue as string]));
  const mystery = grid.mystery && grid.mystery.cells.length >= 3
    ? { word: grid.mystery.word, seed: grid.seed ?? null, cells: grid.mystery.cells } : undefined;
  return {
    payload: { width, height, layout: "sur-mesure", seed: grid.seed ?? null, cells, words, must_words: [],
      ...(mystery ? { mystery } : {}) },
    definitions,
  };
}

// --- Le lien préparé ---

export type PreparedLink = {
  lang: string | null;
  size: { width: number; height: number } | null;
  words: string[];
  mystery: string;
  level: "easy" | "medium" | "hard" | null;
  /** Ce qui n'a pas pu être lu, pour le dire plutôt que l'ignorer */
  ignored: string[];
};

const LEVELS: Record<string, "easy" | "medium" | "hard"> = {
  facile: "easy", easy: "easy", leicht: "easy", moyen: "medium", medium: "medium", mittel: "medium",
  difficile: "hard", hard: "hard", schwer: "hard",
};
const KEYS = ["lang", "taille", "size", "mots", "words", "mystere", "mystery", "niveau", "level"];

/** « 10x10 », « 10×10 », « 10 x 10 » : une taille de 5 à 20 cases de côté ; ou « petite », « moyenne », « grande ». */
function sizeOf(text: string): PreparedLink["size"] {
  const named = tailleNommee(text);
  if (named) return { width: named.width, height: named.height };
  const match = /^(\d{1,2})\s*[x×X*]\s*(\d{1,2})$/.exec(text.trim());
  if (!match) return null;
  const [width, height] = [Number(match[1]), Number(match[2])];
  return width >= 5 && width <= 20 && height >= 5 && height <= 20 ? { width, height } : null;
}

/**
 * Le lien préparé, lu avec tolérance. Un paramètre collé dans la liste des mots faute de « & »
 * (`mots=gateau,bougie,mystere=MAMIE&niveau=facile`) est retrouvé ; ce qui ne se lit pas est rendu dans `ignored`.
 */
export function readPreparedLink(search: string): PreparedLink | null {
  const params = new URLSearchParams(search);
  const values = new Map<string, string>();
  for (const [key, value] of params) {
    values.set(key.toLowerCase(), value);
  }
  if (!KEYS.some((key) => values.has(key))) return null;

  const ignored: string[] = [];
  const words: string[] = [];
  for (const item of (values.get("mots") ?? values.get("words") ?? "").split(/[,;\n]+/)) {
    const text = item.trim();
    if (!text) continue;
    const glued = /^([a-zA-Z]+)\s*=\s*(.*)$/.exec(text);
    if (glued && KEYS.includes(glued[1].toLowerCase())) {
      // Un « & » oublié : le paramètre suivant est resté collé aux mots
      const key = glued[1].toLowerCase();
      if (!values.has(key) || !values.get(key)) values.set(key, glued[2]);
      continue;
    }
    if (/^[\p{L}][\p{L}'’ -]{0,38}[\p{L}]$/u.test(text)) {
      words.push(text);
    } else {
      ignored.push(text);
    }
  }
  const sizeText = values.get("taille") ?? values.get("size") ?? "";
  const size = sizeText ? sizeOf(sizeText) : null;
  if (sizeText && !size) ignored.push(`taille=${sizeText}`);
  const levelText = (values.get("niveau") ?? values.get("level") ?? "").trim().toLowerCase();
  const level = LEVELS[levelText] ?? null;
  if (levelText && !level) ignored.push(`niveau=${levelText}`);
  const mystery = (values.get("mystere") ?? values.get("mystery") ?? "").trim().slice(0, 40);
  const lang = (values.get("lang") ?? "").trim().toLowerCase().slice(0, 2) || null;
  return { lang, size, words: [...new Set(words)].slice(0, 60), mystery, level, ignored };
}
