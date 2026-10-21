import Link from "next/link";
import { linkClass } from "@/components/legal/section";
import { metadataLongueur, PageLongueur } from "@/components/mots/page-longueur";
import { titreClass } from "@/components/mots/page-mots";

/**
 * À RELIRE PAR L'AUTEUR : tout le texte de cette page a été rédigé par Claude (8 octobre 2026). Aucun chiffre, aucun
 * mot de la liste : la page ne connaît que des motifs, la recherche fait le reste. Les titres, la description et les
 * terminaisons sont dans `content/mots/longueurs.ts` et `tools/lexicon/listes.py`.
 */
const SLUG = "six-lettres";

export const metadata = metadataLongueur(SLUG);

export default function SixLettresPage() {
  return (
    <PageLongueur
      slug={SLUG}
      texte={
        <>
          <h2 className={titreClass}>Quand six cases résistent</h2>
          <p>
            Un mot de six lettres traverse souvent plusieurs autres mots de la grille : c’est autant de lettres que tu peux déjà avoir. Compte-les, reporte-les dans la rangée à leur place exacte, et regarde ce qui reste. Si la liste est trop longue pour être parcourue, c’est qu’il te manque une lettre : retourne voir un mot croisé voisin, il te la donnera peut-être.
          </p>
          <p>
            Tu hésites sur le début ou sur la fin ? Les listes « commençant par » et « finissant par » plus haut donnent tous les mots de six lettres d’une initiale ou d’une terminaison : certaines, comme EUR, AGE ou ION, sont à elles seules une famille de mots entière.
          </p>
          <p>
            Pour un mot plus court ou plus long, change le nombre de lettres au-dessus des cases, ou passe par la <Link href="/search" className={linkClass}>recherche par motif</Link>.
          </p>
        </>
      }
    />
  );
}
