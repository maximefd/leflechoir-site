"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Le tutoriel de la grille faite à la main (roadmap 5B) : des étapes courtes, une à la fois, de la grille
 * vide jusqu'aux définitions. Placé au-dessus de la grille, jamais par-dessus : toutes les cases restent
 * cliquables et les lettres tapées visibles.
 *
 * Les étapes 2, 3 et 6 se valident d'elles-mêmes quand l'auteur a fait le geste (l'éditeur avance) :
 * le tutoriel accompagne, il ne fait pas lire. Il revient à chaque grille vide, se passe d'un clic,
 * et se rejoue par « Revoir le tutoriel ».
 */
export type TutorialStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
const TOTAL = 8;

const STEPS: Record<TutorialStep, { title: string; text: string }> = {
  1: {
    title: "Où vont les définitions ?",
    text: "On place d'abord le minimum habituel : une case définition sur deux, sur la première ligne et la première colonne.",
  },
  2: { title: "Place ton premier mot", text: "Clique une case et tape. Tab change de sens." },
  3: {
    title: "Écris un mot qui le croise",
    text: "Clique une case de ton mot, puis Tab : à droite, les mots qui entrent sont proposés.",
  },
  4: { title: "À toi de jouer !", text: "Continue mot après mot, jusqu'à remplir toute la grille." },
  5: {
    title: "Bravo, ta grille est remplie !",
    text: "Place aux définitions : c'est là que ta grille prend sa personnalité.",
  },
  6: { title: "Écris ta première définition", text: "Le mot à définir est surligné. Entrée ou Tab passe au suivant." },
  7: { title: "Continue jusqu'à la dernière", text: "Une définition par mot. Le compteur, en haut, te dit où tu en es." },
  8: { title: "Bravo, ta grille est prête !", text: "Toutes les définitions sont écrites. Il ne reste qu'à la mettre en page et l'imprimer." },
};

export function HandTutorial({
  step,
  onPrefill,
  onNext,
  onDefinitions,
  onLayout,
  onDone,
  onSkip,
}: {
  step: TutorialStep;
  onPrefill: () => void;
  /** Passe à l'étape suivante (« Je les place moi-même », « Suivant »). */
  onNext: () => void;
  onDefinitions: () => void;
  onLayout: () => void;
  /** Ferme l'étape sans refuser la suite : le tutoriel revient quand la grille sera remplie. */
  onDone: () => void;
  onSkip: () => void;
}) {
  const { title, text } = STEPS[step];
  return (
    <div
      role="dialog"
      aria-label={`Tutoriel, étape ${step} sur ${TOTAL} : ${title}`}
      className="mb-2 shrink-0 rounded-lg border-2 border-primary bg-background p-3 text-sm"
    >
      <div className="flex items-center justify-between gap-2">
        {/* La progression en pastilles : on voit où l'on en est sans compter */}
        <ol className="flex gap-1" aria-hidden>
          {Array.from({ length: TOTAL }, (_, i) => i + 1).map((n) => (
            <li key={n} className={`h-1.5 w-5 rounded-full ${n <= step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </ol>
        <button type="button" onClick={onSkip} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
          Passer le tutoriel
        </button>
      </div>
      <p className="mt-2 font-semibold">{title}</p>
      <p className="text-muted-foreground">{text}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {step === 1 && (
          <>
            <Button size="sm" onClick={onPrefill}>
              Oui, place-les
            </Button>
            <Button size="sm" variant="outline" onClick={onNext}>
              Je les place moi-même
            </Button>
          </>
        )}
        {(step === 2 || step === 3 || step === 6) && (
          <>
            {/* Rejoué sur une grille commencée, l'étape peut être déjà faite : on la passe */}
            <Button size="sm" variant="outline" onClick={onNext}>
              Suivant
            </Button>
            <span className="text-xs text-muted-foreground">ou elle se valide toute seule quand c&apos;est fait.</span>
          </>
        )}
        {step === 4 && (
          <Button size="sm" onClick={onDone}>
            C&apos;est parti
          </Button>
        )}
        {step === 5 && (
          <Button size="sm" onClick={onDefinitions}>
            Écrire les définitions
          </Button>
        )}
        {step === 7 && (
          <Button size="sm" onClick={onDone}>
            Compris
          </Button>
        )}
        {step === 8 && (
          <Button size="sm" onClick={onLayout}>
            Voir la mise en page
          </Button>
        )}
        {(step === 4 || step === 7) && (
          <Link
            href="/creer-des-mots-fleches"
            target="_blank"
            rel="noopener"
            className="text-xs underline underline-offset-2 hover:text-foreground"
          >
            Perdu ? Lis le guide (nouvel onglet)
          </Link>
        )}
      </div>
    </div>
  );
}
