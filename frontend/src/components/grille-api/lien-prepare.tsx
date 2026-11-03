"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { storeLastGrid } from "@/lib/last-grid";
import { readPreparedLink, type PreparedLink } from "@/lib/grille-api";

const LANGUES: Record<string, string> = { fr: "français", de: "allemand", en: "anglais" };
const NIVEAUX = { easy: "facile", medium: "moyen", hard: "difficile" };

/**
 * Le lien préparé (ADR 0032) : une IA écrit `/creer?lang=fr&taille=10x10&mots=…&mystere=…&niveau=…` sans rien
 * installer. On dit ce qu'on a compris avant de rien faire, puis on prépare le générateur avec ces réglages : la
 * personne y voit ses mots et lance la grille. Sans paramètres, rien ne s'affiche : la page reste le carrefour « Créer ».
 */
export function LienPrepare() {
  const router = useRouter();
  const [link, setLink] = useState<PreparedLink | null>(null);

  useEffect(() => {
    setLink(readPreparedLink(window.location.search));
  }, []);

  if (!link) return null;

  const prepare = () => {
    storeLastGrid({
      size: link.size,
      entries: link.words.map((text, index) => ({ id: `lien-${index}`, text, required: false })),
      dictionaryIds: [],
      grid: null,
      saved: null,
      mystery: link.mystery,
    });
    router.push("/grid");
  };

  const foreign = link.lang && link.lang !== "fr" ? LANGUES[link.lang] ?? link.lang : null;

  return (
    <section className="mb-8 rounded-lg border-2 border-primary/40 p-5" aria-labelledby="lien-prepare" data-testid="lien-prepare">
      <h2 id="lien-prepare" className="flex items-center gap-2 text-xl font-semibold">
        <Sparkles className="h-5 w-5 text-primary" /> Ta grille est prête à lancer
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Voici ce que j&apos;ai compris du lien :</p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="font-medium">Taille</dt>
        <dd>{link.size ? `${link.size.width} × ${link.size.height} cases` : "au choix (10 × 13 par défaut)"}</dd>
        <dt className="font-medium">Mots</dt>
        <dd data-testid="lien-mots">{link.words.length ? link.words.join(", ") : "aucun : la grille piochera dans le dictionnaire"}</dd>
        {link.mystery && (<><dt className="font-medium">Mot mystère</dt><dd data-testid="lien-mystere">{link.mystery}</dd></>)}
        {link.level && (<><dt className="font-medium">Niveau</dt><dd>{NIVEAUX[link.level]} (le générateur du site choisit ses mots lui-même)</dd></>)}
      </dl>
      {foreign && (
        <p className="mt-3 text-sm">Le lien demande une grille en {foreign} : ce site fait des grilles en français.</p>
      )}
      {link.ignored.length > 0 && (
        <p className="mt-3 text-sm text-muted-foreground" data-testid="lien-ignore">
          Pas compris, donc laissé de côté : {link.ignored.join(", ")}.
        </p>
      )}
      <Button onClick={prepare} className="mt-4" data-testid="lien-preparer">Préparer la grille avec ces mots</Button>
    </section>
  );
}
