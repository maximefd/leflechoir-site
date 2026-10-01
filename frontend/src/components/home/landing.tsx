"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { site } from "@/config/site";
import { Toggle } from "@/components/ui/toggle";
import { useAuth } from "@/contexts/auth-context";
import { AccountBenefits } from "@/components/account/account-benefits";
import { GridSvg } from "@/components/grid/grid-svg";
import { DEMO_DEFINITIONS, DEMO_GRID } from "@/components/home/demo-grid";
import { ExampleDictionary, ExamplePattern } from "@/components/home/example-grid";
import { GUIDE_STEPS } from "@/components/guide/guide-steps";
import { toGrid } from "@/components/guide/guide-figures";

/** La grille du guide, en cours de construction : deux mots posés, le reste à trouver. */
const EN_COURS = GUIDE_STEPS[3];

const A_LA_MAIN = [
  "Pars d'une grille vide, de la taille que tu veux, ou d'une mise en page du catalogue.",
  "Place les cases définitions où tu veux : l'allure classique se prépare en un clic.",
  "Clique un emplacement : les mots qui gardent les croisements valides te sont proposés, plus courts si tu veux.",
  "Un tutoriel t'accompagne pas à pas sur ta première grille.",
];

/**
 * L'accueil : ce que Terminator fait, dans l'ordre où on s'en sert.
 *
 * La grille montrée est une vraie sortie du moteur, rendue par le composant de l'application — un
 * visiteur voit donc exactement ce que le logiciel fabrique, définitions et flèches comprises.
 */
const STEPS = [
  {
    title: "Générer",
    text: "Choisis un format et, en option, des mots que la grille doit contenir : le moteur génère la grille et annonce sa difficulté avant de chercher.",
    href: "/grid",
    action: "Générer une grille",
  },
  {
    title: "Modifier",
    text: "Une lettre ne te convient pas ? Change-la : le logiciel propose les mots qui entrent sans casser un croisement.",
  },
  {
    title: "Définir",
    text: "Écris tes définitions à même la grille, mot par mot.",
  },
  {
    title: "Imprimer",
    text: "Exporte la grille en PDF, avec sa solution en seconde page.",
  },
];

export function Landing() {
  const { isAuthenticated } = useAuth();
  const [solution, setSolution] = useState(false);

  return (
    <main className="container mx-auto px-4 py-12 md:py-16">
      <section className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
          Tes grilles de mots fléchés, générées ou faites à la main
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          {site.name} génère une grille en quelques secondes, ou t&apos;accompagne pour la construire toi-même, case
          par case. À toi ensuite de choisir tes mots et d&apos;écrire tes définitions.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/grid">Générer une grille</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/grids/new">Créer à la main</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/search">Chercher un mot</Link>
          </Button>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Gratuit. Générer et chercher se font sans compte ; créer à la main demande un compte gratuit.
        </p>
      </section>

      {/* Une grille finie, produite par le moteur : c'est l'argument, autant le montrer */}
      <section className="mt-16 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold">Une grille, du début à la fin</h2>
            <div className="flex gap-1 rounded-md border p-1">
              <Toggle size="sm" pressed={!solution} onPressedChange={() => setSolution(false)}>
                Grille
              </Toggle>
              <Toggle size="sm" pressed={solution} onPressedChange={() => setSolution(true)}>
                Solution
              </Toggle>
            </div>
          </div>
          <div className="max-w-xl">
            <GridSvg
              grid={DEMO_GRID}
              variant={solution ? "solution" : "vierge"}
              definitions={DEMO_DEFINITIONS}
              className="h-auto w-full"
            />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Une vraie sortie du moteur, autour du mot imposé <strong>PIANO</strong>.
          </p>
        </div>

        {/* Numérotée parce que c'en est une : chaque étape suppose la précédente */}
        <ol className="space-y-6">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold tabular-nums">
                {index + 1}
              </span>
              <div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
                {step.href && (
                  <Link
                    href={step.href}
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {step.action}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* La création à la main : un outil à part entière, à côté de la génération et de la recherche */}
      <section className="mt-16 grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="order-2 lg:order-1">
          <h2 className="text-xl font-semibold">Ou construis-la toi-même</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Le plaisir de la fabrication, sans la gomme : tu choisis chaque mot, {site.name} t&apos;aide à les faire
            tenir ensemble.
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {A_LA_MAIN.map((point) => (
              <li key={point} className="flex gap-2">
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button asChild>
              <Link href="/grids/new">Créer une grille à la main</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/creer-des-mots-fleches">Comment s&apos;y prendre : le guide</Link>
            </Button>
          </div>
        </div>
        <div className="order-1 mx-auto w-full max-w-sm lg:order-2">
          <GridSvg grid={toGrid(EN_COURS)} variant="edition" />
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Une grille en construction : deux mots posés, le reste à trouver.
          </p>
        </div>
      </section>

      {/* Ce qui accompagne la génération : les parties moins automatisées de la création d'une grille */}
      <section className="mt-16">
        <h2 className="text-xl font-semibold">Pour t&apos;accompagner à chaque étape</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Le Fléchoir ne fait pas que générer : il t&apos;aide aussi sur ce qui reste à faire à la main.
        </p>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <Link
            href="/search"
            className="group flex flex-col gap-4 rounded-lg border p-6 transition-colors hover:border-primary/60 hover:bg-secondary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex h-28 items-center">
              <ExamplePattern />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Trouver le mot manquant</h3>
              <p className="text-sm text-muted-foreground">
                Les lettres que tu connais, un <span className="font-mono font-semibold">?</span> par case
                vide.
              </p>
            </div>
            <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
              Chercher un motif
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>

          <Link
            href="/dictionaries"
            className="group flex flex-col gap-4 rounded-lg border p-6 transition-colors hover:border-primary/60 hover:bg-secondary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex h-28 items-center">
              <ExampleDictionary />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Tes propres dictionnaires</h3>
              <p className="text-sm text-muted-foreground">
                Tes mots par thème, avec leurs définitions. Ils remontent dans la recherche, et alimentent
                les grilles que tu génères.
              </p>
            </div>
            <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
              Gérer mes dictionnaires
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </div>
      </section>

      {/* « Que se passe-t-il ensuite ? » : ce que le compte change, et ce qu'il ne change pas */}
      <section className="mx-auto mt-16 max-w-2xl text-center">
        {isAuthenticated ? (
          <div className="rounded-lg border bg-secondary/20 p-6">
            <h2 className="font-semibold">Bon retour !</h2>
            <p className="mt-2 text-sm text-muted-foreground">Tes grilles et tes dictionnaires t&apos;attendent.</p>
            <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
              <Button asChild variant="outline" size="sm">
                <Link href="/grids">Mes grilles</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/dictionaries">Mes dictionnaires</Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold">Gratuit, avec ou sans compte</h2>
            <AccountBenefits next="/" className="mt-4 text-left" />
          </>
        )}
      </section>
    </main>
  );
}
