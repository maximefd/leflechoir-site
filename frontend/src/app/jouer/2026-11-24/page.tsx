import { PageGrille } from "@/components/jouer/page-grille";
import { jouerPage } from "@/lib/seo";
import data from "@/content/grilles/2026-11-24.json";

// Une page par grille, sans route dynamique (export statique). Le titre et la description viennent du JSON (ils ne
// disent rien des mots) ; la grille n'est écrite dans la page qu'une fois parue (components/jouer/page-grille.tsx)
export const metadata = jouerPage(data);

export default function Page() {
  return <PageGrille date="2026-11-24" />;
}
