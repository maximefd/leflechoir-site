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
  words: WordDifficulty[];
  success_rate: number;
  level: string;
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
};

/** « 13x16 » → « 13 × 16 », comme dans le choix de la taille. */
const formatLabel = (name: string) => name.replace("x", "\u00a0×\u00a0");

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
  /** Passe la grille au format conseillé (« 12x15 »), sans toucher aux mots. */
  onSelectFormat: (format: string) => void;
};

/** Le format qui donne le plus de chances, quand il fait nettement mieux que celui choisi. */
function BetterFormat({ difficulty, onSelectFormat }: { difficulty: Difficulty; onSelectFormat: (format: string) => void }) {
  const better = difficulty.better_format;
  if (!better) return null;
  const label = formatLabel(better.format);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-muted p-2 text-xs">
      <p>
        En {label}, ces mots aboutissent {Math.round(better.success_rate * 100)}&nbsp;% du temps, contre{" "}
        {Math.round(difficulty.success_rate * 100)}&nbsp;% ici.
      </p>
      <Button type="button" size="sm" variant="outline" onClick={() => onSelectFormat(better.format)}>
        Passer en {label}
      </Button>
    </div>
  );
}

export function DifficultyPanel({ difficulty, isLoading, hasRequiredWords, onSelectFormat }: DifficultyPanelProps) {
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
        Pas d&apos;estimation : un mot obligatoire ne tient pas dans ce format.
      </p>
    );
  }

  const percent = Math.round(difficulty.success_rate * 100);
  const colour = BAR_COLOURS[difficulty.level] ?? "bg-muted-foreground";

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
      <BetterFormat difficulty={difficulty} onSelectFormat={onSelectFormat} />

      {/* D'où sort le chiffre : sans quoi 66 % se lit comme une promesse */}
      <p className="border-t pt-2 text-xs text-muted-foreground">
        Chiffre mesuré sur 2 640 générations, avec des mots courants tirés du lexique. Chaque tentative
        est indépendante : relancer change de tirage, mais deux échecs de suite sur une demande annoncée
        facile veulent dire que tes mots sont plus durs que ceux de la mesure.
      </p>
    </div>
  );
}

/**
 * Mots qui ne tiennent dans aucune mise en page du format choisi, signalés dès la saisie (#73).
 * Obligatoires ou souhaités : un mot souhaité impossible serait sinon accepté sans un mot, et jamais placé.
 */
export function FitNotice({ fit, onSelectFormat }: {
  fit: Pick<Difficulty, "impossible" | "fitting_formats">;
  onSelectFormat: (format: string) => void;
}) {
  return (
    <div role="status" className="space-y-2 rounded-md border border-destructive/50 p-3">
      <p className="text-sm font-medium">Ces mots ne tiennent pas dans ce format</p>
      <ul className="space-y-1 text-xs">
        {fit.impossible.map((item) => (
          <li key={item.word}>
            <span className="font-mono font-semibold">{item.word}</span> — {item.problem}
          </li>
        ))}
      </ul>
      {fit.fitting_formats.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Formats qui les accueillent :</span>
          {fit.fitting_formats.map((format) => (
            <Button key={format} type="button" size="sm" variant="outline" onClick={() => onSelectFormat(format)}>
              {formatLabel(format)}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Aucun format du catalogue ne les accueille tous : raccourcis ou retire un mot.
        </p>
      )}
    </div>
  );
}
