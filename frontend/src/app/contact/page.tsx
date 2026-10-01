import { type Metadata } from "next";
import Link from "next/link";
import { linkClass, Section } from "@/components/legal/section";
import { site } from "@/config/site";
import { publicPage } from "@/lib/seo";

export const metadata: Metadata = publicPage({
  path: "/contact",
  title: "Contact",
  description: `Écrire à ${site.name} : une suggestion, un problème, une question sur tes données, ou une faille de sécurité.`,
});


export default function ContactPage() {
  return (
    <main className="container mx-auto max-w-3xl p-4 md:p-8">
      <h1 className="text-3xl font-bold">Contact</h1>

      <div className="mt-8 space-y-8 text-muted-foreground">
        <p className="rounded-lg border bg-secondary/20 p-4 text-foreground">
          Écris à{" "}
          <a href={`mailto:${site.contactEmail}`} className="font-semibold underline underline-offset-2">
            {site.contactEmail}
          </a>
          . Chaque message est lu par l&apos;auteur du site, qui répond en général sous quelques jours.
        </p>

        <Section title="Ce que tu peux y envoyer">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-foreground">Une suggestion</strong> : un format de grille qui manque, un mot
              absent du dictionnaire, ou un mot qui n&apos;a rien à faire dans une grille.
            </li>
            <li>
              <strong className="text-foreground">Un problème</strong> : ce que tu faisais, ce que tu attendais
              et ce qui s&apos;est passé. Si un message d&apos;erreur s&apos;est affiché, recopie-le.
            </li>
            <li>
              <strong className="text-foreground">Une demande sur tes données</strong> : les consulter, les corriger,
              les recevoir ou les effacer (voir la{" "}
              <Link href="/privacy" className={linkClass}>page de confidentialité</Link>). Écris depuis
              l&apos;adresse de ton compte : c&apos;est ainsi que l&apos;auteur sait que la demande vient de toi.
            </li>
          </ul>
        </Section>

        <Section title="Une faille de sécurité">
          <p>
            Écris plutôt à{" "}
            <a href={`mailto:${site.securityEmail}`} className={linkClass}>{site.securityEmail}</a>, en décrivant
            l&apos;impact et les étapes pour la reproduire. Merci de ne pas la rendre publique avant sa correction.
          </p>
        </Section>
      </div>
    </main>
  );
}
