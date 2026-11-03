/**
 * Les outils du connecteur (ADR 0032) : créer une grille, vérifier ses définitions, la dessiner.
 *
 * Fonctions pures au-dessus de l'API (api.ts), sans le SDK MCP : server.ts les enregistre, les tests les appellent.
 * Chaque résultat a deux faces :
 * - `content` : du texte pour le modèle (et pour les assistants sans interface) — la grille, les mots à définir, la
 *   place de chaque définition, la suite à donner ;
 * - `structuredContent` : des données courtes (l'assistant les lit aussi) — l'étape, la langue ;
 * - `_meta` : ce que seule l'interface lit (MCP App) — les liens, déjà dans le texte, et les deux dessins, une
 *   trentaine de Ko que le modèle n'a pas à
 *   lire (essai dans Claude du 02/11/2026 : son message final tardait).
 */

import type { ApiResult, FlechoirApi, GridFile } from "./api.js";

export type ToolResult = {
  content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
  isError?: boolean;
};

export type CreateArgs = {
  lang: "fr" | "de" | "en";
  width?: number;
  height?: number;
  level?: "easy" | "medium" | "hard";
  required_words?: string[];
  preferred_words?: string[];
  mystery_word?: string;
  seed?: number;
  author?: string;
};

type Job = { id: string; status: string; grid?: GridFile; error?: { reason: string; message: string };
  warnings?: Array<{ reason: string; message: string }> };

// L'attente d'une génération : la file rend la main en quelques secondes ; au-delà, l'assistant réessaie plus tard
export const POLL_LIMIT_MS = 45_000;
// Sur le réseau interne, un coup d'œil coûte peu : une demi-seconde, plutôt que les 2 s conseillées aux clients lointains
// (jusqu'à 2 s perdues par grille, essai dans Claude du 28/10/2026)
const POLL_DEFAULT_MS = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function failure(text: string, reason: string): ToolResult {
  return { content: [{ type: "text", text }], structuredContent: { error: { reason, message: text } }, isError: true };
}

function apiFailure(result: Extract<ApiResult<unknown>, { ok: false }>): ToolResult {
  const wait = result.retryAfter ? ` Retry after ${result.retryAfter} s.` : "";
  return failure(`${result.error} (reason: ${result.reason}).${wait}`, result.reason);
}

/** Le fichier de grille sans ce que l'API recalcule : ce que le modèle recopie dans `check_clues`. */
export function compactGrid(grid: GridFile): Record<string, unknown> {
  return {
    format: grid.format,
    version: grid.version,
    type: grid.type,
    lang: grid.lang,
    level: grid.level,
    seed: grid.seed,
    rows: grid.rows,
    words: grid.words.map((word) => ({
      answer: word.answer, x: word.x, y: word.y, direction: word.direction, clue: word.clue ?? "",
    })),
    ...(grid.mystery ? { mystery: grid.mystery } : {}),
    ...(grid.author ? { author: grid.author } : {}),
  };
}

const ARROW_TEXT: Record<string, string> = {
  right: "→", down: "↓", down_then_right: "↳ (down then right)", right_then_down: "↴ (right then down)",
};

/** Ce que le modèle lit d'une grille faite : de quoi écrire les définitions, puis la marche à suivre. */
/** Les mots demandés que la grille a placés, et les autres : de quoi décider d'une nouvelle grille sans tâtonner. */
export function placement(grid: GridFile, asked: string[]): { placed: string[]; missing: string[] } {
  const plain = (word: string) => word.normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase();
  const answers = new Set(grid.words.map((word) => word.answer));
  const placed: string[] = [];
  const missing: string[] = [];
  for (const word of asked) {
    (answers.has(plain(word)) ? placed : missing).push(word);
  }
  return { placed, missing };
}

// La méthode d'écriture des définitions, par niveau : de quoi écrire vite et bien, d'un seul trait (ADR 0032)
const LEVEL_METHOD: Record<string, string> = {
  easy: "Level easy: direct clues — a synonym or a plain description; no traps.",
  medium: "Level medium: classic clues, a little wordplay where it comes naturally.",
  hard: "Level hard: double meanings and misleading parts of speech; the difficulty is in the clues.",
};

