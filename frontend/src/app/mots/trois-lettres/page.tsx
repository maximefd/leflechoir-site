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
 * (verbes conjugués, interjections, sigles, lettres grecques, mots à lettre rare) sont tous dans la liste ; si un
 * mot en sort après une nouvelle curation, ajuster le texte.
 */
const SLUG = "trois-lettres";

export const metadata = metadataLongueur(SLUG);

export default function TroisLettresPage() {
  const total = entreeCatalogue(SLUG)?.total ?? 0;

  return (
    <PageLongueur
      slug={SLUG}
      texte={
        <>
          {<>
          <h2 className={titreClass}>Le mot de la jonction</h2>
          <p>
            Si les mots de deux lettres bouchent les trous, ceux de trois lettres font les jonctions. Ils tiennent entre une case définition et un mot plus long, ou entre deux cases définitions. Presque chacune de leurs lettres appartient aussi à un mot qui part dans l’autre sens : ce sont des mots qui obligent leurs voisins. Dans la grille de 7 sur 9 de <Link href="/creer-des-mots-fleches" className={linkClass}>mon guide</Link>, OTE et PEU sont de ceux-là.
          </p>
          <p>
            Il y en a bien plus que de mots de deux lettres, et c’est une chance : on a de quoi choisir. Cette liste en compte {total}.
          </p>

          <h2 className={titreClass}>Ce que cette liste est, et ce qu’elle n’est pas</h2>
          <p>
            Ce n’est pas la liste du Scrabble. Elle ne reprend pas tous les mots que la règle autorise, seulement ceux que j’accepte de mettre dans une grille : ceux que j’ai regardés et gardés, et ceux que tout le monde emploie sans réfléchir. Les accents n’existent pas dans une grille : ÂNE s’écrit ANE, ÎLE s’écrit ILE, ÈRE s’écrit ERE, ÉTÉ s’écrit ETE.
          </p>

          <h2 className={titreClass}>Les pièges</h2>
          <ul className="list-disc space-y-2 pl-5 text-[1.05rem]">
            <li>
              <strong className="text-foreground">Les verbes conjugués.</strong> EST, ONT, VAS, EUT, FUT, MIT, DIT, VIT, LIE, RIE, SUE, TUE : beaucoup de mots de trois lettres sont des formes de verbes. EUT, FUT, MIT ou DIT se ressemblent, et seul le croisement les départage. La définition doit donc donner la personne et le temps.
            </li>
            <li>
              <strong className="text-foreground">Les interjections.</strong> AIE, BAH, BOF, EUH, HEU, HOP, OUF, PFF, ZUT : « Cri de douleur » est franc, « Fait hésiter » en laisse plusieurs (EUH, HEU). Elles s’écrivent parfois de plusieurs façons : la liste ci-dessous donne celles que j’accepte.
            </li>
            <li>
              <strong className="text-foreground">Les sigles.</strong> ADN, TVA, QCM, FBI, TTC : je les accepte quand la définition annonce un sigle ou une abréviation, pour que le joueur ne cherche pas un mot entier.
            </li>
            <li>
              <strong className="text-foreground">Les lettres grecques.</strong> ETA, PHI, PSI, KHI, KSI : PHI et PSI, KHI et KSI forment deux paires qui se ressemblent, et dont l’orthographe fait hésiter.
            </li>
          </ul>

          <h2 className={titreClass}>Une astuce de verbicruciste</h2>
          <p>
            Quand une lettre rare tombe dans un coin, un K, un W, un Y, un X ou un Z, je ne change pas tout le mot : je cherche un petit mot qui la porte. WEB, WOK, YAK, YEN, ZIP, ZOO, KIT, KIR, BOX, FOX, SAX, LUX tiennent en trois lettres et sauvent une ligne entière. Ils sont aussi plus faciles à définir qu’un long mot rare.
          </p>
          <p>
            Dans l’autre sens, je me méfie des mots sans voyelle, QCM, TTC, PFF, PST ou ZZZ. Ils obligent le mot qui les croise à avoir une consonne précise à la bonne place. Je les garde pour la fin, quand je sais ce qui croise.
          </p>
        </>
          }
          {<>
          <h2 className={titreClass}>Chercher un mot précis</h2>
          <p>
            Il te faut un mot de trois lettres qui a un O au milieu, ou un X au bout ? La <Link href="/search" className={linkClass}>recherche par motif</Link> répond : tape un point d’interrogation par lettre inconnue. <Link href={motifHref("A?E")} className={linkClass}>A?E</Link> donne les mots qui commencent par A et finissent par E, <Link href={motifHref("?O?")} className={linkClass}>?O?</Link> ceux qui ont un O au milieu, <Link href={motifHref("??X")} className={linkClass}>??X</Link> ceux qui finissent par X. Elle fouille tout le lexique {site.nameAfterDe}, pas seulement cette page : elle peut donc en montrer que tu ne verras pas ici.
          </p>
          <p>
            Si tu préfères que quelqu’un d’autre se charge des jonctions, le <Link href="/grid" className={linkClass}>générateur</Link> remplit la grille entière. Les définitions, c’est toi qui les écris.
          </p>
        </>
          }
        </>
      }
    />
  );
}
