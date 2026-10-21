"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { JouerUneGrille } from "@/components/jouer/jouer-une-grille";
import { linkClass } from "@/components/legal/section";
import { LOADERS, aujourdhui } from "@/content/grilles";
import type { GrilleJson } from "@/content/grilles/types";
import { titreDuJour } from "@/lib/seo";

/**
 * Une grille datée d'après le build (page-grille.tsx) : avant son jour (heure de Paris), elle annonce sa date et
 * renvoie à la grille du jour ; le jour venu, elle se charge et se joue. Le choix se fait dans le navigateur.
 */
export function GrilleAVenir({ date }: { date: string }) {
  const [etat, setEtat] = useState<"attente" | "a-venir" | GrilleJson>("attente");

  useEffect(() => {
    if (date > aujourdhui()) {
      setEtat("a-venir");
      return;
    }
    LOADERS[date]().then((module) => setEtat(module.default));
  }, [date]);

  if (typeof etat === "object") return <JouerUneGrille data={etat} />;
  const titre = titreDuJour(date);
  const jour = titre.replace("Mots fléchés du ", "");
  return (
    <main className="container mx-auto max-w-3xl p-4 md:p-8" aria-busy={etat === "attente"}>
      <h1 className="text-3xl font-bold md:text-4xl">{titre}</h1>
      {etat === "a-venir" && (
        <p className="mt-4 text-lg text-muted-foreground">
          Cette grille paraîtra le {jour}. En attendant,{" "}
          <Link href="/jouer" className={linkClass}>joue la grille du jour</Link>.
        </p>
      )}
    </main>
  );
}
