/** Les outils du connecteur, sur une fausse API : ce que lit le modèle, ce que reçoit l'interface, ce que voit l'API. */

import { describe, expect, it } from "vitest";

import { FlechoirApi, type GridFile } from "./api.js";
import { checkClues, compactGrid, createGrid, describeGrid, drawGrid } from "./tools.js";

const GRID: GridFile = {
  format: "flechoir.grid", version: 1, type: "arrowword", lang: "fr", level: "easy", width: 5, height: 5, seed: 3,
  rows: ["#####", "#AMIS", "#R#E#", "#BALS", "#RIZ#"],
  words: [
    { answer: "AMIS", x: 1, y: 1, direction: "across", source: "preferred", clue_cell: { x: 0, y: 1 }, arrow: "right",
      clue_shares_cell: false, clue_max_chars: 68, clue: null, display: "amis" },
    { answer: "BALS", x: 1, y: 3, direction: "across", source: "lexicon", clue_cell: { x: 0, y: 3 }, arrow: "right",
      clue_shares_cell: false, clue_max_chars: 68, clue: null },
  ],
};

type Call = { method: string; url: string; headers: Record<string, string>; body?: unknown };

/** Une fausse API : chaque appel reçoit la réponse suivante de la liste. */
function fakeApi(responses: Array<{ status: number; body: unknown; headers?: Record<string, string> }>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ method: init.method ?? "GET", url, headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined });
    const next = responses.shift()!;
    const isJson = typeof next.body !== "string";
    return new Response(isJson ? JSON.stringify(next.body) : (next.body as string), {
      status: next.status,
      headers: { "Content-Type": isJson ? "application/json" : "image/svg+xml", ...(next.headers ?? {}) },
    });
  }) as unknown as typeof fetch;
  const api = new FlechoirApi({ baseUrl: "http://api", relayKey: "secret", assistant: "openai-mcp/1.0", origin: "104.192.219.205",
    fetchImpl });
  return { api, calls };
}

const noWait = async () => undefined;

describe("create_arrowword_grid", () => {
  it("waits for the grid, then gives the model everything it needs to write the clues", async () => {
    const { api, calls } = fakeApi([
      { status: 202, body: { id: "gen_1", status: "queued" }, headers: { Location: "/v1/grids/gen_1" } },
      { status: 200, body: { id: "gen_1", status: "running" } },
      { status: 200, body: { id: "gen_1", status: "done", grid: GRID } },
    ]);

    const result = await createGrid(api.withLanguage("fr"), { lang: "fr", preferred_words: ["amis"] }, 45_000, noWait);

    expect(result.isError).toBeUndefined();
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "POST http://api/v1/grids", "GET http://api/v1/grids/gen_1", "GET http://api/v1/grids/gen_1"]);
    expect(calls[0].body).toEqual({ type: "arrowword", lang: "fr", preferred_words: ["amis"] });
    // L'adresse de l'appelant : l'API y reconnaît l'assistant (revue de sécurité du 02/11/2026)
    expect(calls[0].headers).toMatchObject({ "X-Relay-Origin": "104.192.219.205" });
    expect(calls[0].headers).toMatchObject({ "X-Relay-Key": "secret", "X-Relay-Client": "openai-mcp/1.0",
      "Accept-Language": "fr" });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("#AMIS");
    expect(text).toContain("1. AMIS (amis) — across → ≤68 chars, preferred");
    expect(text).toContain("no relative clause");
    expect(text).toContain("Level easy: direct clues");
    // Pas de fichier à recopier : le numéro de la grille suffit pour envoyer les définitions
    expect(text).toContain("call check_clues with grid_id « gen_1 », lang « fr » and clues, a list of {answer, clue} pairs");
    // Ni la solution ni les définitions dans la conversation, et pas de permission à demander (essai du 28/10)
    expect(text).toContain("never show it to the person");
    expect(text).toContain("Next, straight away");
    expect(text).not.toContain("```json");
    expect(result.structuredContent).toEqual({ stage: "built", grid_id: "gen_1" });
  });

  it("says why when the API refuses, with the time to wait", async () => {
    const { api } = fakeApi([{ status: 429, body: { error: "Limit of 30 generations per minute.", reason: "quota_minute" },
      headers: { "Retry-After": "12" } }]);

    const result = await createGrid(api, { lang: "fr" }, 45_000, noWait);

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toBe(
      "Limit of 30 generations per minute. (reason: quota_minute). Retry after 12 s.");
  });

  it("gives up waiting after the limit instead of holding the conversation", async () => {
    const { api } = fakeApi([
      { status: 202, body: { id: "gen_2", status: "queued" }, headers: { Location: "/v1/grids/gen_2" } },
      ...Array.from({ length: 30 }, () => ({ status: 200, body: { id: "gen_2", status: "queued" } })),
    ]);

    const result = await createGrid(api, { lang: "fr" }, 1_000, noWait);

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({ error: { reason: "busy", message: expect.stringContaining("gen_2") } });
  });

  it("passes on a failed generation with its reason", async () => {
    const { api } = fakeApi([
      { status: 202, body: { id: "gen_3", status: "queued" }, headers: { Location: "/v1/grids/gen_3" } },
      { status: 200, body: { id: "gen_3", status: "failed", error: { reason: "timeout", message: "Out of time." } } },
    ]);

    const result = await createGrid(api, { lang: "fr" }, 45_000, noWait);

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toBe("Out of time. (reason: timeout)");
  });
});