export function describeGrid(grid: GridFile, warnings: Job["warnings"] = [], asked: string[] = [],
                             id = ""): string {
  const { placed, missing } = placement(grid, asked);
  const lines = [
    `Arrowword grid built (${grid.lang}, ${grid.width}×${grid.height}, level ${grid.level ?? "medium"}, ` +
      `seed ${grid.seed}${id ? `, grid_id ${id}` : ""}). Rows, « # » = clue cell (this is the solution: never show ` +
      "it to the person):",
    ...grid.rows.map((row) => `  ${row}`),
    "",
    `Now write all the clues in one pass, in ${grid.lang}, one per word below, each with its answer. Method: ` +
      "read the written form in brackets (accents tell the word); 1 to 4 words, no sentence, no relative clause; " +
      "same part of speech and number as the answer; never the answer or its root; within the characters given. " +
      "For short tool-words (article, note, pronoun, conjunction) the usual short arrowword convention is fine. " +
      `${LEVEL_METHOD[grid.level ?? "medium"] ?? LEVEL_METHOD.medium} Do not deliberate word by word: ` +
      "check_clues flags anything to fix.",
    ...grid.words.map((word, index) =>
      `${index + 1}. ${word.answer}${word.display ? ` (${word.display})` : ""} — ${word.direction}` +
      ` ${ARROW_TEXT[word.arrow ?? ""] ?? ""} ≤${word.clue_max_chars ?? "?"} chars` +
      `${word.source && word.source !== "lexicon" ? `, ${word.source}` : ""}`),
  ];
  if (grid.mystery) {
    lines.push("", `Mystery word: ${grid.mystery.word} (its letters are numbered in the grid).`);
  }
  if (grid.author) {
    lines.push("", `Signed by: ${grid.author}.`);
  }
  if (asked.length) {
    lines.push("", `Your words placed (${placed.length}/${asked.length}): ${placed.join(", ") || "none"}.` +
      (missing.length ? ` Not placed: ${missing.join(", ")}. If one matters, ask again with it in required_words ` +
        "(at most 3); otherwise keep this grid: every new generation asks the person for permission again." : ""));
  }
  for (const warning of warnings ?? []) {
    lines.push("", `Note: ${warning.message} (${warning.reason})`);
  }
  lines.push("", id
    ? `Next, straight away: call check_clues with grid_id « ${id} », lang « ${grid.lang} » and clues, a list of ` +
      "{answer, clue} pairs (e.g. {answer: \"ANSWER\", clue: \"your clue\"}): a clue cannot slip onto another word. " +
      NO_SPOILER
    : `Next, straight away: call check_clues with the grid file, each word's « clue » filled in. ${NO_SPOILER}`);
  return lines.join("\n");
}

// Essai dans Claude du 28/10/2026 : il avait recopié la solution et les définitions dans la conversation, puis
// demandé la permission de vérifier
// Les assistants qui montrent l'interface (MCP App), d'après leur client : « Claude-User », « openai-mcp »
const SHOWS_VIEW = /claude|openai/i;

const NO_SPOILER = "Do not write the clues or the rows in the conversation, and do not ask first: check_clues shows " +
  "the person the finished grid.";

/** Crée une grille et attend qu'elle soit faite : l'assistant reçoit la grille, pas un numéro à surveiller. */
export async function createGrid(api: FlechoirApi, args: CreateArgs, pollLimitMs = POLL_LIMIT_MS,
                                 wait: (ms: number) => Promise<unknown> = sleep): Promise<ToolResult> {
  const created = await api.request<Job>("POST", "/v1/grids", { type: "arrowword", ...args });
  if (!created.ok) {
    return apiFailure(created);
  }
  const location = created.headers.get("Location") ?? `/v1/grids/${created.body.id}`;
  let job = created.body;
  let waited = 0;
  while (job.status === "queued" || job.status === "running") {
    if (waited >= pollLimitMs) {
      return failure(`The generator is busy: the grid is still in the queue. Ask again in a minute (id ${job.id}).`,
        "busy");
    }
    await wait(POLL_DEFAULT_MS);
    waited += POLL_DEFAULT_MS;
    const read = await api.request<Job>("GET", location);
    if (!read.ok) {
      return apiFailure(read);
    }
    job = read.body;
  }
  if (job.status === "failed" || !job.grid) {
    return failure(`${job.error?.message ?? "The grid could not be built."} (reason: ${job.error?.reason})`,
      job.error?.reason ?? "internal_error");
  }
  return {
    content: [{ type: "text", text: describeGrid(job.grid, job.warnings,
      [...(args.required_words ?? []), ...(args.preferred_words ?? [])], job.id) }],
    // Le texte dit déjà tout au modèle : pas une deuxième copie de la grille à lire
    structuredContent: { stage: "built", grid_id: job.id },
  };
}

type Check = {
  ok: boolean; errors: number; warnings: number; grid?: GridFile; links?: { play: string; open: string };
  clues: Array<{ answer: string; x: number; y: number; direction: string; clue: string | null; ok: boolean;
    findings: Array<{ level: string; reason: string; message: string }> }>;
};

/** Vérifie les définitions d'une grille ; si aucune n'est refusée, rend les liens pour la jouer ou l'imprimer. */
export type AnsweredClue = { answer: string; clue: string };

// La clé d'élection des interfaces (MCP Apps, « supersession ») : la plus récente remplace les précédentes dans la
// conversation, au lieu que la même grille s'y affiche deux fois (essai dans Claude du 28/10/2026)
let callSeq = 0;

