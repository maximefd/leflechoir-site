"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowRight,
  Bold,
  Check,
  Download,
  FileText,
  Italic,
  Pencil,
  Redo2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { withNext } from "@/lib/next-path";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/contexts/auth-context";
import { useDebounce } from "@/hooks/use-debounce";
import { GridSvg, clueKey, wrapDefinition, type Clue } from "@/components/grid/grid-svg";
import { LetterPanel, WordReview, type PlacedWord } from "@/components/grid/letter-panel";
import { HandTutorial, type TutorialStep } from "@/components/grid/hand-tutorial";
import { MysteryPanel } from "@/components/grid/mystery-panel";
import { brokenDescription, movedNumbers } from "@/lib/mystery";

/** Les étapes qu'on peut passer (« Je les place moi-même », « Suivant ») et celle qui les suit. */
const NEXT_STEP: Partial<Record<TutorialStep, TutorialStep>> = { 1: 2, 2: 3, 3: 4, 6: 7 };
import type { GridData } from "@/components/grid/grid-display";
import { exportJson, exportPdf } from "@/lib/grid-export";

/** Ce qui sort des conventions des layouts : signalé, jamais refusé (roadmap, point 5A). */
type LayoutWarning = { kind: string; message: string; cells: [number, number][] };

type GridContent = GridData & {
  clues?: Clue[];
  words: PlacedWord[];
  unknown_words?: string[];
  layout_warnings?: LayoutWarning[];
  /** Les définitions déjà écrites pour ces mots dans les dictionnaires de l'auteur (#91), par mot. */
  dictionary_definitions?: Record<string, { definition: string; dictionary: string }[]>;
};

type SavedGrid = {
  id: number;
  name: string;
  grid: GridContent;
  definitions: Record<string, string>;
  notes: string;
  archived: boolean;
};

type Mode = "lettres" | "definitions" | "apercu";

/**
 * Le travail sur une grille, dans l'ordre où il se fait : on ne définit pas un mot qu'on va
 * remplacer, et la mise en forme ne se juge qu'une fois les définitions écrites.
 */
const STEPS: { mode: Mode; label: string }[] = [
  { mode: "lettres", label: "Relire les mots" },
  { mode: "definitions", label: "Définitions" },
  { mode: "apercu", label: "Mise en page et export" },
];

type CellEdit = { x: number; y: number; char: string };
/** Une case lettre devenue case définition, ou l'inverse. */
type BlockEdit = { x: number; y: number; is_black: boolean };
/** Une modification de la grille, telle qu'on l'envoie et telle qu'on l'annule. */
type GridEdit = { cells?: CellEdit[]; blocks?: BlockEdit[] };

/**
 * La grille tient dans la fenêtre, quelle qu'elle soit.
 *
 * On travaille une grille en la voyant **entière** : un 13×18 qui déborde oblige à faire défiler
 * entre deux lettres. Plutôt qu'une marge fixe — qui suppose une hauteur d'en-tête et se trompe dès
 * qu'on change de fenêtre —, la colonne occupe la hauteur disponible et le dessin prend ce qui
 * reste (`flex-1` + `min-h-0`), la largeur suivant le rapport du SVG.
 *
 * Seulement sur grand écran (`lg:`), où la colonne a une hauteur. En dessous, elle n'en a pas : `h-full` ne
 * repose sur rien, et Safari (WebKit) réduisait le dessin à rien, alors que l'export PDF, dessiné en
 * `h-auto w-full`, restait bon. Sur téléphone, la grille prend donc la largeur, et le défilement fait le reste.
 */
const FITS_SCREEN = "h-auto w-full lg:h-full lg:max-h-full lg:w-auto lg:max-w-full";

/**
 * L'éditeur d'une grille conservée : définitions, lettres, notes, export.
 *
 * Les définitions s'écrivent **sur la grille remplie** — définir un mot qu'on ne voit pas n'a pas de
 * sens. La grille vierge et la solution sont rendues en même temps, hors cadre : ce sont elles qui
 * partent au PDF, et un SVG absent au moment de l'export ne se dessine pas.
 */
