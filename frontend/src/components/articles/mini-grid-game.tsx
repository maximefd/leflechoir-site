"use client";

import { useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { GridSvg } from "@/components/grid/grid-svg";
import { buildMiniGrid, type MiniGridSpec, type MiniWord } from "@/lib/mini-grid";

type Point = { x: number; y: number };
type Direction = "across" | "down";

const keyOf = ({ x, y }: Point) => `${x}-${y}`;
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/**
 * La petite grille à jouer d'un article : on touche une case (ou une définition), on tape, on vérifie.
 *
 * Le clavier : les lettres, les flèches pour se déplacer, Espace pour changer de sens, Entrée pour passer au
 * mot suivant, Retour arrière pour effacer ; rien qui demande Maj ou une touche placée autrement en AZERTY.
 * Sur téléphone, la frappe passe par un champ invisible posé sur la grille : c'est lui qui ouvre le clavier.
 */
export function MiniGridGame({ spec, title }: { spec: MiniGridSpec; title: string }) {
  const mini = useMemo(() => buildMiniGrid(spec), [spec]);
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [cursor, setCursor] = useState<Point | null>(null);
  const [direction, setDirection] = useState<Direction>("across");
  const [wrong, setWrong] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const isLetter = (point: Point) => keyOf(point) in mini.solution;
  const wordAt = (point: Point, dir: Direction): MiniWord | undefined =>
    mini.words.find((word) => word.direction === dir && word.cells.includes(keyOf(point)));
  const current = cursor ? (wordAt(cursor, direction) ?? wordAt(cursor, direction === "across" ? "down" : "across")) : undefined;
  const definition = current ? spec.clues[current.text] : null;

  const place = (point: Point, dir: Direction) => {
    // Un sens sans mot à cet endroit (une lettre seule dans sa ligne) : on prend l'autre
    setDirection(wordAt(point, dir) ? dir : dir === "across" ? "down" : "across");
    setCursor(point);
  };
  const startOf = (word: MiniWord): Point => {
    const empty = word.cells.find((cell) => !entries[cell]) ?? word.cells[0];
    const [x, y] = empty.split("-").map(Number);
    return { x, y };
  };

  const write = (point: Point, char: string) => {
    setEntries((previous) => ({ ...previous, [keyOf(point)]: char }));
    setWrong((previous) => previous.filter((key) => key !== keyOf(point)));
    setMessage("");
  };
  const step = (point: Point, delta: number): Point | null => {
    if (!current) return null;
    const index = current.cells.indexOf(keyOf(point)) + delta;
    if (index < 0 || index >= current.cells.length) return null;
    const [x, y] = current.cells[index].split("-").map(Number);
    return { x, y };
  };

  const selectCell = (point: Point) => {
    inputRef.current?.focus();
    if (!isLetter(point)) {
      // Une case définition : son mot (le second au deuxième toucher, quand elle en porte deux)
      const defined = mini.words.filter((word) =>
        mini.grid.clues?.some((clue) => clue.cell_x === point.x && clue.cell_y === point.y && clue.x === word.x && clue.y === word.y && clue.direction === word.direction),
      );
      if (!defined.length) return;
      const next = defined.length > 1 && current === defined[0] ? defined[1] : defined[0];
      place(startOf(next), next.direction);
      return;
    }
    if (cursor && keyOf(cursor) === keyOf(point)) place(point, direction === "across" ? "down" : "across");
    else place(point, direction);
  };

  const onInput = (event: ChangeEvent<HTMLInputElement>) => {
    const char = event.target.value.normalize("NFD").replace(/[^A-Za-z]/g, "").slice(-1).toUpperCase();
    event.target.value = "";
    if (!char || !cursor) return;
    write(cursor, char);
    const next = step(cursor, 1);
    if (next) setCursor(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!cursor) return;
    const moves: Record<string, [number, number, Direction]> = {
      ArrowRight: [1, 0, "across"],
      ArrowLeft: [-1, 0, "across"],
      ArrowDown: [0, 1, "down"],
      ArrowUp: [0, -1, "down"],
    };
    if (moves[event.key]) {
      event.preventDefault();
      const [dx, dy, dir] = moves[event.key];
      // On saute les cases définitions jusqu'à la prochaine lettre
      for (let x = cursor.x + dx, y = cursor.y + dy; x >= 0 && y >= 0 && x < mini.grid.width && y < mini.grid.height; x += dx, y += dy) {
        if (isLetter({ x, y })) {
          place({ x, y }, dir);
          return;
        }
      }
      place(cursor, dir);
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      place(cursor, direction === "across" ? "down" : "across");
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const index = current ? mini.words.indexOf(current) : -1;
      const next = mini.words[(index + 1) % mini.words.length];
      place(startOf(next), next.direction);
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      if (entries[keyOf(cursor)] || event.key === "Delete") {
        write(cursor, "");
        return;
      }
      const back = step(cursor, -1);
      if (back) {
        write(back, "");
        setCursor(back);
      }
    }
  };

  const check = () => {
    const errors = Object.keys(mini.solution).filter((key) => entries[key] && entries[key] !== mini.solution[key]);
    const empty = Object.keys(mini.solution).filter((key) => !entries[key]).length;
    setWrong(errors);
    if (errors.length) setMessage(`${plural(errors.length, "lettre")} à revoir, soulignée${errors.length > 1 ? "s" : ""} en rouge.`);
    else if (empty) setMessage(`Aucune erreur pour l’instant. Il reste ${plural(empty, "case")} à remplir.`);
    else setMessage("Bravo, la grille est juste !");
  };
  const reveal = () => {
    setEntries({ ...mini.solution });
    setWrong([]);
    setMessage("Voici la solution.");
  };
  const restart = () => {
    setEntries({});
    setWrong([]);
    setMessage("");
    setCursor(null);
  };

  // Les horizontaux d'abord, puis les verticaux, chacun dans l'ordre de lecture
  const byDirection = [...mini.words].sort(
    (a, b) => Number(a.direction === "down") - Number(b.direction === "down") || a.y - b.y || a.x - b.x,
  );

  const shown = {
    ...mini.grid,
    cells: mini.grid.cells.map((cell) => (cell.is_black ? cell : { ...cell, char: entries[keyOf(cell)] ?? "" })),
  };

  return (
    <figure className="not-prose my-8 rounded-lg border bg-secondary/20 p-4" aria-label={title}>
      <figcaption className="text-lg font-semibold text-foreground">{title}</figcaption>
      <p className="mt-1 text-sm text-muted-foreground">
        Touche une case ou une définition, puis tape. Espace change de sens, Entrée passe au mot suivant.
      </p>
      <p className="mt-3 min-h-7 text-lg font-semibold text-foreground" aria-live="polite" data-testid="mini-grid-clue">
        {current && definition ? `${definition} (${plural(current.text.length, "lettre")})` : " "}
      </p>
      {/* Toute la largeur de l'article : en dessous de 64 px par case, les définitions ne se lisent plus ;
          sur un écran étroit, la grille garde cette taille et défile de côté */}
      <div className="-mx-4 mt-2 overflow-x-auto px-4">
      <div className="relative mx-auto max-w-2xl" style={{ minWidth: mini.grid.width * 64 }}>
        <GridSvg
          grid={shown}
          variant="lettres"
          definitions={mini.definitions}
          selectedCell={cursor}
          onSelectCell={selectCell}
          litCells={current?.cells}
          unknownCells={wrong}
        />
        <input
          ref={inputRef}
          aria-label="Lettre à écrire dans la grille"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          style={{ fontSize: 16 }}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          onChange={onInput}
          onKeyDown={onKeyDown}
          onFocus={() => {
            if (!cursor && mini.words[0]) place(startOf(mini.words[0]), mini.words[0].direction);
          }}
        />
      </div>
      </div>
      {/* Dans la grille, les définitions ont leur taille d'imprimé : trop petites pour un écran. Les voici en clair. */}
      <ol className="mt-4 gap-x-6 text-sm sm:columns-2" aria-label="Les définitions">
        {byDirection.map((word) => {
          const active = word === current;
          const done = word.cells.every((cell) => entries[cell]);
          return (
            <li key={`${word.direction}-${word.x}-${word.y}`} className="break-inside-avoid py-0.5">
              <button
                type="button"
                className={`w-full rounded px-2 py-1 text-left ${active ? "bg-amber-200 text-black" : "hover:bg-secondary"} ${done && !active ? "text-muted-foreground" : ""}`}
                onClick={() => {
                  inputRef.current?.focus();
                  place(startOf(word), word.direction);
                }}
              >
                <span aria-hidden="true">{word.direction === "across" ? "→ " : "↓ "}</span>
                {spec.clues[word.text]} <span className="text-muted-foreground">({word.text.length})</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button size="sm" onClick={check}>Vérifier</Button>
        <Button size="sm" variant="outline" onClick={reveal}>Voir la solution</Button>
        <Button size="sm" variant="ghost" onClick={restart}>Recommencer</Button>
      </div>
      <p className="mt-3 min-h-5 text-center text-sm text-foreground" role="status">{message}</p>
    </figure>
  );
}
