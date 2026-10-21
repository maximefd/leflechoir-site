import { type Metadata } from "next";
import { PageRubrique } from "@/components/layout/page-rubrique";
import { LIENS_OUTILS } from "@/components/layout/rubriques";

// Une page de navigation, sans texte à elle : hors des moteurs, mais ses liens se suivent
export const metadata: Metadata = {
  title: "Outils",
  description: "Trouver un mot par ses lettres, les listes de mots par longueur, et tes dictionnaires.",
  robots: { index: false, follow: true },
};

export default function OutilsPage() {
  return (
    <PageRubrique
      titre="Outils"
      chapo="Pour trouver le mot qui manque, dans une grille du site comme sur papier."
      groupes={[{ liens: LIENS_OUTILS }]}
    />
  );
}
