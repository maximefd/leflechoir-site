import { type Metadata } from "next";
import Link from "next/link";
import { linkClass, Section } from "@/components/legal/section";
import { site } from "@/config/site";
import { publicPage } from "@/lib/seo";

export const metadata: Metadata = publicPage({
  path: "/privacy",
  title: "Confidentialité",
  description:
    `Ce que ${site.name} conserve sur toi — une adresse e-mail, un mot de passe haché, tes dictionnaires et tes grilles —, ce qu'il mesure sans cookie, pour combien de temps, qui y touche et comment tout effacer.`,
});

/**
 * Chaque traitement ici figure au registre (docs/RGPD.md), et inversement. Tout nouveau champ mesuré y est
 * déclaré (ADR 0016, CLAUDE.md).
 */

// Les prestataires qui traitent des données pour le site (sous-traitants, RGPD art. 28)
const PROCESSORS = [
  { name: "OVH", what: "héberge le serveur de l'application et sa base de données", where: "France" },
  {
    name: "Cloudflare",
    what: "sert les pages du site, relaie les connexions au serveur, garde les sauvegardes chiffrées et fait suivre les messages envoyés à l'adresse de contact",
    where: "Union européenne et États-Unis (certifié Data Privacy Framework)",
  },
  { name: "Brevo", what: "envoie les e-mails du compte (confirmation de l'adresse, mot de passe oublié)", where: "France" },
  {
    name: "Sentry",
    what: "reçoit les rapports d'erreur, sans adresse IP, cookie ni contenu de formulaire",
    where: "Union européenne (Allemagne)",
  },
];

