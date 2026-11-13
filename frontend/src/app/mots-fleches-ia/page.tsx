import { type Metadata } from "next";
import Link from "next/link";
import { linkClass, Section } from "@/components/legal/section";
import { site } from "@/config/site";
import { LIEN_PREPARE_EXEMPLE } from "@/content/lien-prepare";
import { publicPage } from "@/lib/seo";

/**
 * Écrite par Claude le 03/11/2026 pour le lot 4 de l'API ouverte (ADR 0032) ; adresse et titre choisis par l'auteur le
 * 08/11/2026 (les assistants nommés : c'est ce que les gens cherchent). Les annuaires de Claude et de ChatGPT demandent une page publique qui explique comment ajouter le
 * connecteur et s'en servir ; elle sert aussi à qui le cherche. Les chemins des menus sont ceux du 03/11/2026.
 */
export const metadata: Metadata = publicPage({
  path: "/mots-fleches-ia",
  title: "Créer des mots fléchés avec ChatGPT, Claude ou Le Chat",
  description: `Ajoute ${site.name} à Claude, ChatGPT ou Le Chat : ton assistant choisit les mots et écrit les définitions, notre moteur construit une vraie grille de mots fléchés, à jouer en ligne ou à imprimer.`,
});

const EXEMPLES = [
  "Crée-moi une grille de mots fléchés 9×9 facile pour l'anniversaire de Léa, avec GATEAU, BOUGIES et FETE.",
  "Fais une grille de mots fléchés sur le jardinage pour ma grand-mère, signée Paul.",
  "Une grille difficile de 12 cases de côté sur le cinéma, avec le mot mystère CANNES.",
];

export default function MotsFlechesIaPage() {
  return (
    <main className="container mx-auto max-w-3xl p-4 md:p-8">
      <h1 className="text-3xl font-bold">Créer des mots fléchés avec ChatGPT, Claude ou Le Chat</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Les assistants IA écrivent bien, mais ne savent pas croiser les mots d&apos;une grille. Avec le connecteur{" "}
        {site.nameAfterDe}, ton assistant choisit les mots et écrit les définitions, et notre moteur construit autour
        d&apos;eux une vraie grille de mots fléchés, en quelques secondes. Elle s&apos;affiche dans la conversation,
        sa solution d&apos;un clic, avec un lien pour la jouer en ligne ou l&apos;imprimer.
      </p>

      <div className="mt-8 space-y-8 text-muted-foreground">
        <Section title="L'adresse du connecteur" id="adresse">
          <p>Gratuit, sans compte : il suffit de la coller dans ton assistant.</p>
          <p className="rounded-md border bg-secondary/20 p-3 font-mono text-sm text-foreground" data-testid="adresse-connecteur">
            {site.connectorUrl}
          </p>
        </Section>

        <Section title="Dans Claude" id="claude">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Ouvre <strong className="text-foreground">Paramètres</strong>, puis <strong className="text-foreground">Connecteurs</strong>.</li>
            <li>Choisis <strong className="text-foreground">Ajouter un connecteur personnalisé</strong>.</li>
            <li>Nom : {site.name} ; adresse : celle ci-dessus. Valide.</li>
            <li>Dans une conversation, demande ta grille. Claude peut te demander, la première fois, la permission d&apos;utiliser ses outils.</li>
          </ol>
        </Section>

        <Section title="Dans ChatGPT" id="chatgpt">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Ouvre <strong className="text-foreground">Paramètres</strong>, puis <strong className="text-foreground">Applications</strong>.</li>
            <li>Active le <strong className="text-foreground">mode développeur</strong> dans les réglages avancés, puis crée une application.</li>
            <li>Nom : {site.name} ; adresse : celle ci-dessus ; authentification : aucune.</li>
            <li>Dans une conversation, choisis-la dans le menu « + », puis demande ta grille.</li>
          </ol>
        </Section>

        <Section title="Dans Le Chat de Mistral" id="le-chat">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Ouvre <strong className="text-foreground">Connecteurs</strong>, puis <strong className="text-foreground">+ Ajouter un connecteur</strong>.</li>
            <li>Onglet <strong className="text-foreground">Connecteur MCP personnalisé</strong> : un nom sans espace (LeFlechoir), et l&apos;adresse ci-dessus.</li>
            <li>Dans une conversation, active-le, puis demande ta grille.</li>
          </ol>
        </Section>

        <Section title="Quoi demander" id="exemples">
          <ul className="list-disc space-y-1 pl-5">
            {EXEMPLES.map((exemple) => (
              <li key={exemple}>« {exemple} »</li>
            ))}
          </ul>
          <p>
            Précise la taille (de 5 à 15 cases de côté ; 9 ou 10 pour un cadeau), le niveau (facile, moyen, difficile),
            les mots qui comptent, un mot mystère, et ton nom si tu veux signer la grille. Les grilles sont en français
            pour l&apos;instant ; d&apos;autres langues suivront.
          </p>
        </Section>

        <Section title="Ce que fait le connecteur" id="outils">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-foreground">Créer une grille</strong> autour de tes mots, dans la langue, la taille
              et le niveau demandés, et dire à l&apos;assistant combien de caractères tient chaque définition.
            </li>
            <li>
              <strong className="text-foreground">Vérifier les définitions</strong> de l&apos;assistant : chacune doit
              tenir dans sa case et ne pas donner la réponse. Puis montrer la grille finie, avec sa solution.
            </li>
            <li>
              <strong className="text-foreground">Dessiner la grille</strong> en image, quand tu la demandes.
            </li>
          </ul>
          <p>
            Il ne lit ni tes conversations ni tes fichiers. Il ne garde une grille que 24 heures, le temps de la
            vérifier, et jamais ses définitions (<Link href="/privacy#api" className={linkClass}>confidentialité</Link>,{" "}
            <Link href="/terms#api" className={linkClass}>conditions</Link>). Les grilles sont à toi, y compris pour un
            usage commercial.
          </p>
        </Section>

        <Section title="Sans connecteur" id="sans-connecteur">
          <p>
            Ton assistant peut aussi te donner un lien qui prépare le générateur du site avec tes mots : demande-lui
            « un lien de grille {site.nameAfterDe} ». Le générateur du site s&apos;ouvre avec tes mots et lance la grille aussitôt. Par
            exemple :
          </p>
          <p className="break-all rounded-md border bg-secondary/20 p-3 font-mono text-sm text-foreground">{LIEN_PREPARE_EXEMPLE}</p>
          <p>
            Pour un programme, l&apos;API fait tout cela sans assistant :{" "}
            <Link href="/developpeurs" className={linkClass}>l&apos;API pour les développeurs</Link>.
          </p>
        </Section>

        <Section title="Sans assistant" id="sans-assistant">
          <p>
            Le site fait la même chose, et plus : <Link href="/grid" className={linkClass}>crée ta grille ici</Link>,
            puis écris toi-même les définitions. Une question, un souci avec le connecteur :{" "}
            <Link href="/contact" className={linkClass}>écris-nous</Link>.
          </p>
        </Section>
      </div>
    </main>
  );
}
