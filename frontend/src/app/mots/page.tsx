import { type Metadata } from "next";
import Link from "next/link";
import { linkClass } from "@/components/legal/section";
import { BYLINE } from "@/components/articles/article-view";
import { PastillesCombinaisons } from "@/components/mots/pastilles-combinaisons";
import { cadre, enTeteSection, serif, texteDoux } from "@/components/mots/style";
import { entreeCatalogue } from "@/content/mots/catalogue";
import { PAGES_LONGUEUR } from "@/content/mots/longueurs";
import { breadcrumbJsonLd, publicPage } from "@/lib/seo";

/**
 * L'index des listes de mots. À RELIRE PAR L'AUTEUR : texte rédigé par Claude (8 octobre 2026). Les pages elles-mêmes
 * sont dans `mots/<slug>/page.tsx` et `mots/<slug>/[combinaison]/page.tsx`, leurs listes dans `content/mots` (écrites
 * par `make listes`).
 */
const TITLE = "Listes de mots pour les mots fléchés";
const DESCRIPTION =
  "Un mot te manque dans une grille ? Trouve-le d’après sa longueur et ses lettres, de 2 à 15 lettres. Listes complètes des mots de 2 à 8 lettres, par initiale et par terminaison.";

export const metadata: Metadata = publicPage({ path: "/mots", title: TITLE, description: DESCRIPTION });

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [breadcrumbJsonLd([{ name: "Listes de mots", path: "/mots" }])],
};

export default function MotsPage() {
  return (
    <main className="container mx-auto max-w-3xl p-4 md:p-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <nav aria-label="Fil d’Ariane" className="mb-4 text-sm text-muted-foreground">
        <Link href="/" className={linkClass}>Accueil</Link>
      </nav>

      <h1 className={`text-3xl font-semibold md:text-4xl md:font-bold ${serif}`}>Listes de mots</h1>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
        Quand une grille coince, on connaît souvent la longueur du mot et quelques-unes de ses lettres. Commence par
        là : choisis le nombre de lettres, tape ce que tu sais, la recherche trouve le reste. Pour les mots de deux à
        huit lettres, tu trouves aussi la liste complète de chaque initiale et de chaque terminaison.
      </p>
      <p className="mt-4 text-sm text-muted-foreground">{BYLINE}</p>

      <h2 className={`mt-12 ${enTeteSection}`}>Trouver le mot qui te manque</h2>
      <ul className="mt-6 space-y-6">
        {PAGES_LONGUEUR.map((page) => {
          const entree = page.combinaisons ? entreeCatalogue(page.slug) : undefined;
          return (
            <li key={page.slug} className={`p-5 ${cadre}`}>
              <h3 className="text-xl font-medium text-foreground">
                <Link href={`/mots/${page.slug}`} className="underline underline-offset-4 transition-colors hover:text-primary/80">
                  {page.title}
                </Link>
              </h3>
              <p className={`mt-2 text-[1.05rem] leading-relaxed ${texteDoux}`}>{page.chapo}</p>
              {entree && (
                <div className="mt-5 space-y-4">
                  <p className={`text-sm ${texteDoux}`}>
                    {entree.total} mots de {page.longueur} lettres dans ma liste, en pages à part :
                  </p>
                  <div>
                    <p className="mb-2 text-[1.05rem] text-foreground">Commençant par…</p>
                    <PastillesCombinaisons listeSlug={page.slug} longueur={page.longueur} type="commencant" />
                  </div>
                  <div>
                    <p className="mb-2 text-[1.05rem] text-foreground">Finissant par…</p>
                    <PastillesCombinaisons listeSlug={page.slug} longueur={page.longueur} type="finissant" />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>


      <p className="mt-12 text-[1.05rem] leading-relaxed text-muted-foreground">
        Il te faut un mot d’une autre longueur ? Le sélecteur de chaque outil va jusqu’à quinze lettres, et la{" "}
        <Link href="/search" className={linkClass}>recherche par motif</Link> trouve le mot qui manque d’après les lettres que tu
        as. Le <Link href="/grid" className={linkClass}>générateur</Link> remplit une grille entière. Pour comprendre comment
        ces mots s’emboîtent, lis{" "}
        <Link href="/creer-des-mots-fleches" className={linkClass}>comment je crée mes mots fléchés</Link>.
      </p>
    </main>
  );
}
