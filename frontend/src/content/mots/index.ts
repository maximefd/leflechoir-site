import cinqLettres from "@/content/mots/listes/cinq-lettres.json";
import deuxLettres from "@/content/mots/listes/deux-lettres.json";
import huitLettres from "@/content/mots/listes/huit-lettres.json";
import quatreLettres from "@/content/mots/listes/quatre-lettres.json";
import septLettres from "@/content/mots/listes/sept-lettres.json";
import sixLettres from "@/content/mots/listes/six-lettres.json";
import troisLettres from "@/content/mots/listes/trois-lettres.json";
import { type Combinaison } from "@/content/mots/combinaisons";

/**
 * Les listes de mots publiées. Les fichiers JSON sont écrits par `make listes` (tools/lexicon/listes.py) : on ne
 * les retouche pas à la main. Seuls les mots y figurent, jamais de fréquence ni de définition (ADR 0021).
 *
 * Ce module charge les mots : seules les pages serveur (statiques, rendues au build) l'importent, jamais un
 * composant client. Pour le seul nombre de mots ou les combinaisons, `catalogue.ts` et `combinaisons.ts` suffisent.
 */
export type ListeMots = {
  slug: string;
  lang: string;
  /** Longueur commune des mots, quand il y en a une */
  longueur: number | null;
  total: number;
  /** Groupés par initiale, dans l'ordre alphabétique */
  groupes: { initiale: string; mots: string[] }[];
};

const LISTES: Record<string, ListeMots> = {
  "deux-lettres": deuxLettres,
  "trois-lettres": troisLettres,
  "quatre-lettres": quatreLettres,
  "cinq-lettres": cinqLettres,
  "six-lettres": sixLettres,
  "sept-lettres": septLettres,
  "huit-lettres": huitLettres,
};

export function listeDeMots(slug: string): ListeMots {
  const liste = LISTES[slug];
  if (!liste) throw new Error(`Liste de mots inconnue : ${slug}`);
  return liste;
}

/** Un groupe de mots d'une page de combinaison : sa clé (une lettre) et ses mots, dans l'ordre alphabétique */
export type GroupeDeMots = { cle: string; mots: string[] };

/**
 * La liste complète d'une combinaison, groupée : par deuxième lettre pour « commençant par » (A donne AB, AC…), par
 * initiale pour « finissant par » (EZ donne les mots en A, en B…). Un mot a toujours la longueur de la liste.
 */
export function motsDeCombinaison(listeSlug: string, combinaison: Pick<Combinaison, "type" | "cle">): GroupeDeMots[] {
  const groupes = new Map<string, string[]>();
  const ajouter = (cle: string, mot: string) => groupes.set(cle, [...(groupes.get(cle) ?? []), mot]);
  for (const { initiale, mots } of listeDeMots(listeSlug).groupes) {
    if (combinaison.type === "commencant") {
      if (initiale !== combinaison.cle) continue;
      for (const mot of mots) ajouter(mot[1], mot);
    } else {
      for (const mot of mots) if (mot.endsWith(combinaison.cle)) ajouter(initiale, mot);
    }
  }
  return [...groupes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cle, mots]) => ({ cle, mots }));
}
