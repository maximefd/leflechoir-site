import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Lien } from "@/components/layout/rubriques";

/**
 * La page d'une rubrique (Créer, Outils) : ce qu'on y trouve, en liens qui disent ce qu'ils font. Elle sert au
 * téléphone surtout, où la rubrique est une pastille de l'en-tête (maquette « Onglet Créer sur téléphone »).
 */
export function PageRubrique({
  titre,
  chapo,
  groupes,
}: {
  titre: string;
  chapo: string;
  groupes: { titre?: string; liens: readonly Lien[] }[];
}) {
  return (
    <main className="container mx-auto max-w-3xl p-4 md:p-8">
      <h1 className="text-3xl font-bold md:text-4xl">{titre}</h1>
      <p className="mt-4 text-lg text-muted-foreground">{chapo}</p>
      {groupes.map((groupe, index) => (
        <section key={groupe.titre ?? index} aria-label={groupe.titre} className="mt-8">
          {groupe.titre && <h2 className="mb-3 text-lg font-semibold">{groupe.titre}</h2>}
          <ul className="grid gap-3">
            {groupe.liens.map((lien) => (
              <li key={lien.href}>
                <Link
                  href={lien.href}
                  className="flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors hover:bg-secondary/60"
                >
                  <span>
                    <span className="block text-lg font-medium text-foreground">{lien.label}</span>
                    <span className="mt-1 block text-muted-foreground">{lien.texte}</span>
                  </span>
                  <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