export default function PrivacyPage() {
  return (
    <main className="container mx-auto max-w-3xl p-4 md:p-8">
      <h1 className="text-3xl font-bold">Confidentialité</h1>
      <p className="mt-2 text-sm text-muted-foreground">Dernière mise à jour : 25 septembre 2026</p>

      <div className="mt-8 space-y-8 text-muted-foreground">
        <p className="rounded-lg border bg-secondary/20 p-4 text-foreground">
          {site.name} conserve ton adresse e-mail, ton mot de passe haché, tes dictionnaires et tes grilles, si
          tu crées un compte. Pour savoir ce qui sert et ce qui casse, le serveur compte aussi les recherches, les
          générations et les erreurs, sans cookie et sans garder ton adresse IP. Pas de publicité, aucun cookie en
          dehors de ceux de ta session, et aucune donnée vendue ni cédée.
        </p>

        <Section title="Qui est responsable">
          <p>
            L&apos;éditeur du site, un particulier (voir les{" "}
            <Link href="/legal" className={linkClass}>mentions légales</Link>), joignable à{" "}
            <a href={`mailto:${site.contactEmail}`} className={linkClass}>{site.contactEmail}</a>.
          </p>
        </Section>

        <Section title="Ce qui est conservé, si tu crées un compte">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong className="text-foreground">Ton adresse e-mail</strong>, qui sert d&apos;identifiant.</li>
            <li>
              <strong className="text-foreground">Ton mot de passe, haché</strong> (bcrypt) : il n&apos;est jamais
              enregistré tel quel, et personne ne peut le relire.
            </li>
            <li><strong className="text-foreground">Tes dictionnaires</strong>, leurs mots et leurs définitions.</li>
            <li>
              <strong className="text-foreground">Tes grilles conservées</strong> : leurs cases, leurs définitions et
              tes notes.
            </li>
            <li>
              <strong className="text-foreground">La date de ton inscription et celle de ta dernière
              connexion</strong> : la seconde dit si le compte est encore utilisé (voir plus bas).
            </li>
          </ul>
          <p>
            Pourquoi : pour te fournir le service que tu demandes en créant un compte (RGPD, art. 6.1.b). Tes
            recherches et les grilles que tu génères sans les conserver ne sont pas enregistrées. En invité, rien
            ne l&apos;est, sauf les mots que tu choisis de signaler ou de proposer (juste en dessous).
          </p>
        </Section>

        <Section title="Tes suggestions de mots">
          <p>
            Quand tu signales un mot (le petit drapeau) ou que tu en proposes un, sont conservés : le mot, s&apos;il
            est à retirer ou à ajouter, l&apos;endroit du site d&apos;où il vient et la date. Avec un compte, la
            suggestion est rattachée à ton compte, pour que tu voies ce qu&apos;elle est devenue ; sans compte, à
            l&apos;empreinte du jour décrite plus bas, jamais à ton adresse IP. Elle sert à relire le dictionnaire
            commun, et rien n&apos;y change sans cette relecture (intérêt légitime, RGPD art. 6.1.f).
          </p>
          <p>
            Pour cette relecture, le site tient aussi compte, sans que tu aies à cliquer, des mots imposés
            inconnus du dictionnaire, des mots remplacés à la main dans une grille conservée, et des mots rangés
            dans les dictionnaires personnels, ceux-ci seulement quand au moins deux personnes ont le même, et
            sans dire lesquelles. Tes suggestions disparaissent avec ton compte.
          </p>
        </Section>

        <Section title="Ce qui passe sans être conservé longtemps">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-foreground">Ta session</strong> : des cookies strictement nécessaires à la
              connexion, illisibles par les scripts de la page, valables 7 jours au plus. La déconnexion les efface
              et les rend inutilisables. Ils ne servent à rien d&apos;autre : aucun consentement n&apos;est donc
              demandé.
            </li>
            <li>
              <strong className="text-foreground">Ton adresse IP</strong> : gardée en mémoire pour limiter le
              nombre de requêtes et protéger le service des abus, puis oubliée, au plus tard après une heure. Le
              journal technique du serveur la note aussi, avec la page demandée, pour diagnostiquer une panne ou une
              attaque ; il est effacé au bout de 14 jours (intérêt légitime, RGPD art. 6.1.f).
            </li>
            <li>
              <strong className="text-foreground">Les rapports d&apos;erreur</strong> : quand quelque chose casse, la
              page ou l&apos;action en cause part chez Sentry, sans adresse IP, cookie, mot de passe ni contenu de
              formulaire. Sentry les efface au bout de 90 jours au plus.
            </li>
          </ul>
        </Section>

        <Section title="La mesure d'usage, sans cookie">
          <p>
            Pour savoir ce qui sert, ce qui casse et ce que coûte le serveur, l&apos;application note, côté serveur :
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              chaque <strong className="text-foreground">recherche</strong> : la longueur du motif et son nombre de
              lettres inconnues, le nombre de résultats, la durée — pas le motif lui-même ;
            </li>
            <li>
              chaque <strong className="text-foreground">génération</strong> : le format, le nombre et la longueur
              des mots imposés, la réussite ou la raison de l&apos;échec, la durée. Le texte des mots imposés et
              souhaités est gardé 90 jours, pour repérer ceux qui manquent au dictionnaire, puis effacé ;
            </li>
            <li>
              les <strong className="text-foreground">étapes d&apos;un compte</strong> (inscription, confirmation,
              connexion, suppression), les <strong className="text-foreground">grilles conservées</strong> et les{" "}
              <strong className="text-foreground">erreurs</strong> (la page et le code d&apos;erreur).
            </li>
          </ul>
          <p>
            Chaque fait porte le pays, déduit de la connexion par Cloudflare, et une{" "}
            <strong className="text-foreground">empreinte du jour</strong> : un code calculé à partir de ton adresse
            IP et de ton navigateur avec une clé secrète tirée au hasard chaque jour, et détruite le lendemain. Elle
            compte les visiteurs d&apos;une journée sans permettre de te reconnaître d&apos;un jour à l&apos;autre.
            Ton adresse IP n&apos;est pas enregistrée, et rien n&apos;est écrit dans ton navigateur.
          </p>
          <p>
            Ces faits ne servent qu&apos;aux statistiques du site (intérêt légitime, RGPD art. 6.1.f). Ils sont
            gardés 13 mois ; ceux qui sont liés à ton compte (ses étapes, ses grilles conservées) disparaissent avec
            lui. Pour t&apos;y opposer, écris à l&apos;adresse de contact : les faits liés à ton compte seront
            effacés ; les autres ne permettent pas de te retrouver.
          </p>
        </Section>

        <Section title="Si tu écris à l'adresse de contact">
          <p>
            Ton message et ton adresse sont gardés le temps de te répondre et de suivre ta demande, puis
            effacés au plus tard un an après le dernier échange.
          </p>
        </Section>

        <Section title="Durée et suppression">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Tes données sont gardées tant que ton compte existe. Tu peux le supprimer à tout moment depuis{" "}
              <Link href="/account" className={linkClass}>Mon compte</Link> : l&apos;adresse e-mail, le mot de passe,
              les dictionnaires, les mots et les grilles sont effacés immédiatement et définitivement.
            </li>
            <li>
              Un compte où personne ne s&apos;est connecté depuis 3 ans est supprimé, après un e-mail de prévenance
              un mois avant.
            </li>
            <li>
              Des sauvegardes chiffrées de la base sont faites chaque nuit et gardées 30 jours : après la suppression
              d&apos;un compte, ses données y subsistent jusqu&apos;à l&apos;effacement de la dernière sauvegarde qui
              les contient.
            </li>
          </ul>
        </Section>

        <Section title="Qui y touche">
          <p>
            L&apos;éditeur, et les prestataires ci-dessous, pour le seul fonctionnement du site. Aucun ne reçoit tes
            dictionnaires ou tes grilles pour son propre usage.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {PROCESSORS.map((processor) => (
              <li key={processor.name}>
                <strong className="text-foreground">{processor.name}</strong> {processor.what}. Données traitées en :{" "}
                {processor.where}.
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Tes droits">
          <p>
            Tu peux consulter tes données dans l&apos;application (Mon compte, Dictionnaires, Mes grilles), les
            corriger, les effacer, t&apos;opposer à un traitement ou en demander la limitation, et demander à les
            recevoir dans un format lisible. Écris à{" "}
            <a href={`mailto:${site.contactEmail}`} className={linkClass}>{site.contactEmail}</a>, depuis
            l&apos;adresse de ton compte : la réponse vient sous un mois. Si elle ne te satisfait pas, tu peux
            saisir la <a href="https://www.cnil.fr/fr/plaintes" className={linkClass}>CNIL</a>.
          </p>
        </Section>
      </div>
    </main>
  );
}
