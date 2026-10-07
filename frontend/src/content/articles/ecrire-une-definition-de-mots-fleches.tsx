import Link from "next/link";
import { linkClass } from "@/components/legal/section";
import generated from "@/content/articles/grilles/ecrire-une-definition-de-mots-fleches.json";
import type { Article } from "@/content/articles/types";
import { specFromGeneration } from "@/lib/mini-grid";

/** Brouillon rédigé pour l'auteur, à relire : le ton, les exemples et la méthode doivent devenir les siens. */
export const article: Article = {
  slug: "ecrire-une-definition-de-mots-fleches",
  title: "Comment écrire une bonne définition de mots fléchés",
  description:
    "Définitions franches, détours qui font sourire, pièges à éviter : comment j’écris les définitions de mes mots fléchés, avec des exemples courts.",
  chapo:
    "Une grille se remplit avec des mots, mais elle se joue avec des définitions. C’est la seule chose que le joueur lit vraiment, et celle qui décide s’il a passé un bon moment. Voici comment je les écris, avec des exemples que tu peux reprendre ou démonter.",
  published: "2026-10-06",
  draft: true,
  related: ["guide", "recherche", "generer"],
  grid: {
    title: "Une grille de 8 sur 8, vingt-deux définitions",
    // Générée par le site (8 × 8, INDICE imposé, seed 4) : voir grilles/ecrire-une-definition-de-mots-fleches.json
    spec: specFromGeneration(generated, {
      GEAI: "Bavard des bois",
      OPE: "Opération écourtée",
      TSARISME: "Régime de l’Est",
      DESSERTS: "Finissent bien",
      SE: "Réfléchi avant le verbe",
      PISTE: "Se suit ou se brouille",
      TRAC: "Saisit avant d’entrer",
      AGE: "Ne se demande pas",
      GRILLE: "Au crayon ou au charbon",
      ARS: "Village du curé",
      AIR: "Se donne ou se chante",
      ARAS: "Plumes en couleurs",
      ADN: "Signature intime",
      INDICE: "Coup de pouce",
      NIE: "Refuse l’évidence",
      SALINS: "Font le sel de la côte",
      AIL: "Chasse les vampires",
      ILE: "De Ré ou de Beauté",
      MOT: "Se croise ici",
      ON: "Tous et personne",
      CLE: "Solution, à la fin",
      SENS: "Double, s’il est bon",
    }),
  },
  sections: [
    {
      id: "une-definition-c-est-une-porte",
      title: "Une définition, c’est une porte",
      body: (
        <>
          <p>
            Quand je finis de remplir une grille, j’ai fait la moitié du travail, et pas la plus visible. Le joueur ne
            verra jamais les heures passées à faire croiser les mots. Il verra une vingtaine de petits textes serrés
            dans des cases grises, et c’est sur eux qu’il jugera la grille. Une grille remplie avec des mots
            ordinaires mais bien définie se joue avec plaisir. L’inverse est rarement vrai.
          </p>
          <p>
            Une définition a deux rôles qui tirent en sens contraire. Elle doit mener au mot, sans quoi la grille est
            injouable. Et elle doit le faire avec un peu de résistance, sans quoi la grille est ennuyeuse. Tout l’art
            est dans le dosage, et ce dosage change d’un mot à l’autre.
          </p>
          <p>
            Il y a aussi une contrainte matérielle qu’on oublie quand on écrit sur une feuille à part : la case. Elle
            est petite. Dans une grille de magazine, une définition tient sur trois ou quatre lignes très courtes,
            souvent moins quand la case en porte deux. Je vise une vingtaine de caractères, rarement plus de
            vingt-cinq. Ça oblige à couper, et couper améliore presque toujours une définition.
          </p>
        </>
      ),
    },
    {
      id: "le-sens-propre-d-abord",
      title: "Le sens propre d’abord",
      body: (
        <>
          <p>
            La définition la plus simple est un synonyme ou une périphrase directe. « Tente le coup » pour OSE, « Pas
            comblé » pour DÉÇU, « Pas cela » pour CECI. Elles n’ont rien de brillant, et c’est leur force : le joueur
            les trouve sans effort et récolte ses premières lettres. Je les appelle des portes d’entrée.
          </p>
          <p>
            Une grille sans portes d’entrée est un mur. Le joueur la regarde, ne trouve prise nulle part, et la
            referme. Je place donc mes définitions franches sur les mots qui croisent beaucoup, en particulier les
            petits mots du haut de la grille et du bord gauche : chaque lettre trouvée là en ouvre une autre.
          </p>
          <p>
            Même franche, une définition se travaille. « Fatigué » pour USÉ fonctionne, mais « Comme un vieux jean »
            donne une image et reste aussi facile. Le joueur trouve tout de suite, et il a eu un petit plaisir en
            plus. C’est souvent ça, une bonne définition facile : le mot évident, dit d’une façon qu’on n’attendait
            pas.
          </p>
        </>
      ),
    },
    {
      id: "le-detour-qui-fait-sourire",
      title: "Le détour qui fait sourire",
      body: (
        <>
          <p>
            Les définitions dont on se souvient sont celles qui font un détour. Il y en a de plusieurs sortes, et
            j’essaie de les varier dans une même grille.
          </p>
          <p>
            <strong className="text-foreground">L’expression prise au pied de la lettre.</strong> On part d’une
            expression toute faite et on n’en garde qu’un morceau. « Le silence en est » pour OR. « On la passe pour
            oublier » pour ÉPONGE. « On le renvoie par politesse » pour ASCENSEUR. Le joueur entend l’expression avant
            de voir le mot, et le déclic vient quand il la reconnaît.
          </p>
          <p>
            <strong className="text-foreground">Le double sens.</strong> Un mot qui a deux vies, et une définition qui
            les mélange. « Monnaie courante » pour EUROS. « Ouvert quand le temps est couvert » pour PARAPLUIE.
            « Rayé de naissance » pour ZÈBRE. Le joueur part sur une piste, revient sur l’autre, et sourit.
          </p>
          <p>
            <strong className="text-foreground">La fausse piste.</strong> La définition oriente vers un domaine, et la
            réponse est ailleurs. « Revient sans prévenir » fait penser à une personne, et c’est un TIC. « À la page »
            évoque un livre, et c’est IN. Ces définitions-là sont précieuses, mais elles se méritent : une fausse
            piste sur un mot que rien ne croise, c’est une impasse, pas un jeu.
          </p>
          <p>
            <strong className="text-foreground">Le clin d’œil au mot voisin.</strong> « Gît après lui » pour CI, parce
            qu’on écrit « ci-gît ». « Juste après do » pour RÉ. Ces petites définitions donnent du relief aux mots de
            deux lettres, qui reviennent dans toutes les grilles et qu’on finit par définir toujours de la même façon.
          </p>
          <p>
            <strong className="text-foreground">Le piège sur la nature du mot.</strong> Le joueur croit chercher un
            nom, et c’est un adjectif ou un verbe. « Vieux jeu » fait penser à un jeu de société oublié ; la réponse
            est DÉMODÉ. « Régime de l’Est » envoie vers la diététique, et c’est le TSARISME. C’est le détour le plus
            économe : deux ou trois mots suffisent.
          </p>
          <p>
            <strong className="text-foreground">Le décalage.</strong> Parfois, il suffit de dire le mot depuis un
            endroit inattendu. « Chasse les vampires » pour AIL, « Ne se demande pas » pour ÂGE : rien de faux, rien
            de compliqué, mais le joueur ne l’attendait pas de ce côté-là.
          </p>
          <p>
            Pour trouver ces détours, je pars du mot et je me demande où on l’entend : dans quelles expressions, dans
            quels métiers, dans quelles chansons. ZÈBRE ne m’a rien donné tant que je cherchais du côté de la savane.
            Il a suffi de penser à ses rayures, puis au verbe rayer.
          </p>
        </>
      ),
    },
    {
      id: "les-pieges-a-eviter",
      title: "Les pièges à éviter",
      body: (
        <>
          <p>
            <strong className="text-foreground">Le genre, le nombre et le temps.</strong> La définition et le mot
            doivent s’accorder. « Pas comblé » appelle DÉÇU ; pour DÉÇUE, il faut « Pas comblée ». Un pluriel appelle
            un pluriel, un infinitif un infinitif. Le joueur s’en sert pour compter les cases, et une faute ici le
            trahit au pire moment.
          </p>
          <p>
            <strong className="text-foreground">Le mot dans sa définition.</strong> « Petit chat » pour CHATON ne
            définit rien : le joueur a la réponse sous les yeux. La règle vaut aussi pour la famille du mot. Si je
            définis CHANTEUR, le verbe chanter n’a rien à faire dans la définition.
          </p>
          <p>
            <strong className="text-foreground">L’autre réponse.</strong> C’est le piège le plus sournois, parce
            qu’on ne le voit pas soi-même : on connaît la réponse. « Animal domestique » en quatre lettres, c’est
            CHAT pour moi, mais VEAU pour quelqu’un qui a grandi dans une ferme, et rien dans la définition ne dit
            lequel. Avant de valider une définition, je me demande quel autre mot de même longueur pourrait y
            répondre. Si les lettres croisées ne tranchent pas,
            je réécris.
          </p>
          <p>
            <strong className="text-foreground">La référence trop pointue.</strong> Un nom de joueur de foot des
            années 1980, un terme de botanique, un village que je connais parce que j’y passe mes vacances. Ce qui me
            paraît évident ne l’est pas pour tout le monde. Une grille doit pouvoir se faire sans encyclopédie, et
            quand un mot rare est inévitable, sa définition doit être la plus claire possible.
          </p>
        </>
      ),
    },
    {
      id: "doser-la-force",
      title: "Doser la force d’une grille",
      body: (
        <>
          <p>
            Une grille n’est pas difficile parce que ses mots sont rares. Elle l’est parce que ses définitions font
            des détours. Avec les mêmes mots, je peux faire une grille pour débutant ou une grille qui résistera une
            soirée. C’est ce que les joueurs appellent la force.
          </p>
          <p>
            Pour une grille facile, presque tout est franc, avec deux ou trois clins d’œil pour le plaisir. Pour une
            grille forte, c’est l’inverse, mais je garde toujours quelques portes d’entrée : une grille forte reste
            une grille qu’on finit. Entre les deux, je mélange, et je place les définitions les plus tordues sur les
            mots que les croisements tiennent déjà bien. Si l’énigme résiste, les lettres voisines finissent par la
            trahir.
          </p>
          <p>
            Je relis ensuite la grille comme un joueur, dans l’ordre où il la ferait : en partant du coin en haut à
            gauche. Si je bute sur trois définitions difficiles d’affilée avant la moindre lettre, je déplace la
            difficulté.
          </p>
        </>
      ),
    },
    {
      id: "ma-methode",
      title: "Ma méthode, en pratique",
      body: (
        <>
          <p>
            Pour chaque mot, j’écris au moins trois définitions avant de choisir. La première est presque toujours la
            plus banale : c’est celle que tout le monde aurait écrite. La deuxième commence à chercher. La troisième
            est souvent la bonne, ou me met sur sa piste. Je garde les autres sur une liste, elles serviront dans une
            autre grille.
          </p>
          <p>
            Je relis ensuite toutes les définitions à voix haute. Une définition qui sonne mal à l’oral est souvent
            mal construite. Puis je vérifie la longueur, case par case, parce qu’une définition trop longue sera
            coupée ou écrite trop petit.
          </p>
          <p>
            Enfin, je fais jouer la grille par quelqu’un d’autre, sans rien dire. Ses hésitations me montrent les
            définitions ambiguës, ses sourires celles qu’il faut garder. Rien ne remplace ce test-là. Si tu veux
            voir comment tout ça s’insère dans la fabrication d’une grille entière, je le raconte dans{" "}
            <Link href="/creer-des-mots-fleches" className={linkClass}>le guide pour créer des mots fléchés</Link>.
            Et si tu cherches un mot pour un emplacement précis, la{" "}
            <Link href="/search" className={linkClass}>recherche par motif</Link> le trouve d’après les lettres que
            tu as déjà.
          </p>
          <p>
            La grille ci-dessous, c’est le générateur du site qui l’a remplie, avec quelques mots de cet article
            cachés dedans. Les définitions, c’est moi. Il y a des portes d’entrée et des détours ; dis-moi
            ensuite si je les ai bien dosés.
          </p>
        </>
      ),
    },
  ],
};
