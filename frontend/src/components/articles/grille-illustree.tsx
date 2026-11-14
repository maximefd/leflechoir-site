import { casesIllustrees, type Illustration } from "@/lib/grille-illustree";

const HACHURES = "repeating-linear-gradient(45deg, rgb(245 158 11 / 0.55) 0 3px, transparent 3px 7px)";

/** Une grille ratée, montrée dans un article : ses lettres, ses mots faux en rouge, ses cases inutiles hachurées. */
export function GrilleIllustree({ illustration }: { illustration: Illustration }) {
  const cases = casesIllustrees(illustration);
  const fausses = cases.flat().some((c) => c.fausse);
  const inutiles = cases.flat().filter((c) => c.inutile).length;
  const description = `${illustration.titre}. Ligne par ligne : ${illustration.rows
    .map((ligne) => [...ligne].map((c) => (c === "#" ? "case vide" : c)).join(" "))
    .join(" ; ")}.`;

  return (
    <figure className="my-6 space-y-3 rounded-lg border bg-secondary/20 p-4">
      <div
        role="img"
        aria-label={description}
        className="mx-auto grid w-fit gap-px border border-foreground/60 bg-foreground/60"
        style={{ gridTemplateColumns: `repeat(${cases[0]?.length ?? 0}, 2.25rem)` }}
      >
        {cases.flat().map((c, index) => (
          <span
            key={index}
            className={`flex size-9 items-center justify-center font-mono text-lg font-semibold ${
              c.lettre
                ? c.fausse
                  ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
                  : "bg-background text-foreground"
                : "bg-foreground/80"
            }`}
            style={c.inutile ? { backgroundImage: HACHURES } : undefined}
          >
            {c.lettre}
          </span>
        ))}
      </div>
      <figcaption className="space-y-2 text-sm text-muted-foreground">
        <strong className="block text-foreground">{illustration.titre}</strong>
        <span className="block">{illustration.legende}</span>
        {(fausses || inutiles > 0) && (
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            {fausses && (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="inline-block size-3 rounded-sm bg-red-100 ring-1 ring-red-800 dark:bg-red-950" />
                lettre d’une suite qui n’est pas un mot
              </span>
            )}
            {inutiles > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="inline-block size-3 rounded-sm bg-foreground/80" style={{ backgroundImage: HACHURES }} />
                case qui ne peut porter aucune définition ({inutiles})
              </span>
            )}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
