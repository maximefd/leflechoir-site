"use client";

/**
 * « Le sens des mots » (ADR 0028) : le sens d'un mot tiré du Wiktionnaire, affiché à côté des grilles.
 *
 * Un aide-mémoire, jamais une définition de case : rien ici n'écrit dans une grille, et ces textes (CC BY-SA 4.0)
 * ne partagent ni type ni champ avec les définitions. Une seule mention de la licence par écran (`SensMention`).
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export type SensDuMot = { lemme: string; textes: string[] };
type SensResponse = { sens: Record<string, SensDuMot> };

const STORAGE_KEY = "terminator:sens-des-mots";
/** Au-delà, l'API refuse (`too_many_words`) : une très grande grille ne demande que ses premiers mots. */
const MAX_WORDS = 200;

/** Le sens des mots donnés, par mot (forme de la grille, en capitales). Rien tant que `enabled` est faux. */
export function useSensDesMots(words: string[], enabled = true) {
  const wanted = Array.from(new Set(words.map((word) => word.toUpperCase()))).sort().slice(0, MAX_WORDS);
  const { data } = useQuery<SensResponse>({
    queryKey: ["sens-des-mots", wanted],
    queryFn: () => apiFetch("/api/sens", { method: "POST", body: { mots: wanted } }),
    enabled: enabled && wanted.length > 0,
    // Le fichier ne change qu'avec le lexique ; sans lui (503), le site s'en passe sans réessayer
    staleTime: Infinity,
    retry: false,
  });
  return data?.sens ?? {};
}

/** Affiché d'office ; le choix de le masquer est retenu dans ce navigateur. */
export function useShowSens(): [boolean, (show: boolean) => void] {
  const [show, setShow] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "non") setShow(false);
    } catch {
      // Stockage indisponible (navigation privée…) : le sens reste affiché
    }
  }, []);
  const update = (next: boolean) => {
    setShow(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "oui" : "non");
    } catch {
      // Le choix vaut alors pour cette page seulement
    }
  };
  return [show, update];
}

/** Les acceptions d'un mot, en petit. Une forme fléchie dit de quel mot elle vient (« de ululer »). */
export function SensTexte({ word, sens, className = "" }: { word: string; sens?: SensDuMot; className?: string }) {
  if (!sens || !Array.isArray(sens.textes) || sens.textes.length === 0) return null;
  const fromLemma = normalizeForCompare(sens.lemme) !== word.toUpperCase();
  return (
    <p className={`text-xs leading-snug text-muted-foreground ${className}`}>
      {fromLemma && <span className="italic">{deLemme(sens.lemme)} : </span>}
      {sens.textes.join(" · ")}
    </p>
  );
}

/** La mention de la source et de la licence, une fois par écran, sous les sens. */
export function SensMention({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs text-muted-foreground ${className}`}>
      Sens tirés du{" "}
      <a href="https://fr.wiktionary.org/" target="_blank" rel="noopener noreferrer" className="underline">
        Wiktionnaire
      </a>
      , sous licence{" "}
      <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr" target="_blank" rel="noopener noreferrer"
         className="underline">
        CC BY-SA 4.0
      </a>
      , parfois abrégés.
    </p>
  );
}

/** « de noyer », mais « d'admettre » : l'élision devant une voyelle (le h, muet ou aspiré, reste sans) */
function deLemme(lemme: string): string {
  return /^[aeiouyàâäéèêëîïôöùûü]/i.test(lemme) ? `d’${lemme}` : `de ${lemme}`;
}

function normalizeForCompare(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "").toUpperCase();
}
