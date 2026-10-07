import type { GridData } from "@/components/grid/grid-display";
import type { Clue } from "@/components/grid/grid-svg";

/** La clé d'une définition, comme `clueKey` de grid-svg (module client : on ne l'importe pas côté serveur) */
const keyOf = (clue: Pick<Clue, "x" | "y" | "direction">) => `${clue.x}-${clue.y}-${clue.direction}`;

/**
 * Les petites grilles à jouer des articles.
 *
 * La grille vient de notre propre générateur (`POST /api/grids/generate`, les mots-clés de l'article en mots
 * imposés ou souhaités) : la requête et la réponse sont gardées à côté de l'article
 * (`src/content/articles/grilles/<slug>.json`), et la grille se refait à l'identique avec la même seed et le
 * même lexique. Les définitions, elles, sont écrites à la main, une par mot.
 *
 * Une grille se lit aussi comme on la dessine : une chaîne par ligne, « # » pour une case définition, une
 * lettre sinon. Les mots (toute suite d'au moins deux lettres) et leurs flèches s'en déduisent, avec la même
 * règle que le moteur (`backend/engine/arrows.py`). Une grille incohérente (un mot sans définition ou sans
 * case pour l'écrire, une case qui en porterait deux du même côté, des mots qui ne sont pas ceux du
 * générateur) fait échouer le build : un article ne part jamais avec une grille injouable.
 */
export type MiniGridSpec = {
  rows: string[];
  /** Le texte de chaque définition, par mot (« CECI » : « Pas cela ») */
  clues: Record<string, string>;
};

/** Une grille générée, telle que l'API l'a rendue, avec la requête qui l'a produite */
export type GeneratedGrid = {
  request: Record<string, unknown>;
  response: { grid: { width: number; height: number; cells: { x: number; y: number; char: string; is_black: boolean }[]; words: { text: string; x: number; y: number; direction: string }[] } };
};

/** La grille d'un article à partir de la réponse du générateur, et ses définitions écrites à la main */
export function specFromGeneration({ response: { grid } }: GeneratedGrid, clues: Record<string, string>): MiniGridSpec {
  const at = new Map(grid.cells.map((cell) => [`${cell.x}-${cell.y}`, cell]));
  const rows = Array.from({ length: grid.height }, (_, y) =>
    Array.from({ length: grid.width }, (_, x) => {
      const cell = at.get(`${x}-${y}`);
      return !cell || cell.is_black ? "#" : cell.char;
    }).join(""),
  );
  const expected = grid.words.map((word) => `${word.text}-${word.x}-${word.y}-${word.direction}`).sort().join(" ");
  const found = buildMiniGrid({ rows, clues }).words.map((word) => `${word.text}-${word.x}-${word.y}-${word.direction}`).sort().join(" ");
  if (expected !== found) throw new Error(`Les mots de la grille ne sont pas ceux du générateur : ${found} / ${expected}`);
  return { rows, clues };
}

export type MiniWord = { text: string; x: number; y: number; direction: "across" | "down"; cells: string[] };

export type MiniGrid = {
  grid: GridData;
  /** Par clé de mot (clueKey), le texte affiché dans la case définition */
  definitions: Record<string, string>;
  words: MiniWord[];
  /** La lettre attendue dans chaque case (« x-y ») */
  solution: Record<string, string>;
};

const RIGHT = "droite";
const DOWN = "bas";
const BENT_DOWN_RIGHT = "coudee_bas_droite";
const BENT_RIGHT_DOWN = "coudee_droite_bas";
const EXITS: Record<string, "right" | "bottom"> = {
  [RIGHT]: "right",
  [BENT_RIGHT_DOWN]: "right",
  [DOWN]: "bottom",
  [BENT_DOWN_RIGHT]: "bottom",
};

export function buildMiniGrid({ rows, clues }: MiniGridSpec): MiniGrid {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  if (!height || rows.some((row) => row.length !== width || !/^[#A-Z]+$/.test(row))) {
    throw new Error(`Grille mal formée : ${rows.join(" / ")}`);
  }
  const isDefinition = (x: number, y: number) => rows[y]?.[x] === "#";
  const isLetter = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && !isDefinition(x, y);

  const words: MiniWord[] = [];
  for (const direction of ["across", "down"] as const) {
    const [dx, dy] = direction === "across" ? [1, 0] : [0, 1];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Un mot commence sur une lettre que ne précède aucune lettre dans son sens
        if (!isLetter(x, y) || isLetter(x - dx, y - dy)) continue;
        const cells: string[] = [];
        let text = "";
        for (let cx = x, cy = y; isLetter(cx, cy); cx += dx, cy += dy) {
          cells.push(`${cx}-${cy}`);
          text += rows[cy][cx];
        }
        if (text.length >= 2) words.push({ text, x, y, direction, cells });
      }
    }
  }

  const gridClues: Clue[] = words.map((word) => {
    const { x, y, direction } = word;
    let place: [number, number, string] | null = null;
    if (direction === "across") {
      if (x > 0 && isDefinition(x - 1, y)) place = [x - 1, y, RIGHT];
      else if (y > 0 && isDefinition(x, y - 1)) place = [x, y - 1, BENT_DOWN_RIGHT];
    } else if (y > 0 && isDefinition(x, y - 1)) place = [x, y - 1, DOWN];
    else if (x > 0 && isDefinition(x - 1, y)) place = [x - 1, y, BENT_RIGHT_DOWN];
    if (!place) throw new Error(`Aucune case pour définir ${word.text}`);
    if (!clues[word.text]) throw new Error(`${word.text} n'a pas de définition`);
    const [cell_x, cell_y, arrow] = place;
    return { text: word.text, x, y, direction, length: word.text.length, cell_x, cell_y, arrow, exit: EXITS[arrow] };
  });

  // Une case définition porte au plus deux définitions, jamais deux du même côté (grid-svg les coupe ainsi)
  const exits = new Map<string, string[]>();
  for (const clue of gridClues) {
    const key = `${clue.cell_x}-${clue.cell_y}`;
    const sides = [...(exits.get(key) ?? []), clue.exit ?? ""];
    if (new Set(sides).size !== sides.length) throw new Error(`Case ${key} : deux définitions du même côté`);
    exits.set(key, sides);
  }
  const unused = Object.keys(clues).filter((text) => !words.some((word) => word.text === text));
  if (unused.length) throw new Error(`Définitions sans mot : ${unused.join(", ")}`);

  const solution: Record<string, string> = {};
  rows.forEach((row, y) => [...row].forEach((char, x) => char !== "#" && (solution[`${x}-${y}`] = char)));

  return {
    grid: {
      width,
      height,
      layout: "article",
      seed: null,
      cells: rows.flatMap((row, y) => [...row].map((char, x) => ({ x, y, char: char === "#" ? "" : char, is_black: char === "#" }))),
      words: words.map(({ text, x, y, direction }) => ({ text, x, y, direction, source: "common" })),
      fill_ratio: 1,
      wish_ratio: 0,
      must_words: [],
      clues: gridClues,
    },
    definitions: Object.fromEntries(gridClues.map((clue) => [keyOf(clue), clues[clue.text]])),
    words,
    solution,
  };
}
