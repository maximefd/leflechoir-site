"use client";

import { Button } from "@/components/ui/button";
import { GridSvg, HAND_FONT } from "@/components/grid/grid-svg";
import { SaisieGrille } from "@/components/grid/saisie-grille";
import { useGridGame, plural, mysteryPlayed } from "@/lib/use-grid-game";
import type { MiniGridSpec } from "@/lib/mini-grid";

const keyOf = ({ x, y }: { x: number; y: number }) => `${x}-${y}`;

/**
 * La petite grille à jouer d'un article : on touche une case (ou une définition), on tape, on vérifie.
 *
 * Tout ce qui se joue vit dans `useGridGame` — le même cœur que les grilles du jour (`GridPlayer`).
 * Le clavier : lettres, flèches, Tab pour le sens, Entrée pour le mot suivant, Retour arrière pour
 * effacer ; sur téléphone, la frappe passe par un champ invisible posé sur la grille.
 */
export function MiniGridGame({ spec, title }: { spec: MiniGridSpec; title: string }) {
  const {
    mini, entries, cursor, wrong, message, current, definition, inputRef,
    selectCell, goTo, ecrire, effacer, onKeyDown, check, reveal, restart,
  } = useGridGame(spec);

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
        Touche une case ou une définition, puis tape. Tab change de sens, Entrée passe au mot suivant.
      </p>
      {/* La définition en cours colle en haut de l'écran (sous l'en-tête à partir de la tablette, 7,125 rem) : clavier
          ouvert ou grande grille, elle reste lisible */}
      <p data-collant className="sticky top-0 z-10 -mx-4 mt-3 min-h-7 bg-background px-4 py-2 text-lg font-semibold text-foreground md:top-[7.125rem]" aria-live="polite" data-testid="mini-grid-clue">
        {current && definition ? `${definition} (${plural(current.text.length, "lettre")})` : " "}
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
          letterFont={HAND_FONT}
          mysteryLetters={mini.grid.mystery ? mysteryPlayed(mini, entries) : undefined}
        />
        <SaisieGrille
          inputRef={inputRef}
          cursor={cursor}
          onLetters={ecrire}
          onBackspace={effacer}
          onKeyDown={onKeyDown}
          enterKeyHint="next"
          // Revenir à la saisie reprend où l'on en était ; seul un début de partie va au premier mot
          onFocus={() => !cursor && mini.words[0] && goTo(mini.words[0])}
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
                onClick={() => goTo(word)}
              >
                <span aria-hidden="true">{word.direction === "across" ? "→ " : "↓ "}</span>
                {mini.cluesByWord[word.text]} <span className="text-muted-foreground">({word.text.length})</span>
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
