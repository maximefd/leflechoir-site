/**
 * Une grille montrée en illustration dans un article : pas à jouer, à regarder. Elle sert à montrer une grille
 * ratée (rendue par un assistant IA, par exemple), avec ses défauts marqués :
 *
 * - les suites de lettres qui ne sont pas des mots (données à la main, d'après la mesure de l'essai), en rouge ;
 * - les cases sans lettre inutiles : aucune définition ne peut en partir, parce qu'aucun mot ne commence juste à
 *   leur droite ni juste en dessous. C'est la règle de `tools/articles/mesure.py`, recopiée ici.
 *
 * Une grille se lit comme les grilles des articles : une chaîne par ligne, « # » pour une case sans lettre.
 * Un mot « faux » qui n'est pas dans la grille fait échouer le build : l'illustration ne peut pas mentir.
 */
export type Illustration = {
  /** La section après laquelle elle s'affiche */
  after: string;
  titre: string;
  legende: string;
  rows: string[];
  /** Les suites de la grille qui ne sont pas des mots, à marquer en rouge */
  pasDesMots?: string[];
  /** Marquer les cases sans lettre qui ne peuvent porter aucune définition */
  casesInutiles?: boolean;
};

export type CaseIllustree = { lettre: string; fausse: boolean; inutile: boolean };

type Suite = { texte: string; cases: [number, number][] };

function suites(rows: string[]): Suite[] {
  const hauteur = rows.length;
  const largeur = Math.max(...rows.map((ligne) => ligne.length));
  const lettre = (x: number, y: number) => (y < hauteur && x < largeur ? rows[y][x] ?? "#" : "#");
  const trouvees: Suite[] = [];
  for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
    for (let y = 0; y < hauteur; y++) {
      for (let x = 0; x < largeur; x++) {
        const debut = lettre(x, y) !== "#" && (x - dx < 0 || y - dy < 0 || lettre(x - dx, y - dy) === "#");
        if (!debut) continue;
        const cases: [number, number][] = [];
        for (let k = 0; lettre(x + k * dx, y + k * dy) !== "#"; k++) cases.push([x + k * dx, y + k * dy]);
        if (cases.length >= 2) trouvees.push({ texte: cases.map(([cx, cy]) => rows[cy][cx]).join(""), cases });
      }
    }
  }
  return trouvees;
}

export function casesIllustrees({ rows, pasDesMots = [], casesInutiles = false }: Illustration): CaseIllustree[][] {
  const toutes = suites(rows);
  const fausses = new Set<string>();
  for (const mot of pasDesMots) {
    const trouvees = toutes.filter((suite) => suite.texte === mot);
    if (trouvees.length === 0) throw new Error(`${mot} n'est pas une suite de la grille illustrée`);
    trouvees.forEach((suite) => suite.cases.forEach(([x, y]) => fausses.add(`${x}-${y}`)));
  }
  const debuts = new Set(toutes.map((suite) => `${suite.cases[0][0]}-${suite.cases[0][1]}`));
  return rows.map((ligne, y) =>
    [...ligne].map((lettre, x) => ({
      lettre: lettre === "#" ? "" : lettre,
      fausse: fausses.has(`${x}-${y}`),
      inutile: casesInutiles && lettre === "#" && !debuts.has(`${x + 1}-${y}`) && !debuts.has(`${x}-${y + 1}`),
    })),
  );
}
