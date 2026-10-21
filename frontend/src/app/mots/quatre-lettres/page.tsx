import Link from "next/link";
import { linkClass } from "@/components/legal/section";
import { metadataLongueur, PageLongueur } from "@/components/mots/page-longueur";
import { titreClass } from "@/components/mots/page-mots";

/**
 * À RELIRE PAR L'AUTEUR : tout le texte de cette page a été rédigé par Claude (8 octobre 2026). Aucun chiffre, aucun
 * mot de la liste : la page ne connaît que des motifs, la recherche fait le reste. Pas encore de pages « commençant
 * par » à 4 lettres : les raccourcis sont des boutons (voir `content/mots/longueurs.ts`).
 */
const SLUG = "quatre-lettres";

export const metadata = metadataLongueur(SLUG);

export default function QuatreLettresPage() {
  return (
    <PageLongueur
      slug={SLUG}
      texte={
        <>
          <h2 className={titreClass}>Quatre cases, le ciment de la grille</h2>
          <p>
            Dans une grille de mots fléchés, les mots de quatre lettres font la jonction entre les grands mots, et c’est souvent l’un d’eux qui manque en dernier. Avec un seul croisement, la liste est longue. Avec deux, elle tient d’un coup d’œil.
          </p>
          <p>
            Tape ce que tu sais à sa place exacte, sans te soucier des accents. Si tu ne connais que la première ou la dernière lettre, les boutons « commençant par » et « finissant par » remplissent les cases pour toi.
          </p>

          <h2 className={titreClass}>Une astuce</h2>
          <p>
            Pars de la lettre dont tu es le plus sûr : celle qui vient d’un grand mot déjà trouvé. Une lettre déduite d’une définition qui te laisse un doute vaut moins qu’une case vide. Et pour un mot de trois lettres ou de cinq, regarde la <Link href="/mots" className={linkClass}>page des listes de mots</Link>.
          </p>
        </>
      }
    />
  );
}
