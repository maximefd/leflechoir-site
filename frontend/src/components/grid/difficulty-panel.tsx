"use client";

import { Button } from "@/components/ui/button";

export type WordDifficulty = {
  word: string;
  length: number;
  rare_letters: string[];
  success_rate: number;
  level: string;
  reasons: string[];
  in_lexicon: boolean;
};

export type Difficulty = {
  /** « catalogue » ou « sur_mesure » (#210) : sur mesure, rien n'est encore mesuré. */
  geometry?: "catalogue" | "sur_mesure";
  words: WordDifficulty[];
  /** `null` sur mesure : les taux ont été mesurés sur le catalogue, aucun n'est inventé (#210). */
  success_rate: number | null;
  level: string | null;
  measured: boolean;
  hardest: string | null;
  advice: string | null;
  /** Une grande grille ferait nettement mieux : dit quand le format choisi est petit ou moyen. */
  size_advice: string | null;
  size_class: string | null;
  unknown_words: string[];
  /** Mots qui ne tiennent dans aucune mise en page du format choisi : signalés avant de générer. */
  impossible: { word: string; problem: string }[];
  /** Formats du catalogue qui accueillent ces mots, du plus petit au plus grand (« 13x16 »). */
  fitting_formats: string[];
  /** Format qui donne nettement plus de chances à ces mots (15 points ou plus), à proposer en un clic. */
  better_format: { format: string; width: number; height: number; success_rate: number } | null;
  /** Sur mesure (#219, #220) : la plus petite grille qui a la meilleure probabilité de recevoir ces mots. */
  best_size?: { width: number; height: number; success_rate: number } | null;
};

const BAR_COLOURS: Record<string, string> = {
  facile: "bg-emerald-500",
  moyen: "bg-amber-500",
  difficile: "bg-orange-500",
  "très difficile": "bg-destructive",
};

type DifficultyPanelProps = {
  difficulty: Difficulty | null;
  isLoading: boolean;
  hasRequiredWords: boolean;
};

