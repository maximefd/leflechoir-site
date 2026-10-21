import { type Metadata } from "next";
import { QuestionsFrequentes } from "@/components/faq/questions-frequentes";
import { Landing } from "@/components/home/landing";
import { site } from "@/config/site";
import { QUESTIONS_ACCUEIL } from "@/content/faq-accueil";
import { faqPageJsonLd, publicPage } from "@/lib/seo";

export const metadata: Metadata = publicPage({
  path: "/",
  description: `${site.name} génère automatiquement une grille de mots fléchés autour de tes mots obligatoires et souhaités, puis t'accompagne pour la modifier, écrire tes définitions et l'imprimer.`,
});

// Données structurées : ce qu'est le site, et ses questions fréquentes, pour les moteurs de recherche et de réponse IA
// (#113, #134)
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      name: site.name,
      url: site.url,
      description: site.description,
      inLanguage: site.lang,
      applicationCategory: "DesignApplication",
      operatingSystem: "Navigateur web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
    },
    faqPageJsonLd(QUESTIONS_ACCUEIL),
  ],
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        // Échapper « < » : une chaîne de la configuration ne peut pas fermer la balise
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      <Landing>
        <QuestionsFrequentes questions={QUESTIONS_ACCUEIL} className="mx-auto mt-16 max-w-2xl" />
      </Landing>
    </>
  );
}
