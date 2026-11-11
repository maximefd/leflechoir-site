import { type Metadata } from "next";
import Link from "next/link";
import { ReportForm } from "@/components/contact/report-form";
import { linkClass } from "@/components/legal/section";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: "Signaler un contenu",
  description: `Signaler ${site.nameAfterA} une grille de l'API ou un mot du dictionnaire que tu estimes illicite.`,
  robots: { index: false, follow: true },
};

/** Le signalement d'un contenu (règlement sur les services numériques, art. 16 ; avis juridique du 08/11/2026). */
export default function SignalerPage() {
  return (
    <main className="container mx-auto max-w-3xl p-4 md:p-8">
      <h1 className="text-3xl font-bold">Signaler un contenu</h1>
      <div className="mt-6 space-y-6 text-muted-foreground">
        <p>
          Signale ici un contenu que nous gardons et qui te paraît illicite : une grille demandée à l&apos;API, que
          nous conservons 24 heures, ou un mot de notre dictionnaire. Une personne examine chaque signalement, sans
          retard inutile ; tu reçois un accusé de réception, puis notre décision et les voies de recours
          (<Link href="/terms#api" className={linkClass}>conditions d&apos;utilisation</Link>).
        </p>
        <p>
          Une grille partagée par lien voyage entière dans ce lien, que ton navigateur ne nous envoie pas : nous ne la
          recevons pas et ne pouvons pas la retirer. Adresse-toi à la personne qui te l&apos;a envoyée.
        </p>
        <ReportForm />
        <p className="text-xs">
          Ton nom et ton adresse servent à traiter le signalement et à te répondre ; ils sont gardés 12 mois, comme
          les messages de contact (<Link href="/privacy" className={linkClass}>confidentialité</Link>).
        </p>
      </div>
    </main>
  );
}
