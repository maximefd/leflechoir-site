import { metadataLongueur, PageLongueur } from "@/components/mots/page-longueur";
import { titreClass } from "@/components/mots/page-mots";

/**
 * À RELIRE PAR L'AUTEUR : tout le texte de cette page a été rédigé par Claude (8 octobre 2026). Aucun chiffre, aucun
 * mot de la liste : la page ne connaît que des motifs, la recherche fait le reste.
 */
const SLUG = "sept-lettres";

export const metadata = metadataLongueur(SLUG);

export default function SeptLettresPage() {
  return (
    <PageLongueur
      slug={SLUG}
      texte={
        <>
          <h2 className={titreClass}>Sept lettres, plusieurs croisements</h2>
          <p>
            Un mot de sept lettres coupe plusieurs mots de la grille : tu as de bonnes chances d’en connaître déjà deux ou trois lettres. Indique celles dont tu es sûr, et laisse vides les autres cases. La recherche écarte tout ce qui ne colle pas, et la liste se resserre à chaque lettre ajoutée.
          </p>
          <p>
            Regarde aussi la fin du mot : une définition qui est un verbe appelle souvent une terminaison en ER, une action appelle ION. Les boutons « finissant par » placent la terminaison pour toi.
          </p>
        </>
      }
    />
  );
}
