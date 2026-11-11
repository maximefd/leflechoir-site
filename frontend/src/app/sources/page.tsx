import { type Metadata } from "next";
import Link from "next/link";
import { linkClass, Section } from "@/components/legal/section";
import { site } from "@/config/site";
import { publicPage } from "@/lib/seo";

/**
 * Sources et licences (avis juridique complémentaire du 09/11/2026, annexe 1) : ce que le dictionnaire doit à d'autres,
 * sous quelle licence, et ce qui vient du site. Les conditions d'utilisation, la notice de l'API et le pied de page y
 * renvoient. Les mentions viennent de backend/DELA-NOTICE.md, docs/LICENCES.md et data/lexicon/sources.lock.json.
 */
export const metadata: Metadata = publicPage({
  path: "/sources",
  title: "Sources et licences",
  description: `D'où vient le dictionnaire ${site.nameAfterDe} : le DELA (LGPLLR), Lexique 3.83 et le Wiktionnaire (CC BY-SA 4.0), et ce que ces licences autorisent.`,
});

const BY_SA = "https://creativecommons.org/licenses/by-sa/4.0/deed.fr";

export default function SourcesPage() {
  return (
    <main className="container mx-auto max-w-3xl p-4 md:p-8">
      <h1 className="text-3xl font-bold">Sources et licences</h1>
      <p className="mt-2 text-sm text-muted-foreground">Dernière mise à jour : 9 novembre 2026</p>

      <div className="mt-8 space-y-8 text-muted-foreground">
        <p className="rounded-lg border bg-secondary/20 p-4 text-foreground">
          {site.name} ne part pas de rien. Son dictionnaire repose sur des ressources construites par d&apos;autres,
          mises à disposition sous licence libre. Cette page dit lesquelles, ce qu&apos;elles autorisent, et ce qui
          vient de nous.
        </p>

        <Section title="Le lexique de base" id="dela">
          <p>
            Les mots et leurs formes fléchies proviennent du dictionnaire électronique des formes fléchies du français
            (DELAF), conçu au Laboratoire d&apos;Automatique Documentaire et Linguistique (LADL, équipe de Maurice
            Gross) et diffusé avec{" "}
            <a href="https://unitexgramlab.org/fr/language-resources" className={linkClass}>Unitex/GramLab</a>.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Ressource : le dictionnaire du français des ressources linguistiques d&apos;Unitex/GramLab
              (<code>fr/Dela</code>).
            </li>
            <li>
              Titulaire : Copyright (C) 2001-2019 Université Paris-Est Marne-la-Vallée (aujourd&apos;hui Université
              Gustave Eiffel) ; le dictionnaire des mots simples est dû à Blandine Courtois (LADL).
            </li>
            <li>Licence : Lesser General Public License For Linguistic Resources (<a href="https://spdx.org/licenses/LGPLLR.html" className={linkClass}>LGPLLR</a>).</li>
            <li>
              Modifications : formes normalisées (majuscules, sans accents), codes grammaticaux et flexionnels non
              repris, puis sélection et tri des mots retenus.
            </li>
          </ul>
          <p>
            La LGPLLR autorise l&apos;usage, la copie, la modification et la redistribution de la ressource, à
            condition que la ressource redistribuée reste sous cette licence et que sa forme source soit accessible.
            Le moteur de génération, qui utilise cette ressource sans l&apos;incorporer, n&apos;est pas soumis à
            cette licence.
          </p>
        </Section>

        <Section title="Les fréquences" id="lexique">
          <p>
            Les fréquences d&apos;usage proviennent de <a href="http://www.lexique.org" className={linkClass}>Lexique 3.83</a>,
            base lexicale du français contemporain : B. New, C. Pallier, M. Brysbaert et L. Ferrand (2004),
            « Lexique 2 : A New French Lexical Database », <i>Behavior Research Methods, Instruments, &amp; Computers</i>,
            36 (3), 516-524 ; B. New, C. Pallier, L. Ferrand et R. Matos (2001), « Une base de données lexicales du
            français contemporain sur internet : LEXIQUE », <i>L&apos;Année Psychologique</i>, 101, 447-462.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Licence : Creative Commons Attribution – Partage dans les mêmes conditions 4.0 International (<a href={BY_SA} className={linkClass}>CC BY-SA 4.0</a>).</li>
            <li>
              Ressource : <code>Lexique383.tsv</code>, téléchargé le 14 septembre 2026 depuis{" "}
              <a href="http://www.lexique.org/databases/Lexique383/" className={linkClass}>lexique.org</a>.
            </li>
            <li>Modifications : formes normalisées, fréquences converties sur l&apos;échelle zipf, entrées limitées aux mots du lexique de base.</li>
          </ul>
          <p>
            Ces fréquences servent, côté serveur, à choisir et à classer les mots d&apos;une grille. Elles ne sont
            restituées ni par le site ni par l&apos;API, et sont conservées dans un fichier distinct du lexique de
            base : aucun fichier ne mêle les deux ressources.
          </p>
        </Section>

        <Section title="Les sens affichés" id="wiktionnaire">
          <p>
            Les sens affichés à côté des mots proviennent du{" "}
            <a href="https://fr.wiktionary.org/" className={linkClass}>Wiktionnaire</a>, dictionnaire collaboratif du
            projet Wikimédia, par l&apos;extrait de <a href="https://kaikki.org/frwiktionary/" className={linkClass}>kaikki.org</a>.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Auteurs : les contributrices et contributeurs du Wiktionnaire, listés dans l&apos;historique de chaque page.</li>
            <li>Source : le lien « source » placé après chaque sens mène à sa page d&apos;origine.</li>
            <li>Licence : <a href={BY_SA} className={linkClass}>CC BY-SA 4.0</a>.</li>
            <li>Modifications : les sens peuvent être abrégés pour tenir dans l&apos;affichage ; la mention le signale.</li>
          </ul>
          <p>
            Ces sens restent disponibles sous CC BY-SA 4.0 : tu peux les reprendre, les modifier et les rediffuser
            dans les conditions de cette licence, en créditant leurs auteurs et en plaçant tes propres versions sous
            la même licence.
          </p>
        </Section>

        <Section title="Ce qui vient de nous" id="nous">
          <p>
            Le tri du dictionnaire (le choix des mots retenus et écartés), son organisation, le moteur de génération,
            le code du site, ses textes et sa documentation sont l&apos;œuvre de l&apos;éditeur {site.nameAfterDe} et
            ne sont pas sous licence libre. Les grilles que le site et l&apos;API produisent, en revanche,
            s&apos;utilisent librement : les <Link href="/terms" className={linkClass}>conditions d&apos;utilisation</Link> le
            disent.
          </p>
        </Section>

        <Section title="Ce que ces licences autorisent, et que nous ne restreignons pas" id="droits">
          <p>
            Les droits que la LGPLLR et CC BY-SA 4.0 accordent sur les ressources ci-dessus ne sont restreints par
            aucune de nos conditions. Pour travailler sur ces données, le plus simple reste de les obtenir auprès de
            leurs auteurs, par les liens ci-dessus : tu les y trouveras complètes, dans leur forme d&apos;origine, et
            sans nos limites d&apos;usage.
          </p>
        </Section>

        <Section title="Une erreur dans cette page ?" id="erreur">
          <p>
            Une attribution manquante ou inexacte se corrige vite : écris à{" "}
            <a href={`mailto:${site.contactEmail}`} className={linkClass}>{site.contactEmail}</a>. Nous corrigeons sans
            discuter.
          </p>
        </Section>
      </div>
    </main>
  );
}
