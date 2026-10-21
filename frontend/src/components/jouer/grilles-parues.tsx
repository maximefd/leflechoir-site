"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { linkClass } from "@/components/legal/section";
import { aujourdhui, parues } from "@/content/grilles";
import { titreDuJour } from "@/lib/seo";

/**
 * Les grilles récentes sous la grille du jour (`/jouer`), chacune vers sa page datée. La liste est écrite au build
 * (les moteurs y trouvent l'archive, ADR 0026), puis le navigateur la remet au jour : les grilles parues depuis le
 * build s'y ajoutent sans redéployer.
 */
export function GrillesParues({ initiales }: { initiales: { date: string; force: number }[] }) {
  const [liste, setListe] = useState(initiales);
  useEffect(() => setListe(parues(aujourdhui())), []);
  if (!liste.length) return null;

  return (
    <section aria-labelledby="grilles-parues" className="mt-12">
      <h2 id="grilles-parues" className="text-xl font-semibold text-foreground">Les grilles parues</h2>
      <ul className="mt-4 grid gap-2">
        {liste.map(({ date, force }) => (
          <li key={date}>
            <Link href={`/jouer/${date}`} className={linkClass}>{titreDuJour(date)}</Link>
            <span className="text-muted-foreground"> · force {force} sur 4</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
