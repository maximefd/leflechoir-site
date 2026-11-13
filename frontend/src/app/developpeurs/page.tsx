import { type Metadata } from "next";
import Link from "next/link";
import { linkClass, Section } from "@/components/legal/section";
import { site } from "@/config/site";
import { LIEN_PREPARE_EXEMPLE, LIEN_PREPARE_PARAMETRES } from "@/content/lien-prepare";
import { publicPage } from "@/lib/seo";

/**
 * La documentation de l'API ouverte (ADR 0032, lot 5 : les développeurs) ; adresse choisie par l'auteur le 13/11/2026.
 * Retour du même jour : un assistant à qui l'on demandait d'utiliser l'API n'a trouvé aucune page qui la décrive. La
 * référence complète est la spécification OpenAPI (`/v1/openapi.json`) et la notice (`GET /v1`) : cette page dit
 * comment s'en servir, en français, avec des exemples qu'on peut coller dans un terminal. Les quotas sont ceux de
 * backend/app.py au 13/11/2026 ; `GET /v1/limits` donne toujours les valeurs en vigueur.
 */
export const metadata: Metadata = publicPage({
  path: "/developpeurs",
  title: "L'API pour les développeurs",
  description: `L'API ${site.nameAfterDe} construit des grilles de mots fléchés valides autour de tes mots, vérifie les définitions et dessine la grille en SVG, PNG ou PDF. Gratuite, avec ou sans clé.`,
});

const API = `${site.apiUrl}/v1`;

const ROUTES = [
  { methode: "GET", chemin: "/v1", texte: "La notice : les règles du genre, le style des définitions par langue et par niveau, les formats, tes quotas. À lire avant le premier appel (un assistant IA y trouve tout ce qu'il lui faut)." },
  { methode: "GET", chemin: "/v1/openapi.json", texte: "La spécification OpenAPI 3.1, pour générer un client ou décrire l'API à un agent." },
  { methode: "GET", chemin: "/v1/limits", texte: "Tes quotas et ce que tu en as utilisé." },
  { methode: "POST", chemin: "/v1/grids", texte: "Lance la construction d'une grille autour de tes mots. Répond 202 avec l'adresse à relire (Location) et le délai (Retry-After)." },
  { methode: "GET", chemin: "/v1/grids/{id}", texte: "L'état de la construction : en attente, en cours, finie (avec le fichier de grille) ou en échec (avec sa raison)." },
  { methode: "POST", chemin: "/v1/clues/check", texte: "Vérifie tes définitions : chacune doit tenir dans sa case et ne pas donner la réponse ; les alertes de style sont des conseils. Sans erreur, renvoie les liens pour jouer la grille ou l'imprimer." },
  { methode: "POST", chemin: "/v1/render", texte: "Dessine la grille, à remplir ou sa solution, en SVG, PNG ou PDF, signée." },
] as const;

const PARAMETRES = [
  { nom: "lang", texte: "La langue de la grille, obligatoire : fr (l'allemand et l'anglais suivront)." },
  { nom: "width, height", texte: "La taille, de 5 à 15 cases de côté (10 × 10 par défaut). Les plus sûres : 8 × 8, 10 × 10, 9 × 12, 12 × 12, 12 × 15." },
  { nom: "level", texte: "easy, medium ou hard (medium par défaut). Le niveau facile prend des mots plus courants ; pour les autres, la difficulté est dans les définitions." },
  { nom: "required_words", texte: "Jusqu'à 10 mots tous placés, ou la construction échoue (must_words_unplaced)." },
  { nom: "preferred_words", texte: "Jusqu'à 60 mots placés quand c'est possible : le thème de la grille." },
  { nom: "mystery_word", texte: "Un mot mystère de 3 à 20 lettres : ses cases sont numérotées dans la grille." },
  { nom: "author", texte: "Le nom dont la grille est signée (« Grille de Mamie Jo »), sur le dessin et sur le site." },
  { nom: "seed", texte: "Un entier : mêmes réglages et même graine, même grille." },
] as const;

const QUOTAS = [
  { qui: "Sans clé", minute: "2", jour: "20", mots: "800" },
  { qui: "Avec une clé", minute: "6", jour: "300", mots: "12 000" },
] as const;

const RAISONS = [
  { reason: "invalid_request", texte: "Un champ manque, est mal formé ou inconnu : le message le nomme." },
  { reason: "size_out_of_range", texte: "La taille sort des bornes (5 à 15 cases de côté)." },
  { reason: "invalid_letters, word_length", texte: "Un mot a des lettres hors de l'alphabet de la langue, ou une longueur impossible." },
  { reason: "generation_in_progress", texte: "Une de tes grilles est encore en construction : une à la fois." },
  { reason: "quota_minute, quota_day, quota_words", texte: "Un quota est atteint : attends le délai de Retry-After." },
  { reason: "busy, api_paused, lang_unavailable", texte: "Le serveur sert d'abord le site : réessaie plus tard." },
  { reason: "must_words_unplaced, no_solution, timeout", texte: "La construction a échoué : moins de mots imposés, ou une autre taille." },
  { reason: "invalid_api_key", texte: "La clé est fausse ou révoquée." },
] as const;

