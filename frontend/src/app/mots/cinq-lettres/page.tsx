import Link from "next/link";
import { linkClass } from "@/components/legal/section";
import { motifHref } from "@/components/mots/liste-de-mots";
import { metadataLongueur, PageLongueur } from "@/components/mots/page-longueur";
import { titreClass } from "@/components/mots/page-mots";

/**
 * À RELIRE PAR L'AUTEUR : tout le texte de cette page a été rédigé par Claude (8 octobre 2026). Aucun chiffre, aucun
 * mot de la liste : la page ne connaît que des motifs, la recherche fait le reste (les listes complètes sont sur les
 * pages « commençant par » et « finissant par »). Les titres, la description et les finales sont dans
 * `content/mots/longueurs.ts`.
 */
const SLUG = "cinq-lettres";

export const metadata = metadataLongueur(SLUG);

export default function CinqLettresPage() {
  return (
    <PageLongueur
      slug={SLUG}
      texte={
        <>
          <h2 className={titreClass}>Comment t’en servir avec ta grille</h2>
          <p>
            Tu es devant ta grille, sur papier ou sur écran, et il te manque un mot. Tu sais qu’il fait cinq lettres, et les mots qui le croisent t’ont déjà donné deux ou trois d’entre elles. Compte les cases du mot, puis tape dans la rangée tes lettres connues, à leur place exacte. Laisse vides les autres cases.
          </p>
          <p>
            Un exemple : le mot commence par P et finit par E. Tape P dans la première case, E dans la dernière : les mots de cinq lettres qui collent s’affichent juste en dessous, sans quitter la page, et la liste se resserre à chaque lettre que tu ajoutes. Tu n’as plus qu’à garder celui qui va avec ta définition. Et si tu sais seulement par quelle lettre il commence ou par quelle lettre il finit, ouvre la liste complète de cette initiale ou de cette terminaison, juste au-dessus.
          </p>

          <h2 className={titreClass}>Ce que veut dire le « ? »</h2>
          <p>
            Un point d’interrogation veut dire « une lettre, je ne sais pas laquelle ». Chaque case vide en devient un : <Link href={motifHref("P???E")} className={linkClass}>P???E</Link> cherche les mots de cinq lettres qui commencent par P et finissent par E. Tu peux aussi écrire ce motif toi-même dans la <Link href="/search" className={linkClass}>recherche</Link>. Pas d’accents dans une grille : tape E pour É.
          </p>

          <h2 className={titreClass}>Une astuce</h2>
          <p>
            Pars des lettres dont tu es sûr, pas de celles que tu espères. Une seule lettre fausse et le bon mot ne sortira jamais. Si rien ne convient, vide la case dont tu doutes le plus : tu verras plus de mots, mais le bon y sera. Quand une lettre vient d’un mot croisé que tu as bien vérifié, fie-toi à elle d’abord.
          </p>
          <p>
            Et si toute la grille te résiste, le <Link href="/grid" className={linkClass}>générateur</Link> peut la remplir à ta place.
          </p>
        </>
      }
    />
  );
}
