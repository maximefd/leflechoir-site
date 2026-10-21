import { type ReactNode } from "react";
import Link from "next/link";
import { linkClass } from "@/components/legal/section";
import { OutilLongueur } from "@/components/mots/outil-longueur";
import { PastillesCombinaisons } from "@/components/mots/pastilles-combinaisons";
import { cadre, enTeteSection, lienOcre, serif, texteDoux } from "@/components/mots/style";
import { faqJsonLd, questionsLongueur } from "@/content/mots/faq-longueur";
import { pageLongueurDe } from "@/content/mots/longueurs";
import { breadcrumbJsonLd, publicPage } from "@/lib/seo";

/** Les métadonnées d'une page « Mot de N lettres » : titre, description, canonique et aperçu comme les autres pages publiques */
export function metadataLongueur(slug: string) {
  const page = pageLongueurDe(slug);
  return publicPage({ path: `/mots/${slug}`, title: page.metaTitle, description: page.chapo });
}

/**
 * Une page « Mot de N lettres » (le hub d'une longueur) : fil d'Ariane, titre, l'outil (choix de la longueur, rangée de
 * cases, recherche qui se met à jour en tapant), puis, selon la longueur, les liens vers toutes les pages « commençant
 * par » et « finissant par » (5 et 6 lettres) ou des boutons de raccourci, le texte de l'auteur (`texte`), la FAQ (aussi
 * en données structurées) et les liens vers le reste du site. La page est vide tant qu'on ne cherche pas : elle ne
 * connaît aucun mot, seulement des motifs que l'API de recherche résout à la demande (sauf `?motif=` dans l'adresse).
 */
/** `texte` : gardé pour les pages qui le passent encore ; il n'est plus affiché, la FAQ le remplace */
export function PageLongueur({ slug }: { slug: string; texte?: ReactNode }) {
  const { longueur, title, h1, chapo, finales, combinaisons } = pageLongueurDe(slug);
  const questions = questionsLongueur(longueur, combinaisons);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      breadcrumbJsonLd([
        { name: "Listes de mots", path: "/mots" },
        { name: title, path: `/mots/${slug}` },
      ]),
      faqJsonLd(longueur, combinaisons),
    ],
  };

  const raccourcis = combinaisons ? (
    <>
      <section aria-labelledby="commencant-par" className="mt-10">
        <h2 id="commencant-par" className={enTeteSection}>
          Mots de {longueur} lettres commençant par…
        </h2>
        <div className="mt-4">
          <PastillesCombinaisons listeSlug={slug} longueur={longueur} type="commencant" />
        </div>
      </section>
      <section aria-labelledby="finissant-par" className="mt-10">
        <h2 id="finissant-par" className={enTeteSection}>
          Mots de {longueur} lettres finissant par…
        </h2>
        <div className="mt-4">
          <PastillesCombinaisons listeSlug={slug} longueur={longueur} type="finissant" />
        </div>
      </section>
    </>
  ) : undefined;

  return (
    <main className="container mx-auto max-w-3xl p-4 md:p-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav aria-label="Fil d’Ariane" className="mb-4 text-sm text-muted-foreground">
        <Link href="/" className={linkClass}>Accueil</Link>
        <span aria-hidden="true"> › </span>
        <Link href="/mots" className={linkClass}>Listes de mots</Link>
      </nav>

      <h1 className={`text-3xl font-semibold md:text-4xl md:font-bold ${serif}`}>{h1}</h1>
      <p className="mt-4 text-lg text-muted-foreground">{chapo}</p>

      <OutilLongueur longueur={longueur} finales={combinaisons ? undefined : finales} raccourcis={raccourcis} />

      {/* Le texte d'explication a rejoint la FAQ (retour de l'auteur du 08/10/2026 : une seule FAQ par page) */}

      <section aria-labelledby="questions" className="mt-12">
        <h2 id="questions" className={enTeteSection}>Questions fréquentes</h2>
        <dl className="mt-5 space-y-6">
          {questions.map(({ question, reponse, liens }) => (
            <div key={question}>
              <dt className="text-lg font-medium text-foreground">{question}</dt>
              <dd className="mt-1 text-[1.05rem] leading-relaxed text-muted-foreground">
                <p>{reponse}</p>
                {liens && (
                  <p className="mt-2">
                    {liens.map(({ texte: libelle, href }, i) => (
                      <span key={href}>
                        {i > 0 && " · "}
                        <Link href={href} className={lienOcre}>{libelle}</Link>
                      </span>
                    ))}
                  </p>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="aller-plus-loin" className={`mt-12 p-5 ${cadre}`}>
        <h2 id="aller-plus-loin" className="text-xl font-medium text-foreground">Aller plus loin</h2>
        <ul className={`mt-3 list-disc space-y-2 pl-5 text-[1.05rem] ${texteDoux}`}>
          <li>
            <Link href="/grid" className={linkClass}>Générer une grille</Link> : le moteur place les mots à ta place,
            tu écris les définitions.
          </li>
          <li>
            <Link href="/creer-des-mots-fleches" className={linkClass}>Comment créer des mots fléchés</Link> : ma
            méthode, d’une grille de 7 sur 9 construite pas à pas.
          </li>
          <li>
            <Link href="/search" className={linkClass}>Chercher un mot</Link> d’une autre longueur.
          </li>
          <li>
            <Link href="/mots" className={linkClass}>Toutes les listes de mots</Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
