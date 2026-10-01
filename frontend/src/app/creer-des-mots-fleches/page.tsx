import { type Metadata } from "next";
import Link from "next/link";
import { StepFigure } from "@/components/guide/guide-figures";
import { linkClass } from "@/components/legal/section";
import { site } from "@/config/site";
import { publicPage } from "@/lib/seo";

/**
 * Le guide « Comment créer des mots fléchés » (Phase 9, recadrée le 29/09/2026 : une seule page de contenu,
 * pour les passionnés). La fabrication à la main, de zéro, suivie sur une grille 7 × 9 (layout 7x9-001) ; Le Fléchoir
 * n'apparaît qu'à la fin. Texte relu par l'auteur : toute retouche passe par lui.
 */
const TITLE = "Comment créer des mots fléchés : de l’idée à la grille";
const DESCRIPTION =
  "Dessiner la grille, la remplir, écrire les définitions : comment je crée mes mots fléchés à la main, sur une grille de 7 sur 9 construite pas à pas.";

export const metadata: Metadata = publicPage({ path: "/creer-des-mots-fleches", title: TITLE, description: DESCRIPTION });

const SECTIONS = [
  { id: "ce-que-demande-une-grille", title: "Ce que demande une grille" },
  { id: "au-depart-deux-mots", title: "Au départ, deux mots" },
  { id: "le-cadre", title: "Le cadre" },
  { id: "chercher-ce-qui-croise", title: "Chercher ce qui croise" },
  { id: "quand-ca-coince", title: "Quand ça coince" },
  { id: "refermer-la-grille", title: "Refermer la grille" },
  { id: "les-definitions", title: "Les définitions" },
  { id: "l-epreuve-de-la-table", title: "L’épreuve de la table" },
  { id: "si-tu-veux-aller-plus-vite", title: "Si tu veux aller plus vite" },
];

// Données structurées : un article, pour que les moteurs sachent ce qu'est la page
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: TITLE,
  description: DESCRIPTION,
  inLanguage: site.lang,
  mainEntityOfPage: `${site.url}/creer-des-mots-fleches`,
  datePublished: "2026-09-30",
  author: { "@type": "Organization", name: site.name, url: site.url },
  publisher: { "@type": "Organization", name: site.name, url: site.url },
};

