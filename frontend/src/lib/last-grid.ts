import type { GridData } from "@/components/grid/grid-display";
import type { WordEntry } from "@/components/grid/word-list";

/**
 * La dernière génération, gardée dans le navigateur.
 *
 * On génère souvent **avant** de se connecter : la grille plaît, on veut la garder, on passe par
 * l'inscription… et on revenait sur un écran vide. La demande et la grille survivent donc au
 * changement de page, jusqu'à la génération suivante ou la déconnexion.
 *
 * Commodité, pas stockage : un navigateur en navigation privée peut tout refuser, et l'écran doit
 * alors fonctionner comme avant — d'où les `try` qui avalent l'erreur.
 */
const KEY = "terminator:derniere-grille";

export type LastGrid = {
  /** La taille choisie (#220 : toutes les grilles sont dessinées par le moteur, la taille est libre). */
  size: { width: number; height: number } | null;
  entries: WordEntry[];
  dictionaryIds: number[];
  grid: GridData | null;
  /** La grille a déjà été conservée : on propose la suite plutôt qu'un second enregistrement. */
  saved: { id: number; name: string } | null;
  /** Le mot mystère tel que tapé (#218) : il reste dans ce navigateur, comme les mots imposés. */
  mystery?: string;
};

/**
 * La taille gardée : `size`, ou avant #220 la taille libre (`freeSize`) ou le format du catalogue (« 13x16 »).
 */
function sizeOf(parsed: Partial<LastGrid> & { format?: unknown; freeSize?: { width: number; height: number } | null }) {
  const valid = (size: { width: number; height: number } | null | undefined) =>
    size && Number.isInteger(size.width) && Number.isInteger(size.height) ? { width: size.width, height: size.height } : null;
  const kept = valid(parsed.size) ?? valid(parsed.freeSize);
  if (kept) return kept;
  if (typeof parsed.format === "string" && /^\d+x\d+$/.test(parsed.format)) {
    const [width, height] = parsed.format.split("x").map(Number);
    return { width, height };
  }
  return null;
}

export function loadLastGrid(): LastGrid | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastGrid>;
    return {
      size: sizeOf(parsed),
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      dictionaryIds: Array.isArray(parsed.dictionaryIds) ? parsed.dictionaryIds : [],
      grid: parsed.grid && Array.isArray(parsed.grid.cells) ? parsed.grid : null,
      saved: parsed.saved && typeof parsed.saved.id === "number" ? parsed.saved : null,
      mystery: typeof parsed.mystery === "string" ? parsed.mystery : "",
    };
  } catch {
    return null;
  }
}

export function storeLastGrid(state: LastGrid) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Stockage refusé ou plein : la grille ne survivra pas au changement de page, rien de plus
  }
}

/** À la déconnexion : la grille « déjà conservée » d'un compte ne doit pas s'afficher dans un autre. */
export function forgetLastGrid() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Rien à effacer si le stockage est refusé
  }
}
