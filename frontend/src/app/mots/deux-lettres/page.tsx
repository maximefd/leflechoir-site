import Link from "next/link";
import { linkClass } from "@/components/legal/section";
import { motifHref } from "@/components/mots/liste-de-mots";
import { metadataLongueur, PageLongueur } from "@/components/mots/page-longueur";
import { titreClass } from "@/components/mots/page-mots";
import { site } from "@/config/site";
import { entreeCatalogue } from "@/content/mots/catalogue";

/**
 * Au format des autres longueurs depuis le 20/10/2026 (outil, pages par initiale et terminaison). Le texte
 * ci-dessous n'est plus affiché, comme sur les autres pages (la FAQ le remplace) ; il est gardé pour mémoire.
 * À RELIRE PAR L'AUTEUR : tout le texte de cette page a été rédigé par Claude (8 octobre 2026) ; la liste, elle,
 * vient de `make listes` (mots validés seulement, voir tools/lexicon/listes.py). Les exemples cités dans le texte
 * (articles, pronoms, notes, lettres grecques, participes en U, sigles) sont tous dans la liste ; si un mot en
 * sort après une nouvelle curation, ajuster le texte.
 */
const SLUG = "deux-lettres";

export const metadata = metadataLongueur(SLUG);

export default function DeuxLettresPage() {
  const total = entreeCatalogue(SLUG)?.total ?? 0;

  return (
    <PageLongueur
      slug={SLUG}
      texte={
        <>
          {<>
          <h2 className={titreClass}>À quoi servent les mots de deux lettres</h2>
          <p>
            Dans une grille de mots fléchés, chaque case définition coupe une ligne ou une colonne en deux. Entre cette case et le bord de la grille, ou entre elle et la suivante, il reste parfois deux cases seulement : il faut alors un mot de deux lettres. C’est le bouche-trou par excellence. On en trouve dans les coins, le long des bords et autour des cases définitions. Dans la grille de 7 sur 9 de <Link href="/creer-des-mots-fleches" className={linkClass}>mon guide</Link>, LE et EU en font partie.
          </p>
          <p>
            Le souci, c’est qu’il n’y en a pas beaucoup : {total} dans cette liste, contre bien plus pour les mots plus longs. Chaque fois qu’on en pose un, on se prive d’un choix. Autant savoir lesquels on a sous la main.
          </p>

          <h2 className={titreClass}>Ce que cette liste est, et ce qu’elle n’est pas</h2>
          <p>
            Ce n’est pas la liste du Scrabble. Elle ne reprend pas tous les mots que la règle autorise, seulement ceux que j’accepte de mettre dans une grille : ceux que j’ai regardés et gardés, et ceux que tout le monde emploie sans réfléchir. Les accents n’existent pas dans une grille, donc OÙ s’écrit OU, ÇA s’écrit CA, et LÀ s’écrit LA.
          </p>

          <h2 className={titreClass}>Les pièges</h2>
          <p>
            Un mot de deux lettres répond à beaucoup de définitions, et c’est ce qui le rend traître. Voici les familles que je retrouve le plus souvent :
          </p>
          <ul className="list-disc space-y-2 pl-5 text-[1.05rem]">
            <li><strong className="text-foreground">Les articles</strong> : LE, LA, UN, DU, AU.</li>
            <li><strong className="text-foreground">Les pronoms</strong> : JE, TU, IL, ON, ME, TE, SE.</li>
            <li><strong className="text-foreground">Les conjonctions</strong> : ET, OU, NI, OR, SI.</li>
            <li><strong className="text-foreground">Les notes de musique</strong> : DO, RE, MI, FA, LA, SI, et UT, l’ancien nom du do.</li>
            <li><strong className="text-foreground">Les lettres grecques</strong> : PI, MU, NU, XI.</li>
            <li><strong className="text-foreground">Les interjections</strong> : AH, EH, HA, HE, HI, HO, OH.</li>
          </ul>
          <p>
            Le même mot passe d’une famille à l’autre. SI est une note, une conjonction, et ce que l’on répond à qui nous contredit. Une définition vague laisse le joueur hésiter, et c’est au croisement qu’il tranche.
          </p>
          <p>
            Autre piège : les participes passés. BU, EU, LU, MU, PU, SU et VU tiennent tous en deux lettres, et ils ne se distinguent que par le sens : « Avalé » donne BU, « Parcouru des yeux » donne LU, « Aperçu » donne VU. Dès que la définition devient floue, ils sont tous à égalité.
          </p>
          <p>
            Enfin, les sigles : CD, CM, TV, WC. Certains verbicrucistes les refusent. Je les accepte, à condition que la définition annonce un sigle ou une abréviation, pour que le joueur ne cherche pas un mot entier.
          </p>

          <h2 className={titreClass}>Une astuce de verbicruciste</h2>
          <p>
            Je choisis mes mots de deux lettres selon leurs voyelles. Un AI, un EU ou un OU se croise avec presque n’importe quoi, puisque leurs lettres sont courantes. À l’inverse, CD, CM, PH, TV ou WC n’ont aucune voyelle : le mot qui les croise doit avoir une consonne précise à la bonne place, et ça resserre tout autour. Je les garde pour les derniers coins, quand je sais déjà ce qui croise.
          </p>
        </>
          }
          {<>
          <h2 className={titreClass}>Chercher un mot précis</h2>
          <p>
            Il te faut un mot de deux lettres qui finit par un U, ou qui commence par un H ? La <Link href="/search" className={linkClass}>recherche par motif</Link> répond : tape un point d’interrogation par lettre inconnue. <Link href={motifHref("A?")} className={linkClass}>A?</Link> donne les mots qui commencent par A, <Link href={motifHref("?U")} className={linkClass}>?U</Link> ceux qui finissent par U. Elle fouille tout le lexique {site.nameAfterDe}, pas seulement cette page : elle peut donc en montrer que tu ne verras pas ici.
          </p>
          <p>
            Si tu préfères que quelqu’un d’autre se charge des coins, le <Link href="/grid" className={linkClass}>générateur</Link> remplit la grille entière. Les définitions, c’est toi qui les écris.
          </p>
        </>
          }
        </>
      }
    />
  );
}
