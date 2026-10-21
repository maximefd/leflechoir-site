"use client";

import { useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { boutonOcre, cadre, enTeteSection, texteDoux } from "@/components/mots/style";
import { Button } from "@/components/ui/button";

/**
 * Une lettre saisie, sans accent et en capitale. `""` : un joker (espace, point, `?`), la case reste vide et on passe
 * à la suivante ; `null` : un caractère qui n'a rien à faire dans une grille, ignoré.
 */
export function lettreDe(caractere: string): string | null {
  if (/^[\s?.*_-]$/.test(caractere)) return "";
  const lettre = caractere.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  return /^[A-Z]$/.test(lettre) ? lettre : null;
}

/**
 * La rangée de cases, comme une ligne de grille : on tape les lettres connues, on laisse vides les autres, et
 * « Chercher » (ou Entrée) rend le motif (`A??E?`) à `onChercher`, qui lance la recherche tout de suite (le parent
 * relance aussi la recherche seul, après un court délai, quand les lettres changent). Les lettres vivent chez le
 * parent (`lettres`, `onLettres`) : les raccourcis de la page peuvent ainsi remplir les cases. `onEffacer` est
 * appelé par le deuxième bouton (`libelleEffacer`). Passage automatique à la case suivante, Retour arrière qui
 * revient en arrière, flèches, collage d'un mot entier. `avant` : ce qui précède les cases (le choix de la longueur).
 * Jusqu'à 8 cases, une seule rangée ; au-delà, deux rangées égales, pour que les cases restent assez larges.
 */
export function RangeeDeLettres({
  longueur,
  lettres,
  onLettres,
  onChercher,
  onEffacer,
  libelleEffacer = "Effacer",
  avant,
}: {
  longueur: number;
  lettres: string[];
  onLettres: (lettres: string[]) => void;
  onChercher: (motif: string) => void;
  onEffacer: () => void;
  libelleEffacer?: string;
  avant?: ReactNode;
}) {
  const [manque, setManque] = useState(false);
  const cases = useRef<(HTMLInputElement | null)[]>([]);

  const aller = (index: number) => {
    const cible = Math.max(0, Math.min(longueur - 1, index));
    cases.current[cible]?.focus();
  };

  const poser = (index: number, valeur: string) => {
    setManque(false);
    onLettres(lettres.map((lettre, i) => (i === index ? valeur : lettre)));
  };

  const saisir = (index: number, texte: string) => {
    if (texte === "") return poser(index, "");
    // Une case garde une seule lettre : la dernière tapée (la lettre d'avant est sélectionnée, ou déjà là)
    const lettre = lettreDe(texte.slice(-1));
    if (lettre === null) return;
    poser(index, lettre);
    aller(index + 1);
  };

  const coller = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const saisies = [...event.clipboardData.getData("text")].map(lettreDe).filter((lettre) => lettre !== null);
    if (saisies.length === 0) return;
    setManque(false);
    onLettres(lettres.map((lettre, i) => (i >= index && i - index < saisies.length ? saisies[i - index] : lettre)));
    aller(index + saisies.length);
  };

  const toucher = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "Backspace":
        // Case vide : on revient en arrière et on efface la lettre d'avant ; sinon le navigateur efface celle-ci
        if (lettres[index] === "" && index > 0) {
          event.preventDefault();
          poser(index - 1, "");
          aller(index - 1);
        }
        break;
      case "ArrowLeft":
        event.preventDefault();
        aller(index - 1);
        break;
      case "ArrowRight":
        event.preventDefault();
        aller(index + 1);
        break;
      case "Home":
        event.preventDefault();
        aller(0);
        break;
      case "End":
        event.preventDefault();
        aller(longueur - 1);
        break;
    }
  };

  const chercher = (event: FormEvent) => {
    event.preventDefault();
    if (lettres.every((lettre) => lettre === "")) {
      setManque(true);
      aller(0);
      return;
    }
    onChercher(lettres.map((lettre) => lettre || "?").join(""));
  };

  const effacer = () => {
    setManque(false);
    onEffacer();
    aller(0);
  };

  const colonnes = longueur <= 8 ? longueur : Math.ceil(longueur / 2);

  return (
    <form onSubmit={chercher} className={`${cadre} p-4 md:p-6`} aria-labelledby="rangee-titre">
      <h2 id="rangee-titre" className={enTeteSection}>
        Les lettres que tu connais
      </h2>
      <p id="rangee-aide" className={`mt-3 text-[1.05rem] ${texteDoux}`}>
        Tape-les à leur place : les mots se cherchent tout seuls. Laisse vide la case d’une lettre que tu ne connais pas.
      </p>

      {avant}

      <div
        role="group"
        aria-labelledby="rangee-titre"
        aria-describedby="rangee-aide"
        className="mx-auto mt-5 grid gap-1.5 sm:gap-2"
        style={{ gridTemplateColumns: `repeat(${colonnes}, minmax(0, 1fr))`, maxWidth: `${colonnes * 72}px` }}
      >
        {lettres.map((lettre, index) => (
          <input
            key={index}
            ref={(element) => {
              cases.current[index] = element;
            }}
            type="text"
            inputMode="text"
            value={lettre}
            aria-label={`Lettre ${index + 1} sur ${longueur}`}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint={index === longueur - 1 ? "search" : "next"}
            onChange={(event) => saisir(index, event.target.value)}
            onKeyDown={(event) => toucher(index, event)}
            onPaste={(event) => coller(index, event)}
            onFocus={(event) => event.target.select()}
            className={`h-16 w-full min-w-0 rounded-md border-2 border-input transition-[border-color,box-shadow,transform] duration-150 focus:scale-[1.04] focus:border-amber-500 text-center text-3xl uppercase text-foreground caret-transparent outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:h-20 sm:text-4xl ${lettre ? "border-amber-400 bg-amber-50" : "bg-background"}`}
          />
        ))}
      </div>

      {manque && (
        <p role="alert" className="mt-3 text-center text-[1.05rem] font-medium text-destructive">
          Tape au moins une lettre dans les cases, sinon tous les mots conviennent.
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button type="submit" className={boutonOcre}>
          Chercher
        </button>
        <Button type="button" variant="outline" size="lg" className="h-12 px-6 text-lg" onClick={effacer}>
          {libelleEffacer}
        </Button>
      </div>
    </form>
  );
}
