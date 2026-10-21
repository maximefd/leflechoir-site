"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { placerChamp } from "@/components/grid/saisie-grille";
import { buildMiniGrid, type MiniGrid, type MiniGridSpec, type MiniWord } from "@/lib/mini-grid";

export type Point = { x: number; y: number };
export type Direction = "across" | "down";

const keyOf = ({ x, y }: Point) => `${x}-${y}`;
export const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/** Les lettres du mot mystère déjà écrites dans la grille, par numéro de case : la rangée suit le joueur. */
export function mysteryPlayed(mini: MiniGrid, entries: Record<string, string>): Record<number, string> {
  const cells = mini.grid.mystery?.cells ?? [];
  return Object.fromEntries(cells.map(({ x, y }, index) => [index + 1, entries[`${x}-${y}`] ?? ""]));
}

/**
 * Jouer une grille : curseur, sens, frappe, vérification, solution. Le cœur, partagé par la petite grille des
 * articles et les grilles du jour (`GridPlayer`) ; l'écran autour habille le même état.
 *
 * Le clavier : les lettres, les flèches pour se déplacer, Tab pour changer de sens (comme l'éditeur de
 * grille), Entrée pour passer au mot suivant, Retour arrière pour effacer ; rien qui demande Maj ou une
 * touche placée autrement en AZERTY. Sur téléphone, la frappe passe par un champ invisible posé sur la
 * grille : c'est lui qui ouvre le clavier.
 *
 * `onFirstLetter` est appelé une fois, à la première lettre écrite : c'est le moment où la partie commence
 * (la mesure « parties jouées » s'y accroche, ADR 0026).
 */
export function useGridGame(spec: MiniGridSpec, { onFirstLetter }: { onFirstLetter?: () => void } = {}) {
  const mini: MiniGrid = useMemo(() => buildMiniGrid(spec), [spec]);
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [cursor, setCursor] = useState<Point | null>(null);
  const [direction, setDirection] = useState<Direction>("across");
  const [wrong, setWrong] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [solved, setSolved] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const firstLetter = useRef(false);

  const isLetter = (point: Point) => keyOf(point) in mini.solution;
  const wordAt = (point: Point, dir: Direction): MiniWord | undefined =>
    mini.words.find((word) => word.direction === dir && word.cells.includes(keyOf(point)));
  const current = cursor ? (wordAt(cursor, direction) ?? wordAt(cursor, direction === "across" ? "down" : "across")) : undefined;
  const definition = current ? mini.cluesByWord[current.text] : null;

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
    if (char && !firstLetter.current) {
      firstLetter.current = true;
      onFirstLetter?.();
    }
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

  /** Le focus du champ, posé d'abord sur la case visée : le clavier du téléphone s'ouvre au bon endroit */
  const focusOn = (point: Point) => {
    placerChamp(inputRef.current, point);
    inputRef.current?.focus({ preventScroll: true });
  };

  const selectCell = (point: Point) => {
    if (!isLetter(point)) {
      // Une case définition : son mot (le second au deuxième toucher, quand elle en porte deux)
      const defined = mini.words.filter((word) =>
        mini.grid.clues?.some((clue) => clue.cell_x === point.x && clue.cell_y === point.y && clue.x === word.x && clue.y === word.y && clue.direction === word.direction),
      );
      if (!defined.length) {
        inputRef.current?.focus({ preventScroll: true });
        return;
      }
      const next = defined.length > 1 && current === defined[0] ? defined[1] : defined[0];
      const start = startOf(next);
      focusOn(start);
      place(start, next.direction);
      return;
    }
    focusOn(point);
    if (cursor && keyOf(cursor) === keyOf(point)) place(point, direction === "across" ? "down" : "across");
    else place(point, direction);
  };

  /** Aller à un mot : c'est là que mènent la liste des définitions et le premier focus. */
  const goTo = (word: MiniWord) => {
    const start = startOf(word);
    if (document.activeElement !== inputRef.current) focusOn(start);
    place(start, word.direction);
  };

  /** Des lettres reçues par le champ : une seule le plus souvent, plusieurs quand un clavier insère une suggestion */
  const ecrire = (texte: string) => {
    const chars = texte.normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase();
    if (!chars || !cursor) return;
    let at = cursor;
    for (const char of chars) {
      write(at, char);
      const next = step(at, 1);
      if (!next) break;
      at = next;
    }
    setCursor(at);
  };

  /** Retour arrière : efface la case, ou recule et efface celle d'avant si elle est déjà vide */
  const effacer = () => {
    if (!cursor) return;
    if (entries[keyOf(cursor)]) {
      write(cursor, "");
      return;
    }
    const back = step(cursor, -1);
    if (back) {
      write(back, "");
      setCursor(back);
    }
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
    if (event.key === "Tab") {
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
    if (event.key === "Delete") {
      event.preventDefault();
      write(cursor, "");
      return;
    }
    if (event.key === "Backspace") {
      event.preventDefault();
      effacer();
    }
  };

  const check = () => {
    const errors = Object.keys(mini.solution).filter((key) => entries[key] && entries[key] !== mini.solution[key]);
    const empty = Object.keys(mini.solution).filter((key) => !entries[key]).length;
    setWrong(errors);
    if (errors.length) {
      setSolved(false);
      setMessage(`${plural(errors.length, "lettre")} à revoir, soulignée${errors.length > 1 ? "s" : ""} en rouge.`);
    } else if (empty) {
      setMessage(`Aucune erreur pour l’instant. Il reste ${plural(empty, "case")} à remplir.`);
    } else {
      setSolved(true);
      setMessage("Bravo, la grille est juste !");
    }
  };
  const reveal = () => {
    setEntries({ ...mini.solution });
    setWrong([]);
    setRevealed(true);
    setMessage("Voici la solution.");
  };
  const restart = () => {
    setEntries({});
    setWrong([]);
    setMessage("");
    setCursor(null);
    setSolved(false);
    setRevealed(false);
    firstLetter.current = false; // une nouvelle partie repart : son chrono aussi, son écran décide
  };

  return {
    mini, entries, cursor, direction, wrong, message, solved, revealed,
    current, definition, inputRef,
    selectCell, goTo, ecrire, effacer, onKeyDown, check, reveal, restart,
  };
}
