/**
 * À RELIRE PAR L'AUTEUR : tous les textes de ce fichier ont été rédigés par Claude (8 octobre 2026). Ce sont les courts
 * textes d'accroche des pages « commençant par » et « finissant par » : six tournures par type, choisies d'après la
 * place de la combinaison dans sa liste (deux pages voisines ne se ressemblent donc pas), plus un conseil propre à
 * la lettre ou à la terminaison. Les seuls chiffres sont le nombre de mots de la page et sa longueur ; les exemples
 * sont des mots de la liste (premier, du milieu, dernier). Rien n'est inventé sur la langue : ce que disent les
 * conseils (verbes, pluriels, participes…) est de la grammaire courante.
 */
import { type Combinaison } from "./combinaisons";

const VOYELLES = new Set(["A", "E", "I", "O", "U", "Y"]);
const LETTRES_RARES = new Set(["J", "K", "Q", "W", "X", "Y", "Z"]);

/** « A », « A et B », « A, B et C » */
function enumeration(mots: string[]): string {
  if (mots.length <= 1) return mots[0] ?? "";
  return `${mots.slice(0, -1).join(", ")} et ${mots[mots.length - 1]}`;
}

/** Trois exemples de la liste : le premier, celui du milieu et le dernier, sans doublon */
export function exemples(mots: string[]): string[] {
  if (mots.length === 0) return [];
  return [...new Set([mots[0], mots[Math.floor(mots.length / 2)], mots[mots.length - 1]])];
}

const CONSEIL_TERMINAISON: Record<string, string> = {
  E: "Un E final, c’est la fin de nombreux noms féminins, d’adjectifs au féminin et de verbes conjugués : le sens de ta définition aide à départager.",
  S: "Un S final marque souvent un pluriel, ou un verbe à la deuxième personne. Si ta définition est au pluriel, la réponse l’est aussi.",
  R: "Un R final, c’est très souvent un verbe à l’infinitif. Si ta définition est un verbe, cherche de ce côté.",
  T: "Un T final, c’est souvent un verbe conjugué à la troisième personne du singulier, ou un participe passé. Le temps de ta définition te le dira.",
  ER: "ER, c’est la terminaison des verbes du premier groupe à l’infinitif, mais aussi de quelques noms. Si la définition est un verbe, tu as de bonnes chances.",
  RE: "RE termine de nombreux infinitifs et de nombreux noms. Une définition à l’infinitif ouvre la première piste.",
  TE: "TE se trouve à la fin de beaucoup de noms féminins et de participes passés au féminin.",
  ES: "ES termine les pluriels des mots en E et beaucoup de verbes conjugués : une définition au pluriel mène souvent ici.",
  ON: "ON termine un très grand nombre de noms ; c’est aussi un petit mot par lui-même, qui se glisse parfois en bout de grille.",
  NT: "NT, c’est la terminaison des verbes à la troisième personne du pluriel (ils chantent), des participes présents et de beaucoup d’adjectifs.",
  EE: "EE se lit à la fin de participes passés au féminin et de noms féminins : une définition qui parle d’une chose faite, passée, y mène.",
  IE: "IE termine beaucoup de noms féminins, et quelques participes passés au féminin.",
  EZ: "EZ est la terminaison de la deuxième personne du pluriel, celle qu’on emploie avec « vous » : si ta définition est un ordre ou une question adressée à plusieurs personnes, c’est la piste.",
  AGE: "AGE termine de nombreux noms masculins, et quelques verbes conjugués.",
  EUR: "EUR termine des noms de personnes qui font quelque chose et des noms de qualités. Une définition qui dit « celui qui… » mène souvent ici.",
  ION: "ION termine beaucoup de noms féminins, souvent tirés d’un verbe : une définition qui désigne l’action de faire quelque chose mène ici.",
  ENT: "ENT termine des verbes conjugués à la troisième personne du pluriel, des adjectifs et des noms.",
  ANT: "ANT termine des participes présents, des adjectifs et des noms : si ta définition décrit quelqu’un ou quelque chose qui fait une action, c’est une bonne piste.",
  ISE: "ISE termine des noms féminins et des verbes conjugués.",
  ONS: "ONS, c’est la première personne du pluriel d’un verbe (nous allons), et le pluriel des noms en ON.",
  IER: "IER termine des noms de métiers ou d’objets, et quelques adjectifs.",
  // Mots courts (2 et 3 lettres) : une dernière lettre ; mots longs (7 et 8 lettres) : suffixes et formes verbales
  A: "Un A final, c’est souvent un article ou un possessif (LA, MA, TA), un verbe conjugué (VA) ou un mot venu d’une autre langue.",
  I: "Un I final se lit dans des participes passés (fini, ri), des mots familiers et quelques mots venus d’ailleurs.",
  O: "Un O final, c’est souvent une abréviation familière (VELO, PHOTO) ou un mot venu de l’italien ou de l’espagnol.",
  U: "Un U final se lit dans beaucoup de participes passés courts (BU, LU, VU) : si ta définition est un participe, regarde ici.",
  L: "Un L final termine des noms et des adjectifs courts, souvent au masculin.",
  N: "Un N final termine des noms et des adjectifs courts, et quelques pronoms.",
  ERA: "ERA, c’est le futur à la troisième personne du singulier (il chantera) : une définition au futur mène ici.",
  AIT: "AIT, c’est l’imparfait ou le conditionnel à la troisième personne (il chantait, il chanterait) : une définition au passé ou au conditionnel mène ici.",
  ABLE: "ABLE termine des adjectifs qui disent qu’une chose peut être faite (lavable, mangeable).",
  ANCE: "ANCE termine des noms féminins, souvent tirés d’un verbe ou d’un adjectif.",
  ETTE: "ETTE donne souvent un petit quelque chose : un diminutif, au féminin.",
  EUSE: "EUSE termine des noms de métiers et des adjectifs au féminin : une définition qui dit « celle qui… » mène souvent ici.",
  ISME: "ISME termine des noms de doctrines, de mouvements et de comportements.",
};

