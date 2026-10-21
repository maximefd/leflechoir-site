import { metadataLongueur, PageLongueur } from "@/components/mots/page-longueur";
import { titreClass } from "@/components/mots/page-mots";

/**
 * À RELIRE PAR L'AUTEUR : tout le texte de cette page a été rédigé par Claude (8 octobre 2026). Aucun chiffre, aucun
 * mot de la liste : la page ne connaît que des motifs, la recherche fait le reste.
 */
const SLUG = "huit-lettres";

export const metadata = metadataLongueur(SLUG);

export default function HuitLettresPage() {
  return (
    <PageLongueur
      slug={SLUG}
      texte={
        <>
          <h2 className={titreClass}>Un long mot, mais des indices</h2>
          <p>
            Un mot de huit lettres, dans une grille, a souvent déjà livré quelques-unes de ses lettres aux mots qui le croisent. Place-les à leur exacte position et laisse la recherche faire le tri : sur un mot long, même deux lettres bien placées font fondre la liste.
          </p>
          <p>
            Pense aussi à la famille du mot. Si ta définition est une action, cherche une terminaison en ION ; si c’est un verbe, essaie ER ; si elle décrit plusieurs choses, un S ou un NT final. Les boutons « finissant par » posent la terminaison en un clic.
          </p>
        </>
      }
    />
  );
}
