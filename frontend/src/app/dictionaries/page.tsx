import { type Metadata } from "next";
import { DictionariesClientLayout } from "@/components/dictionary/dictionaries-client-layout";
import { privatePage } from "@/lib/seo";

export const metadata: Metadata = privatePage({
  title: "Tes dictionnaires",
  description: "Rassemble tes mots par thème, avec leurs définitions : ils passent en tête de la recherche par motif et alimentent les grilles que tu génères.",
});

export default function DictionariesPage() {
  return <DictionariesClientLayout />;
}
