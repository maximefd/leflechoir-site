import type { Mystery } from "@/components/grid/grid-display";

/**
 * Le mot mystère (#218), côté écran : la même normalisation que l'API, pour prévenir avant d'envoyer.
 *
 * L'API reste juge (`normalize_phrase`, puis 3 à 20 lettres) : ceci évite seulement d'attendre une
 * génération pour apprendre qu'un mot de deux lettres ne convient pas.
 */
export const MYSTERY_MIN = 3;
export const MYSTERY_MAX = 20;

const LETTERS = "A-Za-zÀ-ÖØ-öø-ÿŒœÆæ";
const TYPED = new RegExp(`^[${LETTERS}][${LETTERS}'’ -]*$`);

/** « Joyeux Noël » → « JOYEUX NOEL » : majuscules sans accents, tiret et apostrophe retirés, un blanc entre deux mots. */
export function normalizeMystery(text: string) {
  return text
    .split(/\s+/)
    .map((part) =>
      part
        .replace(/[Œœ]/g, "OE")
        .replace(/[Ææ]/g, "AE")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toUpperCase()
        .replace(/[^A-Z]/g, ""),
    )
    .filter(Boolean)
    .join(" ");
}

/** Ce qui empêche d'envoyer ce mot mystère, ou `null`. Un champ vide n'est pas une erreur : pas de mot mystère. */
export function mysteryProblem(text: string): string | null {
  const typed = text.trim();
  if (!typed) return null;
  if (!TYPED.test(typed)) return "Des lettres seulement : ni chiffre ni ponctuation.";
  const count = normalizeMystery(typed).replace(/ /g, "").length;
  if (count < MYSTERY_MIN || count > MYSTERY_MAX) {
    return `De ${MYSTERY_MIN} à ${MYSTERY_MAX} lettres (${count} pour l'instant).`;
  }
  return null;
}

/** Les numéros qui ont changé de case entre deux états de la grille (une lettre numérotée corrigée). */
export function movedNumbers(before: Mystery | null | undefined, after: Mystery | null | undefined) {
  if (!before || !after || before.word !== after.word) return [];
  return after.cells.flatMap((cell, index) => {
    const old = before.cells[index];
    return old && (old.x !== cell.x || old.y !== cell.y) ? [index + 1] : [];
  });
}

/** « le n° 3 attend un R » : ce qui manque à un mot mystère dont des cases ont perdu leur lettre. */
export function brokenDescription(mystery: Mystery) {
  const letters = mystery.word.replace(/ /g, "");
  const parts = (mystery.broken ?? []).map((number) => `le n° ${number} attend un ${letters[number - 1]}`);
  return parts.join(", ");
}
