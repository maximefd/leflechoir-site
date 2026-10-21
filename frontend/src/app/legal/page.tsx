import { type Metadata } from "next";
import Link from "next/link";
import { linkClass, Section } from "@/components/legal/section";
import { site } from "@/config/site";
import { publicPage } from "@/lib/seo";

export const metadata: Metadata = publicPage({
  path: "/legal",
  title: "Mentions légales",
  description: `Qui édite ${site.name}, qui l'héberge, comment joindre son auteur, et les ressources qu'il emprunte.`,
});

// Les hébergeurs, dont la loi demande le nom, l'adresse et le téléphone (LCEN, art. 6, III)
const HOSTS = [
  {
    name: "OVH SAS",
    role: "le serveur de l'application et sa base de données, en France",
    address: "2 rue Kellermann, 59100 Roubaix, France",
    phone: "1007 (depuis la France)",
  },
  {
    name: "Cloudflare, Inc.",
    role: "les pages du site (Cloudflare Pages) et la connexion au serveur",
    address: "101 Townsend Street, San Francisco, CA 94107, États-Unis",
    phone: "+1 650 319 8930",
  },
];

export default function LegalPage() {
  return (
    <main className="container mx-auto max-w-3xl p-4 md:p-8">
      <h1 className="text-3xl font-bold">Mentions légales</h1>
      <p className="mt-2 text-sm text-muted-foreground">Dernière mise à jour : 25 septembre 2026</p>

      <div className="mt-8 space-y-8 text-muted-foreground">
        <Section title="Éditeur">
          <p>
            {site.name} ({site.url.replace(/^https?:\/\//, "")}) est un outil de création de mots fléchés, édité par
            un particulier, à titre non professionnel et gratuit. Comme la loi le permet dans ce cas (loi n° 2004-575
            du 21 juin 2004, art. 6, III, 2), son nom n&apos;est pas publié : il est connu de l&apos;hébergeur, qui
            le communique à la justice si elle le demande.
          </p>
          <p>
            Pour joindre l&apos;éditeur :{" "}
            <a href={`mailto:${site.contactEmail}`} className={linkClass}>{site.contactEmail}</a> (voir la{" "}
            <Link href="/contact" className={linkClass}>page contact</Link>).
          </p>
        </Section>

        <Section title="Hébergement">
          <ul className="list-disc space-y-2 pl-5">
            {HOSTS.map((host) => (
              <li key={host.name}>
                <strong className="text-foreground">{host.name}</strong>, pour {host.role} : {host.address}.
                Téléphone : {host.phone}.
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Utilisation et données personnelles">
          <p>
            Les règles d&apos;utilisation du site sont dans les{" "}
            <Link href="/terms" className={linkClass}>conditions d&apos;utilisation</Link>. Ce que {site.name}{" "}
            conserve, pourquoi, combien de temps et comment le supprimer : la{" "}
            <Link href="/privacy" className={linkClass}>page de confidentialité</Link>.
          </p>
        </Section>

        <Section title="Les listes de mots">
          <p>
            Le choix des mots de {site.name} est le fruit d&apos;un tri fait à la main, mot par mot, par
            l&apos;éditeur. Cette sélection, et les listes de mots publiées sur le site qui en sont issues, forment une
            base de données protégée par les articles L341-1 et suivants du Code de la propriété intellectuelle : leur
            extraction ou leur réutilisation, en totalité ou pour une partie substantielle, notamment par des moyens
            automatisés, est interdite sans autorisation écrite. Les ressources d&apos;origine citées ci-dessous restent
            disponibles sous leurs propres licences.
          </p>
        </Section>

        <Section title="Crédits">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-foreground">Liste des mots</strong> : dérivée du DELA, dictionnaire des formes
              fléchies du français (LADL, diffusé avec{" "}
              <a href="https://unitexgramlab.org/fr/language-resources" className={linkClass}>Unitex/GramLab</a>),
              sous licence LGPLLR.
            </li>
            <li>
              <strong className="text-foreground">Fréquence des mots</strong> :{" "}
              <a href="http://www.lexique.org" className={linkClass}>Lexique 3.83</a> (Boris New, Christophe Pallier et
              coll.), sous licence{" "}
              <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr" className={linkClass}>CC BY-SA 4.0</a>.
            </li>
            <li>
              <strong className="text-foreground">Le sens des mots</strong> : tiré du{" "}
              <a href="https://fr.wiktionary.org/" className={linkClass}>Wiktionnaire</a> (extrait de{" "}
              <a href="https://kaikki.org/" className={linkClass}>kaikki.org</a>), sous licence{" "}
              <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr" className={linkClass}>CC BY-SA 4.0</a>,
              cité tel quel ou abrégé. Il s&apos;affiche à côté des grilles, jamais dans leurs cases.
            </li>
            <li>
              <strong className="text-foreground">Police des grilles</strong> : Archivo Narrow (Omnibus-Type), sous
              licence <a href="/fonts/OFL.txt" className={linkClass}>SIL Open Font License 1.1</a>.
            </li>
            <li>
              <strong className="text-foreground">Police de l&apos;écriture du joueur</strong> : Architects Daughter
              (Kimberly Geswein), sous licence{" "}
              <a href="/fonts/OFL-ArchitectsDaughter.txt" className={linkClass}>SIL Open Font License 1.1</a>.
            </li>
            <li>
              <strong className="text-foreground">Police du site</strong> : Inter (Rasmus Andersson), sous licence SIL
              Open Font License 1.1.
            </li>
          </ul>
        </Section>
      </div>
    </main>
  );
}
