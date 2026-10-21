import Link from "next/link";
import { pastille, pastilleCourante } from "@/components/mots/style";
import { cheminCombinaison, combinaisonsDe, titreCombinaison, type TypeCombinaison } from "@/content/mots/combinaisons";

/**
 * Les liens vers les pages « commençant par » (A à Z) ou « finissant par » (EZ, ER…) d'une longueur, en pastilles.
 * `courante` : la combinaison de la page où l'on est, marquée et sans lien. Rendu au build : ce sont de vrais liens
 * dans le HTML, le maillage interne entre toutes les pages d'une longueur.
 */
export function PastillesCombinaisons({
  listeSlug,
  longueur,
  type,
  courante,
}: {
  listeSlug: string;
  longueur: number;
  type: TypeCombinaison;
  courante?: string;
}) {
  return (
    <ul className="flex flex-wrap gap-2">
      {combinaisonsDe(listeSlug, type).map((combinaison) => {
        const titre = titreCombinaison(longueur, combinaison);
        return (
          <li key={combinaison.slug}>
            {combinaison.slug === courante ? (
              <span className={pastilleCourante} aria-current="page" aria-label={`${titre} : page actuelle`}>
                {combinaison.cle}
              </span>
            ) : (
              <Link
                href={cheminCombinaison(listeSlug, combinaison)}
                className={pastille}
                aria-label={titre}
                title={`${combinaison.total} mot${combinaison.total > 1 ? "s" : ""}`}
              >
                {combinaison.cle}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
