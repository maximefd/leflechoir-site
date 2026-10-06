"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GridSvg } from "@/components/grid/grid-svg";
import type { GridData } from "@/components/grid/grid-display";
import { apiFetch } from "@/lib/api-client";
import { withNext } from "@/lib/next-path";
import { useAuth } from "@/contexts/auth-context";

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
 * Créer une grille à la main (roadmap, point 5B) : une taille, puis l'éditeur. Son tutoriel propose trois départs
 * (#221) : la première ligne et la première colonne, une grille de magazine tirée au hasard, ou une grille vierge.
 * Plus de galerie de mises en page toutes faites.
 *
 * La remplir demande un compte, puisque la grille se range dans « Mes grilles » et s'ouvre dans l'éditeur.
 */
export function NewGrid() {
  const router = useRouter();
  const { isAuthenticated, isLoading: isSessionLoading } = useAuth();
  // Petit par défaut : une première grille se finit mieux en 6 × 7 qu'en 13 × 16
  const [width, setWidth] = useState(6);
  const [height, setHeight] = useState(7);
  const [isCreating, setCreating] = useState(false);

  const create = async (body: { width: number; height: number }) => {
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
          Choisis une taille. Dans l&apos;éditeur, pars de la première ligne et de la première colonne, d&apos;une
          grille de magazine tirée au hasard, ou d&apos;une grille vierge. Tu remplis ensuite les mots, avec des
          suggestions qui gardent les croisements valides.
        </p>
      </div>

      {accountNeeded && (
        <div className="mx-auto mt-6 max-w-xl rounded-lg border bg-secondary/20 p-4 text-center text-sm">
          <p>
            Pour créer une grille, il faut un compte gratuit : ta grille t&apos;attend ensuite dans
            «&nbsp;Mes grilles&nbsp;».
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
        <h2 id="vide" className="text-xl font-semibold">La taille de ta grille</h2>
        <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
          <div className="space-y-4">
            {/* Un conseil, discret : la taille par défaut le suit déjà */}
            <p className="text-sm text-muted-foreground">
              Première grille ? Un petit format, 6&nbsp;×&nbsp;6 ou 6&nbsp;×&nbsp;7, est plus simple pour commencer.
            </p>
            <p className="text-sm text-muted-foreground">
              De {MIN_SIDE} à {MAX_SIDE} cases de côté. La grille de magazine au hasard demande au moins 5 cases
              de côté.
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

    </main>
  );
}
