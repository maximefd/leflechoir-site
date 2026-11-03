import { type Metadata } from "next";
import { PageRubrique } from "@/components/layout/page-rubrique";
import { LIENS_AIDE, LIENS_CREER } from "@/components/layout/rubriques";
import { LienPrepare } from "@/components/grille-api/lien-prepare";

// Une page de navigation, sans texte à elle : hors des moteurs (le guide /creer-des-mots-fleches porte la requête),
// mais ses liens se suivent
export const metadata: Metadata = {
  title: "Créer une grille",
  description: "Générer une grille, la faire à la main, reprendre tes grilles, et les outils qui aident.",
  robots: { index: false, follow: true },
};

export default function CreerPage() {
  return (
    <PageRubrique
      avant={
        <>
          <LienPrepare />
          {/* Pour un assistant IA qui ouvre la page sans JavaScript : ce que fait le lien préparé */}
          <noscript>
            <p className="mb-6">
              Avec des paramètres (lang, taille, mots, mystere, niveau), cette page prépare le générateur de mots fléchés
              avec ces mots : la personne y voit ce qui a été compris, puis lance sa grille. Exemple :
              /creer?lang=fr&amp;taille=10x10&amp;mots=gateau,bougie,cadeau&amp;mystere=MAMIE&amp;niveau=facile
            </p>
          </noscript>
        </>
      }
      titre="Créer une grille"
      chapo="Laisse le site remplir la grille autour de tes mots, ou construis-la toi-même, case par case."
      groupes={[
        { liens: LIENS_CREER },
        { titre: "Pour t’aider, même sur papier", liens: [...LIENS_AIDE, { href: "/creer-des-mots-fleches", label: "Le guide", texte: "De l’idée à la grille, pas à pas." }] },
      ]}
    />
  );
}
