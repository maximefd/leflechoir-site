import { GrilleAVenir } from "@/components/jouer/grille-a-venir";
import { JouerUneGrille } from "@/components/jouer/jouer-une-grille";
import { LOADERS, aujourdhui } from "@/content/grilles";

/**
 * La page d'une grille datée (`/jouer/<date>`, ADR 0026). Le site est figé au build, le jour avance :
 * - une grille déjà parue au build est écrite dans la page (les moteurs la lisent, comme une archive de presse) ;
 * - une grille à venir n'y est pas : la page attend son jour dans le navigateur (`GrilleAVenir`), puis la charge,
 *   sans qu'il faille redéployer. Avant, ni la grille ni sa solution ne se voient.
 */
export async function PageGrille({ date }: { date: string }) {
  if (date > aujourdhui()) return <GrilleAVenir date={date} />;
  const data = (await LOADERS[date]()).default;
  return <JouerUneGrille data={data} />;
}
