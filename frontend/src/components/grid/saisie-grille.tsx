"use client";

import { useEffect, type KeyboardEvent, type RefObject } from "react";

type Point = { x: number; y: number };

/**
 * Le témoin : un caractère toujours présent dans le champ. Les claviers de téléphone (Gboard surtout) ne disent pas
 * toujours la touche Retour arrière (« Unidentified ») et, dans un champ vide, n'envoient rien du tout. Avec le
 * témoin, le Retour arrière l'efface : le champ se vide, et c'est ce vide qui dit « on recule ».
 */
const TEMOIN = " ";

const caseDe = (input: HTMLInputElement, point: Point) =>
  input.parentElement?.querySelector<SVGElement>(`[data-cell="${point.x}-${point.y}"]`) ?? null;

/**
 * Pose le champ invisible sur la case, avant de lui donner le focus. Un téléphone qui ouvre son clavier fait défiler
 * la page jusqu'au champ : posé sur toute la grille, il ramenait au haut de la grille, et la case touchée en bas
 * passait sous le clavier. À appeler dans le geste même du toucher, juste avant `focus()`.
 */
export function placerChamp(input: HTMLInputElement | null, point: Point | null) {
  const wrapper = input?.parentElement;
  if (!input || !wrapper || !point) return;
  const cell = caseDe(input, point);
  if (!cell) return;
  const box = wrapper.getBoundingClientRect();
  const rect = cell.getBoundingClientRect();
  Object.assign(input.style, {
    left: `${rect.left - box.left}px`,
    top: `${rect.top - box.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
}

/**
 * Ce qui couvre le haut de l'écran : l'en-tête quand il colle, et le bandeau de la définition en cours, qui colle
 * juste dessous. On les empile de haut en bas : un élément compte s'il touche le bas du précédent.
 */
function hautCouvert(): number {
  const collants = [...document.querySelectorAll<HTMLElement>("header, [data-collant]")]
    .filter((element) => ["sticky", "fixed"].includes(getComputedStyle(element).position))
    .map((element) => element.getBoundingClientRect())
    .sort((a, b) => a.top - b.top);
  let bas = 0;
  for (const rect of collants) if (rect.top <= bas + 1 && rect.bottom > bas) bas = rect.bottom;
  return bas;
}

/**
 * Garde la case du curseur à l'écran : de côté dans une grille plus large que l'écran, qui défile, et en hauteur
 * au-dessus du clavier du téléphone (la fenêtre visible, `visualViewport`) et sous ce qui colle en haut.
 */
export function garderVisible(input: HTMLInputElement | null, point: Point | null) {
  if (!input || !point) return;
  const cell = caseDe(input, point);
  if (!cell) return;
  const rect = cell.getBoundingClientRect();
  const marge = Math.min(rect.width / 2, 24);
  // Sans animation : on tape vite, et une animation coupée par la lettre suivante s'arrêtait à mi-chemin
  const behavior: ScrollBehavior = "auto";

  // La grille qui défile de côté : le premier parent qu'on peut faire glisser
  let scroller = input.parentElement?.parentElement ?? null;
  while (scroller && scroller !== document.body) {
    const { overflowX } = getComputedStyle(scroller);
    if ((overflowX === "auto" || overflowX === "scroll") && scroller.scrollWidth > scroller.clientWidth) break;
    scroller = scroller.parentElement;
  }
  if (scroller && scroller !== document.body) {
    const zone = scroller.getBoundingClientRect();
    if (rect.left < zone.left + marge) scroller.scrollBy({ left: rect.left - zone.left - marge, behavior });
    else if (rect.right > zone.right - marge) scroller.scrollBy({ left: rect.right - zone.right + marge, behavior });
  }

  const vue = window.visualViewport;
  const haut = Math.max(vue?.offsetTop ?? 0, hautCouvert()) + 8;
  const bas = (vue ? vue.offsetTop + vue.height : window.innerHeight) - 8;
  if (rect.top < haut) window.scrollBy({ top: rect.top - haut, behavior });
  else if (rect.bottom > bas) window.scrollBy({ top: rect.bottom - bas, behavior });
}

/**
 * Le champ invisible par lequel on écrit dans une grille (jeu et éditeur) : c'est lui qui ouvre le clavier d'un
 * téléphone. Il suit la case du curseur, garde celle-ci visible quand le clavier s'ouvre ou qu'on avance, et
 * traduit ce qu'il reçoit en lettres et en Retour arrière, que la touche soit nommée ou non.
 *
 * `onKeyDown` reçoit les touches d'un vrai clavier (flèches, Tab, Entrée, Retour arrière nommé) : il doit faire
 * `preventDefault()` sur celles qu'il traite, pour que le champ ne les compte pas une seconde fois.
 */
export function SaisieGrille({
  inputRef,
  cursor,
  onLetters,
  onBackspace,
  onKeyDown,
  onFocus,
  disabled,
  enterKeyHint,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  cursor: Point | null;
  onLetters: (letters: string) => void;
  onBackspace: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onFocus?: () => void;
  disabled?: boolean;
  enterKeyHint?: "next" | "done";
}) {
  // Le champ suit le curseur ; la case reste visible quand on avance au clavier
  useEffect(() => {
    const input = inputRef.current;
    placerChamp(input, cursor);
    if (input && document.activeElement === input) garderVisible(input, cursor);
  }, [inputRef, cursor]);

  // Le clavier qui s'ouvre (ou une grille qui change de taille) : on replace, et on ramène la case à la vue
  useEffect(() => {
    const input = inputRef.current;
    const wrapper = input?.parentElement;
    if (!input || !wrapper) return;
    const replacer = () => placerChamp(input, cursor);
    const observer = new ResizeObserver(replacer);
    observer.observe(wrapper);
    const vue = window.visualViewport;
    const clavier = () => {
      if (document.activeElement === input) garderVisible(input, cursor);
    };
    vue?.addEventListener("resize", clavier);
    return () => {
      observer.disconnect();
      vue?.removeEventListener("resize", clavier);
    };
  }, [inputRef, cursor]);

  const remettreTemoin = (input: HTMLInputElement) => {
    input.value = TEMOIN;
    input.setSelectionRange(TEMOIN.length, TEMOIN.length);
  };

  return (
    <input
      ref={inputRef}
      aria-label="Lettre à écrire dans la grille"
      className="pointer-events-none absolute left-0 top-0 opacity-0"
      style={{ fontSize: 16 }}
      defaultValue={TEMOIN}
      autoCapitalize="characters"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      enterKeyHint={enterKeyHint}
      disabled={disabled}
      onChange={(event) => {
        const value = event.target.value;
        remettreTemoin(event.target);
        if (value === "") onBackspace();
        else onLetters(value.replaceAll(TEMOIN, ""));
      }}
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        remettreTemoin(event.target);
        onFocus?.();
      }}
    />
  );
}