export async function checkClues(api: FlechoirApi, gridId: string, clues: AnsweredClue[]): Promise<ToolResult> {
  const checked = await api.request<Check>("POST", "/v1/clues/check", { id: gridId, clues });
  if (!checked.ok) {
    return apiFailure(checked);
  }
  const body = checked.body;
  const lines: string[] = [];
  for (const clue of body.clues) {
    for (const finding of clue.findings) {
      lines.push(`- ${clue.answer} « ${clue.clue ?? ""} »: ${finding.level} — ${finding.message} (${finding.reason})`);
    }
  }
  if (!body.ok) {
    return {
      content: [{ type: "text", text: [
        `${body.errors} clue(s) must be fixed${body.warnings ? `, ${body.warnings} style warning(s)` : ""}:`,
        ...lines,
        "",
        "Fix the errors, then call check_clues again with the whole list of pairs.",
      ].join("\n") }],
      structuredContent: { stage: "check_failed", lang: body.grid?.lang, createdAt: Date.now(), seq: ++callSeq,
        refused: body.clues.flatMap((clue) => clue.findings.filter((finding) => finding.level === "error")
          .map((finding) => ({ answer: clue.answer, message: finding.message }))) },
    };
  }
  // La grille et sa solution, déjà dessinées : l'interface les montre et bascule sans rappeler d'outil (chaque appel
  // demande une autorisation à la personne). Sans la police, que l'interface embarque une fois
  const [puzzle, solution] = await Promise.all((["puzzle", "solution"] as const).map((view) =>
    api.binary("/v1/render", { grid: body.grid, format: "svg", view, embed_font: false })));
  const accepted = body.warnings
    ? `All clues accepted, with ${body.warnings} optional style warning(s). Only call check_clues again if the ` +
      "person wants changes: each call shows the grid again."
    : "All clues accepted.";
  // Les liens contiennent la grille (1 à 3 000 caractères) : les recopier coûte au modèle de longues secondes, alors
  // que l'interface a ses boutons. Claude et ChatGPT montrent l'interface ; les autres reçoivent les liens à donner
  const next = SHOWS_VIEW.test(api.assistant)
    ? ["The person now sees the finished grid in the conversation, with buttons to play it online, to print it or " +
        "download its PDF, and to show its solution. Reply in one or two short sentences: do not copy the links " +
        "(long, and already behind the buttons), the clues or the solution. Only if the person says they cannot see " +
        "the grid, give them these links:",
       `Play online: ${body.links?.play}`,
       `Print, download the PDF or edit: ${body.links?.open}`]
    : [`Play online: ${body.links?.play}`,
       `Print, download the PDF or edit: ${body.links?.open}`,
       "Give the person these two links in a short message, without the clues or the solution. Do not call " +
        "draw_grid unless the person asks for an image."];
  return {
    content: [{ type: "text", text: [accepted, ...lines, "", ...next].join("\n") }],
    structuredContent: { stage: "ready", lang: body.grid?.lang, createdAt: Date.now(), seq: ++callSeq },
    _meta: { links: body.links, svg: { puzzle: puzzle.ok ? puzzle.text : "", solution: solution.ok ? solution.text : "" } },
  };
}

/** Dessine une grille en PNG, quand la personne demande une image (l'interface, elle, a déjà ses deux dessins). */
/** La grille d'une génération (24 heures), avec les définitions données, pour la dessiner. */
export async function gridWithClues(api: FlechoirApi, gridId: string, clues: AnsweredClue[] = []):
    Promise<Record<string, unknown> | ToolResult> {
  const read = await api.request<Job>("GET", `/v1/grids/${encodeURIComponent(gridId)}`);
  if (!read.ok) {
    return apiFailure(read);
  }
  if (!read.body.grid) {
    return failure("The grid is not ready yet.", "grid_not_ready");
  }
  const grid = read.body.grid;
  const plain = (word: string) => word.normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase();
  const byAnswer = new Map(clues.map((pair) => [plain(pair.answer), pair.clue]));
  return { ...compactGrid(grid), words: grid.words.map((word) => ({
    answer: word.answer, x: word.x, y: word.y, direction: word.direction, clue: byAnswer.get(word.answer) ?? "" })) };
}

export async function drawGrid(api: FlechoirApi, grid: Record<string, unknown>,
                               view: "puzzle" | "solution"): Promise<ToolResult> {
  const png = await api.binary("/v1/render", { grid, format: "png", view, width: 900 });
  if (!png.ok) {
    return failure("The grid could not be drawn.", "render_failed");
  }
  return {
    content: [{ type: "image", data: png.data.toString("base64"), mimeType: "image/png" }],
    structuredContent: { view },
  };
}
