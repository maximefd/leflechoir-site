"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { withNext } from "@/lib/next-path";

const WITHOUT_ACCOUNT = ["générer des grilles", "chercher un mot par motif", "imprimer une grille et sa solution"];

/** Ce que le compte ajoute, en général (accueil). */
const WITH_ACCOUNT = [
  "conserver tes grilles et les retrouver",
  "retoucher les mots d'une grille",
  "écrire tes propres définitions sur le site",
  "créer tes dictionnaires personnels",
];

/** Sur chaque page, ce que le compte y change : on ne met pas en avant les mêmes choses partout. */
const FOCUS = {
  search: {
    title: "Avec un compte gratuit, tes mots d'abord",
    items: [
      "les mots de tes dictionnaires personnels apparaissent en premier dans les résultats, marqués « Personnel »",
      "des dictionnaires par thème : prénoms, lieux, mots de famille…",
      "les mêmes mots peuvent être placés dans tes grilles à la génération",
    ],
  },
  generation: {
    title: "Avec un compte gratuit, ta grille va plus loin",
    items: [
      "conserver ta grille : elle t'attend après l'inscription",
      "écrire tes propres définitions directement sur le site",
      "modifier les mots de la grille",
    ],
  },
} as const;

function Item({ children, strong = false }: { children: string; strong?: boolean }) {
  return (
    <li className="flex gap-2">
      <Check aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${strong ? "text-primary" : ""}`} />
      {children}
    </li>
  );
}

/**
 * Ce que le compte gratuit apporte, montré seulement à qui n'est pas connecté. Sur l'accueil, la vue
 * d'ensemble (sans compte / avec) ; sur la recherche et la génération, ce que le compte change sur la page.
 * `next` : la page où revenir après l'inscription ou la connexion.
 */
export function AccountBenefits({
  next,
  page = "home",
  className = "",
}: {
  next: string;
  page?: "home" | keyof typeof FOCUS;
  className?: string;
}) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading || isAuthenticated) return null;

  return (
    <aside aria-label="Ce que le compte apporte" className={`rounded-lg border bg-muted/40 p-4 text-sm ${className}`}>
      {page === "home" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="font-medium">Sans compte</p>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              {WITHOUT_ACCOUNT.map((item) => <Item key={item}>{item}</Item>)}
            </ul>
          </div>
          <div>
            <p className="font-medium">Avec un compte gratuit, en plus</p>
            <ul className="mt-2 space-y-1">
              {WITH_ACCOUNT.map((item) => <Item key={item} strong>{item}</Item>)}
            </ul>
          </div>
        </div>
      ) : (
        <>
          <p className="font-medium">{FOCUS[page].title}</p>
          <ul className="mt-2 space-y-1">
            {FOCUS[page].items.map((item) => <Item key={item} strong>{item}</Item>)}
          </ul>
        </>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href={withNext("/register", next)}>Créer un compte gratuit</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={withNext("/login", next)}>Se connecter</Link>
        </Button>
      </div>
    </aside>
  );
}
