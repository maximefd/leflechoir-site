import Link from "next/link";
import { linkClass } from "@/components/legal/section";
import generated from "@/content/articles/grilles/mots-fleches-dans-le-monde.json";
import type { Article } from "@/content/articles/types";
import { specFromGeneration } from "@/lib/mini-grid";

/**
 * Relu et publié par l'auteur le 07/10/2026. Faits relus avant publication : la grille d'Arthur Wynne
 * (New York World, 21 décembre 1913), les noms étrangers du jeu (Schwedenrätsel, Zweedse puzzel, autodefinido,
 * arrowword), La Settimana Enigmistica (1932), les grilles de Georges Perec pour un hebdomadaire.
 */
export const article: Article = {
  slug: "mots-fleches-dans-le-monde",
  title: "Mots fléchés, mots croisés, Schwedenrätsel : le jeu dans le monde",
  description:
    "De la première grille de New York aux Schwedenrätsel allemands et aux énigmes anglaises : comment les mots fléchés et les mots croisés se jouent ailleurs.",
  chapo:
    "Les mots fléchés ont l’air très français, avec leurs cases grises et leurs flèches coudées. Ils ont pourtant des cousins partout, sous des noms qui disent beaucoup de la façon dont chaque pays joue avec sa langue.",
  published: "2026-10-07",
  draft: false,
  related: ["guide", "recherche", "generer"],
  grid: {
    title: "Une grille qui voyage un peu",
    // Générée par le site (7 × 7, LANGUE imposé, seed 8) : voir grilles/mots-fleches-dans-le-monde.json
    spec: specFromGeneration(generated, {
      HOLA: "Salut ibérique",
      LENTO: "Pas pressé, en musique",
      CRU: "Sans cuisson ni détour",
      GO: "Se joue sur un goban",
      EARL: "Ferme en société",
      AGENTS: "Secrets ou de la circulation",
      LEGERE: "Comme une plume",
      LANGUE: "Se donne au chat",
      ARMEE: "Prête à tirer",
      CARTE: "Du monde ou du restaurant",
      MONDE: "On en fait le tour",
      DIT: "Autrement appelé",
      VIE: "Se gagne en travaillant",
      ID: "Le ça, chez Freud",
      TIR: "Au but ou à l’arc",
      DEISTE: "Croit sans Église",
    }),
  },
  sections: [
    {
      id: "un-jeu-plusieurs-familles",
      title: "Un jeu, plusieurs familles",
      body: (
        <>
          <p>
            En France, on distingue sans y penser les mots croisés et les mots fléchés. Les premiers ont des cases
            noires et des définitions numérotées en marge ; les seconds rangent leurs définitions dans la grille, et
            une flèche dit où va le mot. Pour nous, ce sont deux jeux. Ailleurs, la frontière passe parfois ailleurs,
            et les noms racontent une autre histoire.
          </p>
          <p>
            Je ne prétends pas faire ici le tour du monde des grilles. J’ai seulement voulu comprendre d’où vient le
            jeu que je fabrique, et comment il se joue chez nos voisins. Ce que j’ai trouvé m’a appris quelques
            choses sur ma propre façon d’écrire.
          </p>
        </>
      ),
    },
    {
      id: "new-york-1913",
      title: "New York, 1913",
      body: (
        <>
          <p>
            La première grille de mots croisés connue paraît le 21 décembre 1913, dans le supplément du dimanche du
            New York World. Son auteur, Arthur Wynne, est un journaliste né à Liverpool. Sa grille a la forme d’un
            losange, sans aucune case noire à l’intérieur, et il l’appelle « word-cross ». Le nom s’inverse quelques
            semaines plus tard, et le crossword est né.
          </p>
          <p>
            Il faut une dizaine d’années pour que le jeu devienne une folie. En 1924, un tout jeune éditeur new-yorkais
            publie un recueil de grilles vendu avec un crayon, et le succès est immédiat. Les journaux suivent, puis
            l’Europe. En France, les mots croisés arrivent dans la presse au milieu des années 1920, et ne la quittent
            plus.
          </p>
        </>
      ),
    },
    {
      id: "cases-noires-et-cases-bavardes",
      title: "Cases noires et cases bavardes",
      body: (
        <>
          <p>
            La grande différence entre les deux familles tient à ce qu’on fait des cases vides. Dans les mots
            croisés, une case noire ne dit rien : elle sépare deux mots, et toutes les définitions sont rassemblées
            sous la grille. Le joueur va et vient entre la liste et les cases.
          </p>
          <p>
            Dans les mots fléchés, la case qui sépare deux mots porte leurs définitions. Le joueur n’a jamais besoin
            de quitter la grille des yeux, et c’est sans doute ce qui a fait leur succès dans les magazines de jeux :
            on peut remplir une grille au café, dans le train, sans chercher la définition numéro 14 horizontalement.
          </p>
          <p>
            Ce choix a une conséquence pour celui qui fabrique la grille. Une définition doit tenir dans une case, ce
            qui pousse à la brièveté, et parfois au jeu de mots. Les définitions de mots croisés peuvent prendre leur
            temps ; celles des mots fléchés doivent frapper en quatre mots. J’en parle plus longuement dans{" "}
            <Link href="/articles/ecrire-une-definition-de-mots-fleches" className={linkClass}>
              l’article sur l’écriture des définitions
            </Link>
            .
          </p>
        </>
      ),
    },
    {
      id: "le-detour-par-la-suede",
      title: "Le détour par la Suède",
      body: (
        <>
          <p>
            Demande à un Allemand comment il appelle nos mots fléchés : il te répondra Schwedenrätsel, l’énigme
            suédoise. Les Néerlandais disent de même Zweedse puzzel. Ces noms désignent la grille aux définitions
            intégrées, et ils pointent tous vers la Suède, où ce format domine depuis longtemps les magazines de
            jeux. Je n’ai pas trouvé de source sûre qui dise qui l’a inventé ; le nom dit surtout d’où nos voisins
            pensent qu’il vient.
          </p>
          <p>
            Les Espagnols, eux, parlent d’autodefinidos, des grilles qui se définissent elles-mêmes, ce qui est une
            jolie façon de le dire. Les Britanniques ont leurs arrowwords, littéralement des mots à flèches, le nom
            le plus proche du nôtre. Et les Italiens, grands amateurs de jeux de lettres, ont un hebdomadaire entier
            consacré aux énigmes, La Settimana Enigmistica, publié depuis 1932.
          </p>
          <p>
            Ce qui me frappe en feuilletant ces grilles étrangères, c’est à quel point elles se ressemblent. Les
            mêmes cases grises, les mêmes flèches coudées au bord, les mêmes petits mots qui reviennent pour tenir
            les coins. Le jeu a voyagé sans presque changer de forme.
          </p>
        </>
      ),
    },
    {
      id: "les-britanniques-et-leurs-enigmes",
      title: "Les Britanniques et leurs énigmes",
      body: (
        <>
          <p>
            Le cas le plus étonnant est celui des mots croisés « cryptiques » des journaux britanniques. Chaque
            définition y contient deux indices : une définition ordinaire, et un jeu sur les lettres du mot, qu’il
            faut démonter comme une petite machine. Anagrammes, mots cachés dans la phrase, morceaux de mots
            assemblés : les règles sont strictes, et les amateurs les connaissent par cœur.
          </p>
          <p>
            Pour donner une idée, en français, cela pourrait donner « Abri pour un chien en désordre », en cinq
            lettres. La définition, c’est « abri ». Le jeu, c’est « chien en désordre » : on mélange les lettres de
            CHIEN, et on obtient NICHE. Le joueur qui a compris la mécanique ne devine pas, il démontre.
          </p>
          <p>
            Je n’en mettrai pas dans mes grilles, mais cette exigence m’inspire. Une bonne définition de mots fléchés
            n’a pas besoin d’être aussi codée ; elle doit en revanche être aussi juste. Quand le joueur trouve, il
            doit pouvoir se dire que la définition ne mentait pas.
          </p>
        </>
      ),
    },
    {
      id: "ce-que-la-langue-change",
      title: "Ce que la langue change",
      body: (
        <>
          <p>
            D’un pays à l’autre, la grille suit les règles de sa langue. En français, on oublie les accents : É, È et
            Ê s’écrivent E, et une seule lettre peut ainsi servir à ÉTÉ dans un sens et à MERE dans l’autre. Les
            grilles allemandes remplacent souvent Ä, Ö et Ü par AE, OE et UE, et le ß par SS. Les Suédois, eux,
            gardent Å, Ä et Ö, qui sont pour eux des lettres à part entière, avec leur place au bout de l’alphabet.
          </p>
          <p>
            La longueur des mots compte aussi. L’allemand assemble volontiers des mots très longs, l’anglais regorge
            de mots de trois ou quatre lettres qui croisent facilement. Le français est entre les deux, avec un
            avantage précieux pour le verbicruciste : beaucoup de voyelles, et des terminaisons très régulières
            comme -ER, -ES ou -ENT, qui aident à fermer une grille.
          </p>
        </>
      ),
    },
    {
      id: "et-en-france",
      title: "Et en France ?",
      body: (
        <>
          <p>
            Nous avons au moins un mot que les autres langues nous envient : la distinction entre le cruciverbiste,
            qui résout les grilles, et le verbicruciste, qui les fabrique. Les mots croisés ont eu chez nous de
            grandes plumes, au point que l’écrivain Georges Perec en composait pour un hebdomadaire. Les mots
            fléchés, plus modestes, ont conquis les kiosques et les cahiers de jeux.
          </p>
          <p>
            Ce qui unit toutes ces grilles, d’un pays à l’autre, c’est le plaisir du mot qui tombe juste. Si tu veux
            essayer d’en fabriquer une, avec tes mots à toi, je raconte comment je m’y prends dans{" "}
            <Link href="/creer-des-mots-fleches" className={linkClass}>le guide pour créer des mots fléchés</Link>.
            La petite grille qui suit, le générateur du site l’a remplie, avec quelques mots de cet article cachés dedans ; les définitions sont de moi.
          </p>
        </>
      ),
    },
  ],
};
