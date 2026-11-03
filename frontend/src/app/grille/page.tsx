import { type Metadata } from "next";
import { GrillePartagee } from "@/components/grille-api/grille-partagee";
import { site } from "@/config/site";

// Une grille de l'API ouverte (ADR 0032), contenue dans son lien : rien à indexer, chaque adresse est une grille privée
export const metadata: Metadata = {
  title: "Une grille de mots fléchés",
  description: `Une grille de mots fléchés préparée avec l'API ${site.nameAfterDe} : la jouer, l'imprimer, la garder.`,
  robots: { index: false, follow: true },
};

export default function GrillePage() {
  return (
    <main className="container mx-auto max-w-3xl p-4 md:p-8">
      <h1 className="text-3xl font-bold md:text-4xl">Une grille de mots fléchés</h1>
      <p className="mt-2 text-muted-foreground">Préparée avec l&apos;API {site.nameAfterDe}.</p>
      {/* Pour un assistant IA qui ouvre la page sans JavaScript : ce qu'elle fait, au lieu d'une page vide */}
      <noscript>
        <p className="mt-4">
          Cette page affiche la grille de mots fléchés contenue dans son adresse (après le « # ») : on la joue en ligne,
          on l&apos;imprime ou on l&apos;enregistre. Elle a besoin de JavaScript ; la grille n&apos;est jamais envoyée au
          serveur.
        </p>
      </noscript>
      <div className="mt-6">
        <GrillePartagee />
      </div>
    </main>
  );
}
