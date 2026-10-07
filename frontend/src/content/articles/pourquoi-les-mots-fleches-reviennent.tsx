import Link from "next/link";
import { linkClass } from "@/components/legal/section";
import generated from "@/content/articles/grilles/pourquoi-les-mots-fleches-reviennent.json";
import type { Article } from "@/content/articles/types";
import { specFromGeneration } from "@/lib/mini-grid";

/**
 * Brouillon rédigé pour l'auteur, à relire. À vérifier avant publication : la mention de la radio ICI
 * (relevé du 02/10/2026) et la date de Wordle (lancé en octobre 2021, racheté par le
 * New York Times en janvier 2022).
 */
export const article: Article = {
  slug: "pourquoi-les-mots-fleches-reviennent",
  title: "Pourquoi les mots fléchés reviennent à la mode",
  description:
    "Pause sans écran, jeux de mots du quotidien, grilles faites maison : pourquoi les mots fléchés, qu’on croyait réservés aux salles d’attente, séduisent à nouveau.",
  chapo:
    "Longtemps, les mots fléchés ont eu l’image d’un passe-temps de salle d’attente. Depuis quelque temps, on en voit partout, et pas seulement entre les mains des grands-parents. J’ai quelques idées sur ce qui se passe.",
  published: "2026-10-06",
  draft: true,
  related: ["mystere", "generer", "guide"],
  grid: {
    title: "Une grille pour la pause",
    // Générée par le site (7 × 7, RETOUR imposé, seed 1) : voir grilles/pourquoi-les-mots-fleches-reviennent.json
    spec: specFromGeneration(generated, {
      CAFE: "Se prend serré",
      JEU: "Il a ses règles",
      TEL: "Ainsi fait",
      PAREFEU: "Garde la forêt et l’ordi",
      REMEDE: "Pire que le mal, parfois",
      FIER: "Comme un paon",
      USINER: "Bosser dur",
      FEUILS: "Fines pellicules",
      NEM: "Se roule à table",
      ECRAN: "On le fuit avec une grille",
      CET: "Ce, devant une voyelle",
      ALU: "Papier qui brille",
      MODE: "Revient toujours",
      OR: "Vaut mieux que l’argent",
      LE: "Article très défini",
      RETOUR: "En grâce, ces temps-ci",
    }),
  },
  sections: [
    {
      id: "une-image-a-depoussierer",
      title: "Une image à dépoussiérer",
      body: (
        <>
          <p>
            Quand je dis que je fabrique des mots fléchés, on me regarde souvent avec un sourire poli. Pour beaucoup,
            c’est le jeu des cahiers achetés à la gare, des salles d’attente et des après-midi chez une grand-tante.
            Un jeu sympathique, mais un peu poussiéreux, qu’on ferait faute de mieux.
          </p>
          <p>
            Cette image a toujours été injuste. Les mots fléchés n’ont jamais disparu : les cahiers de jeux se vendent
            en kiosque depuis des décennies, et beaucoup de gens en font un chaque jour, sans en parler. Mais quelque
            chose a changé. On en parle davantage, on en voit sur les tables des cafés, dans les mains de gens qui ont
            trente ans, et des radios s’y intéressent : début octobre 2026, ICI évoquait même leur retour en grâce.
          </p>
          <p>
            Je n’ai pas de chiffres sérieux pour mesurer ce retour, et je me méfie de ceux qu’on lit parfois. Je peux
            seulement dire ce que je vois et ce que j’entends autour de moi. Voici les raisons qui me semblent les
            plus solides.
          </p>
        </>
      ),
    },
    {
      id: "la-pause-sans-ecran",
      title: "La pause sans écran",
      body: (
        <>
          <p>
            La première raison est la plus simple : une grille de mots fléchés sur papier ne sonne pas, ne vibre pas
            et ne propose rien d’autre. Pendant vingt minutes, on a un crayon, une gomme et une seule chose à faire.
            Après une journée passée à sauter d’une fenêtre à l’autre, cette simplicité a quelque chose de reposant.
          </p>
          <p>
            Ce n’est pas de la nostalgie. C’est le même besoin qui fait revenir les puzzles, le tricot ou les livres
            de coloriage : une activité qui occupe les mains et la tête juste assez pour que le reste se taise. Les
            mots fléchés y ajoutent une petite satisfaction à chaque mot trouvé, ce qui est assez rare pour être
            remarqué.
          </p>
          <p>
            On entend aussi que les jeux de lettres entretiennent la mémoire. Je ne suis pas médecin et je ne
            promettrai rien de ce côté-là. Ce que je constate, c’est qu’une grille faite le matin met de bonne humeur,
            et que ça suffit largement comme raison.
          </p>
        </>
      ),
    },
    {
      id: "les-jeux-de-mots-du-quotidien",
      title: "Les jeux de mots du quotidien",
      body: (
        <>
          <p>
            Il y a quelques années, un petit jeu en ligne a fait le tour du monde : Wordle, un mot de cinq lettres à
            deviner en six essais, un seul par jour. Des millions de gens ont pris l’habitude de chercher un mot
            chaque matin et de comparer leurs résultats. Le jeu a été racheté par le New York Times, et une foule
            d’imitations a suivi, en français comme ailleurs.
          </p>
          <p>
            Je crois que Wordle a rappelé à beaucoup de monde un plaisir que les mots fléchés offrent depuis
            longtemps : trouver un mot à partir de quelques lettres. Une fois qu’on a pris goût à ce petit déclic,
            une grille entière, avec ses vingt ou trente déclics, n’a plus rien d’intimidant. Les jeux de lettres en
            ligne ont en quelque sorte servi d’initiation.
          </p>
          <p>
            Ils ont aussi installé l’idée d’un rendez-vous. Une grille par jour, au café ou dans le train, c’est un
            rituel facile à tenir. Les mots fléchés s’y prêtent très bien : une grille moyenne se fait en un quart
            d’heure.
          </p>
        </>
      ),
    },
    {
      id: "un-jeu-qui-se-partage",
      title: "Un jeu qui se partage",
      body: (
        <>
          <p>
            Les mots fléchés passent pour un jeu solitaire. C’est pourtant à plusieurs que je les préfère, et je ne
            suis pas le seul. Une grille posée au milieu d’une table, un crayon qui passe de main en main, chacun qui
            apporte ce qu’il sait : l’un connaît l’histoire, l’autre les expressions, le troisième a l’oreille pour
            les jeux de mots.
          </p>
          <p>
            C’est aussi l’un des rares jeux où les générations se valent. Le grand-père connaît les vieux mots que
            les grilles adorent, la petite-fille connaît les mots nouveaux qui commencent à y entrer. Personne ne
            gagne contre personne : on gagne quand la grille est finie.
          </p>
          <p>
            Je pense que ce côté coopératif compte beaucoup dans le regain actuel. On cherche des activités à faire
            ensemble qui ne demandent ni écran ni règles compliquées, et une grille coche toutes les cases.
          </p>
        </>
      ),
    },
    {
      id: "le-plaisir-du-declic",
      title: "Le plaisir du déclic",
      body: (
        <>
          <p>
            Au fond, ce qui fait revenir les joueurs, c’est le moment où une définition résiste, puis cède. On lit
            « Le silence en est », on cherche du côté du bruit, puis l’expression revient d’un coup : le silence est
            d’or. Ce petit rire intérieur, c’est tout le jeu.
          </p>
          <p>
            Les grilles d’aujourd’hui jouent davantage sur ce plaisir. On trouve moins de définitions de
            dictionnaire et plus de détours, de doubles sens, de clins d’œil. Les jeunes joueurs, habitués aux
            énigmes et aux jeux de mots des réseaux, s’y retrouvent bien mieux que dans les grilles des années 1980,
            remplies de fleuves russes et d’unités de mesure oubliées.
          </p>
        </>
      ),
    },
    {
      id: "faire-ses-propres-grilles",
      title: "Faire ses propres grilles",
      body: (
        <>
          <p>
            Le dernier changement est celui qui me touche le plus : de plus en plus de gens ne se contentent plus de
            jouer, ils fabriquent. Une grille pour l’anniversaire d’une amie, avec ses souvenirs en définitions. Une
            grille pour un mariage, distribuée sur les tables. Une grille pour le départ en retraite d’un collègue,
            avec les blagues du bureau.
          </p>
          <p>
            Pendant longtemps, c’était un travail de spécialiste. Remplir une grille à la main demande des heures, et
            beaucoup abandonnent avant la fin. Aujourd’hui, des outils font le remplissage, et chacun peut se
            concentrer sur la partie amusante, les définitions. Sur ce site, le{" "}
            <Link href="/grid" className={linkClass}>générateur</Link> remplit la grille, et le mot mystère y cache un
            prénom ou un message à retrouver lettre à lettre. Si tu préfères tout faire au crayon, je raconte ma façon
            de faire dans <Link href="/creer-des-mots-fleches" className={linkClass}>le guide</Link>.
          </p>
          <p>
            Une grille faite pour quelqu’un, avec des définitions qui ne parlent qu’à lui, c’est un cadeau qui ne
            ressemble à aucun autre. Je crois que c’est aussi ça, le retour des mots fléchés : un jeu qu’on ne fait
            plus seulement, mais qu’on offre.
          </p>
          <p>
            En attendant d’écrire la tienne, voici une petite grille pour ta pause. Le générateur du site l’a remplie avec quelques mots de cet article ; les définitions sont de moi.
          </p>
        </>
      ),
    },
  ],
};
