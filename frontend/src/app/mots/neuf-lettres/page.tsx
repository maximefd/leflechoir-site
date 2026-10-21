import Link from "next/link";
import { linkClass } from "@/components/legal/section";
import { metadataLongueur, PageLongueur } from "@/components/mots/page-longueur";
import { titreClass } from "@/components/mots/page-mots";

/**
 * À RELIRE PAR L'AUTEUR : tout le texte de cette page a été rédigé par Claude (8 octobre 2026). Aucun chiffre, aucun
 * mot de la liste : la page ne connaît que des motifs, la recherche fait le reste.
 */
const SLUG = "neuf-lettres";

export const metadata = metadataLongueur(SLUG);

export default function NeufLettresPage() {
  return (
    <PageLongueur
      slug={SLUG}
      texte={
        <>
          <h2 className={titreClass}>Neuf cases à remplir</h2>
          <p>
            Un mot de neuf lettres croise beaucoup d’autres mots, et c’est tant mieux : chaque croisement t’a laissé une lettre. Avant de chercher, relis les mots qui le coupent, puis reporte seulement les lettres que tu as vérifiées. Une lettre devinée, mieux vaut la laisser vide.
          </p>
          <p>
            Si toute la rangée est vide ou presque, la liste sera trop longue : c’est le signe qu’il faut d’abord trouver un mot croisé plus court. Pour ceux-là, <Link href="/mots" className={linkClass}>les listes de mots</Link> t’aident à chaque longueur.
          </p>
        </>
      }
    />
  );
}