export default function GuidePage() {
  return (
    <main className="container mx-auto max-w-3xl p-4 md:p-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <h1 className="text-3xl font-bold md:text-4xl">Comment créer des mots fléchés</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Créer une grille de mots fléchés, c’est enchaîner trois métiers : dessiner la grille, la remplir de mots qui se croisent partout, puis écrire les définitions. Voici ce que chacun demande, et la façon dont je m’y prends moi-même, sur une grille construite du début à la fin.
      </p>

      <nav aria-labelledby="sommaire" className="mt-8 rounded-lg border bg-secondary/20 p-4">
        <h2 id="sommaire" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Sommaire
        </h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          {SECTIONS.map(({ id, title }) => (
            <li key={id}>
              <a href={`#${id}`} className={linkClass}>
                {title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <article className="mt-6 space-y-6 leading-relaxed text-muted-foreground [&_p]:text-[1.05rem]">
        <section aria-labelledby="ce-que-demande-une-grille" className="space-y-4">
          <h2 id="ce-que-demande-une-grille" className="scroll-mt-20 pt-6 text-2xl font-semibold text-foreground">Ce que demande une grille</h2>
          <p>
            Dans une grille de mots fléchés, aucune case ne se repose. Chaque lettre appartient à un mot, souvent à deux, et chaque mot a sa définition écrite dans une case voisine, d’où part une flèche. Il n’y a pas de cases noires pour souffler comme dans les mots croisés : ce sont les cases définitions qui en tiennent lieu. Il en faut assez pour loger tous les textes, mais pas trop, sinon la grille se couvre de petits mots sans intérêt.
          </p>
          <p>
            Le travail se fait en trois temps. D’abord le dessin : où placer les cases définitions. La plupart des grilles de magazine ont la même allure, avec une case définition sur deux le long de la première ligne et de la première colonne, puis quelques cases dispersées à l’intérieur. Ensuite le remplissage, de loin l’étape la plus longue : trouver des mots qui s’emboîtent dans les deux sens, sans recourir à ceux que personne n’emploie. Enfin les définitions, la seule partie que le joueur lira vraiment, et celle qui décidera s’il a aimé la grille.
          </p>
          <p>
            Pour commencer, il y a deux grandes écoles. On peut partir d’un dessin vide, choisi ou recopié, et le remplir case après case. On peut aussi partir des mots qu’on tient à placer et construire la grille autour. Je fais plutôt la seconde, en gardant en tête l’allure classique pour le dessin.
          </p>
          <p>
            Côté matériel, il faut du papier quadrillé, un crayon, une bonne gomme et un dictionnaire où l’on peut chercher des mots d’après les lettres qu’on connaît. Il faut surtout du temps : même une petite grille peut prendre une soirée entière. Ce qui suit est ma façon de faire, pas une recette. Il en existe sûrement mille autres ; prends ce qui te sert.
          </p>
        </section>
        <section aria-labelledby="au-depart-deux-mots" className="space-y-4">
          <h2 id="au-depart-deux-mots" className="scroll-mt-20 pt-6 text-2xl font-semibold text-foreground">Au départ, deux mots</h2>
          <p>
            Je ne commence jamais par une grille vide. Je commence par deux mots que j’ai envie d’y voir et qui peuvent se croiser. Pour celle-ci, CONTREBAS et BLASON. CONTREBAS parce qu’il est long et qu’il lui manque deux lettres pour faire une contrebasse : sa définition était trouvée d’avance, « Contrebasse écourtée ». BLASON parce que je savais déjà comment le définir : « Redoré quand on se rattrape ».
          </p>
          <p>
            Ils partagent un B. J’écris CONTREBAS à la verticale, BLASON à l’horizontale à travers son B, et j’ajoute tout de suite leurs cases définitions. Celle de BLASON va à sa gauche. CONTREBAS, lui, commence tout en haut : sa définition ira dans la case à gauche de sa première lettre, avec une flèche qui tourne pour descendre.
          </p>
          <StepFigure n={1} />
        </section>
        <section aria-labelledby="le-cadre" className="space-y-4">
          <h2 id="le-cadre" className="scroll-mt-20 pt-6 text-2xl font-semibold text-foreground">Le cadre</h2>
          <p>
            Autour de la croix, je trace un rectangle. C’est lui qui donne le format de la grille. CONTREBAS fait neuf cases de haut, BLASON et sa case définition sept de large : ce sera une grille de 7 sur 9.
          </p>
          <p>
            Ensuite, je pose les cases définitions qui suivent l’allure classique : une case sur deux sur la première ligne, une case sur deux dans la première colonne. Elles tombent bien, celles de CONTREBAS et de BLASON en font déjà partie. Pour l’intérieur, je ne décide rien encore. Les autres cases définitions viendront au fil du remplissage, là où un mot devra s’arrêter.
          </p>
          <StepFigure n={2} />
        </section>
        <section aria-labelledby="chercher-ce-qui-croise" className="space-y-4">
          <h2 id="chercher-ce-qui-croise" className="scroll-mt-20 pt-6 text-2xl font-semibold text-foreground">Chercher ce qui croise</h2>
          <p>
            Le plus gros morceau, c’est la deuxième ligne. Elle part du bord gauche, traverse toute la grille, et chacune de ses lettres commencera une colonne. Je sais seulement que sa deuxième lettre est le O de CONTREBAS. En motif, ça s’écrit ?O?????, un point d’interrogation par lettre inconnue. Mon dictionnaire en propose des centaines.
          </p>
          <p>
            Je me laisse tenter par MORCEAU. Avec une contrebasse dans les parages, un morceau de musique me semblait aller de soi. Je l’écris, content de moi, et je passe aux colonnes.
          </p>
        </section>
        <section aria-labelledby="quand-ca-coince" className="space-y-4">
          <h2 id="quand-ca-coince" className="scroll-mt-20 pt-6 text-2xl font-semibold text-foreground">Quand ça coince</h2>
          <p>
            La dernière colonne descend sur huit cases, depuis le U de MORCEAU jusqu’en bas de la grille, et elle passe par le N final de BLASON. Motif : U????N??. Je cherche, je retourne le problème dans tous les sens : pas un seul mot courant. Seulement des mots que je n’avais jamais vus, et que le joueur n’aurait jamais trouvés.
          </p>
          <p>
            C’est là qu’on gomme. Je pourrais aussi bouger une case définition pour couper la colonne, mais ça abîmerait l’allure de la grille, et c’est le U qui pose problème, pas la colonne. Une lettre difficile au bout d’une ligne, contre le bord, coûte cher : c’est la première lettre de toute une colonne. Je gomme MORCEAU.
          </p>
          <StepFigure n={3} />
          <p>
            Je reprends le motif en regardant cette fois la dernière lettre avant le reste. SONORES garde l’idée musicale et finit sur un S, qui ouvre la dernière colonne en grand : S????N?? donne une trentaine de mots courants, SOUVENIR, SEMAINES, SERPENTS, SOUTENUE. Je prends SOUTENUE, parce que sa définition m’est venue en l’écrivant : « Comme une langue de salon ».
          </p>
          <p>
            Cette fois, ça s’est réglé vite. Ce n’est pas toujours le cas. Il m’arrive de gommer, de regommer, de laisser une grille de côté pendant des semaines, et parfois de l’abandonner : deux mots de départ qui ne veulent rien donner, un coin impossible à fermer sans trois mots que personne n’emploie. Ça fait partie du jeu, et une grille ratée m’apprend souvent plus qu’une grille qui se remplit toute seule.
          </p>
          <StepFigure n={4} />
        </section>
        <section aria-labelledby="refermer-la-grille" className="space-y-4">
          <h2 id="refermer-la-grille" className="scroll-mt-20 pt-6 text-2xl font-semibold text-foreground">Refermer la grille</h2>
          <p>
            Avec trois mots longs sur les bords, le reste se resserre. En bas, la dernière ligne part du S de CONTREBAS et finit sur le E de SOUTENUE : S????E. Des dizaines de possibilités ; je prends SIECLE. La deuxième ligne, elle, ne m’a pas laissé le choix : entre le N de CONTREBAS et le O de SOUTENUE, N????O n’a qu’une réponse courante, NUMERO.
          </p>
          <p>
            Il reste le milieu. C’est là que je pose les dernières cases définitions, quatre en tout, décalées d’une ligne à l’autre pour qu’elles ne se touchent jamais. Des cases définitions groupées en bloc, je trouve ça laid, et ça se voit de loin. Chaque case coupe une ligne en deux mots plus courts : OTE et PEU, REEL, LE et MINE, PAON et EU.
          </p>
          <p>
            Les colonnes se remplissent alors presque seules. Sous le N de SONORES et le U de NUMERO, NUEE. Au centre, REPLIS descend jusqu’au S de BLASON. Plus à droite, MERE au-dessus, NOEL en dessous, dans la même colonne, ce qui m’a fait sourire. En bas au centre, EMANE et LOI.
          </p>
          <p>
            Je me recule. Vingt mots, douze cases définitions bien réparties, et aucun mot de grille. Même aussi petite, une grille comme celle-ci peut prendre une soirée, sans compter tout ce qui finit à la gomme.
          </p>
          <StepFigure n={5} />
        </section>
        <section aria-labelledby="les-definitions" className="space-y-4">
          <h2 id="les-definitions" className="scroll-mt-20 pt-6 text-2xl font-semibold text-foreground">Les définitions</h2>
          <p>
            Une fois la grille pleine, je change de métier. Quelques définitions sont déjà dans la marge, arrivées en même temps que le mot. Pour les autres, je prends mon temps. C’est la partie que je préfère, et c’est elle que le joueur retiendra.
          </p>
          <p>
            Je cherche d’abord les jeux de mots : une expression prise au pied de la lettre, un mot détourné, deux sens qui se croisent. NUMERO devient « Sacré personnage ». REEL devient « Il dépasse parfois la fiction ». Pour NOM, « Commun ou propre ». Pour LOI, « Dure, mais c’est elle ». MINE, dans une grille faite au crayon, ne pouvait être que « S’use au bout du crayon ». Pour SIECLE, « Grand, sous Louis XIV ».
          </p>
          <p>
            Mais une grille où tout est jeu de mots devient un mur. Le joueur a besoin de portes d’entrée, des définitions franches qui lui donnent ses premières lettres et le laissent avancer tranquillement. Je les place sur les petits mots qui croisent beaucoup : « Retiré » pour OTE, « Pas beaucoup » pour PEU, « Article défini » pour LE. Ce ne sont pas les plus belles, mais sans elles personne n’entrerait dans la grille. Quant aux définitions les plus tordues, je les réserve aux mots que les croisements tiennent déjà bien : si l’énigme résiste, les lettres voisines finissent par la trahir.
          </p>
          <p>
            Entre les deux, il y a tout un éventail. « Fait la roue » pour PAON est un classique, mais il marche toujours. « Contrebasse écourtée », pour CONTREBAS, joue sur l’orthographe plutôt que sur le sens : le joueur cherche un instrument et tombe sur un adverbe. Avec SONORES juste à côté, la fausse piste musicale est complète.
          </p>
          <p>
            Pour finir, je relis chaque définition en me posant une seule question : quel autre mot de la même longueur pourrait y répondre ? « Il dépasse parfois la fiction » appelle REEL, mais VRAI a aussi quatre lettres et pourrait tenter le joueur. Ici, le R de CONTREBAS tranche. Sans lui, il aurait fallu réécrire la définition. C’est exactement le genre de piège qu’on ne voit pas soi-même.
          </p>
          <StepFigure n={6} />
        </section>
        <section aria-labelledby="l-epreuve-de-la-table" className="space-y-4">
          <h2 id="l-epreuve-de-la-table" className="scroll-mt-20 pt-6 text-2xl font-semibold text-foreground">L’épreuve de la table</h2>
          <p>
            Je fais la plupart de mes grilles pour les voir résolues à plusieurs, et c’est là qu’elles se jugent vraiment. Je les fais tester, si possible par deux ou trois personnes en même temps, et j’essaie de me taire. Les silences trop longs sur une même case me signalent une définition ratée ou ambiguë. Les rires me disent ce qu’il faut garder. Et quand quelqu’un écrit une autre réponse que la mienne et qu’elle passe dans les croisements, j’ai une ambiguïté à corriger.
          </p>
          <p>
            C’est aussi pour ça que je varie les définitions. Autour d’une table, chacun a ses points forts : l’un connaît l’histoire, un autre les expressions, un troisième a l’oreille pour les calembours. Une grille réussie donne une prise à chacun. Seul, je mets deux ou trois jours à venir à bout d’une grande grille ; à plusieurs, deux ou trois heures, et c’est bien plus drôle. On en parle rarement, mais c’est pour moi le meilleur des mots fléchés.
          </p>
          <p>
            Ensuite, je mets au propre : une feuille neuve, des cases assez grandes pour y écrire deux définitions, les textes en petites capitales, les flèches tracées, coudées quand un mot part du bord.
          </p>
        </section>
        <section aria-labelledby="si-tu-veux-aller-plus-vite" className="space-y-4">
          <h2 id="si-tu-veux-aller-plus-vite" className="scroll-mt-20 pt-6 text-2xl font-semibold text-foreground">Si tu veux aller plus vite</h2>
          <p>
            Tout ce qui précède se fait avec un crayon. Si le remplissage te décourage, le <Link href="/grid" className={linkClass}>générateur du Fléchoir</Link> remplit une grille automatiquement, et la <Link href="/search" className={linkClass}>recherche par motif</Link> trouve les mots qui correspondent à un motif comme S????N??. Les définitions, en revanche, restent entièrement à toi.
          </p>
        </section>
      </article>
    </main>
  );
}
