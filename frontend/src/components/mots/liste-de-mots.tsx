import Link from "next/link";
import { linkClass } from "@/components/legal/section";
import { type ListeMots } from "@/content/mots";

/** L'adresse de la recherche par motif, déjà remplie : `/search?motif=A%3F%3F` pour A?? */
export function motifHref(motif: string): string {
  return `/search?motif=${encodeURIComponent(motif)}`;
}

/** Le motif des mots d'une initiale : A + un point d'interrogation par lettre qui suit */
function motifDe(initiale: string, longueur: number): string {
  return initiale + "?".repeat(longueur - 1);
}

/**
 * Les mots d'une liste, groupés par initiale, en gros caractères, sur des colonnes qui se resserrent sur un
 * téléphone. Chaque groupe renvoie à la recherche par motif (A??) ; aucune fréquence, aucune définition.
 */
export function ListeDeMots({ liste, titre }: { liste: ListeMots; titre: string }) {
  return (
    <div>
      <nav aria-label="Aller à une lettre" className="mt-4 flex flex-wrap gap-2">
        {liste.groupes.map(({ initiale }) => (
          <a
            key={initiale}
            href={`#lettre-${initiale}`}
            className="flex h-11 w-11 items-center justify-center rounded-md border bg-secondary/30 text-lg font-semibold hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Aller aux mots qui commencent par ${initiale}`}
          >
            {initiale}
          </a>
        ))}
      </nav>

      <div className="mt-6 space-y-8">
        {liste.groupes.map(({ initiale, mots }) => (
          <section key={initiale} id={`lettre-${initiale}`} aria-labelledby={`lettre-${initiale}-titre`} className="scroll-mt-32">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-b pb-1">
              <h3 id={`lettre-${initiale}-titre`} className="text-2xl font-bold text-foreground">
                {initiale}
                <span className="ml-3 text-base font-normal text-muted-foreground">
                  {mots.length} mot{mots.length > 1 ? "s" : ""}
                </span>
              </h3>
              {liste.longueur && (
                <Link href={motifHref(motifDe(initiale, liste.longueur))} className={`${linkClass} text-base`}>
                  <span className="font-mono font-semibold">{motifDe(initiale, liste.longueur)}</span> dans la recherche
                </Link>
              )}
            </div>
            <ul aria-label={`${titre} en ${initiale}`} className="mt-3 grid grid-cols-3 gap-x-4 gap-y-2 sm:grid-cols-4 md:grid-cols-6">
              {mots.map((mot) => (
                <li key={mot} className="font-mono text-xl font-semibold tracking-widest text-foreground">
                  {mot}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
