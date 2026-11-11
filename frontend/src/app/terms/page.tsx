import { type Metadata } from "next";
import Link from "next/link";
import { linkClass, Section } from "@/components/legal/section";
import { site } from "@/config/site";
import { API_TERMS_VERSION } from "@/lib/conditions-api";
import { publicPage } from "@/lib/seo";

export const metadata: Metadata = publicPage({
  path: "/terms",
  title: "Conditions d'utilisation",
  description: `Les règles d'utilisation ${site.nameAfterDe} : ce qui t'appartient, ce que le site te doit, et ce qu'il ne garantit pas.`,
});

export default function TermsPage() {
  return (
    <main className="container mx-auto max-w-3xl p-4 md:p-8">
      <h1 className="text-3xl font-bold">Conditions d&apos;utilisation</h1>
      <p className="mt-2 text-sm text-muted-foreground">Dernière mise à jour : 9 novembre 2026</p>

      <div className="mt-8 space-y-8 text-muted-foreground">
        <p className="rounded-lg border bg-secondary/20 p-4 text-foreground">
          En bref : {site.name} est gratuit et fourni tel quel. Tes dictionnaires et tes grilles sont à toi. Les
          mots que tu suggères pour le dictionnaire commun deviennent ceux du site. N&apos;utilise pas le site
          pour nuire à d&apos;autres ou au service.
        </p>

        <Section title="Le service">
          <p>
            {site.name} aide à créer des grilles de mots fléchés : recherche de mots par motif, génération
            automatique de grilles, définitions et export. Il est gratuit, sans publicité. On peut l&apos;utiliser
            sans compte ; un compte permet de conserver ses dictionnaires et ses grilles.
          </p>
        </Section>

        <Section title="Ton compte">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Il faut avoir au moins 15 ans pour créer un compte, ou l&apos;accord d&apos;un parent.
            </li>
            <li>
              Tu gardes ton mot de passe pour toi : ce qui est fait avec ton compte est réputé fait par toi.
            </li>
            <li>
              Tu peux supprimer ton compte à tout moment depuis{" "}
              <Link href="/account" className={linkClass}>Mon compte</Link>.
            </li>
          </ul>
        </Section>

        <Section title="Ce qui t'appartient">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-foreground">Tes dictionnaires et tes grilles</strong> restent les tiens.{" "}
              {site.name} ne les conserve que pour te les rendre, ne les montre à personne et n&apos;en fait aucun
              autre usage.
            </li>
            <li>
              <strong className="text-foreground">Les grilles que tu crées</strong>, générées ou non, tu peux
              les utiliser librement : les imprimer, les partager, les publier, y compris dans un cadre commercial.
              Tu es responsable de leur contenu, en particulier des mots et des définitions que tu y mets.
            </li>
          </ul>
        </Section>

        <Section title="Le dictionnaire commun et tes suggestions">
          <p>
            Le tri du dictionnaire commun, les formats de grilles et le moteur de génération sont le travail du
            site ; les ressources qu&apos;il emprunte gardent leur licence (voir les crédits des{" "}
            <Link href="/legal" className={linkClass}>mentions légales</Link>). Le sens des mots affiché à côté des
            grilles vient du Wiktionnaire et reste sous sa licence (CC BY-SA 4.0) : tu peux le réutiliser selon ses
            termes. Quand tu suggères un mot à ajouter
            ou à retirer, tu nous autorises gratuitement à l&apos;utiliser, le vérifier, le corriger et
            l&apos;intégrer à ce dictionnaire, pour tout usage, y compris commercial, sans limite de durée ni de
            territoire. Cette autorisation ne nous donne aucun droit exclusif sur les mots eux-mêmes.
          </p>
        </Section>

        <Section title="Ce qui n'est pas permis">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Surcharger le service, par exemple en lançant des générations ou des recherches automatisées en masse.
            </li>
            <li>Tenter d&apos;accéder aux données d&apos;un autre, ou de contourner les protections du site.</li>
            <li>Enregistrer dans tes dictionnaires ou tes grilles un contenu illicite.</li>
          </ul>
          <p>
            En cas d&apos;abus, l&apos;accès peut être limité ou le compte supprimé. Une faille découverte de bonne
            foi est la bienvenue : signale-la à{" "}
            <a href={`mailto:${site.securityEmail}`} className={linkClass}>{site.securityEmail}</a>.
          </p>
        </Section>

        <Section title="L'API et le connecteur pour assistants IA" id="api">
          <p>
            L&apos;API {site.nameAfterDe} et son connecteur pour assistants IA construisent des grilles autour des mots
            qu&apos;on leur donne, vérifient des définitions et dessinent des grilles. Ils sont gratuits, avec des
            limites d&apos;usage (par clé, par assistant, par adresse) que la notice de l&apos;API indique et qui
            peuvent évoluer. En appelant l&apos;API, tu acceptes ces conditions dans leur version en vigueur, que la
            notice indique aussi (version du <span data-testid="version-conditions-api">{API_TERMS_VERSION}</span>).
            L&apos;API n&apos;est pas conçue pour les enfants : si tu es mineur, utilise-la avec l&apos;accord de ton
            représentant légal.
          </p>
          <h3 className="font-semibold text-foreground">Les grilles obtenues</h3>
          <p>
            Tu peux utiliser librement les grilles que l&apos;API te rend, y compris dans un cadre commercial : les
            partager, les imprimer, les modifier, les publier, les intégrer à tes projets. Nous ne revendiquons aucun
            droit sur elles et ne te demandons aucune autorisation. Cette liberté porte sur ce que nous pouvons te
            concéder : elle ne couvre pas les droits que des tiers pourraient détenir sur ce que tu nous envoies ou
            ajoutes à une grille, ni les définitions écrites par quelqu&apos;un d&apos;autre que toi. Elle ne
            s&apos;étend pas non plus à notre sélection de mots, au moteur, au code ni à la documentation{" "}
            {site.nameAfterDe}, qui restent protégés. Les dessins portent la signature de l&apos;API ; la garder est apprécié,
            jamais exigé.
          </p>
          <h3 className="font-semibold text-foreground">Les définitions et le nom que tu envoies</h3>
          <p>
            Tu dois disposer des droits sur les définitions, les mots et le nom d&apos;auteur que tu transmets, et ne
            pas porter atteinte aux droits ni à la vie privée d&apos;autrui. N&apos;envoie pas de données personnelles
            dont tu n&apos;as pas la maîtrise : une grille partagée par lien est visible de qui a le lien.
          </p>
          <h3 className="font-semibold text-foreground">Les clés d&apos;API</h3>
          <p>
            Une clé est personnelle et confidentielle : ne la partage pas, ne la publie pas. Tu réponds des appels
            faits avec ta clé, sauf si elle a été utilisée à ton insu sans faute de ta part. Signale-nous sans délai
            une clé compromise : nous la fermons aussitôt.
          </p>
          <h3 className="font-semibold text-foreground">Ce qui n&apos;est pas permis</h3>
          <p>
            Le dictionnaire {site.nameAfterDe} repose en partie sur des ressources libres, dont les licences sont
            indiquées sur la page <Link href="/sources" className={linkClass}>Sources et licences</Link>. Les droits
            que ces licences accordent ne sont en rien restreints par ces conditions, et rien ici ne t&apos;empêche
            d&apos;en user directement auprès de leurs auteurs. Ce qui n&apos;est pas permis, dans la mesure des droits
            dont nous disposons :
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Extraire ou reconstituer notre sélection de mots, son organisation et le moteur de génération,
              notamment par des demandes répétées et systématiques excédant manifestement l&apos;usage normal de
              l&apos;API, ou en rassemblant les grilles obtenues.
            </li>
            <li>
              Contourner les limites d&apos;usage : multiplier les clés ou les adresses, se faire passer pour un
              assistant, altérer les en-têtes d&apos;identification.
            </li>
            <li>Revendre l&apos;accès à l&apos;API, le louer ou le mettre à disposition d&apos;autres comme service autonome, sans notre accord écrit.</li>
            <li>
              Bâtir, alimenter ou améliorer, à partir de notre sélection ou du moteur, un service concurrent de
              génération de grilles.
            </li>
            <li>
              Utiliser l&apos;API ou ses résultats pour entraîner un système d&apos;intelligence artificielle à des fins
              commerciales. Nous réservons expressément nos droits au sens de l&apos;article L122-5-3 du Code de la
              propriété intellectuelle (article 4 de la directive 2019/790), et l&apos;API exprime cette réserve sous
              une forme lisible par machine. Elle porte sur nos seuls éléments (notre sélection de mots, son
              organisation, le moteur, nos textes) ; elle ne retire rien aux ressources libres de la page{" "}
              <Link href="/sources" className={linkClass}>Sources et licences</Link>.
            </li>
            <li>Y faire passer un contenu illicite, ou s&apos;en servir à des fins illicites.</li>
            <li>Porter atteinte à la sécurité, à l&apos;intégrité ou au fonctionnement de l&apos;API et du site.</li>
          </ul>
          <p>
            Ces interdictions ne font pas obstacle aux usages que la loi autorise, notamment aux exceptions
            impératives du droit d&apos;auteur et du droit des bases de données. En cas de manquement, nous pouvons
            limiter ton usage, fermer une clé ou couper l&apos;accès : immédiatement si la sécurité ou le
            fonctionnement du service est en jeu, après t&apos;avoir averti dans les autres cas quand c&apos;est
            possible. Nous restons libres d&apos;agir en justice pour faire cesser l&apos;atteinte et en obtenir
            réparation.
          </p>
          <h3 className="font-semibold text-foreground">Les contenus et leur signalement</h3>
          <p>
            Une grille partagée par lien voyage entière dans ce lien, après le « # », que ton navigateur ne nous
            envoie pas : nous ne la recevons ni ne la stockons, et ne pouvons donc ni la lire ni la retirer. Ce que
            nous gardons, ce sont les grilles demandées à l&apos;API, 24 heures, et le dictionnaire du site. Toute
            personne peut nous signaler l&apos;un de ces contenus qu&apos;elle estime illicite par{" "}
            <Link href="/signaler" className={linkClass}>le formulaire de signalement</Link>. Nous accusons réception
            du signalement, l&apos;examinons sans retard inutile et de manière objective, et informons son auteur de
            notre décision et de ses voies de recours. Nous pouvons retirer un contenu, rendre un lien inaccessible ou
            fermer un accès ; la personne concernée en est informée, avec les motifs, quand nous avons un moyen de la
            joindre. Nos décisions sont prises par une personne, après examen : aucun retrait n&apos;est automatisé.
          </p>
          <h3 className="font-semibold text-foreground">Ce que l&apos;API garde</h3>
          <p>
            Une grille demandée est conservée 24 heures au plus, le temps de la rendre. Les grilles et définitions
            envoyées pour vérification ou dessin ne sont pas conservées. Le détail est dans la{" "}
            <Link href="/privacy#api" className={linkClass}>politique de confidentialité</Link>.
          </p>
          <h3 className="font-semibold text-foreground">Disponibilité, évolution, responsabilité</h3>
          <p>
            L&apos;API est fournie gratuitement. Nous faisons de notre mieux pour qu&apos;elle fonctionne, sans
            garantir un accès permanent, l&apos;absence d&apos;erreur, ni une grille à chaque demande. Elle peut être
            suspendue, en particulier pour la maintenance, la sécurité, ou pour laisser la place aux visiteurs du
            site ; nous prévenons quand une interruption durable ou un changement important est prévisible. Les
            grilles sont produites automatiquement et les définitions viennent de qui les écrit : vérifie-les avant
            de les diffuser. Nous ne garantissons ni leur exactitude ni leur adéquation à un usage particulier.
            {site.name} est édité à titre personnel, gratuitement et sans contrepartie d&apos;aucune sorte : cette
            gratuité est prise en compte dans l&apos;appréciation des obligations de son éditeur.
          </p>
          <p>
            Dans la limite de ce que la loi permet, nous ne répondons pas des dommages indirects, ni des pertes liées
            à une défaillance des réseaux, de nos prestataires techniques ou des plateformes d&apos;assistants IA. Si
            tu intègres l&apos;API à un produit professionnel, tu assumes le risque d&apos;indisponibilité et prévois
            un fonctionnement dégradé. Rien ici n&apos;exclut une responsabilité qui ne peut légalement l&apos;être. Le
            format de
            l&apos;API est versionné (<code>/v1</code>) : un changement qui casserait les programmes qui
            l&apos;utilisent passera par une nouvelle version.
          </p>
        </Section>

        <Section title="Sans garantie">
          <p>
            Le site est fourni tel quel, par un particulier, sans garantie de disponibilité ni de résultat : une
            grille peut ne pas pouvoir être générée, un mot peut manquer ou être rare, le service peut être
            interrompu. Garde une copie de ce qui compte pour toi (l&apos;export PDF et le fichier de travail sont
            faits pour cela). Dans les limites permises par la loi, l&apos;éditeur n&apos;est pas responsable des
            dommages indirects liés à l&apos;utilisation du site.
          </p>
        </Section>

        <Section title="Changements et droit applicable">
          <p>
            Ces conditions peuvent changer ; la date en haut de la page l&apos;indique. Un changement important est
            annoncé sur le site. Elles sont soumises au droit français. Pour toute
            question : <Link href="/contact" className={linkClass}>contact</Link>.
          </p>
        </Section>
      </div>
    </main>
  );
}
