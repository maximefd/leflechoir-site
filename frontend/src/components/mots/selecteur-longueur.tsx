"use client";

import { useState } from "react";
import Link from "next/link";
import { pastille, pastilleCourante } from "@/components/mots/style";
import { adresseDeLongueur, LONGUEUR_MAX, LONGUEUR_MIN } from "@/content/mots/longueurs";

const LONGUEURS = Array.from({ length: LONGUEUR_MAX - LONGUEUR_MIN + 1 }, (_, i) => LONGUEUR_MIN + i);

/**
 * Le choix du nombre de lettres (2 à 15), au-dessus des cases. Une longueur qui a sa page (2 et 3 : les listes ; 4 à
 * 10 : les outils) est un lien vers elle ; la longueur de la page où l'on est et celles qui n'ont pas de page (11 à
 * 15) sont des boutons : la rangée de cases change de taille sur place et la recherche s'y fait.
 */
export function SelecteurDeLongueur({
  courante,
  pageLongueur,
  onChoisir,
}: {
  /** La longueur de la rangée de cases en ce moment */
  courante: number;
  /** La longueur de la page où l'on est */
  pageLongueur: number;
  onChoisir: (longueur: number) => void;
}) {
  // Replié par défaut (retour de l'auteur du 08/10/2026) : qui arrive de Google connaît déjà la longueur de son mot
  const [ouvert, setOuvert] = useState(false);
  return (
    <nav aria-label="Nombre de lettres" className="mt-4">
      <p id="nombre-de-lettres" className="text-[1.05rem] text-muted-foreground">
        Mot de {courante} lettres ·{" "}
        <button
          type="button"
          className="text-foreground underline underline-offset-4 transition-colors hover:text-primary/80"
          aria-expanded={ouvert}
          onClick={() => setOuvert(!ouvert)}
        >
          {ouvert ? "Fermer" : "Changer de longueur"}
        </button>
      </p>
      {ouvert && (
      <ul className="mt-3 grid grid-cols-7 gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200 md:grid-cols-14">
        {LONGUEURS.map((n) => {
          const adresse = adresseDeLongueur(n);
          const classe = `${n === courante ? pastilleCourante : pastille} w-full`;
          const etiquette = `${n} lettres`;
          return (
            <li key={n}>
              {adresse && n !== pageLongueur ? (
                <Link href={adresse} className={classe} aria-label={etiquette} aria-current={n === courante ? "true" : undefined}>
                  {n}
                </Link>
              ) : (
                <button
                  type="button"
                  className={classe}
                  aria-label={etiquette}
                  aria-current={n === courante ? "true" : undefined}
                  onClick={() => onChoisir(n)}
                >
                  {n}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      )}
    </nav>
  );
}
