"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { linkClass } from "@/components/legal/section";
import { GRILLES, aujourdhui } from "@/content/grilles";
import { serieEnCours, useReussites } from "@/lib/reussites";
import { withNext } from "@/lib/next-path";
import { titreDuJour } from "@/lib/seo";

const JOURS = ["L", "M", "M", "J", "V", "S", "D"];

const nomDuMois = (mois: string) =>
  new Date(`${mois}-15T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

/** Les cases d'un mois (AAAA-MM), semaine commençant le lundi : null pour les cases avant le 1er */
function casesDuMois(mois: string): (string | null)[] {
  const [annee, numero] = mois.split("-").map(Number);
  const decalage = (new Date(Date.UTC(annee, numero - 1, 1)).getUTCDay() + 6) % 7;
  const longueur = new Date(Date.UTC(annee, numero, 0)).getUTCDate();
  return [
    ...Array<null>(decalage).fill(null),
    ...Array.from({ length: longueur }, (_, i) => `${mois}-${String(i + 1).padStart(2, "0")}`),
  ];
}

/**
 * Les grilles parues, en calendrier, sous chaque grille et sur `/jouer` : un mois à la fois, chaque jour paru mène à
 * sa grille, celles que le joueur a réussies portent une coche, et la série en cours se lit au-dessus
 * (lib/reussites.ts : dans le navigateur, ou avec le compte). Sans compte, il invite à en créer un pour les garder.
 *
 * Tous les mois sont écrits dans la page au build (les moteurs y trouvent l'archive, ADR 0026), jusqu'au jour
 * `jusqua` ; le navigateur remet ensuite le jour à l'heure de Paris : une grille parue depuis le build s'y ajoute
 * sans redéployer, une grille à venir n'y a jamais de lien. `selection` : la grille de la page, entourée, et dont
 * le mois s'ouvre d'abord.
 */
export function CalendrierDesGrilles({ jusqua, selection }: { jusqua: string; selection?: string }) {
  const [jour, setJour] = useState(jusqua);
  const { reussites, connecte } = useReussites();
  const [choisi, setChoisi] = useState<string | null>(null); // le mois montré, une fois que le joueur en change

  useEffect(() => setJour(aujourdhui()), []);

  const parues = useMemo(() => GRILLES.map((grille) => grille.date).filter((date) => date <= jour), [jour]);
  const mois = useMemo(() => [...new Set(parues.map((date) => date.slice(0, 7)))], [parues]);
  if (!mois.length) return null;

  const depart = selection && mois.includes(selection.slice(0, 7)) ? selection.slice(0, 7) : mois[0];
  const montre = choisi && mois.includes(choisi) ? choisi : depart;
  const index = mois.indexOf(montre);
  const reussies = parues.filter((date) => reussites[date]).length;
  const serie = serieEnCours(reussites, parues, jour);
  const ici = selection ? `/jouer/${selection}` : "/jouer";

  return (
    <section aria-labelledby="grilles-parues" className="mx-auto mt-12 max-w-md">
      <h2 id="grilles-parues" className="text-center text-xl font-semibold text-foreground">Les grilles parues</h2>
      <p className="mt-2 text-center text-sm text-muted-foreground" data-testid="progression">
        {reussies
          ? <>
              {reussies} {reussies > 1 ? "grilles réussies" : "grille réussie"}
              {serie > 1 && <>, dont les {serie} dernières d’affilée</>}
              {serie === 1 && <>, dont la dernière</>}.
            </>
          : "Chaque grille réussie se coche ici."}
      </p>
      {/* Sans compte, la progression ne vit que dans ce navigateur : le compte la garde partout */}
      <p className="mt-1 text-center text-sm text-muted-foreground" data-testid="progression-compte">
        {connecte
          ? "Gardées avec ton compte, sur tous tes appareils."
          : <>
              <Link href={withNext("/register", ici)} className={linkClass}>Crée un compte</Link> pour retrouver tes
              réussites sur tous tes appareils (sinon, <Link href="/privacy#reussites" className={linkClass}>elles
              restent dans ce navigateur</Link>).
            </>}
      </p>

      <div className="mt-4 rounded-lg border p-3 sm:p-4">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost" size="icon" aria-label="Mois précédent"
            disabled={index >= mois.length - 1} onClick={() => setChoisi(mois[index + 1])}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </Button>
          <p className="font-semibold capitalize text-foreground" aria-live="polite" data-testid="calendrier-mois">
            {nomDuMois(montre)}
          </p>
          <Button
            variant="ghost" size="icon" aria-label="Mois suivant"
            disabled={index <= 0} onClick={() => setChoisi(mois[index - 1])}
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </Button>
        </div>

        {mois.map((m) => (
          <div key={m} hidden={m !== montre} data-mois={m}>
            <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground" aria-hidden>
              {JOURS.map((lettre, j) => <span key={j}>{lettre}</span>)}
            </div>
            <ul className="mt-1 grid grid-cols-7 gap-1">
              {casesDuMois(m).map((date, j) => {
                if (!date) return <li key={`vide-${j}`} aria-hidden />;
                const numero = Number(date.slice(8));
                if (!parues.includes(date)) {
                  return (
                    <li key={date} aria-hidden className="flex aspect-square items-center justify-center text-sm text-muted-foreground/40">
                      {numero}
                    </li>
                  );
                }
                const reussie = Boolean(reussites[date]);
                const duJour = date === jour;
                const ouverte = date === selection;
                return (
                  <li key={date}>
                    <Link
                      href={`/jouer/${date}`}
                      aria-label={`${titreDuJour(date)}${duJour ? ", la grille du jour" : ""}${reussie ? ", réussie" : ""}`}
                      aria-current={ouverte ? "page" : undefined}
                      data-reussie={reussie || undefined}
                      className={[
                        "relative flex aspect-square items-center justify-center rounded-md border text-sm font-medium transition-colors",
                        "hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        reussie ? "border-primary bg-primary text-primary-foreground" : "bg-secondary/40 text-foreground",
                        duJour && !reussie ? "border-2 border-foreground" : "",
                        ouverte ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-background" : "",
                      ].join(" ")}
                    >
                      {numero}
                      {reussie && <Check className="absolute right-0.5 top-0.5 h-3 w-3" aria-hidden />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