describe("check_clues", () => {
  const clues = [{ answer: "AMIS", clue: "Sont de la fête" }, { answer: "BALS", clue: "On y danse" }];

  it("returns the links, and both drawings for the view, when no clue is refused", async () => {
    const { api, calls } = fakeApi([{ status: 200, body: {
      ok: true, errors: 0, warnings: 0, grid: GRID, links: { play: "https://site/grille#mode=jouer&g=x", open: "https://site/grille#g=x" },
      clues: [] } }, { status: 200, body: "<svg>grille</svg>" }, { status: 200, body: "<svg>solution</svg>" }]);

    const result = await checkClues(api, "gen_1", clues);

    expect(calls[0].body).toEqual({ id: "gen_1", clues });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("Play online: https://site/grille#mode=jouer&g=x");
    expect(result.structuredContent).toMatchObject({ stage: "ready" });
    // Les liens et les dessins pour l'interface seule : le modèle ne lit pas `_meta`
    expect(result._meta).toMatchObject({ links: { play: "https://site/grille#mode=jouer&g=x", open: "https://site/grille#g=x" },
      svg: { puzzle: "<svg>grille</svg>", solution: "<svg>solution</svg>" } });
    expect(JSON.stringify(result.structuredContent)).not.toContain("<svg");
    // Claude et ChatGPT montrent l'interface : le modèle ne recopie pas les liens, longs (essai du 02/11)
    expect((result.content[0] as { text: string }).text).toContain("do not copy the links");
    expect(calls.slice(1).map((call) => call.body)).toMatchObject([
      { format: "svg", view: "puzzle", embed_font: false }, { format: "svg", view: "solution", embed_font: false }]);
    // La clé d'élection : l'interface la plus récente remplace les précédentes
    expect(result._meta).toMatchObject({ createdAt: expect.any(Number), seq: expect.any(Number) });
    // Aucun horodatage dans ce que lit le modèle (règles des annuaires)
    expect(result.structuredContent).not.toHaveProperty("createdAt");
  });

  it("lists what to fix, and returns no links", async () => {
    const { api } = fakeApi([{ status: 200, body: { ok: false, errors: 1, warnings: 1, clues: [
      { answer: "AMIS", x: 1, y: 1, direction: "across", clue: "Les amis", ok: false,
        findings: [{ level: "error", reason: "clue_contains_answer", message: "The clue gives the answer away." }] },
      { answer: "BALS", x: 1, y: 3, direction: "across", clue: "Lieux où l'on danse qui", ok: true,
        findings: [{ level: "warning", reason: "clue_style_relative", message: "A relative clause…" }] }] } }]);

    const result = await checkClues(api, "gen_1", clues);

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("1 clue(s) must be fixed, 1 style warning(s):");
    expect(text).toContain("- AMIS « Les amis »: error — The clue gives the answer away. (clue_contains_answer)");
    expect(result.structuredContent).toMatchObject({ stage: "check_failed" });
    expect(JSON.stringify(result)).not.toContain("http");
  });
});

describe("draw_grid", () => {
  it("gives the model a PNG", async () => {
    const { api, calls } = fakeApi([{ status: 200, body: "\u0089PNG-fake" }]);

    const forModel = await drawGrid(api, compactGrid(GRID), "solution");

    expect(calls.map((call) => (call.body as { format: string; view: string }))).toMatchObject([
      { format: "png", view: "solution" }]);
    expect(forModel.content[0]).toMatchObject({ type: "image", mimeType: "image/png" });
  });
});

describe("placement", () => {
  it("tells which of the words asked for made it into the grid", () => {
    const text = describeGrid(GRID, [], ["amis", "Bals", "jardin"]);

    expect(text).toContain("Your words placed (2/3): amis, Bals. Not placed: jardin.");
  });
});

describe("compactGrid", () => {
  it("keeps the author's signature with the grid", () => {
    expect(compactGrid({ ...GRID, author: "Mamie Jo" })).toMatchObject({ author: "Mamie Jo" });
    expect(compactGrid(GRID)).not.toHaveProperty("author");
  });
});

describe("describeGrid", () => {
  it("names the mystery word and the warnings", () => {
    const text = describeGrid({ ...GRID, mystery: { word: "AMI", cells: [] } },
      [{ reason: "mystery_letters_missing", message: "Missing letters." }]);

    expect(text).toContain("Mystery word: AMI");
    expect(text).toContain("Note: Missing letters. (mystery_letters_missing)");
  });
});
