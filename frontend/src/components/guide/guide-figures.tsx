import type { GridData } from "@/components/grid/grid-display";
import { GridSvg } from "@/components/grid/grid-svg";
import { GUIDE_STEPS, type GuideStep } from "@/components/guide/guide-steps";

/**
 * Les illustrations du guide « Comment créer des mots fléchés » : la grille du fil rouge, étape par étape.
 *
 * Dessinées par le composant des grilles de l'application, et non par des images : ce que le lecteur voit
 * ici a l'allure de ce que le site imprime.
 */

/** Une étape en grille : les cases hors du rectangle (« - ») ne sont pas dessinées. */
function toGrid(step: GuideStep): GridData {
  const cells = step.rows.flatMap((row, y) =>
    [...row].flatMap((char, x) =>
      char === "-" ? [] : [{ x, y, char: char === "#" || char === "." ? "" : char, is_black: char === "#" }],
    ),
  );
  return {
    width: step.rows[0].length,
    height: step.rows.length,
    layout: "guide",
    seed: null,
    cells,
    words: step.clues.map(({ text, x, y, direction }) => ({ text, x, y, direction, source: "common" })),
    fill_ratio: 1,
    wish_ratio: 0,
    must_words: [],
    clues: step.clues,
  };
}

/** Une étape de la grille, `n` compté à partir de 1 comme dans le texte. */
export function StepFigure({ n }: { n: number }) {
  const step = GUIDE_STEPS[n - 1];
  const defined = Object.keys(step.definitions).length > 0;
  return (
    <figure className="my-8">
      <div className={`mx-auto ${defined ? "max-w-lg" : "max-w-xs"}`}>
        <GridSvg
          grid={toGrid(step)}
          variant={defined ? "vierge" : "edition"}
          definitions={step.definitions}
          litCells={step.lit}
          frame={!step.rows.some((row) => row.includes("-"))}
        />
      </div>
      <figcaption className="mt-3 text-center text-sm text-muted-foreground">{step.caption}</figcaption>
    </figure>
  );
}
