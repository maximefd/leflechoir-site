"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { GridPlayer } from "@/components/grid/grid-player";
import { linkClass } from "@/components/legal/section";
import { specFromGeneration, type MiniGridSpec } from "@/lib/mini-grid";
import { jouerJsonLd, titreDuJour } from "@/lib/seo";
import type { GrilleJson } from "@/content/grilles/types";

/**
 * La page d'une grille publiée (ADR 0026) : le titre du jour, la force annoncée, la grille à jouer en
 * pleine page. Le contenu vient du JSON produit hors ligne ; les définitions y sont écrites à la main,
 * et le joueur voit les mêmes cases que sur le papier — définitions dedans, liste en clair dessous.
 */
/** `children` : sur `/jouer`, la présentation de la rubrique et les grilles parues, sous la grille */
export function JouerUneGrille({ data, children }: { data: GrilleJson; children?: ReactNode }) {
  // La validation a lieu ici : une grille dont un mot n'a pas sa définition ne s'affiche pas
  const spec: MiniGridSpec = useMemo(() => specFromGeneration(data, data.clues), [data]);
  const { width, height, mystery } = data.response.grid;
  const titre = titreDuJour(data.date);

  return (
    <main className="container mx-auto max-w-3xl p-4 md:p-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jouerJsonLd(data)) }} />
      <nav aria-label="Fil d’Ariane" className="mb-4 text-sm text-muted-foreground">
        <Link href="/" className={linkClass}>Accueil</Link>
        <span aria-hidden="true"> › </span>
        <Link href="/jouer" className={linkClass}>La grille du jour</Link>
      </nav>

      <h1 className="text-3xl font-bold md:text-4xl">{titre}</h1>
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
        <span className="rounded-full border px-2.5 py-0.5 font-medium text-foreground">Force {data.force} sur 4</span>
        <span>{width} × {height} cases, {data.response.grid.words.length} définitions</span>
        {mystery && <span>mot mystère en {mystery.cells.length} lettres</span>}
      </p>

      <div className="mt-6">
        <GridPlayer spec={spec} title={titre} />
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Une grille nouvelle chaque jour. Envie de la tienne, avec tes mots ?{" "}
        <Link href="/grid" className={linkClass}>Le moteur te la dessine</Link>.
      </p>
      {children}
    </main>
  );
}
