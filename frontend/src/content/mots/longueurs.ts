/**
 * Les pages « Mot de N lettres » (`/mots/<nombre>-lettres`) : un outil pour qui est bloqué dans une grille et connaît
 * la longueur du mot et quelques-unes de ses lettres. L'outil affiche sur place les mots que l'API de recherche
 * renvoie pour le motif ; la page elle-même est vide tant qu'on ne cherche pas.
 *
 * Deux sortes de pages :
 * - avec `combinaisons` (2 à 10 lettres, toutes depuis le 25/10/2026) : en plus, une page statique par initiale et par terminaison
 *   (`/mots/cinq-lettres/commencant-par-a`, `…/finissant-par-ez`), dont la liste complète est dans le HTML. Les
 *   combinaisons viennent de `catalogue.json` (écrit par `make listes`, `tools/lexicon/listes.py`) ;
 * - sans : l'outil et ses raccourcis (boutons), sans liste de mots. Plus aucune longueur publiée n'est dans ce cas ;
 *   le sélecteur de longueur au-delà de 10 lettres change la rangée sur place.
 *
 * Une nouvelle longueur : une entrée ici et un dossier `src/app/mots/<slug>/page.tsx` avec son texte (voir
 * `cinq-lettres`). Le sitemap, l'index `/mots`, le sélecteur de longueur et le fil d'Ariane suivent tout seuls.
 */
export type PageLongueur = {
  longueur: number;
  /** Adresse : `/mots/<slug>` */
  slug: string;
  /** Intitulé dans les listes de liens et le fil d'Ariane */
  title: string;
  /** Titre de page pour les moteurs, avant « | nom du site » (60 caractères au plus avec lui) */
  metaTitle: string;
  /** Titre de la page (H1) */
  h1: string;
  /** Une phrase pour l'index et pour la description des moteurs */
  chapo: string;
  /** Les finales les plus utiles, de la plus courte à la plus longue : « ER » donne ???ER. Sans `combinaisons` seulement */
  finales: readonly string[];
  /** Cette longueur a ses pages « commençant par » et « finissant par » (catalogue.json) */
  combinaisons: boolean;
};

export const NOMBRES: Record<number, string> = {
  2: "deux", 3: "trois", 4: "quatre", 5: "cinq", 6: "six", 7: "sept", 8: "huit", 9: "neuf", 10: "dix",
};

/** Les longueurs qu'on peut choisir dans le sélecteur ; au-delà de 10 lettres, la recherche se fait sur place */
export const LONGUEUR_MIN = 2;
export const LONGUEUR_MAX = 15;

function pageLongueur(
  longueur: number,
  chapo: string,
  options: { finales?: readonly string[]; combinaisons?: boolean; metaTitle?: string } = {},
): PageLongueur {
  return {
    longueur,
    slug: `${NOMBRES[longueur]}-lettres`,
    title: `Mot de ${longueur} lettres`,
    // « | Le Fléchoir » compris, 60 caractères au plus : à 10 lettres le titre court est un peu plus court
    metaTitle: options.metaTitle ?? `Mot de ${longueur} lettres commençant par, finissant par`,
    h1: `Mot de ${longueur} lettres : trouve celui qui te manque`,
    chapo,
    finales: options.finales ?? [],
    combinaisons: options.combinaisons ?? false,
  };
}

const FINALES_COURANTES = ["E", "S", "R", "T", "ER", "RE", "TE", "ES", "ON", "NT", "EE", "IE"] as const;

export const PAGES_LONGUEUR: readonly PageLongueur[] = [
  pageLongueur(
    2,
    "Les petits mots qui bouchent les coins d’une grille : articles, pronoms, notes de musique, interjections. Tape la lettre que tu connais, ou ouvre la liste de ton initiale.",
    { combinaisons: true, metaTitle: "Mots de 2 lettres pour les mots fléchés" },
  ),
  pageLongueur(
    3,
    "Les mots qui font la jonction entre deux grands, et ceux qui sauvent un coin quand une lettre rare s’y glisse. Tape ce que tu sais, la recherche trouve le reste.",
    { combinaisons: true, metaTitle: "Mots de 3 lettres pour les mots fléchés" },
  ),
  pageLongueur(
    4,
    "Il te manque un mot de 4 lettres pour finir ta grille ? Dis-moi les lettres que tu as : la recherche te propose les mots possibles.",
    { finales: ["E", "S", "R", "T", "ER", "RE", "ES", "ON"], combinaisons: true },
  ),
  pageLongueur(
    5,
    "Un mot de 5 lettres te manque dans une grille ? Tape les lettres que tu connais, laisse vides les autres : la recherche trouve les mots qui collent.",
    { finales: FINALES_COURANTES, combinaisons: true },
  ),
  pageLongueur(
    6,
    "Un mot de 6 lettres résiste dans ta grille ? Place les lettres déjà croisées dans les cases : la recherche sort les mots qui vont avec.",
    { finales: FINALES_COURANTES, combinaisons: true },
  ),
  pageLongueur(
    7,
    "Sept cases, quelques lettres connues : tape-les à leur place et laisse la recherche proposer les mots de 7 lettres qui s’y glissent.",
    { finales: ["E", "S", "R", "T", "ER", "ES", "NT", "ION"], combinaisons: true },
  ),
  pageLongueur(
    8,
    "Pour un mot de 8 lettres, deux ou trois lettres suffisent souvent : indique-les, et la recherche écarte tout ce qui ne colle pas.",
    { finales: ["E", "S", "R", "T", "ER", "ES", "NT", "ION"], combinaisons: true },
  ),
  pageLongueur(
    9,
    "Un grand mot de 9 lettres barre ta grille ? Tape celles que tes mots croisés t’ont livrées : les mots possibles s’affichent aussitôt.",
    { combinaisons: true },
  ),
  pageLongueur(
    10,
    "Un mot de 10 lettres, c’est long, mais chaque lettre connue écarte beaucoup de mots. Place-les, et la recherche te montre ce qui reste possible.",
    { combinaisons: true, metaTitle: "Mot de 10 lettres commençant ou finissant par" },
  ),
];

export function pageLongueurDe(slug: string): PageLongueur {
  const page = PAGES_LONGUEUR.find((candidate) => candidate.slug === slug);
  if (!page) throw new Error(`Page de longueur inconnue : ${slug}`);
  return page;
}

/**
 * L'adresse de la page d'une longueur, quand elle existe : les outils de 2 à 10 lettres.
 * Au-delà de 10 lettres, `null` : le sélecteur change la rangée de cases sur place.
 */
export function adresseDeLongueur(longueur: number): string | null {
  return NOMBRES[longueur] ? `/mots/${NOMBRES[longueur]}-lettres` : null;
}
