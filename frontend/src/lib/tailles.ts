/**
 * Les trois tailles d'un clic du générateur (#220, retour de l'auteur du 06/10/2026), partagées avec le lien préparé :
 * une IA qui écrit `taille=moyenne` obtient la même grille que la personne qui clique sur « Moyenne ».
 */
export type TailleNommee = { name: string; width: number; height: number };

export const PRESETS: readonly TailleNommee[] = [
  { name: "Petite", width: 7, height: 9 },
  { name: "Moyenne", width: 10, height: 13 },
  { name: "Grande", width: 13, height: 16 },
];

/** Les noms que le lien préparé comprend, en français, en anglais et en allemand, sans accent ni casse */
const NOMS: Record<string, string> = {
  petite: "Petite", petit: "Petite", small: "Petite", klein: "Petite",
  moyenne: "Moyenne", moyen: "Moyenne", medium: "Moyenne", mittel: "Moyenne",
  grande: "Grande", grand: "Grande", large: "Grande", gross: "Grande", "groß": "Grande",
};

export function tailleNommee(text: string): TailleNommee | null {
  const name = NOMS[text.trim().toLowerCase()];
  return PRESETS.find((preset) => preset.name === name) ?? null;
}
