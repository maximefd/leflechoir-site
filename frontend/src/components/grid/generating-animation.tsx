"use client";

import { useEffect, useState } from "react";

// Une grille fantôme : « x » case définition, une lettre sinon. Les lettres apparaissent l'une après l'autre.
const GHOST = ["xFxLx", "MOTSx", "xUNIR", "FLECH", "xEROS"];
const MESSAGES = [
  "Le moteur choisit une mise en page…",
  "Il place les premiers mots…",
  "Il vérifie chaque croisement…",
  "Il cherche des mots qui s'emboîtent…",
];
// Au-delà, on prévient : une grande grille peut demander jusqu'au budget du moteur (20 s)
const LONG_WAIT_MS = 7000;

/**
 * Pendant la génération : l'API ne dit pas où en est le moteur (une seule requête), l'animation montre
 * seulement qu'il travaille. Immobile si le système demande de réduire les animations.
 */
export function GeneratingAnimation() {
  const [message, setMessage] = useState(0);
  const [long, setLong] = useState(false);

  useEffect(() => {
    const rotate = window.setInterval(() => setMessage((current) => (current + 1) % MESSAGES.length), 2500);
    const warn = window.setTimeout(() => setLong(true), LONG_WAIT_MS);
    return () => {
      window.clearInterval(rotate);
      window.clearTimeout(warn);
    };
  }, []);

  const letters = GHOST.flatMap((row, y) => [...row].map((char, x) => ({ char, x, y }))).filter((cell) => cell.char !== "x");

  return (
    <div role="status" className="flex flex-col items-center">
      <div aria-hidden className="grid grid-cols-5 gap-0.5 rounded-sm border-2 border-foreground/70 bg-foreground/70 p-0.5">
        {GHOST.flatMap((row, y) =>
          [...row].map((char, x) => {
            const order = letters.findIndex((cell) => cell.x === x && cell.y === y);
            return char === "x" ? (
              <span key={`${x}-${y}`} className="h-7 w-7 bg-muted" />
            ) : (
              <span key={`${x}-${y}`} className="flex h-7 w-7 items-center justify-center bg-background text-sm font-bold">
                <span className="animate-remplissage" style={{ animationDelay: `${order * 0.15}s` }}>{char}</span>
              </span>
            );
          }),
        )}
      </div>
      <p className="mt-4 text-sm">{MESSAGES[message]}</p>
      {long && (
        <p className="mt-1 text-xs text-muted-foreground">
          Les grandes grilles demandent parfois jusqu&apos;à 20 secondes : le moteur essaie plusieurs mises en page.
        </p>
      )}
    </div>
  );
}
