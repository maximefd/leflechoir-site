"use client";

import { BoutonSignaler, MotsEnColonnes, useSignalement } from "@/components/mots/mots-en-colonnes";
import { enTeteSection } from "@/components/mots/style";
import type { GroupeDeMots } from "@/content/mots";

/**
 * La liste complète d'une page « commençant par » ou « finissant par », telle qu'elle est écrite dans le HTML de la
 * page : groupée (par deuxième lettre, ou par initiale), en caractères normaux, en colonnes, sans fréquence ni
 * définition. `prefixe` : ce qui s'ajoute devant la clé du groupe dans son titre (« A » devant « B » donne « AB »).
 * C'est un composant client seulement pour le mode signalement ; il est rendu au build comme le reste de la page.
 */
export function ListeCombinaison({
  groupes,
  total,
  nom,
  prefixe = "",
  decrit,
}: {
  groupes: GroupeDeMots[];
  total: number;
  /** Le nom de la liste pour les lecteurs d'écran : « Mots de 5 lettres commençant par A » */
  nom: string;
  prefixe?: string;
  /** Comment les mots sont classés, en une phrase : « classés par deuxième lettre » */
  decrit: string;
}) {
  const [signaler, setSignaler] = useSignalement();

  return (
    <section id="la-liste" aria-labelledby="la-liste-titre" className="mt-10 scroll-mt-32">
      <h2 id="la-liste-titre" className={enTeteSection}>
        Les {total} mot{total > 1 ? "s" : ""}
      </h2>
      <p className="mt-3 text-[1.05rem] text-muted-foreground">
        Sans accents, comme dans une grille, {decrit}.
      </p>


      <div className="mt-8 space-y-10">
        {groupes.map(({ cle, mots }) => (
          <section key={cle} id={`groupe-${cle}`} aria-labelledby={`groupe-${cle}-titre`} className="scroll-mt-32">
            <h3 id={`groupe-${cle}-titre`} className="flex items-baseline gap-3 border-b border-border pb-1 text-xl text-foreground">
              <span>{prefixe}{cle}</span>
              <span className="text-base text-muted-foreground">{mots.length} mot{mots.length > 1 ? "s" : ""}</span>
            </h3>
            <div className="mt-3">
              <MotsEnColonnes mots={mots} nom={`${nom}, groupe ${prefixe}${cle}`} signaler={signaler} />
            </div>
          </section>
        ))}
      </div>

      <BoutonSignaler actif={signaler} onChange={setSignaler} />
    </section>
  );
}