function Code({ children }: { children: string }) {
  return (
    // Défilable sur le côté : il se prend au clavier (Tab, puis les flèches), pour qui ne se sert pas de la souris
    <pre tabIndex={0} className="overflow-x-auto rounded-md border bg-secondary/20 p-3 font-mono text-xs leading-relaxed text-foreground focus-visible:outline-2 focus-visible:outline-primary">
      <code>{children}</code>
    </pre>
  );
}

const C = "font-mono text-foreground";

export default function DeveloppeursPage() {
  return (
    <main className="container mx-auto max-w-3xl p-4 md:p-8">
      <h1 className="text-3xl font-bold">L&apos;API pour les développeurs</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Les modèles de langage écrivent bien, mais ne savent pas croiser les mots d&apos;une grille. L&apos;API{" "}
        {site.nameAfterDe} construit une grille de mots fléchés valide autour de tes mots, en quelques secondes ; toi
        ou ton IA écrivez les définitions, qu&apos;elle vérifie, puis elle dessine la grille ou donne un lien pour la
        jouer et l&apos;imprimer. Gratuite, avec ou sans clé.
      </p>

      <div className="mt-8 space-y-8 text-muted-foreground">
        <Section title="En bref" id="bref">
          <ul className="list-disc space-y-1 pl-5">
            <li>Adresse : <span className={C} data-testid="adresse-api">{API}</span>, en JSON.</li>
            <li>
              Référence complète : la notice (<a href={API} className={linkClass}>GET /v1</a>) et la{" "}
              <a href={`${API}/openapi.json`} className={linkClass}>spécification OpenAPI</a>.
            </li>
            <li>Sans clé pour essayer ; une clé gratuite, créée dans <Link href="/account" className={linkClass}>ton compte</Link>, pour davantage.</li>
            <li>
              Les grilles sont à toi, y compris pour un usage commercial ; chaque dessin est signé. Appeler l&apos;API
              vaut acceptation de ses <Link href="/terms#api" className={linkClass}>conditions</Link>.
            </li>
          </ul>
        </Section>

        <Section title="Sans écrire de code" id="sans-code">
          <p>
            <strong className="text-foreground">Dans Claude, ChatGPT ou Le Chat</strong> : ajoute le connecteur{" "}
            <span className={C}>{site.connectorUrl}</span> (<Link href="/mots-fleches-ia" className={linkClass}>la marche à suivre</Link>).
            L&apos;assistant appelle alors l&apos;API lui-même.
          </p>
          <p>
            <strong className="text-foreground">Le lien préparé</strong> : un assistant sans connecteur ne peut pas
            appeler l&apos;API depuis une conversation, mais il peut donner un lien qui prépare le générateur du site.
            Le générateur du site s&apos;ouvre avec ces réglages et lance la grille aussitôt, sans compte ni clic.
          </p>
          <Code>{LIEN_PREPARE_EXEMPLE}</Code>
          <ul className="list-disc space-y-1 pl-5">
            {LIEN_PREPARE_PARAMETRES.map(({ nom, texte }) => (
              <li key={nom}><span className={C}>{nom}</span> : {texte}</li>
            ))}
          </ul>
        </Section>

        <Section title="Une grille en quatre appels" id="demarrer">
          <p>1. Demande la grille : le moteur la construit en tâche de fond.</p>
          <Code>{`curl -i -X POST ${API}/grids \\
  -H "Content-Type: application/json" \\
  -d '{"lang": "fr", "width": 10, "height": 10, "level": "medium",
       "required_words": ["Eric"], "preferred_words": ["anniversaire", "gateau", "bougie"]}'`}</Code>
          <p>
            Réponse <span className={C}>202</span>, avec l&apos;identifiant (<span className={C}>gen_…</span>),
            l&apos;adresse à relire (<span className={C}>Location</span>) et le délai en secondes
            (<span className={C}>Retry-After</span>).
          </p>
          <p>2. Relis-la jusqu&apos;à ce qu&apos;elle soit finie (quelques secondes) :</p>
          <Code>{`curl ${API}/grids/gen_XXXXXXXXXXXX`}</Code>
          <p>
            Avec <span className={C}>&quot;status&quot;: &quot;done&quot;</span>, la réponse porte le fichier de grille
            (<span className={C}>grid</span>) : ses lignes, et pour chaque mot sa place, sa direction et le nombre de
            caractères que tient sa définition (<span className={C}>clue_max_chars</span>). Il est à toi : nous
            l&apos;effaçons au bout de 24 heures.
          </p>
          <p>3. Écris une définition par mot, et fais-les vérifier :</p>
          <Code>{`curl -X POST ${API}/clues/check \\
  -H "Content-Type: application/json" \\
  -d '{"id": "gen_XXXXXXXXXXXX",
       "clues": [{"answer": "ERIC", "clue": "Prénom du jour"}, {"answer": "GATEAU", "clue": "Porte des bougies"}]}'`}</Code>
          <p>
            Sans erreur, la réponse donne <span className={C}>links.play</span> (jouer en ligne) et{" "}
            <span className={C}>links.open</span> (imprimer, PDF, modifier), et le fichier complet avec ses
            définitions. On peut aussi envoyer le fichier entier (<span className={C}>grid</span>) au lieu de
            l&apos;identifiant.
          </p>
          <p>4. Dessine-la, à remplir ou sa solution :</p>
          <Code>{`curl -X POST ${API}/render \\
  -H "Content-Type: application/json" \\
  -d '{"grid": { …le fichier de grille… }, "format": "png", "view": "puzzle"}' -o grille.png`}</Code>
        </Section>

        <Section title="Les routes" id="routes">
          <ul className="space-y-2">
            {ROUTES.map(({ methode, chemin, texte }) => (
              <li key={chemin}>
                <span className={C}>{methode} {chemin}</span> — {texte}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Les réglages d'une grille" id="parametres">
          <p>Le corps de <span className={C}>POST /v1/grids</span> ; un champ inconnu est refusé, et nommé.</p>
          <ul className="space-y-2">
            {PARAMETRES.map(({ nom, texte }) => (
              <li key={nom}><span className={C}>{nom}</span> — {texte}</li>
            ))}
          </ul>
        </Section>

        <Section title="La clé et les quotas" id="quotas">
          <p>
            La clé se crée dans <Link href="/account" className={linkClass}>ton compte</Link>, une fois l&apos;adresse
            e-mail confirmée, et s&apos;envoie dans l&apos;en-tête{" "}
            <span className={C}>Authorization: Bearer flk_…</span>. Elle vaut pour toutes les langues.
          </p>
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Quotas de l'API">
            <table className="w-full text-left text-sm">
              <thead className="text-foreground">
                <tr><th className="py-1 pr-4">Grilles</th><th className="py-1 pr-4">par minute</th><th className="py-1 pr-4">par 24 heures</th><th className="py-1">mots rendus par 24 heures</th></tr>
              </thead>
              <tbody>
                {QUOTAS.map(({ qui, minute, jour, mots }) => (
                  <tr key={qui} className="border-t"><td className="py-1 pr-4">{qui}</td><td className="py-1 pr-4">{minute}</td><td className="py-1 pr-4">{jour}</td><td className="py-1">{mots}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Une grille à la fois par appelant ; 5 secondes de calcul au plus par grille. Les valeurs en vigueur :{" "}
            <a href={`${API}/limits`} className={linkClass}>GET /v1/limits</a>. Le site passe d&apos;abord : quand il
            est très demandé, l&apos;API attend son tour.
          </p>
        </Section>

        <Section title="Les erreurs" id="erreurs">
          <p>
            Toujours du JSON : <span className={C}>{`{"error": "…", "reason": "…"}`}</span>. Le message suit
            l&apos;en-tête <span className={C}>Accept-Language</span> (fr, en, de) ; le code{" "}
            <span className={C}>reason</span> ne change jamais : c&apos;est sur lui qu&apos;un programme décide. Un
            refus pour quota porte l&apos;en-tête <span className={C}>Retry-After</span>.
          </p>
          <ul className="space-y-2">
            {RAISONS.map(({ reason, texte }) => (
              <li key={reason}><span className={C}>{reason}</span> — {texte}</li>
            ))}
          </ul>
        </Section>

        <Section title="Le fichier de grille" id="fichier">
          <p>
            Un JSON public et versionné (<span className={C}>&quot;format&quot;: &quot;flechoir.grid&quot;</span>,{" "}
            <span className={C}>&quot;version&quot;: 1</span>) : les lignes de la grille (<span className={C}>#</span>{" "}
            pour une case de définition, une lettre sinon), et les mots, chacun avec sa place (<span className={C}>x</span>,{" "}
            <span className={C}>y</span>), sa direction (<span className={C}>across</span> ou{" "}
            <span className={C}>down</span>) et sa définition (<span className={C}>clue</span>). Les champs inconnus
            sont ignorés, et les cases de définition recalculées : un fichier venu d&apos;ailleurs se vérifie et se
            dessine aussi. Son schéma complet est dans la spécification OpenAPI (<span className={C}>GridFileIn</span>).
          </p>
        </Section>

        <Section title="Bon à savoir" id="usage">
          <ul className="list-disc space-y-1 pl-5">
            <li>Envoie un en-tête <span className={C}>User-Agent</span> qui nomme ton application : certains clients par défaut sont refusés par la protection du serveur.</li>
            <li>L&apos;API ne cherche pas de mots et ne donne pas de listes : pour cela, il y a la <Link href="/search" className={linkClass}>recherche par motif</Link> du site.</li>
            <li>Les définitions ne servent qu&apos;à vérifier et dessiner la grille : jamais gardées, jamais réutilisées (<Link href="/privacy#api" className={linkClass}>confidentialité</Link>).</li>
            <li>Une question, un bug : <Link href="/contact" className={linkClass}>écris-nous</Link>.</li>
          </ul>
        </Section>
      </div>
    </main>
  );
}