export function DifficultyPanel({ difficulty, isLoading, hasRequiredWords }: DifficultyPanelProps) {
  if (!hasRequiredWords) {
    return (
      <p className="text-sm text-muted-foreground">
        Sans mot obligatoire, la grille aboutit presque toujours.
      </p>
    );
  }
  if (!difficulty) {
    return <p className="text-sm text-muted-foreground">{isLoading ? "Estimation…" : null}</p>;
  }

  // Impossible, pas seulement difficile : le détail est dit sous la liste des mots (FitNotice)
  if (difficulty.impossible?.length > 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Pas d&apos;estimation : un mot obligatoire ne tient pas dans cette taille.
      </p>
    );
  }

  // Aucun taux mesuré pour cette taille : on le dit plutôt que d'en inventer un
  if (difficulty.success_rate === null) {
    return (
      <div className={`space-y-1 rounded-md border p-4 ${isLoading ? "opacity-60" : ""}`}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium">Chances par tentative</span>
          <span className="text-sm font-semibold">pas encore mesuré</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Les chances de tes mots obligatoires n&apos;ont pas été mesurées pour cette taille. Si la grille
          n&apos;aboutit pas, décoche « Obligatoire » : le mot sera placé s&apos;il rentre.
        </p>
      </div>
    );
  }

  const percent = Math.round(difficulty.success_rate * 100);
  const colour = BAR_COLOURS[difficulty.level ?? ""] ?? "bg-muted-foreground";

  return (
    <div className={`space-y-3 rounded-md border p-4 ${isLoading ? "opacity-60" : ""}`}>
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">Chances par tentative</span>
          <span className="text-2xl font-bold tabular-nums">{percent}&nbsp;%</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className={`h-full ${colour}`} style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {difficulty.level}
          {difficulty.size_class ? ` · grille ${difficulty.size_class}` : " · toutes tailles confondues"}
          {difficulty.measured ? "" : " · estimation, ce cas n'a pas été mesuré"}
        </p>
      </div>

      {/* Ce qui coûte, mot par mot : l'auteur doit voir d'où vient le chiffre */}
      {difficulty.words.some((word) => word.reasons.length > 0) && (
        <ul className="space-y-1 text-xs">
          {difficulty.words
            .filter((word) => word.reasons.length > 0)
            .map((word) => (
              <li key={word.word}>
                <span className="font-mono font-semibold">{word.word}</span> — {word.reasons.join(" ; ")}
              </li>
            ))}
        </ul>
      )}

      {/*
        Un mot hors lexique se place ; ce sont ses croisements qui coûtent. La mesure, elle, a tiré
        ses mots imposés **dans** le lexique : le dire évite de lire le chiffre comme une promesse.
      */}
      {difficulty.unknown_words?.length > 0 && (
        <p className="text-xs text-muted-foreground">
          <span className="font-mono font-semibold">{difficulty.unknown_words.join(", ")}</span>{" "}
          {difficulty.unknown_words.length > 1 ? "ne sont pas" : "n'est pas"} dans le lexique. Le moteur
          {difficulty.unknown_words.length > 1 ? " les place" : " le place"} quand même, mais les mots qui
          {difficulty.unknown_words.length > 1 ? " les croiseront" : " le croiseront"} viendront du lexique
          ou de tes propres mots — et le taux ci-dessus a été mesuré sur des mots du lexique, plus faciles
          à croiser que des mots choisis au hasard.
        </p>
      )}

      {difficulty.advice && <p className="rounded bg-muted p-2 text-xs">{difficulty.advice}</p>}
      {difficulty.size_advice && <p className="rounded bg-muted p-2 text-xs">{difficulty.size_advice}</p>}

      {/* D'où sort le chiffre : sans quoi 66 % se lit comme une promesse */}
      <p className="border-t pt-2 text-xs text-muted-foreground">
        Chiffre mesuré sur des générations de cette taille, avec des mots courants tirés du lexique. Chaque tentative
        est indépendante : relancer donne une autre grille, mais deux échecs de suite sur une demande annoncée
        facile veulent dire que tes mots sont plus durs que ceux de la mesure.
      </p>
    </div>
  );
}

/**
 * La taille conseillée pour les mots imposés (#220) : la plus petite grille qui a la meilleure probabilité de
 * les recevoir (`best_size`, #219), à prendre d'un clic.
 */
export function SizeAdvice({ best, current, onApply, disabled }: {
  best: { width: number; height: number };
  current: { width: number; height: number } | null;
  onApply: (size: { width: number; height: number }) => void;
  disabled?: boolean;
}) {
  const applied = current?.width === best.width && current?.height === best.height;
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted p-2 text-sm">
      <p>
        Taille conseillée pour tes mots : <strong className="tabular-nums">{best.width}&nbsp;×&nbsp;{best.height}</strong>
        {applied && <span className="text-muted-foreground"> (c&apos;est celle choisie)</span>}
      </p>
      {!applied && (
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onApply(best)}>
          Prendre {best.width}&nbsp;×&nbsp;{best.height}
        </Button>
      )}
    </div>
  );
}

/**
 * Mots qui ne tiennent pas dans la taille choisie, signalés dès la saisie (#73) : plus longs que tout mot
 * d'une grille dessinée à cette taille. Obligatoires ou souhaités : un mot souhaité impossible serait sinon
 * accepté sans un mot, et jamais placé.
 */
export function FitNotice({ fit }: { fit: Pick<Difficulty, "impossible"> }) {
  return (
    <div role="status" className="space-y-2 rounded-md border border-destructive/50 p-3">
      <p className="text-sm font-medium">Ces mots ne tiennent pas dans une grille de cette taille</p>
      <ul className="space-y-1 text-xs">
        {fit.impossible.map((item) => (
          <li key={item.word}>
            <span className="font-mono font-semibold">{item.word}</span> — {item.problem}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Agrandis la grille, ou raccourcis-les.</p>
    </div>
  );
}
