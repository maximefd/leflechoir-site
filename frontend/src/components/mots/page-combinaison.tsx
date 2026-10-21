import Link from "next/link";
import { notFound } from "next/navigation";
import { linkClass } from "@/components/legal/section";
import { ListeCombinaison } from "@/components/mots/liste-combinaison";
import { OutilLongueur } from "@/components/mots/outil-longueur";
import { PastillesCombinaisons } from "@/components/mots/pastilles-combinaisons";
import { cadre, enTeteSection, lienOcre, serif, texteDoux } from "@/components/mots/style";
import { motsDeCombinaison } from "@/content/mots";
import {
  cheminCombinaison,
  combinaisonDe,
  combinaisonsDe,
  slugCombinaison,
  titreCombinaison,
  indexable,
} from "@/content/mots/combinaisons";
import { descriptionCombinaison, introCombinaison } from "@/content/mots/intros";
import { PAGES_LONGUEUR, pageLongueurDe } from "@/content/mots/longueurs";
import { breadcrumbJsonLd, publicPage } from "@/lib/seo";

/** Tous les mots d'une combinaison, à plat et dans l'ordre alphabétique */
function motsDe(listeSlug: string, slug: string): string[] {
  const combinaison = combinaisonDe(listeSlug, slug);
  if (!combinaison) notFound();
  return motsDeCombinaison(listeSlug, combinaison).flatMap(({ mots }) => mots).sort();
}

/** Les paramètres statiques des pages d'une longueur : une par combinaison qui a des mots (jamais de page vide) */
export function parametresCombinaisons(listeSlug: string): { combinaison: string }[] {
  return combinaisonsDe(listeSlug).map(({ slug }) => ({ combinaison: slug }));
}

/** Titre (60 caractères au plus avec le nom du site), description (nombre de mots, exemples) et canonique de la page */
export function metadataCombinaison(listeSlug: string, slug: string) {
  const combinaison = combinaisonDe(listeSlug, slug);
  if (!combinaison) notFound();
  const { longueur } = pageLongueurDe(listeSlug);
  const page = publicPage({
    path: cheminCombinaison(listeSlug, combinaison),
    title: titreCombinaison(longueur, combinaison),
    description: descriptionCombinaison(longueur, combinaison, motsDe(listeSlug, slug)),
  });
  // Trop peu de mots : la page sert l'outil, mais reste hors des moteurs (MIN_MOTS_INDEXES)
  return indexable(combinaison) ? page : { ...page, robots: { index: false, follow: true } };
}

/**
 * Une page « Mots de 5 lettres commençant par A » ou « … finissant par EZ » : titre, court texte d'accroche, l'outil
 * (cases déjà remplies du motif, recherche qui se met à jour en tapant) et, dessous, la liste complète dans le HTML,
 * groupée, que les résultats remplacent dès qu'on touche aux cases. Puis le maillage : la page d'avant et celle
 * d'après, toutes les initiales et terminaisons de la longueur, la même page pour l'autre longueur, le hub et
 * l'index.
 */
