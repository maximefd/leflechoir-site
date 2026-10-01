import { type Metadata } from "next";
import { NewGrid } from "@/components/grid/new-grid";
import { privatePage } from "@/lib/seo";

export const metadata: Metadata = privatePage({
  title: "Créer une grille à la main",
  description: "Partir d'une mise en page du catalogue ou d'une grille vide, et remplir ses mots à la main.",
});

export default function NewGridPage() {
  return <NewGrid />;
}