export function GridEditor({ gridId }: { gridId: number }) {
  const { isAuthenticated, isLoading: isSessionLoading } = useAuth();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>("lettres");
  const [selected, setSelected] = useState<string | null>(null);
  const [definitions, setDefinitions] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [content, setContent] = useState<GridContent | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [direction, setDirection] = useState<"across" | "down">("across");
  const [draftName, setDraftName] = useState<string | null>(null);
  const [isExporting, setExporting] = useState(false);
  const [bold, setBold] = useState(true);
  const [italic, setItalic] = useState(false);
  // L'export attend une confirmation quand la grille n'est pas finie : `true` = avec la solution
  const [pendingPdf, setPendingPdf] = useState<boolean | null>(null);
  // Annulation : on garde les **lettres d'avant**, pas des copies de grille. Une correction ne
  // touche que quelques cases, et l'inverse d'une pose de lettre est une autre pose de lettre.
  const [past, setPast] = useState<GridEdit[]>([]);
  // Changement de case en attente de confirmation : il sortirait des conventions des layouts
  const [pendingBlock, setPendingBlock] = useState<{ edit: GridEdit; warnings: LayoutWarning[] } | null>(null);
  const [future, setFuture] = useState<GridEdit[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const blankRef = useRef<HTMLDivElement>(null);
  const lettersRef = useRef<HTMLDivElement>(null);
  // Fermer l'avertissement d'export rend le focus au bouton PDF, sauf si l'on part compléter
  const writeAfterDialog = useRef(false);
  const solutionRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useQuery<SavedGrid, Error>({
    queryKey: ["saved-grids", gridId],
    queryFn: () => apiFetch(`/api/grids/${gridId}`),
    enabled: isAuthenticated,
  });

  /**
   * Le texte en cours de frappe ne se recharge pas.
   *
   * Chaque lettre posée invalide la requête, donc les données reviennent du serveur pendant que
   * l'auteur écrit ses notes. Réappliquer la réponse effacerait ce qu'il est en train de taper :
   * définitions et notes ne sont donc lues qu'à l'ouverture de la grille. Le contenu de la grille,
   * lui, vient toujours du serveur — c'est lui qui recalcule les mots.
   */
  const seeded = useRef<number | null>(null);
  useEffect(() => {
    if (!data) return;
    setContent(data.grid);
    if (seeded.current === gridId) return;
    seeded.current = gridId;
    setDefinitions(data.definitions ?? {});
    setNotes(data.notes ?? "");
    // Une grille neuve s'ouvre sur la relecture ; une grille déjà entamée, là où on l'avait laissée
    setMode(Object.values(data.definitions ?? {}).some(Boolean) ? "definitions" : "lettres");
  }, [data, gridId]);

  useEffect(() => {
    try {
      setBold(localStorage.getItem("terminator:definitions-grasses") !== "non");
      setItalic(localStorage.getItem("terminator:definitions-italiques") === "oui");
    } catch {
      // Stockage refusé (navigation privée) : on garde la valeur par défaut
    }
  }, []);

  const remember = (key: string, value: boolean) => {
    try {
      localStorage.setItem(key, value ? "oui" : "non");
    } catch {
      // Sans stockage, le réglage ne survit pas au rechargement : pas une raison d'échouer
    }
  };
  const changeBold = (next: boolean) => {
    setBold(next);
    remember("terminator:definitions-grasses", next);
  };
  const changeItalic = (next: boolean) => {
    setItalic(next);
    remember("terminator:definitions-italiques", next);
  };

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`/api/grids/${gridId}`, { method: "PATCH", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saved-grids"] }),
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });
  const patchRef = useRef(patch);
  patchRef.current = patch;

  // Enregistrement au fil de la frappe, définitions et notes : rien à cliquer, rien à perdre
  const pending = JSON.stringify({ definitions, notes });
  const settled = useDebounce(pending, 600);
  const saved = useRef<string | null>(null);
  useEffect(() => {
    if (!data) return;
    if (saved.current === null) saved.current = JSON.stringify({ definitions: data.definitions ?? {}, notes: data.notes ?? "" });
    if (settled === saved.current) return;
    saved.current = settled;
    patchRef.current.mutate(JSON.parse(settled));
    // `data` change à chaque enregistrement réussi : le mettre en dépendance relancerait la boucle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);

  /**
   * Quitter un champ enregistre sans attendre.
   *
   * L'attente de 600 ms suffit tant qu'on continue de taper ; elle ne suffit pas si on ferme
   * l'onglet dans la foulée. Le départ du curseur est le signal le plus sûr que la phrase est finie.
   */
  const flush = () => {
    if (pending === saved.current) return;
    saved.current = pending;
    patchRef.current.mutate(JSON.parse(pending));
  };

  /** Ordre de travail : celui de la lecture d'une grille, et la moitié haute avant la basse. */
  const clues = useMemo(() => {
    const list = [...(content?.clues ?? [])];
    list.sort((a, b) =>
      (a.cell_y ?? 0) - (b.cell_y ?? 0) ||
      (a.cell_x ?? 0) - (b.cell_x ?? 0) ||
      (a.exit === "right" ? 0 : 1) - (b.exit === "right" ? 0 : 1),
    );
    return list;
  }, [content]);

  // Le mot choisi peut disparaître quand l'auteur déplace une case définition : on repart du premier
  useEffect(() => {
    if (clues.length > 0 && !clues.some((clue) => clueKey(clue) === selected)) setSelected(clueKey(clues[0]));
  }, [clues, selected]);

  // Sur une grande grille, le mot suivant tombe souvent hors écran : on le ramène sans sautiller
  useEffect(() => {
    if (!selected) return;
    document.querySelector(`[data-clue="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: "nearest" });
    document.querySelector(`[data-clue-row="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const move = useCallback(
    (step: number) => {
      if (clues.length === 0) return;
      const index = clues.findIndex((clue) => clueKey(clue) === selected);
      setSelected(clueKey(clues[(index + step + clues.length) % clues.length]));
      inputRef.current?.focus();
    },
    [clues, selected],
  );

  /** Le mot qui passe par une case dans un sens donné, tel que le serveur l'a recalculé. */
  const wordAt = useCallback(
    (cell: { x: number; y: number } | null, wanted: "across" | "down"): PlacedWord | null => {
      if (!cell || !content) return null;
      return (
        content.words.find((word) => {
          if (word.direction !== wanted) return false;
          const length = word.length ?? word.text.length;
          return wanted === "across"
            ? word.y === cell.y && cell.x >= word.x && cell.x < word.x + length
            : word.x === cell.x && cell.y >= word.y && cell.y < word.y + length;
        }) ?? null
      );
    },
    [content],
  );

  // Grille vide faite à la main : l'allure classique reste proposée tant que la première ligne et la première
  // colonne n'ont ni lettre ni toutes leurs cases définitions (l'auteur peut changer d'avis)
  const classicBlocks: BlockEdit[] = useMemo(
    () =>
      (content?.cells ?? [])
        .filter((cell) => (cell.y === 0 && cell.x % 2 === 0) || (cell.x === 0 && cell.y % 2 === 0))
        .map((cell) => ({ x: cell.x, y: cell.y, is_black: true })),
    [content],
  );
  /**
   * Le troisième départ (#221) : une géométrie de style magazine tirée par le moteur (`POST /api/grids/geometry`),
   * posée comme toute modification de la grille, donc annulable. Seulement sur une grille sans lettre.
   */
  const canDrawMagazine = Boolean(
    content?.layout === "manuel" && content.width >= 5 && content.height >= 5 && !content.cells.some((cell) => cell.char),
  );
  const [isDrawing, setDrawing] = useState(false);
  const drawMagazine = async () => {
    if (!content) return false;
    setDrawing(true);
    try {
      const { rows } = (await apiFetch("/api/grids/geometry", {
        method: "POST",
        body: { width: content.width, height: content.height },
      })) as { rows: string[] };
      const blocks = content.cells
        .filter((cell) => (rows[cell.y]?.[cell.x] === "x") !== cell.is_black)
        .map((cell) => ({ x: cell.x, y: cell.y, is_black: !cell.is_black }));
      if (blocks.length) await writeEdit({ blocks });
      return true;
    } catch (drawError) {
      toast.error(drawError instanceof Error ? drawError.message : "La géométrie n'a pas pu être tirée.");
      return false;
    } finally {
      setDrawing(false);
    }
  };
  const canPrefill = Boolean(
    content?.layout === "manuel" &&
      classicBlocks.length > 0 &&
      (content?.cells ?? []).every((cell) => (cell.x > 0 && cell.y > 0) || !cell.char) &&
      classicBlocks.some(({ x, y }) => !content?.cells.find((cell) => cell.x === x && cell.y === y)?.is_black),
  );
  // Tutoriel de la grille faite à la main : à chaque grille encore vide, une étape à la fois, jusqu'aux
  // définitions. `guided` reste vrai tant que l'auteur ne l'a pas passé : l'étape suivante revient d'elle-même.
  const [tutorial, setTutorial] = useState<TutorialStep | null>(null);
  const [guided, setGuided] = useState(false);
  const tutorialFor = useRef<number | null>(null);
  const hasDefinitions = Boolean(content?.cells.some((cell) => cell.is_black));
  const isEmptyGrid = Boolean(content && !content.cells.some((cell) => cell.char));
  const isFullGrid = Boolean(
    content && !isEmptyGrid && content.cells.every((cell) => cell.is_black || cell.char),
  );
  const isHandMade = content?.layout === "manuel" || content?.seed === null;
  useEffect(() => {
    if (!content || tutorialFor.current === gridId) return;
    tutorialFor.current = gridId;
    if (isHandMade && isEmptyGrid) {
      setGuided(true);
      setTutorial(hasDefinitions ? 2 : 1);
    }
  }, [content, gridId, isHandMade, isEmptyGrid, hasDefinitions]);
  // Le parcours guidé avance aussi selon ce que fait l'auteur, par n'importe quel chemin (onglet, bouton du
  // bas, bouton du tutoriel) ; jamais en arrière : `reached` retient l'étape la plus avancée déjà montrée
  const reached = useRef(0);
  useEffect(() => {
    if (tutorial !== null && tutorial > reached.current) reached.current = tutorial;
  }, [tutorial]);
  const allDefined = (content?.clues ?? []).length > 0
    && (content?.clues ?? []).every((clue) => (definitions ?? {})[clueKey(clue)]);
  useEffect(() => {
    if (!guided) return;
    const show = (step: TutorialStep) => {
      if (step > reached.current) setTutorial(step);
    };
    if (mode === "lettres" && isFullGrid) show(5);
    if (mode === "definitions" && !allDefined) show(6);
    if (mode === "definitions" && allDefined) show(8);
  }, [guided, isFullGrid, mode, allDefined]);
  // Les étapes 2, 3 et 6 avancent d'elles-mêmes dès qu'un mot ou une définition de plus est écrit pendant
  // l'étape : rejouer le tutoriel sur une grille commencée montre donc chaque étape
  const completeWords = (content?.words ?? []).filter((word) => !word.text.includes("?")).length;
  const writtenDefinitions = Object.values(definitions ?? {}).filter(Boolean).length;
  const progressAtStep = useRef({ words: 0, definitions: 0 });
  useEffect(() => {
    progressAtStep.current = { words: completeWords, definitions: writtenDefinitions };
    // Seulement au changement d'étape : le compte de départ est celui du moment où elle s'ouvre
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorial]);
  useEffect(() => {
    if ((tutorial === 2 || tutorial === 3) && completeWords > progressAtStep.current.words) {
      setTutorial(tutorial === 2 ? 3 : 4);
    }
    if (tutorial === 6 && writtenDefinitions > progressAtStep.current.definitions) setTutorial(7);
  }, [tutorial, completeWords, writtenDefinitions]);
  const replayTutorial = () => {
    reached.current = 0;
    setGuided(true);
    setTutorial(mode === "lettres" ? (hasDefinitions ? 2 : 1) : 6);
    if (mode === "apercu") setMode("definitions");
  };

  const currentWord = wordAt(cursor, direction);
  const cursorCell = cursor ? content?.cells.find((cell) => cell.x === cursor.x && cell.y === cursor.y) ?? null : null;
  // Un même avertissement peut viser plusieurs endroits : on le dit une fois, avec le compte
  const layoutWarnings = useMemo(() => {
    const counts = new Map<string, number>();
    // Une case définition qui n'annonce rien existe dans deux layouts du catalogue : on ne la signale
    // qu'au moment où l'auteur en crée une (demande de confirmation)
    for (const warning of (content?.layout_warnings ?? []).filter((w) => w.kind !== "case_vide")) {
      counts.set(warning.message, (counts.get(warning.message) ?? 0) + 1);
    }
    return [...counts].map(([message, count]) => ({ message, count }));
  }, [content]);
  const crossingWord = wordAt(cursor, direction === "across" ? "down" : "across");
  const litCells = currentWord
    ? Array.from({ length: currentWord.length ?? currentWord.text.length }, (_, i) =>
        currentWord.direction === "across"
          ? `${currentWord.x + i}-${currentWord.y}`
          : `${currentWord.x}-${currentWord.y + i}`,
      )
    : [];

  /** Les cases des mots hors lexique : elles se soulignent dans la grille. */
  const unknownCells = useMemo(() => {
    if (!content) return [];
    return content.words
      .filter((word) => word.in_lexicon === false)
      .flatMap((word) =>
        Array.from({ length: word.length ?? word.text.length }, (_, i) =>
          word.direction === "across" ? `${word.x + i}-${word.y}` : `${word.x}-${word.y + i}`,
        ),
      );
  }, [content]);

  /** Ce qu'il faudrait réécrire pour revenir à l'état actuel de ces cases. */
  const inverseOf = (edit: GridEdit): GridEdit => {
    const cellAt = (x: number, y: number) => content?.cells.find((cell) => cell.x === x && cell.y === y);
    return {
      ...(edit.cells ? { cells: edit.cells.map(({ x, y }) => ({ x, y, char: cellAt(x, y)?.char ?? "" })) } : {}),
      ...(edit.blocks
        ? { blocks: edit.blocks.map(({ x, y }) => ({ x, y, is_black: Boolean(cellAt(x, y)?.is_black) })) }
        : {}),
    };
  };

  const writeLetters = (cells: CellEdit[], remember = true) => writeEdit({ cells }, remember);

  const writeEdit = async (edit: GridEdit, remember = true) => {
    const before = inverseOf(edit);
    try {
      const updated = await apiFetch(`/api/grids/${gridId}`, { method: "PATCH", body: edit });
      // Une lettre numérotée corrigée : son numéro passe sur une autre case, et l'auteur doit le savoir (#218)
      const moved = movedNumbers(content?.mystery, updated.grid.mystery);
      if (moved.length > 0) {
        toast.info(
          moved.length > 1
            ? `Mot mystère : les numéros ${moved.join(", ")} ont changé de case, leur lettre a changé.`
            : `Mot mystère : le numéro ${moved[0]} a changé de case, sa lettre a changé.`,
        );
      }
      setContent(updated.grid);
      if (remember) {
        setPast((stack) => [...stack.slice(-49), before]);
        setFuture([]);
      }
      queryClient.invalidateQueries({ queryKey: ["saved-grids"] });
      return before;
    } catch (writeError) {
      toast.error(writeError instanceof Error ? writeError.message : "La lettre n'a pas pu être posée.");
      return null;
    }
  };

  /**
   * Transforme une case, après avoir prévenu si le changement sort des conventions des layouts :
   * l'auteur décide, mais en connaissance de cause. Seuls les avertissements nouveaux comptent.
   */
  const toggleBlock = async (block: BlockEdit) => {
    const edit: GridEdit = { blocks: [block] };
    // Tant qu'aucune lettre n'est écrite, toute case définition est « hors règles » : on ne dérange pas
    if (isEmptyGrid) {
      void writeEdit(edit);
      return;
    }
    try {
      const preview = await apiFetch(`/api/grids/${gridId}`, { method: "PATCH", body: { ...edit, preview: true } });
      const before = content?.layout_warnings ?? [];
      const same = (a: LayoutWarning, b: LayoutWarning) =>
        a.kind === b.kind && JSON.stringify(a.cells) === JSON.stringify(b.cells);
      const added = (preview.layout_warnings as LayoutWarning[]).filter((w) => !before.some((b) => same(w, b)));
      if (added.length > 0) {
        setPendingBlock({ edit, warnings: added });
        return;
      }
    } catch {
      // Sans aperçu, on applique : le serveur refusera de toute façon ce qui est impossible
    }
    void writeEdit(edit);
  };

  const undo = async () => {
    const last = past[past.length - 1];
    if (!last) return;
    const redoEntry = await writeEdit(last, false);
    if (!redoEntry) return;
    setPast((stack) => stack.slice(0, -1));
    setFuture((stack) => [...stack, redoEntry]);
  };

  const redo = async () => {
    const next = future[future.length - 1];
    if (!next) return;
    const undoEntry = await writeEdit(next, false);
    if (!undoEntry) return;
    setFuture((stack) => stack.slice(0, -1));
    setPast((stack) => [...stack, undoEntry]);
  };

  const selectCell = (cell: { x: number; y: number }) => {
    setPendingBlock(null);
    // Un second clic sur la même case change de sens : c'est le geste des grilles croisées.
    // Mais seulement si un mot y passe dans l'autre sens — sinon le panneau se viderait sans raison.
    if (cursor && cursor.x === cell.x && cursor.y === cell.y) {
      const other = direction === "across" ? "down" : "across";
      if (wordAt(cell, other)) setDirection(other);
      return;
    }
    setCursor(cell);
    // Une case au croisement d'un seul mot : on prend ce sens-là plutôt que de laisser le vide
    if (!wordAt(cell, direction)) {
      const other = direction === "across" ? "down" : "across";
      if (wordAt(cell, other)) setDirection(other);
    }
  };

  const onLetterKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!content) return;
    // Annuler et rétablir marchent même sans case sélectionnée
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      void undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      void redo();
      return;
    }
    if (!cursor) return;
    // Une case définition ne reçoit pas de lettre : elle se transforme depuis le panneau
    if (content.cells.some((cell) => cell.x === cursor.x && cell.y === cursor.y && cell.is_black)) return;

    const isLetter = /^[a-zA-ZàâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]$/.test(event.key);
    const inGrid = (cell: { x: number; y: number }) =>
      content.cells.some((candidate) => candidate.x === cell.x && candidate.y === cell.y && !candidate.is_black);
    const letterAt = (cell: { x: number; y: number }) =>
      content.cells.find((candidate) => candidate.x === cell.x && candidate.y === cell.y)?.char ?? "";

    // Retour arrière : on efface la case courante si elle porte une lettre, sinon on recule et on
    // efface celle d'avant. Maintenu, il remonte le mot en le vidant — c'est le geste attendu.
    if (event.key === "Backspace") {
      event.preventDefault();
      const back =
        direction === "across" ? { x: cursor.x - 1, y: cursor.y } : { x: cursor.x, y: cursor.y - 1 };
      if (letterAt(cursor)) {
        void writeLetters([{ ...cursor, char: "" }]);
        if (inGrid(back)) setCursor(back);
      } else if (inGrid(back)) {
        void writeLetters([{ ...back, char: "" }]);
        setCursor(back);
      }
      return;
    }
    // Suppr efface sans bouger : utile quand on nettoie une case au milieu d'un mot
    if (event.key === "Delete") {
      event.preventDefault();
      void writeLetters([{ ...cursor, char: "" }]);
      return;
    }

    if (isLetter) {
      event.preventDefault();
      // Le moteur travaille en majuscules sans accent : on y ramène la frappe
      const char = event.key.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
      void writeLetters([{ x: cursor.x, y: cursor.y, char }]);
      const next =
        direction === "across" ? { x: cursor.x + 1, y: cursor.y } : { x: cursor.x, y: cursor.y + 1 };
      if (inGrid(next)) setCursor(next);
      return;
    }

    const moves: Record<string, { x: number; y: number }> = {
      ArrowRight: { x: 1, y: 0 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowDown: { x: 0, y: 1 },
      ArrowUp: { x: 0, y: -1 },
    };
    if (moves[event.key]) {
      event.preventDefault();
      const next = { x: cursor.x + moves[event.key].x, y: cursor.y + moves[event.key].y };
      if (inGrid(next)) setCursor(next);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      setDirection((previous) => (previous === "across" ? "down" : "across"));
    }
  };

  const clearWord = () => {
    if (!currentWord) return;
    void writeLetters(
      Array.from({ length: currentWord.length ?? currentWord.text.length }, (_, index) => ({
        x: currentWord.direction === "across" ? currentWord.x + index : currentWord.x,
        y: currentWord.direction === "down" ? currentWord.y + index : currentWord.y,
        char: "",
      })),
    );
  };

  const replaceWord = (word: string) => {
    if (!currentWord) return;
    const at = (index: number) => ({
      x: currentWord.direction === "across" ? currentWord.x + index : currentWord.x,
      y: currentWord.direction === "down" ? currentWord.y + index : currentWord.y,
    });
    const cells = [...word].map((char, index) => ({ ...at(index), char }));
    // Un mot plus court que l'emplacement est suivi d'une case définition : un seul geste, une seule annulation
    const length = currentWord.length ?? currentWord.text.length;
    void writeEdit(word.length < length ? { blocks: [{ ...at(word.length), is_black: true }], cells } : { cells });
  };

  if (isSessionLoading || (isAuthenticated && isLoading)) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Chargement…</p>;
  }
  if (!isAuthenticated) {
    return (
      <main className="container mx-auto max-w-xl p-8 text-center">
        <h1 className="text-2xl font-bold">Cette grille demande un compte</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Les grilles conservées appartiennent à celui qui les a gardées.
        </p>
        <Button asChild className="mt-4" size="sm">
          <Link href={withNext("/login", `/grids/edit?id=${gridId}`)}>Se connecter</Link>
        </Button>
      </main>
    );
  }
  if (error || !data || !content) {
    return (
      <main className="container mx-auto max-w-xl p-8 text-center">
        <p className="text-sm text-destructive">{error?.message ?? "Grille introuvable."}</p>
        <Button asChild variant="outline" className="mt-4" size="sm">
          <Link href="/grids">Retour à mes grilles</Link>
        </Button>
      </main>
    );
  }

  const selectedClue = clues.find((clue) => clueKey(clue) === selected) ?? null;
  const defined = clues.filter((clue) => definitions[clueKey(clue)]?.trim()).length;
  const missing = clues.length - defined;
  const percent = clues.length ? Math.round((defined / clues.length) * 100) : 0;
  const current = selectedClue ? definitions[clueKey(selectedClue)] ?? "" : "";
  const sharesItsCell = (clue: Clue) =>
    clues.some((other) => other !== clue && other.cell_x === clue.cell_x && other.cell_y === clue.cell_y);
  const overflows = (clue: Clue, text: string) =>
    Boolean(text) && wrapDefinition(text, clue.arrow, sharesItsCell(clue), bold).overflow;
  const tooLong = clues.filter((clue) => overflows(clue, definitions[clueKey(clue)] ?? ""));
  const unfinished = content.words.filter((word) => word.complete === false || word.text.includes("?"));

  const svgOf = (container: HTMLDivElement | null) => container?.querySelector("svg") ?? null;
  const downloadPdf = async (withSolution: boolean) => {
    const blank = svgOf(blankRef.current);
    if (!blank) return;
    setExporting(true);
    try {
      await exportPdf(data.name, blank, withSolution ? svgOf(solutionRef.current) : null);
    } catch (exportError) {
      toast.error(exportError instanceof Error ? exportError.message : "L'export a échoué.");
    } finally {
      setExporting(false);
    }
  };

  /** Une grille inachevée s'exporte quand même, mais pas sans que l'auteur l'ait su. */
  const requestPdf = (withSolution: boolean) => {
    if (missing > 0 || unfinished.length > 0) setPendingPdf(withSolution);
    else void downloadPdf(withSolution);
  };

  const goToMissing = () => {
    const first = clues.find((clue) => !definitions[clueKey(clue)]?.trim());
    writeAfterDialog.current = true;
    setPendingPdf(null);
    setMode("definitions");
    if (first) setSelected(clueKey(first));
  };

  const toggleArchive = () => {
    const archived = !data.archived;
    patch.mutate(
      { archived },
      {
        onSuccess: () =>
          toast.success(
            archived ? "Grille archivée : elle est rangée dans Mes grilles › Archivées." : "Grille sortie de l'archive.",
          ),
      },
    );
  };

  /** Choisir un mot dans la liste de relecture : le curseur s'y pose, et le clavier suit. */
  const pickWord = (word: PlacedWord) => {
    setCursor({ x: word.x, y: word.y });
    setDirection(word.direction);
    lettersRef.current?.focus();
  };

  return (
    /*
     * Un plan de travail, pas une page qui défile : sur grand écran l'éditeur occupe la fenêtre
     * (moins l'en-tête de 4 rem), la grille prend la hauteur qui reste et le panneau défile seul.
     * En dessous de `lg`, la page redevient un document qu'on fait défiler — une grille et un
     * panneau côte à côte n'y tiendraient pas.
     */
    <main className="container mx-auto flex flex-col p-4 md:p-6 lg:h-[calc(100svh-4rem)] lg:overflow-hidden">
      <div className="mb-4 flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/grids">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Mes grilles
            </Link>
          </Button>
          {draftName === null ? (
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
              {data.name}
              <button
                type="button"
                aria-label="Renommer la grille"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setDraftName(data.name)}
              >
                <Pencil className="h-4 w-4" />
              </button>
              {data.archived && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Archivée
                </span>
              )}
            </h1>
          ) : (
            <Input
              autoFocus
              className="mt-1 max-w-sm text-xl font-semibold"
              aria-label="Nom de la grille"
              maxLength={100}
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={() => {
                const name = draftName.trim();
                if (name && name !== data.name) patch.mutate({ name });
                setDraftName(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") setDraftName(null);
              }}
            />
          )}

          {/* L'avancement, comme dans Mes grilles : c'est la question qu'on se pose en travaillant */}
          <div className="mt-1 w-72 max-w-full">
            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                {missing === 0 && clues.length > 0
                  ? "Définitions complètes"
                  : `${defined} définition${defined > 1 ? "s" : ""} sur ${clues.length}`}
              </span>
              <span className="tabular-nums">{percent} %</span>
            </div>
            <div
              className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Définitions écrites"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={missing === 0 ? "h-full bg-emerald-500" : "h-full bg-amber-500"}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {content.unknown_words && content.unknown_words.length > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-500">
                <AlertTriangle className="h-3.5 w-3.5" />
                {content.unknown_words.length} hors lexique
              </span>
            )}
            {tooLong.length > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-500">
                <AlertTriangle className="h-3.5 w-3.5" />
                {tooLong.length} trop longue{tooLong.length > 1 ? "s" : ""}
              </span>
            )}
            {patch.isPending ? (
              <span>enregistrement…</span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Check className="h-3.5 w-3.5" />
                enregistré
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={isExporting} onClick={() => requestPdf(false)}>
            <FileText className="mr-1 h-4 w-4" />
            PDF
          </Button>
          <Button variant="outline" size="sm" disabled={isExporting} onClick={() => requestPdf(true)}>
            <FileText className="mr-1 h-4 w-4" />
            PDF + solution
          </Button>
          <Button variant="outline" size="sm" disabled={patch.isPending} onClick={toggleArchive}>
            {data.archived ? (
              <>
                <ArchiveRestore className="mr-1 h-4 w-4" />
                Sortir de l&apos;archive
              </>
            ) : (
              <>
                <Archive className="mr-1 h-4 w-4" />
                Archiver
              </>
            )}
          </Button>
        </div>
      </div>

      {/* grid-cols-1 : sur téléphone, la colonne ne dépasse jamais l'écran, quel que soit son contenu */}
      <div className="grid min-h-0 flex-1 items-start gap-6 grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Hauteur **définie** et non plafonnée : sans elle, le `100 %` du dessin n'a rien à quoi se
            rapporter et le SVG reprend sa taille intrinsèque — le piège classique des pourcentages. */}
        <div className="flex min-h-0 flex-col lg:h-full">
          {/* Les étapes, numérotées : on voit par où commencer et où l'on en est */}
          <nav aria-label="Étapes" className="mb-3 shrink-0">
            <ol className="flex flex-wrap gap-1 rounded-md border p-1">
              {STEPS.map((step, index) => {
                const active = mode === step.mode;
                return (
                  <li key={step.mode}>
                    <button
                      type="button"
                      aria-current={active ? "step" : undefined}
                      onClick={() => setMode(step.mode)}
                      className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        active ? "bg-primary text-primary-foreground" : "hover:bg-secondary/60"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${
                          active ? "bg-primary-foreground text-primary" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {index + 1}
                      </span>
                      {step.label}
                      {step.mode === "definitions" && (
                        <span className={`text-xs tabular-nums ${active ? "opacity-80" : "text-muted-foreground"}`}>
                          {percent} %
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          {/* Le tutoriel, au-dessus de la grille et non par-dessus : toutes les cases restent à portée */}
          {tutorial !== null && mode !== "apercu" && (
            <HandTutorial
              step={tutorial}
              onPrefill={() => {
                void writeEdit({ blocks: classicBlocks });
                setTutorial(2);
              }}
              onMagazine={
                canDrawMagazine
                  ? () => {
                      void drawMagazine().then((done) => done && setTutorial(2));
                    }
                  : undefined
              }
              isDrawing={isDrawing}
              onNext={() => setTutorial((step) => (step === null ? null : NEXT_STEP[step] ?? step))}
              onDefinitions={() => {
                setMode("definitions");
                setTutorial(6);
              }}
              onLayout={() => {
                setMode("apercu");
                setTutorial(null);
              }}
              onDone={() => setTutorial(null)}
              onSkip={() => {
                setTutorial(null);
                setGuided(false);
              }}
            />
          )}

          {/* Grille vide créée à la main : l'allure classique, en un clic (roadmap 5B) */}
          {mode === "lettres" && canPrefill && tutorial !== 1 && (
            <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-md border bg-secondary/20 p-2 text-xs">
              <span>
                Placer les cases définitions habituelles : une sur deux sur la première ligne et la première
                colonne ?
              </span>
              <span className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void writeEdit({ blocks: classicBlocks })}>
                  Préremplir
                </Button>
                {canDrawMagazine && (
                  <Button size="sm" variant="outline" disabled={isDrawing} onClick={() => void drawMagazine()}>
                    Grille de magazine au hasard
                  </Button>
                )}
              </span>
            </div>
          )}

          {/* Le mode lettres écoute le clavier : c'est la grille elle-même qui prend le focus */}
          <div
            ref={lettersRef}
            tabIndex={mode === "lettres" ? 0 : -1}
            onKeyDown={mode === "lettres" ? onLetterKey : undefined}
            className="relative flex min-h-0 flex-1 items-start justify-center overflow-hidden rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={mode === "lettres" ? "Grille, correction des lettres" : undefined}
          >
            {mode === "apercu" ? (
              <GridSvg
                grid={content}
                variant="vierge"
                definitions={definitions}
                boldDefinitions={bold}
                italicDefinitions={italic}
                className={FITS_SCREEN}
              />
            ) : mode === "lettres" ? (
              <GridSvg
                grid={content}
                className={FITS_SCREEN}
                variant="lettres"
                definitions={definitions}
                boldDefinitions={bold}
                italicDefinitions={italic}
                selectedCell={cursor}
                onSelectCell={selectCell}
                litCells={litCells}
                unknownCells={unknownCells}
              />
            ) : (
              <GridSvg
                grid={content}
                className={FITS_SCREEN}
                variant="edition"
                definitions={definitions}
                boldDefinitions={bold}
                italicDefinitions={italic}
                selectedKey={selected}
                unknownCells={unknownCells}
                onSelect={(key) => {
                  setSelected(key);
                  inputRef.current?.focus();
                }}
              />
            )}
          </div>

          {mode === "lettres" && (
            <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void undo()} disabled={past.length === 0}>
                <Undo2 className="mr-1 h-4 w-4" />
                Annuler
              </Button>
              <Button variant="outline" size="sm" onClick={() => void redo()} disabled={future.length === 0}>
                <Redo2 className="mr-1 h-4 w-4" />
                Rétablir
              </Button>
              {past.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {past.length} modification{past.length > 1 ? "s" : ""} depuis l&apos;ouverture
                </span>
              )}
              {/* Toujours visibles : Tab, pour changer de sens, ne se devine pas */}
              <p className="w-full text-xs text-muted-foreground">
                Clique une case et tape. <kbd className="rounded border px-1">Tab</kbd> change de sens (horizontal
                ou vertical), les <kbd className="rounded border px-1">flèches</kbd> déplacent le curseur,{" "}
                <kbd className="rounded border px-1">Retour arrière</kbd> efface en remontant,{" "}
                <kbd className="rounded border px-1">Suppr</kbd> efface sur place,{" "}
                <kbd className="rounded border px-1">Ctrl</kbd>+<kbd className="rounded border px-1">Z</kbd> annule.
              </p>
            </div>
          )}

          {mode === "lettres" && cursorCell && (
            <div className="mt-2 flex shrink-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {cursorCell.is_black ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void toggleBlock({ x: cursorCell.x, y: cursorCell.y, is_black: false })}
                >
                  En faire une case lettre
                </Button>
              ) : cursorCell.char ? (
                <span>Efface la lettre pour pouvoir faire de cette case une case définition.</span>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void toggleBlock({ x: cursorCell.x, y: cursorCell.y, is_black: true })}
                >
                  En faire une case définition
                </Button>
              )}
            </div>
          )}

          {mode === "lettres" && pendingBlock && (
            <div role="alertdialog" aria-label="Confirmer le changement de case" className="mt-2 shrink-0 space-y-2 rounded-md border border-amber-500 p-3 text-xs">
              <p className="font-medium">Ce changement donne une grille peu conventionnelle :</p>
              <ul className="list-disc pl-4 text-muted-foreground">
                {[...new Set(pendingBlock.warnings.map((w) => w.message))].map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    void writeEdit(pendingBlock.edit);
                    setPendingBlock(null);
                  }}
                >
                  Transformer quand même
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPendingBlock(null)}>
                  Annuler
                </Button>
              </div>
            </div>
          )}

          {/* Un numéro du mot mystère sans case qui porte sa lettre : la grille imprimée serait fausse (#218) */}
          {mode === "lettres" && content.mystery && (content.mystery.broken ?? []).length > 0 && (
            <div role="status" className="mt-2 shrink-0 rounded-md border border-amber-500/50 p-2 text-xs">
              <p className="font-medium">Mot mystère : {brokenDescription(content.mystery)}.</p>
              <p className="text-muted-foreground">
                Aucune case libre ne porte cette lettre : remets-la dans la grille, ou change de mot dans « Mise en
                page et export ».
              </p>
            </div>
          )}

          {/* Signalé, jamais refusé : l'auteur fait la grille qu'il veut */}
          {mode === "lettres" && layoutWarnings.length > 0 && !isEmptyGrid && (
            <div role="status" className="mt-2 shrink-0 rounded-md border border-amber-500/50 p-2 text-xs">
              <p className="font-medium">Pas conventionnel :</p>
              <ul className="list-disc pl-4 text-muted-foreground">
                {layoutWarnings.map(({ message, count }) => (
                  <li key={message}>
                    {message}
                    {count > 1 ? ` (${count} fois)` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Les rendus de l'export : hors cadre mais mis en page, sinon le PDF ne mesure rien */}
          <div ref={blankRef} aria-hidden className="pointer-events-none absolute -left-[9999px] top-0 w-[640px]">
            <GridSvg
              grid={content}
              variant="vierge"
              definitions={definitions}
              boldDefinitions={bold}
              italicDefinitions={italic}
            />
          </div>
          <div ref={solutionRef} aria-hidden className="pointer-events-none absolute -left-[9999px] top-0 w-[640px]">
            <GridSvg grid={content} variant="solution" />
          </div>
        </div>

        {/* Pendant le tutoriel, le panneau s'efface, sauf quand l'étape y renvoie (suggestions, définition) */}
        <div
          className={`space-y-4 transition-opacity lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-1 ${
            tutorial !== null && [1, 2, 4, 5].includes(tutorial) ? "opacity-40" : ""
          } ${tutorial === 3 || tutorial === 6 ? "rounded-lg ring-2 ring-primary" : ""}`}
        >
          {/* Toujours à portée : revoir le tutoriel ou lire le guide, quand on ne sait plus comment s'y prendre */}
          {mode !== "apercu" && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 p-2 text-xs">
              <span className="font-medium">Besoin d&apos;aide ?</span>
              {/* Le tutoriel est celui de la grille faite à la main : sans objet sur une grille générée */}
              {isHandMade && (
                <Button variant="outline" size="sm" onClick={replayTutorial}>
                  Revoir le tutoriel
                </Button>
              )}
              <Button asChild variant="ghost" size="sm">
                <Link href="/creer-des-mots-fleches" target="_blank" rel="noopener">
                  Lire le guide
                </Link>
              </Button>
            </div>
          )}
          {mode === "lettres" && (
            <>
              <LetterPanel
                gridId={gridId}
                word={currentWord}
                crossing={crossingWord}
                onReplace={replaceWord}
                onClear={clearWord}
                unknownWords={content.unknown_words ?? []}
              />
              <WordReview words={content.words} current={currentWord} onPick={pickWord} />
              {/* Collé en bas du panneau : sous une liste de quarante mots, l'étape suivante se perdrait */}
              <div className="sticky bottom-0 bg-background pb-1 pt-2">
                <Button className="w-full" onClick={() => setMode("definitions")}>
                  Les mots me conviennent : écrire les définitions
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </>
          )}

          {mode === "definitions" && (
            <>
              <div className="rounded-lg border p-4">
                {selectedClue ? (
                  <>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-mono text-xl font-semibold tracking-wide">{selectedClue.text}</p>
                      <p className="text-xs text-muted-foreground">
                        {selectedClue.direction === "across" ? "horizontal" : "vertical"} ·{" "}
                        {selectedClue.text.length} lettres
                      </p>
                    </div>
                    <Input
                      ref={inputRef}
                      aria-label={`Définition de ${selectedClue.text}`}
                      autoFocus
                      maxLength={120}
                      className="mt-2"
                      placeholder="Sa définition, telle qu'elle sera imprimée"
                      value={current}
                      onChange={(event) =>
                        setDefinitions((state) => ({ ...state, [clueKey(selectedClue)]: event.target.value }))
                      }
                      onBlur={flush}
                      onKeyDown={(event) => {
                        if (event.key === "Tab" || event.key === "Enter") {
                          event.preventDefault();
                          move(event.key === "Tab" && event.shiftKey ? -1 : 1);
                        }
                      }}
                    />
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        <kbd className="rounded border px-1">Tab</kbd> ou{" "}
                        <kbd className="rounded border px-1">Entrée</kbd> : mot suivant
                      </span>
                      <span>{current.length}/120</span>
                    </div>
                    {/* #91 : ce que l'auteur a déjà écrit pour ce mot dans ses dictionnaires, à reprendre d'un clic */}
                    {(content.dictionary_definitions?.[selectedClue.text] ?? [])
                      .filter(({ definition }) => definition.slice(0, 120) !== current)
                      .map(({ definition, dictionary }) => (
                        <div
                          key={`${dictionary}-${definition}`}
                          className="mt-2 flex items-start justify-between gap-2 rounded-md bg-secondary/40 p-2 text-xs"
                        >
                          <p>
                            <span className="text-muted-foreground">Dans ton dictionnaire « {dictionary} » : </span>
                            {definition}
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 shrink-0"
                            onClick={() => {
                              // Un clic est un geste fini : enregistré tout de suite, sans l'attente de la frappe
                              const next = { ...definitions, [clueKey(selectedClue)]: definition.slice(0, 120) };
                              setDefinitions(next);
                              saved.current = JSON.stringify({ definitions: next, notes });
                              patchRef.current.mutate({ definitions: next, notes });
                              inputRef.current?.focus();
                            }}
                          >
                            Utiliser
                          </Button>
                        </div>
                      ))}
                    {overflows(selectedClue, current) && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Trop longue pour la case : la fin sera coupée à l&apos;impression.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Aucun mot sélectionné. Choisis-en un dans la grille ou dans la liste.
                  </p>
                )}
              </div>

              <ul className="space-y-0.5 rounded-lg border p-2">
                {clues.map((clue) => {
                  const key = clueKey(clue);
                  const text = definitions[key];
                  return (
                    <li key={key} data-clue-row={key}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(key);
                          inputRef.current?.focus();
                        }}
                        className={`flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          selected === key ? "bg-secondary" : ""
                        }`}
                      >
                        <span className="w-24 shrink-0 font-mono font-semibold">{clue.text}</span>
                        <span className={`truncate ${text ? "text-muted-foreground" : "text-destructive/70"}`}>
                          {text || "à définir"}
                        </span>
                        {overflows(clue, text ?? "") && (
                          <AlertTriangle className="ml-auto h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-500" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="sticky bottom-0 bg-background pb-1 pt-2">
                <Button
                  className="w-full"
                  variant={missing === 0 ? "default" : "outline"}
                  onClick={() => setMode("apercu")}
                >
                  Voir la mise en page et exporter
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </>
          )}

          {mode === "apercu" && (
            <>
              {/* La mise en forme se règle ici, sous les yeux : c'est l'aperçu qui montre son effet */}
              <div className="rounded-lg border p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Style des définitions
                </p>
                <div className="mt-2 flex gap-2">
                  <Toggle
                    variant="outline"
                    pressed={bold}
                    onPressedChange={changeBold}
                    aria-label="Définitions en gras"
                  >
                    <Bold className="mr-1 h-4 w-4" />
                    Gras
                  </Toggle>
                  <Toggle
                    variant="outline"
                    pressed={italic}
                    onPressedChange={changeItalic}
                    aria-label="Définitions en italique"
                  >
                    <Italic className="mr-1 h-4 w-4" />
                    Italique
                  </Toggle>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  S&apos;applique à toutes les définitions, à l&apos;écran comme dans le PDF.
                </p>
              </div>

              <MysteryPanel
                gridId={gridId}
                mystery={content.mystery}
                onUpdated={(grid) => {
                  setContent(grid as GridContent);
                  queryClient.invalidateQueries({ queryKey: ["saved-grids"] });
                }}
              />

              <div className="space-y-2 rounded-lg border p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Exporter</p>
                {(missing > 0 || unfinished.length > 0) && (
                  <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {missing > 0 && `${missing} définition${missing > 1 ? "s" : ""} à écrire`}
                    {missing > 0 && unfinished.length > 0 && " · "}
                    {unfinished.length > 0 && `${unfinished.length} mot${unfinished.length > 1 ? "s" : ""} inachevé${unfinished.length > 1 ? "s" : ""}`}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={isExporting} onClick={() => requestPdf(true)}>
                    <FileText className="mr-1 h-4 w-4" />
                    Grille et solution (PDF)
                  </Button>
                  <Button size="sm" variant="outline" disabled={isExporting} onClick={() => requestPdf(false)}>
                    Grille seule (PDF)
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2"
                  onClick={() => exportJson(data.name, content, definitions)}
                >
                  <Download className="mr-1 h-4 w-4" />
                  Fichier de travail
                </Button>
                <p className="text-xs text-muted-foreground">
                  Le fichier de travail garde la grille et ses définitions, pour les archiver ou les
                  reprendre ailleurs.
                </p>
              </div>
            </>
          )}

          {/* Le bloc-notes : les idées viennent avant les définitions, et rarement en une fois */}
          <div className="rounded-lg border p-4">
            <label htmlFor="notes" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notes
            </label>
            <textarea
              id="notes"
              rows={5}
              maxLength={5000}
              placeholder="Idées, mots à caser, thème, où tu en es…"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              onBlur={flush}
              className="mt-2 w-full resize-y rounded-md border bg-transparent p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Enregistrées avec la grille, comme les définitions.
            </p>
          </div>
        </div>
      </div>

      {/* Exporter une grille inachevée reste possible : on prévient, on ne bloque pas */}
      <Dialog open={pendingPdf !== null} onOpenChange={(open) => !open && setPendingPdf(null)}>
        <DialogContent
          onCloseAutoFocus={(event) => {
            if (!writeAfterDialog.current) return;
            writeAfterDialog.current = false;
            event.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>La grille n&apos;est pas finie</DialogTitle>
            <DialogDescription>
              {missing > 0 &&
                `${missing} définition${missing > 1 ? "s" : ""} sur ${clues.length} ${
                  missing > 1 ? "restent" : "reste"
                } à écrire : ${missing > 1 ? "leurs cases seront vides" : "sa case sera vide"} sur le PDF.`}
              {missing > 0 && unfinished.length > 0 && " "}
              {unfinished.length > 0 &&
                `${unfinished.length} mot${unfinished.length > 1 ? "s ont" : " a"} encore des cases sans lettre.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                const withSolution = pendingPdf ?? false;
                setPendingPdf(null);
                void downloadPdf(withSolution);
              }}
            >
              Exporter quand même
            </Button>
            {missing > 0 ? (
              <Button onClick={goToMissing}>Compléter les définitions</Button>
            ) : (
              <Button
                onClick={() => {
                  setPendingPdf(null);
                  setMode("lettres");
                }}
              >
                Compléter les mots
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </main>
  );
}
