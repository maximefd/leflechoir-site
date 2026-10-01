import { type Metadata } from "next";
import { SearchClientLayout } from "@/components/search/search-client-layout";
import { publicPage } from "@/lib/seo";

export const metadata: Metadata = publicPage({
  path: "/search",
  title: "Recherche de mots",
  description:
    "Trouve instantanément des mots pour tes grilles de mots fléchés. Recherche par motif (ex : P??LE) et utilise tes dictionnaires personnels.",
});

export default function SearchPage() {
  return <SearchClientLayout />;
}
