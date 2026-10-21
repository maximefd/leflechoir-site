import { metadataCombinaison, PageCombinaison, parametresCombinaisons } from "@/components/mots/page-combinaison";

/**
 * Les pages « Mots de 4 lettres commençant par A » et « … finissant par EZ » : une par combinaison qui a des mots
 * (`content/mots/catalogue.json`, écrit par `make listes`), pré-rendues au build avec leur liste complète dans le HTML.
 * Aucune autre adresse n'existe (`dynamicParams = false`) : une combinaison sans mot est une 404, jamais une page vide.
 */
const SLUG = "quatre-lettres";

export const dynamicParams = false;

export function generateStaticParams() {
  return parametresCombinaisons(SLUG);
}

export async function generateMetadata({ params }: { params: Promise<{ combinaison: string }> }) {
  return metadataCombinaison(SLUG, (await params).combinaison);
}

export default async function CombinaisonPage({ params }: { params: Promise<{ combinaison: string }> }) {
  return <PageCombinaison listeSlug={SLUG} slug={(await params).combinaison} />;
}
