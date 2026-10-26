"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { GridPlayer, inWords } from "@/components/grid/grid-player";
import { linkClass } from "@/components/legal/section";
import { specFromGeneration, type MiniGridSpec } from "@/lib/mini-grid";
import { jouerJsonLd, titreDuJour } from "@/lib/seo";
import type { GrilleJson } from "@/content/grilles/types";
import { GRILLES, aujourdhui } from "@/content/grilles";
import { CalendrierDesGrilles } from "@/components/jouer/calendrier-des-grilles";
import { serieEnCours, useReussites } from "@/lib/reussites";
import { withNext } from "@/lib/next-path";

const sansPrefixe = (date: string) => titreDuJour(date).replace("Mots fléchés du ", "");
// « 23 oct. » : la navigation tient sur une ligne au téléphone ; le nom complet reste pour les lecteurs d'écran
const court = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).replace(/^1 /, "1er ");

/** La veille et le lendemain paru : en haut, près du titre, et en bas, après la partie */
function EntreLesJours({ veille, lendemain, className, label }: {
  veille?: string; lendemain?: string; className: string; label: string;
}) {
  return (
    <nav aria-label={label} className={`grid grid-cols-3 items-center gap-2 text-sm ${className}`}>
      <span>
        {veille && (
          <Link href={`/jouer/${veille}`} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 hover:border-foreground" rel="prev">
            <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
            <span aria-hidden>{court(veille)}</span><span className="sr-only">La grille du {sansPrefixe(veille)}</span>
          </Link>
        )}
      </span>
      <a href="#grilles-parues" className="inline-flex items-center justify-center gap-1 text-center hover:text-foreground">
        <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
        Toutes les grilles
      </a>
      <span className="text-right">
        {lendemain && (
          <Link href={`/jouer/${lendemain}`} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 hover:border-foreground" rel="next">
            <span aria-hidden>{court(lendemain)}</span><span className="sr-only">La grille du {sansPrefixe(lendemain)}</span>
            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
          </Link>
        )}
      </span>
    </nav>
  );
}

/**
 * La page d'une grille publiée (ADR 0026) : le titre du jour, la force si elle en a une, la grille à jouer en
 * pleine page, puis le calendrier des grilles parues. Le contenu vient du JSON produit hors ligne ; les définitions
 * y sont écrites à la main, et le joueur voit les mêmes cases que sur le papier — définitions dedans, liste en clair
 * dessous. `children` : sur `/jouer`, la présentation de la rubrique, entre la grille et le calendrier.
 */
export function JouerUneGrille({ data, children }: { data: GrilleJson; children?: ReactNode }) {
  // La validation a lieu ici : une grille dont un mot n'a pas sa définition ne s'affiche pas
  const spec: MiniGridSpec = useMemo(() => specFromGeneration(data, data.clues), [data]);
  const { width, height, mystery } = data.response.grid;
  const titre = titreDuJour(data.date);

  // La grille de la veille est toujours parue ; celle du lendemain, seulement si son jour est venu (à Paris, dans le
  // navigateur : la page est figée au build). GRILLES va de la plus récente à la plus ancienne.
  const veille = GRILLES.find((grille) => grille.date < data.date)?.date;
  const suivante = [...GRILLES].reverse().find((grille) => grille.date > data.date)?.date;
  const [jour, setJour] = useState<string | null>(null);
  useEffect(() => setJour(aujourdhui()), []);
  const lendemain = suivante && jour && suivante <= jour ? suivante : undefined;

  const { reussites, noter, connecte } = useReussites();
  const reussite = reussites[data.date];
  const [notee, setNotee] = useState(false); // réussie pendant cette visite : la fin de partie en parle
  const serie = jour ? serieEnCours(reussites, GRILLES.map((grille) => grille.date), jour) : 0;

  function reussie(ms: number | null) {
    noter(data.date, ms, aujourdhui());
    setNotee(true);
  }

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
        {data.force && <span className="rounded-full border px-2.5 py-0.5 font-medium text-foreground">Force {data.force} sur 4</span>}
        <span>{width} × {height} cases, {data.response.grid.words.length} définitions</span>
        {mystery && <span>mot mystère en {mystery.cells.length} lettres</span>}
        {reussite && (
          <span className="rounded-full bg-primary px-2.5 py-0.5 font-medium text-primary-foreground" data-testid="deja-reussie">
            Réussie{reussite.ms != null ? `, en ${inWords(reussite.ms)}` : ""}
          </span>
        )}
      </p>
      <EntreLesJours veille={veille} lendemain={lendemain} className="mt-4" label="Les autres jours" />

      <div className="mt-6">
        <GridPlayer
          spec={spec}
          title={titre}
          onSolved={reussie}
          fin={notee && (
            <>
              {serie > 1 && (
                <p className="mt-1 text-sm font-medium text-foreground" data-testid="serie">
                  {serie} grilles réussies d’affilée !
                </p>
              )}
              <p className="mt-1 text-sm text-muted-foreground" data-testid="fin-compte">
                {connecte
                  ? "Cochée dans le calendrier, et gardée avec ton compte."
                  : <>
                      Cochée dans le calendrier de ce navigateur.{" "}
                      <Link href={withNext("/register", `/jouer/${data.date}`)} className={linkClass}>Crée un compte</Link>{" "}
                      pour retrouver ta progression sur tous tes appareils.
                    </>}
              </p>
            </>
          )}
        />
      </div>

      <EntreLesJours veille={veille} lendemain={lendemain} className="mt-8" label="Les autres jours, après la partie" />

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Une grille nouvelle chaque jour. Envie de la tienne, avec tes mots ?{" "}
        <Link href="/grid" className={linkClass}>Le moteur te la dessine</Link>.
      </p>
      {children}
      <CalendrierDesGrilles jusqua={data.date} selection={data.date} />
    </main>
  );
}