function conseilInitiale(cle: string): string {
  if (LETTRES_RARES.has(cle)) {
    return `${cle} est une lettre rare : la liste est courte, et c’est justement ce qui la rend utile quand une grille t’en impose une.`;
  }
  if (VOYELLES.has(cle)) {
    return `Une voyelle en tête se croise souvent facilement avec les mots voisins : regarde la deuxième lettre que ton mot croisé te confirme, et va droit à son groupe.`;
  }
  return `Une consonne en tête : regarde d’abord le groupe de la deuxième lettre que ton mot croisé te confirme, il écarte presque tout le reste.`;
}

/**
 * Les paragraphes d'accroche d'une page de combinaison. `mots` : tous les mots de la page, dans l'ordre
 * alphabétique ; `rang` : la place de la combinaison parmi celles de sa longueur (pour varier la tournure).
 */
export function introCombinaison(longueur: number, combinaison: Pick<Combinaison, "type" | "cle">, mots: string[], rang: number): string[] {
  const total = mots.length;
  const { type, cle } = combinaison;
  const cites = exemples(mots);
  const liste = enumeration(cites);
  const premier = cites[0];
  const dernier = cites[cites.length - 1];
  const milieu = cites[Math.floor(cites.length / 2)];
  const conseil = type === "commencant" ? conseilInitiale(cle) : (CONSEIL_TERMINAISON[cle] ?? "");
  const verbe = type === "commencant" ? "commence" : "se termine";
  const sort = `par ${cle}`;

  if (total === 1) {
    return [
      `Un seul mot de ${longueur} lettres ${type === "commencant" ? "commence" : "finit"} ${sort} dans ma liste : ${premier}. Si ta grille en réclame un autre, vérifie tes lettres croisées, ou écris-moi.`,
      conseil,
    ].filter(Boolean);
  }
  if (total <= 3) {
    return [
      `Seulement ${total} mots de ${longueur} lettres ${type === "commencant" ? "commencent" : "finissent"} ${sort} dans ma liste : ${liste}. C’est court, donc vite vérifié contre les lettres de ton croisement.`,
      conseil,
    ].filter(Boolean);
  }

  const debut: string[] = [
    `Ma liste compte ${total} mots de ${longueur} lettres qui ${type === "commencant" ? "commencent" : "finissent"} ${sort}, de ${premier} à ${dernier}. ${type === "commencant" ? "Ils sont classés par deuxième lettre : si tu la connais, va directement au bon groupe." : "Ils sont rangés par première lettre : si tu la connais, saute au bon groupe."}`,
    `Ton mot de ${longueur} lettres ${verbe} ${sort} ? Voici tous ceux que je garde pour les grilles, ${total} en tout : ${liste} et les autres. ${type === "commencant" ? "Repère le groupe de ta deuxième lettre pour aller plus vite." : "Ils sont classés par première lettre."}`,
    `${total} mots, ${longueur} lettres, ${type === "commencant" ? `une même initiale : ${cle}` : `une même fin : ${cle}`}. Parcours la liste, ou tape une lettre de plus dans les cases juste au-dessus pour la resserrer : ${milieu}, le tien y est peut-être.`,
    `${type === "commencant" ? `Pour une grille bloquée sur un mot qui commence par ${cle}` : `Pour un mot qui finit par ${cle}`}, voici les ${total} mots de ${longueur} lettres de mon lexique, par exemple ${premier} ou ${milieu}. ${type === "commencant" ? "Ils sont rangés par deuxième lettre." : "Ils sont rangés par première lettre."}`,
    `${type === "commencant" ? `Tout part de l’initiale ${cle}` : `Tout se joue en fin de mot, avec ${cle}`} : ${total} mots de ${longueur} lettres, ${liste}… La liste est complète et sans accent, comme dans une grille. Une lettre croisée en plus, et les cases du dessus font le tri pour toi.`,
    `Il y a ${total} mots de ${longueur} lettres ${type === "commencant" ? "commençant" : "finissant"} ${sort} dans cette liste. ${premier} ouvre la série, ${dernier} la ferme ; entre les deux, ${type === "commencant" ? "cherche la deuxième lettre de ton mot." : "cherche la première lettre de ton mot."}`,
  ];
  return [debut[rang % debut.length], conseil].filter(Boolean);
}

/** La description pour les moteurs : le nombre de mots, trois exemples, l'usage (160 caractères environ) */
export function descriptionCombinaison(longueur: number, combinaison: Pick<Combinaison, "type" | "cle">, mots: string[]): string {
  const total = mots.length;
  const cites = exemples(mots).join(", ");
  const qui = combinaison.type === "commencant" ? "commençant" : "finissant";
  return `${total} mot${total > 1 ? "s" : ""} de ${longueur} lettres ${qui} par ${combinaison.cle} : ${cites}${total > exemples(mots).length ? "…" : "."} La liste complète, sans pub, pour finir ta grille de mots fléchés.`;
}
