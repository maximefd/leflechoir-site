"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Eye, Loader2, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GridSvg, HAND_FONT } from "@/components/grid/grid-svg";
import { SaisieGrille } from "@/components/grid/saisie-grille";
import { site } from "@/config/site";
import { useGridGame, plural, mysteryPlayed } from "@/lib/use-grid-game";
import type { MiniGridSpec } from "@/lib/mini-grid";
import { exportPdf } from "@/lib/grid-export";
import { trackPdfExport, trackPlay } from "@/lib/audience";
import { SensMention, SensTexte, useSensDesMots } from "@/components/sens/sens-des-mots";

const keyOf = ({ x, y }: { x: number; y: number }) => `${x}-${y}`;

const chrono = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};
const inWords = (ms: number) => {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes} min ${String(seconds % 60).padStart(2, "0")} s` : `${seconds} s`;
};

/** Le coup d'œil : la solution reste affichée ce nombre de secondes, puis la grille du joueur revient. */
const PEEK_SECONDS = 3;

/**
 * Une grille à jouer en pleine page : la grille du jour et celles de la bibliothèque ([ADR 0026]). Le cœur
 * (`useGridGame`) est celui de la petite grille des articles ; ici s'ajoutent le chrono (il ne court qu'à
 * partir de la première lettre, comme au papier : le temps regarde jouer, il ne presse pas), le mot mystère
 * qui se remplit au fil de la grille, l'impression gratuite (la grille, sans sa solution), le joker qui
 * compte ses tours, le partage du lien, et le panneau de fin qui propose de créer sa propre grille.
 *
 * Le joueur écrit au crayon (`HAND_FONT`) : le remplissage a l'air d'une main, la grille reste un imprimé.
 * La solution ne se dévoile pas par mégarde : un coup d'œil de trois secondes ou l'abandon, en connaissance
 * de cause. La partie compte (une seule fois par page) dès la première lettre écrite : mesure sans cookie
 * (ADR 0016).
 */
export function GridPlayer({ spec, title }: { spec: MiniGridSpec; title: string }) {
  const {
    mini, entries, cursor, wrong, message, solved, revealed, current, definition, inputRef,
    selectCell, goTo, ecrire, effacer, onKeyDown, check, reveal, restart,
  } = useGridGame(spec, { onFirstLetter: play });

  const blankRef = useRef<HTMLDivElement>(null);
  const [printing, setPrinting] = useState(false);
  const [askSolution, setAskSolution] = useState(false);
  const [askJoker, setAskJoker] = useState(false);
  const [jokers, setJokers] = useState(0);
  const [peekLeft, setPeekLeft] = useState<number | null>(null); // secondes restantes du coup d'œil

  // L'horloge : discrète, elle démarre à la première lettre et s'arrête sur une grille juste ou révélée
  const [running, setRunning] = useState(false);
  const startedAt = useRef(0);
  const [elapsed, setElapsed] = useState<number | null>(null); // figée, une fois la partie finie
  const played = useRef(false); // la balise « partie jouée » ne part qu'une fois par page
  const [, setTick] = useState(0);

  function play() {
    if (!running && !solved && !revealed) {
      startedAt.current = Date.now();
      setElapsed(null);
      setRunning(true);
    }
    if (!played.current) {
      played.current = true;
      trackPlay();
    }
  }

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTick((count) => count + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if ((solved || revealed) && running) {
      setElapsed(Date.now() - startedAt.current);
      setRunning(false);
    }
  }, [solved, revealed, running]);

  // La grille complète et juste se termine d'elle-même : le « Bravo » n'attend pas un clic sur le joker,
  // qui reste le geste pour souligner les erreurs en cours de route. L'effet ne regarde que le basculement
  // de `complete` : le vérifier à chaque frappe ne ferait que refuser ce qu'il vient d'accorder.
  const everyLetter = Object.keys(mini.solution);
  const complete = everyLetter.length > 0 && everyLetter.every((key) => entries[key] === mini.solution[key]);
  useEffect(() => {
    if (complete && !solved && !revealed) check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete]);

  // Le coup d'œil défile tout seul ; à la fin, la grille du joueur revient et le clavier se rouvre
  useEffect(() => {
    if (peekLeft === null) return;
    if (peekLeft <= 0) {
      setPeekLeft(null);
      inputRef.current?.focus();
      return;
    }
    const timer = setTimeout(() => setPeekLeft((left) => (left == null ? null : left - 1)), 1000);
    return () => clearTimeout(timer);
  }, [peekLeft, inputRef]);

  const restartGame = () => {
    restart();
    setRunning(false);
    setElapsed(null);
  };

  const utiliserJoker = () => {
    setJokers((tours) => tours + 1);
    check();
  };
  const clicJoker = () => {
    // La première fois, le joker s'explique : on sait ce qu'on dépense avant de le faire
    if (jokers === 0) setAskJoker(true);
    else utiliserJoker();
  };

  const print = async () => {
    const blank = blankRef.current?.querySelector("svg");
    if (!blank) return;
    setPrinting(true);
    try {
      // La grille seule : la solution ne s'imprime pas, elle se joue
      await exportPdf(title, blank, null);
      trackPdfExport();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "L'impression a échoué.");
    } finally {
      setPrinting(false);
    }
  };

  /** Le lien seul, jamais une partie : la feuille de partage du téléphone, sinon le presse-papiers. */
  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${title} — ${site.name}`, url });
        return;
      } catch (error) {
        // Le partage fermé sans partir : un changement d'avis, pas un échec à signaler
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Lien copié — envoie la grille à qui tu veux.");
    } catch {
      toast.error("Le lien n’a pas pu être copié.");
    }
  };

  // Les horizontaux d'abord, puis les verticaux, chacun dans l'ordre de lecture
  const byDirection = [...mini.words].sort(
    (a, b) => Number(a.direction === "down") - Number(b.direction === "down") || a.y - b.y || a.x - b.x,
  );

  const peeking = peekLeft !== null;
  const letters = peeking ? mini.solution : entries; // pendant le coup d'œil, la grille complétée
  const shown = {
    ...mini.grid,
    cells: mini.grid.cells.map((cell) => (cell.is_black ? cell : { ...cell, char: letters[keyOf(cell)] ?? "" })),
  };
  const mystery = mini.grid.mystery;
  const finished = solved || revealed;
  // Le sens des mots (ADR 0028) : seulement la partie finie, jamais pendant (pas même demandé à l'API avant)
  const sens = useSensDesMots(mini.words.map((word) => word.text), finished);
  const clock = running ? Date.now() - startedAt.current : elapsed;

  return (
    <section aria-label={title}>
      {/* La définition en cours colle en haut de l'écran (sous l'en-tête à partir de la tablette, 7,125 rem) : clavier
          ouvert ou grande grille, elle reste lisible */}
      <div data-collant className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-4 bg-background px-4 py-2 md:top-[7.125rem] md:mx-0 md:px-0">
        <p className="min-h-7 flex-1 text-lg font-semibold text-foreground" aria-live="polite" data-testid="grid-clue">
          {current && definition ? `${definition} (${plural(current.text.length, "lettre")})` : " "}
        </p>
        <p className="shrink-0 font-mono text-sm text-muted-foreground" data-testid="grid-chrono" aria-label="Temps de la partie">
          {clock != null ? chrono(clock) : "0:00"}
        </p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Touche une case ou une définition, puis tape. Tab change de sens, Entrée passe au mot suivant.
        {mystery ? " Les cases numérotées remplissent le mot mystère." : ""}
      </p>
      {peeking && (
        <p className="mt-3 flex items-center justify-center gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-sm text-foreground" data-testid="grid-peek">
          <Eye className="h-4 w-4 shrink-0" aria-hidden />
          La solution, encore {plural(peekLeft ?? 0, "seconde")}…
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setPeekLeft(null)}>J’ai vu</Button>
        </p>
      )}
      {/* En dessous de 64 px par case, les définitions ne se lisent plus : sur un écran étroit, la grille garde cette
          taille et défile de côté. Les grilles de 6 colonnes (format téléphone) descendent à 56 px : elles tiennent
          sans défiler de 375 à 430 px de large, et leurs définitions se lisent aussi en clair dessous */}
      <div className={`-mx-4 mt-3 overflow-x-auto px-4 ${peeking ? "pointer-events-none" : ""}`}>
        <div className="relative mx-auto max-w-3xl" style={{ minWidth: mini.grid.width * (mini.grid.width <= 6 ? 56 : 64) }}>
          <GridSvg
            grid={shown}
            variant="lettres"
            definitions={mini.definitions}
            selectedCell={cursor}
            onSelectCell={selectCell}
            litCells={current?.cells}
            unknownCells={wrong}
            letterFont={HAND_FONT}
            mysteryLetters={mystery ? mysteryPlayed(mini, letters) : undefined}
          />
          <SaisieGrille
            inputRef={inputRef}
            cursor={cursor}
            onLetters={ecrire}
            onBackspace={effacer}
            onKeyDown={onKeyDown}
            enterKeyHint="next"
            disabled={peeking}
            // Revenir à la saisie reprend où l'on en était ; seul un début de partie va au premier mot
            onFocus={() => !cursor && mini.words[0] && goTo(mini.words[0])}
          />
        </div>
      </div>
      {finished && (
        <div className="mt-4 rounded-lg border bg-secondary/30 p-4 text-center" data-testid="grid-end">
          <p className="text-lg font-semibold text-foreground">
            {solved ? "Bravo, la grille est juste !" : "Voici la solution."}
          </p>
          {solved && clock != null && (
            <p className="mt-1 text-sm text-muted-foreground">Terminée en {inWords(clock)}.</p>
          )}
          {mystery && (
            <p className="mt-1 text-sm text-muted-foreground">
              Le mot mystère était {mystery.word}.
            </p>
          )}
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Button asChild size="sm">
              <Link href="/grid">Crée la tienne</Link>
            </Button>
            <Button size="sm" variant="outline" onClick={restartGame}>Rejouer</Button>
          </div>
        </div>
      )}
      {finished && Object.keys(sens).length > 0 && (
        <details open className="mt-4 rounded-md border p-3" data-testid="sens-des-mots">
          <summary className="cursor-pointer text-sm font-medium">Les mots de la grille et leur sens</summary>
          <ul className="mt-3 space-y-2">
            {mini.words.filter((word) => sens[word.text]).map((word) => (
              <li key={`${word.text}-${word.x}-${word.y}-${word.direction}`}>
                <p className="text-sm">
                  <span className="font-mono font-semibold">{word.text}</span>
                  {mini.cluesByWord[word.text] && (
                    <span className="ml-2 italic text-muted-foreground">« {mini.cluesByWord[word.text]} »</span>
                  )}
                </p>
                <SensTexte word={word.text} sens={sens[word.text]} />
              </li>
            ))}
          </ul>
          <SensMention className="mt-3 border-t pt-3" />
        </details>
      )}
      {/* Dans la grille, les définitions ont leur taille d'imprimé : trop petites pour un écran. Les voici en clair. */}
      <ol className="mt-4 gap-x-6 text-sm sm:columns-2 lg:columns-3" aria-label="Les définitions">
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
        {!finished && (
          <>
            <Button size="sm" onClick={clicJoker} data-testid="joker-button">
              Joker{jokers > 0 ? ` · ${jokers}` : ""}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAskSolution(true)}>Voir la solution</Button>
          </>
        )}
        <Button size="sm" variant="ghost" onClick={restartGame}>Recommencer</Button>
        <Button size="sm" variant="outline" disabled={printing} onClick={print}>
          {printing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
          Imprimer
        </Button>
        <Button size="sm" variant="outline" onClick={share} data-testid="share-button">
          <Share2 className="mr-2 h-4 w-4" aria-hidden />
          Partager
        </Button>
      </div>
      <p className="mt-3 min-h-5 text-center text-sm text-foreground" role="status">{message}</p>

      {/* Le joker, la première fois : qu'il s'explique avant d'agir */}
      <Dialog open={askJoker} onOpenChange={setAskJoker}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Utiliser le joker ?</DialogTitle>
            <DialogDescription>
              Le joker vérifie les cases déjà complétées : une lettre fausse s’y souligne en rouge. Il
              n’écrit rien à ta place.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">Pas maintenant</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button size="sm" onClick={utiliserJoker}>Utiliser le joker</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* La solution ne se dévoile pas par mégarde : un coup d’œil ou l’abandon, en connaissance de cause */}
      <Dialog open={askSolution} onOpenChange={setAskSolution}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Dévoiler la solution ?</DialogTitle>
            <DialogDescription>
              Un coup d’œil de trois secondes, le temps de débloquer une case — ou la grille dévoilée pour
              de bon, et la partie s’arrête là.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">Annuler</Button>
            </DialogClose>
            {!finished && (
              <DialogClose asChild>
                <Button variant="outline" size="sm" onClick={reveal}>Abandonner</Button>
              </DialogClose>
            )}
            <DialogClose asChild>
              <Button size="sm" onClick={() => setPeekLeft(PEEK_SECONDS)}>Regarder vite fait (3 s)</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Le rendu du PDF : hors cadre mais mis en page, sinon l'export ne mesure rien */}
      <div ref={blankRef} aria-hidden className="pointer-events-none absolute -left-[9999px] top-0 w-[640px]">
        <GridSvg grid={mini.grid} variant="vierge" definitions={mini.definitions} />
      </div>
    </section>
  );
}
