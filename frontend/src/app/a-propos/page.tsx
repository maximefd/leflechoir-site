import { type Metadata } from "next";
import Link from "next/link";
import { linkClass, Section } from "@/components/legal/section";
import { site } from "@/config/site";
import { publicPage } from "@/lib/seo";

/**
 * À RELIRE PAR L'AUTEUR : page écrite par Claude le 20 octobre 2026 (#134). Les moteurs de réponse IA citent plus
 * volontiers un site dont on sait qui le fait et comment : la page le dit, sans nom (l'éditeur reste anonyme, comme
 * dans les mentions légales). Tout ce qu'elle affirme est vrai du site au 20/10/2026 ; à tenir à jour avec lui.
 */
export const metadata: Metadata = publicPage({
  path: "/a-propos",
  title: `Qui fait ${site.name}`,
  description: `${site.name} est fait par un auteur de mots fléchés, en France : pourquoi le site existe, d'où viennent ses grilles et ses mots, et ce qu'il ne fait pas.`,
});

const structuredData = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  url: `${site.url}/a-propos`,
  inLanguage: site.lang,
  about: {
    "@type": "Organization",
    name: site.name,
    url: site.url,
    email: site.contactEmail,
    description: site.description,
  },
};

export default function AProposPage() {
  return (
    <main className="container mx-auto max-w-3xl p-4 md:p-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      <h1 className="text-3xl font-bold">Qui fait {site.name}</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        {site.name} est fait par un auteur de mots fléchés, en France. Il fabrique des grilles pour les voir résolues
        à plusieurs, et il a construit ce site pour aider à faire ce qu&apos;il fait au crayon.
      </p>

      <div className="mt-8 space-y-8 text-muted-foreground">
        <Section title="Pourquoi ce site">
          <p>
            Une grille de mots fléchés, même petite, demande une soirée ; une grande, plusieurs jours. Le plus long
            n&apos;est pas d&apos;écrire les définitions, c&apos;est de faire tenir les mots ensemble.{" "}
            {site.name} prend en charge cette partie : il remplit une grille autour des mots que tu choisis, ou
            t&apos;aide à la construire toi-même, case par case. Les définitions, elles, restent les tiennes.
          </p>
          <p>
            Le site est gratuit. Générer, imprimer, chercher un mot et jouer la grille du jour se font sans compte.
          </p>
        </Section>

        <Section title="D'où viennent les grilles">
          <p>
            Le générateur a été écrit pour le site. Il place d&apos;abord tes mots obligatoires, puis tes mots
            souhaités, et remplit le reste. Chaque format reprend une disposition des cases définitions relevée sur de
            vraies grilles publiées. Le moteur tourne sur un serveur en France.
          </p>
          <p>
            La <Link href="/jouer" className={linkClass}>grille du jour</Link> sort du même générateur ; ses
            définitions sont écrites pour elle.
          </p>
        </Section>

        <Section title="D'où viennent les mots">
          <p>
            La liste de départ est un dictionnaire des formes du français, le DELA, croisé avec les fréquences
            d&apos;usage de Lexique 3.83. Elle est ensuite triée : les mots trop rares, douteux ou impossibles à
            définir sont écartés, pour qu&apos;une grille se résolve sans dictionnaire. Ce tri, l&apos;auteur le
            mène lui-même, avec l&apos;aide d&apos;une IA dont il vérifie les choix.
          </p>
          <p>
            Le sens des mots, affiché à côté des grilles et dans la recherche, vient du Wiktionnaire. Il n&apos;est
            jamais écrit dans les cases : une définition de mots fléchés n&apos;est pas une définition de
            dictionnaire. Les sources et leurs licences sont dans les{" "}
            <Link href="/legal" className={linkClass}>mentions légales</Link>.
          </p>
        </Section>

        <Section title="Ce que le site ne fait pas">
          <p>
            Pas de publicité, pas de cookie de suivi, aucun outil de mesure d&apos;audience extérieur : les pages
            vues sont comptées par le serveur, sans identifiant. Seules les erreurs techniques partent chez un service
            de suivi des pannes (Sentry), sans adresse IP. Le détail est dans la page{" "}
            <Link href="/privacy" className={linkClass}>confidentialité</Link>.
          </p>
        </Section>

        <Section title="Écrire à l'auteur">
          <p>
            Une idée, une erreur dans une grille, un mot qui manque :{" "}
            <a href={`mailto:${site.contactEmail}`} className={linkClass}>{site.contactEmail}</a>, ou la{" "}
            <Link href="/contact" className={linkClass}>page contact</Link>.
          </p>
        </Section>
      </div>
    </main>
  );
}