export function PageCombinaison({ listeSlug, slug }: { listeSlug: string; slug: string }) {
  const combinaison = combinaisonDe(listeSlug, slug);
  if (!combinaison) notFound();
  const page = pageLongueurDe(listeSlug);
  const { longueur } = page;
  const groupes = motsDeCombinaison(listeSlug, combinaison);
  const mots = groupes.flatMap((groupe) => groupe.mots).sort();
  const titre = titreCombinaison(longueur, combinaison);
  const memeType = combinaisonsDe(listeSlug, combinaison.type);
  const rang = memeType.findIndex((candidate) => candidate.slug === slug);
  const avant = rang > 0 ? memeType[rang - 1] : undefined;
  const apres = rang < memeType.length - 1 ? memeType[rang + 1] : undefined;
  const introduction = introCombinaison(longueur, combinaison, mots, rang);
  const commencant = combinaison.type === "commencant";

  // La même combinaison avec une lettre de moins et une de plus (4 et 6 lettres pour une page de 5)
  const autresLongueurs = PAGES_LONGUEUR.filter((candidate) => candidate.combinaisons && Math.abs(candidate.longueur - longueur) === 1)
    .map((candidate) => ({ page: candidate, trouvee: combinaisonDe(candidate.slug, slugCombinaison(combinaison.type, combinaison.cle)) }))
    .filter((entree) => entree.trouvee);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      breadcrumbJsonLd([
        { name: "Listes de mots", path: "/mots" },
        { name: page.title, path: `/mots/${listeSlug}` },
        { name: titre, path: cheminCombinaison(listeSlug, combinaison) },
      ]),
    ],
  };

  return (
    <main className="container mx-auto max-w-3xl p-4 md:p-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav aria-label="Fil d’Ariane" className="mb-4 text-sm text-muted-foreground">
        <Link href="/" className={linkClass}>Accueil</Link>
        <span aria-hidden="true"> › </span>
        <Link href="/mots" className={linkClass}>Listes de mots</Link>
        <span aria-hidden="true"> › </span>
        <Link href={`/mots/${listeSlug}`} className={linkClass}>{page.title}</Link>
      </nav>

      <h1 className={`text-3xl font-semibold md:text-4xl md:font-bold ${serif}`}>{titre}</h1>
      <div className="mt-4 space-y-3 text-lg leading-relaxed text-muted-foreground">
        {introduction.map((paragraphe) => (
          <p key={paragraphe}>{paragraphe}</p>
        ))}
      </div>

      <OutilLongueur longueur={longueur} motifInitial={combinaison.motif} motsInitiaux={mots}>
        <ListeCombinaison
          groupes={groupes}
          total={mots.length}
          nom={titre}
          prefixe={commencant ? combinaison.cle : ""}
          decrit={commencant ? "classés par deuxième lettre" : "classés par première lettre"}
        />
      </OutilLongueur>

      <nav aria-label="Page précédente et suivante" className="mt-12 grid gap-3 sm:grid-cols-2">
        {avant ? (
          <Link
            href={cheminCombinaison(listeSlug, avant)}
            rel="prev"
            className={`block p-4 text-[1.05rem] ${cadre} transition-colors hover:bg-accent`}
          >
            <span className={`block text-sm ${texteDoux}`}>← Avant</span>
            <span className="text-foreground">{titreCombinaison(longueur, avant)}</span>
          </Link>
        ) : (
          <span />
        )}
        {apres && (
          <Link
            href={cheminCombinaison(listeSlug, apres)}
            rel="next"
            className={`block p-4 text-[1.05rem] sm:text-right ${cadre} transition-colors hover:bg-accent`}
          >
            <span className={`block text-sm ${texteDoux}`}>Après →</span>
            <span className="text-foreground">{titreCombinaison(longueur, apres)}</span>
          </Link>
        )}
      </nav>

      <section aria-labelledby="initiales" className="mt-12">
        <h2 id="initiales" className={enTeteSection}>Mots de {longueur} lettres commençant par…</h2>
        <div className="mt-4">
          <PastillesCombinaisons
            listeSlug={listeSlug}
            longueur={longueur}
            type="commencant"
            courante={commencant ? slug : undefined}
          />
        </div>
      </section>

      <section aria-labelledby="terminaisons" className="mt-10">
        <h2 id="terminaisons" className={enTeteSection}>Mots de {longueur} lettres finissant par…</h2>
        <div className="mt-4">
          <PastillesCombinaisons
            listeSlug={listeSlug}
            longueur={longueur}
            type="finissant"
            courante={commencant ? undefined : slug}
          />
        </div>
      </section>

      <section aria-labelledby="et-aussi" className={`mt-12 p-5 ${cadre}`}>
        <h2 id="et-aussi" className="text-xl font-medium text-foreground">Et aussi</h2>
        <ul className={`mt-3 list-disc space-y-2 pl-5 text-[1.05rem] ${texteDoux}`}>
          {autresLongueurs.map(({ page: autre, trouvee }) =>
            trouvee ? (
              <li key={autre.slug}>
                <Link href={cheminCombinaison(autre.slug, trouvee)} className={lienOcre}>
                  {titreCombinaison(autre.longueur, trouvee)}
                </Link>{" "}
                : la même recherche, avec une lettre {autre.longueur > longueur ? "de plus" : "de moins"}.
              </li>
            ) : null,
          )}
          <li>
            <Link href={`/mots/${listeSlug}`} className={lienOcre}>{page.title}</Link> : l’outil, pour chercher d’après
            les lettres que tu connais.
          </li>
          <li>
            <Link href="/mots" className={lienOcre}>Toutes les listes de mots</Link>
          </li>
          <li>
            <Link href="/search" className={lienOcre}>Chercher un mot</Link> d’une autre longueur.
          </li>
        </ul>
      </section>
    </main>
  );
}
