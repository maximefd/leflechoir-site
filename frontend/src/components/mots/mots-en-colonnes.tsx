"use client";

import { useState } from "react";
import { SuggestWord } from "@/components/suggestions/suggest-word";

/**
 * Des mots en colonnes, en caractères normaux (ni gras, ni chasse fixe), aérés. En « mode signalement », un petit
 * drapeau apparaît à côté de chaque mot : un clic le signale à l'auteur (`POST /api/suggestions`, origine « mots »),
 * qui le relit avant de le retirer du lexique. Hors de ce mode, la liste n'a aucun bouton : elle reste lisible.
 */
export function MotsEnColonnes({ mots, nom, signaler }: { mots: string[]; nom: string; signaler: boolean }) {
  return (
    <ul
      aria-label={nom}
      aria-live="off"
      className="text-xl leading-relaxed tracking-wide text-foreground"
      // Des colonnes aussi larges que le mot est long (un mot de 15 lettres ne doit jamais dépasser de l'écran)
      style={{ columnWidth: `${(mots[0]?.length ?? 5) * 0.9 + 3 + (signaler ? 2 : 0)}rem`, columnGap: "1.5rem" }}
    >
      {mots.map((mot) => (
        <li key={mot} className="flex break-inside-avoid items-center justify-between gap-1 py-1">
          <span>{mot}</span>
          {signaler && <SuggestWord word={mot} kind="remove" source="mots" />}
        </li>
      ))}
    </ul>
  );
}

/**
 * L'interrupteur du mode signalement, discret : un lien-bouton sous la liste. Il porte son explication une fois
 * actif. L'état est chez le parent (`useSignalement`) : une liste, un interrupteur.
 */
export function BoutonSignaler({ actif, onChange }: { actif: boolean; onChange: (actif: boolean) => void }) {
  return (
    <div className="mt-5 text-[1.05rem] text-muted-foreground">
      <button
        type="button"
        aria-pressed={actif}
        onClick={() => onChange(!actif)}
        className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60"
      >
        {actif ? "Terminer le signalement" : "Signaler un mot"}
      </button>
      {actif ? (
        <span> : touche le drapeau à côté d’un mot qui n’a rien à faire ici, je le relirai.</span>
      ) : (
        <span> qui n’a rien à faire dans cette liste.</span>
      )}
    </div>
  );
}

export function useSignalement(): [boolean, (actif: boolean) => void] {
  return useState(false);
}
