import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { linkClass } from "@/components/legal/section";

/**
 * Le petit balisage des textes d'articles (ADR 0027) : `**gras**` pour une amorce en gras,
 * `[libellé](/chemin)` pour un lien interne. Tout le reste s'écrit tel quel — pas de titres, de listes ni
 * d'images : un article reste des paragraphes.
 */
const MORCEAUX = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g;

/** Un lien interne seulement : jamais d'adresse externe ni de schéma exotique. */
function cibleInterne(cible: string): boolean {
  return cible.startsWith("/") && !cible.startsWith("//");
}

/** Une ligne de texte balisé, découpée en ses morceaux gras, liens et texte simple. */
export function ligneProse(texte: string): ReactNode {
  return texte.split(MORCEAUX).map((morceau, index) => {
    if (/^\*\*[^*]+\*\*$/.test(morceau)) {
      return <strong key={index} className="text-foreground">{morceau.slice(2, -2)}</strong>;
    }
    const lien = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(morceau);
    if (lien && cibleInterne(lien[2])) {
      return <Link key={index} href={lien[2]} className={linkClass}>{lien[1]}</Link>;
    }
    return <Fragment key={index}>{morceau}</Fragment>;
  });
}

/** Les paragraphes d'une section, rendus comme la page les lit. */
export function Prose({ paragraphs }: { paragraphs: string[] }) {
  return (
    <>
      {paragraphs.map((paragraphe, index) => (
        <p key={index}>{ligneProse(paragraphe)}</p>
      ))}
    </>
  );
}
