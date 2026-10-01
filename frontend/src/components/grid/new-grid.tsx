"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GridSvg } from "@/components/grid/grid-svg";
import type { GridData } from "@/components/grid/grid-display";
import { apiFetch } from "@/lib/api-client";
import { withNext } from "@/lib/next-path";
import { useAuth } from "@/contexts/auth-context";

type CatalogLayout = { id: string; rows: string[]; stats: { words: number } };
type CatalogFormat = { width: number; height: number; layouts: CatalogLayout[] };

const MIN_SIDE = 4;
const MAX_SIDE = 20;

/** Un dessin de grille sans lettres, pour choisir : cases définitions en gris, cases lettres en blanc. */
function shapeOf(rows: string[]): GridData {
  return {
    width: rows[0]?.length ?? 0,
    height: rows.length,
    layout: "apercu",
    seed: null,
    cells: rows.flatMap((row, y) => [...row].map((char, x) => ({ x, y, char: "", is_black: char === "x" }))),
    words: [],
    fill_ratio: 0,
    wish_ratio: 0,
    must_words: [],
  };
}

const clampSide = (value: number) => Math.min(MAX_SIDE, Math.max(MIN_SIDE, Math.round(value) || MIN_SIDE));

/**
 * Créer une grille à la main (roadmap, point 5B) : depuis un layout du catalogue, ou toute vide.
 *
 * Sans compte, on parcourt les layouts ; les remplir demande un compte, puisque la grille se range
 * dans « Mes grilles » et s'ouvre dans l'éditeur.
 */
export function NewGrid() {
  const router = useRouter();
  const { isAuthenticated, isLoading: isSessionLoading } = useAuth();
  const [chosen, setChosen] = useState<string | null>(null);
  // Petit par défaut : une première grille se finit mieux en 6 × 7 qu'en 13 × 16
  const [width, setWidth] = useState(6);
  const [height, setHeight] = useState(7);
  const [isCreating, setCreating] = useState(false);

  const { data, isLoading, error } = useQuery<{ formats: CatalogFormat[] }, Error>({
    queryKey: ["layouts"],
    queryFn: () => apiFetch("/api/layouts"),
  });

  const create = async (body: { layout: string } | { width: number; height: number }) => {
    setCreating(true);
    try {
      const saved = await apiFetch("/api/grids/blank", { method: "POST", body });
      router.push(`/grids/edit?id=${saved.id}`);
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : "La grille n'a pas pu être créée.");
      setCreating(false);
    }
  };

  const accountNeeded = !isSessionLoading && !isAuthenticated;

  return (
    <main className="container mx-auto max-w-5xl p-4 md:p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Créer une grille à la main</h1>
        <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
          Pars d&apos;une mise en page du catalogue, ou d&apos;une grille vide où tu places toi-même les cases
          définitions. Tu remplis ensuite les mots, avec des suggestions qui gardent les croisements valides.
        </p>
      </div>

      {accountNeeded && (
        <div className="mx-auto mt-6 max-w-xl rounded-lg border bg-secondary/20 p-4 text-center text-sm">
          <p>
            Parcours librement les mises en page. Pour en remplir une, il faut un compte gratuit : ta grille
            t&apos;attend ensuite dans «&nbsp;Mes grilles&nbsp;».
          </p>
          <div className="mt-3 flex flex-col justify-center gap-2 sm:flex-row">
            <Button asChild size="sm">
              <Link href={withNext("/register", "/grids/new")}>Créer un compte gratuit</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={withNext("/login", "/grids/new")}>Se connecter</Link>
            </Button>
          </div>
        </div>
      )}

      <section aria-labelledby="vide" className="mt-10 space-y-4">
        <h2 id="vide" className="text-xl font-semibold">Une grille vide</h2>
        <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
          <div className="space-y-4">
            {/* Un conseil, discret : la taille par défaut le suit déjà */}
            <p className="text-sm text-muted-foreground">
              Première grille ? Un petit format, 6&nbsp;×&nbsp;6 ou 6&nbsp;×&nbsp;7, est plus simple pour commencer.
            </p>
            <p className="text-sm text-muted-foreground">
              De {MIN_SIDE} à {MAX_SIDE} cases de côté. Toutes les cases sont d&apos;abord des cases lettres :
              efface et transforme celles qui porteront les définitions.
            </p>
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <Label htmlFor="largeur">Largeur</Label>
                <Input
                  id="largeur"
                  type="number"
                  min={MIN_SIDE}
                  max={MAX_SIDE}
                  value={width}
                  onChange={(event) => setWidth(Number(event.target.value))}
                  onBlur={() => setWidth(clampSide(width))}
                  className="w-24"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="hauteur">Hauteur</Label>
                <Input
                  id="hauteur"
                  type="number"
                  min={MIN_SIDE}
                  max={MAX_SIDE}
                  value={height}
                  onChange={(event) => setHeight(Number(event.target.value))}
                  onBlur={() => setHeight(clampSide(height))}
                  className="w-24"
                />
              </div>
              <Button
                disabled={accountNeeded || isCreating}
                onClick={() => void create({ width: clampSide(width), height: clampSide(height) })}
              >
                Créer une grille vide de {clampSide(width)}&nbsp;×&nbsp;{clampSide(height)}
              </Button>
            </div>
          </div>
          <div className="mx-auto w-full max-w-[16rem]">
            <GridSvg grid={shapeOf(Array(clampSide(height)).fill("-".repeat(clampSide(width))))} variant="vierge" />
          </div>
        </div>
      </section>

      <section aria-labelledby="catalogue" className="mt-12 space-y-6">
        <div>
          <h2 id="catalogue" className="text-xl font-semibold">Une mise en page du catalogue</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Les cases définitions sont déjà placées. Choisis-en une, puis remplis-la.
          </p>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error.message}</p>
        ) : (
          data?.formats.map((format) => (
            <div key={`${format.width}x${format.height}`} className="space-y-2">
              <h3 className="font-medium">
                {format.width}&nbsp;×&nbsp;{format.height}
              </h3>
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                {format.layouts.map((layout) => (
                  <li key={layout.id}>
                    <button
                      type="button"
                      onClick={() => setChosen(layout.id)}
                      aria-pressed={chosen === layout.id}
                      aria-label={`Mise en page ${layout.id}, ${layout.stats.words} mots`}
                      className={`w-full rounded-md border p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        chosen === layout.id ? "border-primary ring-2 ring-primary" : "hover:border-primary/60"
                      }`}
                    >
                      <GridSvg grid={shapeOf(layout.rows)} variant="vierge" />
                      <span className="mt-1 block text-xs text-muted-foreground">{layout.stats.words} mots</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
        {/* Collé en bas : le choix se fait en défilant, l'action doit rester sous la main */}
        <div className="sticky bottom-0 flex justify-center bg-background/95 py-3">
          <Button disabled={!chosen || accountNeeded || isCreating} onClick={() => chosen && void create({ layout: chosen })}>
            {chosen ? `Remplir la mise en page ${chosen}` : "Choisis une mise en page"}
          </Button>
        </div>
      </section>
    </main>
  );
}
