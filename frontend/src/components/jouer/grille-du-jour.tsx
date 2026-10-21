"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { JouerUneGrille } from "@/components/jouer/jouer-une-grille";
import { GRILLES, LOADERS, aujourdhui } from "@/content/grilles";
import type { GrilleJson } from "@/content/grilles/types";
import { linkClass } from "@/components/legal/section";
import { titreDuJour } from "@/lib/seo";

const sansPrefixe = (date: string) => titreDuJour(date).replace("Mots fléchés du ", "");

type Etat =
  | { cas: "attente" }
  | { cas: "jour"; grille: GrilleJson }
  // Le stock épuisé : aucune grille datée d'aujourd'hui, on le dit, et on propose celles déjà parues
  | { cas: "repli" }
  | { cas: "pas-encore" };

/**
 * La grille du jour sur `/jouer` (ADR 0026) : celle du jour qu'on vit à Paris, choisie dans le navigateur — le
 * site est un export figé au build, le jour, lui, avance. Un jour sans grille (le stock s'est épuisé), la page le
 * dit franchement et propose de rejouer une grille parue, plutôt que de faire passer une ancienne pour celle du
 * jour. Une grille à venir n'y paraît jamais en avance. `children` : ce que la page écrit au build sous la grille
 * (présentation de la rubrique, grilles parues), quel que soit le cas.
 */
export function GrilleDuJour({ children }: { children?: ReactNode }) {
  const [etat, setEtat] = useState<Etat>({ cas: "attente" });

  useEffect(() => {
    const jour = aujourdhui();
    const choix = GRILLES.find((grille) => grille.date === jour);
    if (choix) {
      LOADERS[choix.date]().then((module) => setEtat({ cas: "jour", grille: module.default }));
      return;
    }
    setEtat(GRILLES.some((grille) => grille.date < jour) ? { cas: "repli" } : { cas: "pas-encore" });
  }, []);

  if (etat.cas === "jour") return <JouerUneGrille data={etat.grille}>{children}</JouerUneGrille>;

  return (
    <main className="container mx-auto max-w-3xl p-4 md:p-8" aria-busy={etat.cas === "attente"}>
      <h1 className="text-3xl font-bold md:text-4xl">La grille du jour</h1>
      {etat.cas === "attente" && <p className="mt-4 text-lg text-muted-foreground">La grille du jour s’installe…</p>}
      {etat.cas === "pas-encore" && (
        <p className="mt-4 text-lg text-muted-foreground">
          La première grille arrive le {GRILLES.length ? sansPrefixe(GRILLES[GRILLES.length - 1].date) : "bientôt"}.
          En attendant, <Link href="/grid" className={linkClass}>crée la tienne</Link>.
        </p>
      )}
      {etat.cas === "repli" && (
        <p className="mt-4 text-lg text-muted-foreground" data-testid="grille-repli">
          La grille du jour arrive bientôt. En attendant, rejoue une grille déjà parue : elles sont juste en dessous.
        </p>
      )}
      {children}
    </main>
  );
}
