import { metadataLongueur, PageLongueur } from "@/components/mots/page-longueur";
import { titreClass } from "@/components/mots/page-mots";

/**
 * À RELIRE PAR L'AUTEUR : tout le texte de cette page a été rédigé par Claude (8 octobre 2026). Aucun chiffre, aucun
 * mot de la liste : la page ne connaît que des motifs, la recherche fait le reste.
 */
const SLUG = "dix-lettres";

export const metadata = metadataLongueur(SLUG);

export default function DixLettresPage() {
  return (
    <PageLongueur
      slug={SLUG}
      texte={
        <>
          <h2 className={titreClass}>Dix lettres : peu de mots, vite triés</h2>
          <p>
            Un mot de dix lettres est long, et chaque lettre que tu connais en écarte beaucoup d’autres. Dès que deux ou trois lettres sont posées, la liste devient souvent courte. Tape-les à leur place, et parcours ce qui reste.
          </p>
          <p>
            Au-delà de dix lettres, le sélecteur au-dessus des cases te laisse aller jusqu’à quinze : la rangée s’agrandit, la recherche se fait sur place.
          </p>
        </>
      }
    />
  );
}
