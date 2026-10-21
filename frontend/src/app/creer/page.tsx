import { type Metadata } from "next";
import { PageRubrique } from "@/components/layout/page-rubrique";
import { LIENS_AIDE, LIENS_CREER } from "@/components/layout/rubriques";

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
      titre="Créer une grille"
      chapo="Laisse le site remplir la grille autour de tes mots, ou construis-la toi-même, case par case."
      groupes={[
        { liens: LIENS_CREER },
        { titre: "Pour t’aider, même sur papier", liens: [...LIENS_AIDE, { href: "/creer-des-mots-fleches", label: "Le guide", texte: "De l’idée à la grille, pas à pas." }] },
      ]}
    />
  );
}
