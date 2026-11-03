/**
 * L'interface du connecteur dans la conversation (MCP App, ADR 0032) : la grille finie, sa solution d'un clic, et les
 * liens pour la jouer en ligne ou l'imprimer. Elle ne charge rien et n'appelle aucun outil : la vérification lui livre
 * les deux dessins (chaque appel d'outil demanderait une autorisation à la personne). Les liens s'ouvrent par
 * l'assistant (`openLink`).
 *
 * Une seule grille à jour dans la conversation : si l'assistant revérifie, l'interface la plus récente l'emporte et les
 * précédentes se réduisent à une ligne (« supersession », documentation de Claude ; essai du 28/10/2026).
 */

import { App } from "@modelcontextprotocol/ext-apps";

type Stage = { stage?: string; lang?: string; links?: { play: string; open: string };
  svg?: { puzzle: string; solution: string }; createdAt?: number; seq?: number; error?: { message: string };
  refused?: Array<{ answer: string; message: string }> };

const TEXTS = {
  fr: { checking: "Vérification des définitions…", ready: "Ta grille est prête.", fixing: "Quelques définitions sont à reprendre :",
    play: "Jouer en ligne", print: "Imprimer ou PDF", solution: "Voir la solution", puzzle: "Revoir la grille",
    older: "Version précédente : la grille à jour est plus bas." },
  de: { checking: "Die Hinweise werden geprüft…", ready: "Dein Rätsel ist fertig.", fixing: "Einige Hinweise müssen überarbeitet werden:",
    play: "Online spielen", print: "Drucken oder PDF", solution: "Lösung zeigen", puzzle: "Zurück zum Rätsel",
    older: "Frühere Fassung: das aktuelle Rätsel steht weiter unten." },
  en: { checking: "Checking the clues…", ready: "Your grid is ready.", fixing: "A few clues need another go:",
    play: "Play online", print: "Print or PDF", solution: "Show the solution", puzzle: "Back to the puzzle",
    older: "Earlier version: the current grid is further down." },
};
type Texts = (typeof TEXTS)["fr"];

const $ = (id: string) => document.getElementById(id)!;
const etat = $("etat");
const dessin = $("dessin");
const remarques = $("remarques");
const actions = $("actions");
const jouer = $("jouer");
const imprimer = $("imprimer");
const solution = $("solution");

let texts: Texts = TEXTS.en;
let data: Stage = {};
let showSolution = false;

const app = new App({ name: "Le Fléchoir", version: "1.0.0" });

function useLanguage(lang: string | undefined) {
  texts = TEXTS[(lang ?? "en") as keyof typeof TEXTS] ?? TEXTS.en;
  document.documentElement.lang = lang ?? "en";
  jouer.textContent = texts.play;
  imprimer.textContent = texts.print;
  solution.textContent = showSolution ? texts.puzzle : texts.solution;
}

function render() {
  if (superseded) {
    etat.textContent = texts.older;
    dessin.replaceChildren();
    remarques.hidden = true;
    actions.hidden = true;
    return;
  }
  if (data.error) {
    etat.textContent = data.error.message;
    return;
  }
  if (data.stage === "check_failed") {
    etat.textContent = texts.fixing;
    const items = (data.refused ?? []).map((item) => `${item.answer} : ${item.message}`);
    remarques.replaceChildren(...items.map((text) => Object.assign(document.createElement("li"), { textContent: text })));
    remarques.hidden = items.length === 0;
    return;
  }
  if (data.stage === "ready" && data.svg) {
    etat.textContent = texts.ready;
    // Les dessins viennent de notre serveur, qui échappe chaque texte ; ils sont posés tels quels
    dessin.innerHTML = showSolution ? data.svg.solution : data.svg.puzzle;
    solution.textContent = showSolution ? texts.puzzle : texts.solution;
    remarques.hidden = true;
    actions.hidden = false;
  }
}

// --- Une seule grille à jour : l'élection de l'interface la plus récente (BroadcastChannel, même origine) ---
let superseded = false;
let key: { orderKey: number; seq: number } | undefined;
const instanceId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const peers = new Map<string, { orderKey: number; seq: number; instanceId: string }>();

/** Le canal entre interfaces, s'il existe : un cadre isolé (origine opaque) peut le refuser, et la grille doit
 * s'afficher quand même (essai dans Claude du 01/11/2026 : rien ne s'affichait). */
function openChannel(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === "function" ? new BroadcastChannel("flechoir-grille") : null;
  } catch {
    return null;
  }
}
const channel = openChannel();

function younger(other: { orderKey: number; seq: number; instanceId: string }) {
  if (!key) return false;
  if (other.orderKey !== key.orderKey) return other.orderKey > key.orderKey;
  if (other.seq !== key.seq) return other.seq > key.seq;
  return other.instanceId > instanceId;
}

if (channel) {
  channel.onmessage = (event) => {
    const message = event.data;
    if (!message || message.instanceId === instanceId || !key) return;
    if (message.type === "hello") channel.postMessage({ type: "born", instanceId, ...key });
    peers.set(message.instanceId, message);
    superseded = [...peers.values()].some(younger);
    render();
  };
}

function announce() {
  if (!channel || !key) return;
  try {
    channel.postMessage({ type: "hello", instanceId, ...key });
  } catch {
    // Sans canal, chaque interface reste affichée : mieux vaut deux grilles qu'aucune
  }
}

// --- L'assistant ---

app.ontoolinput = (params) => {
  const args = (params.arguments ?? {}) as { lang?: string };
  useLanguage(args.lang);
  etat.textContent = texts.checking;
};

app.ontoolresult = (result) => {
  // Les dessins et les liens arrivent dans `_meta`, que le modèle ne lit pas
  const meta = (result._meta ?? {}) as { svg?: Stage["svg"]; links?: Stage["links"] };
  data = { ...(result.structuredContent ?? {}), svg: meta.svg, links: meta.links } as Stage;
  if (result.isError && !data.error) {
    const text = result.content?.find((item) => item.type === "text");
    data = { error: { message: text && "text" in text ? text.text : "Error" } };
  }
  useLanguage(data.lang ?? document.documentElement.lang);
  if (Number.isFinite(data.createdAt)) {
    key = { orderKey: data.createdAt as number, seq: data.seq ?? 0 };
    announce();
  }
  render();
};

jouer.addEventListener("click", () => data.links && app.openLink({ url: data.links.play }));
imprimer.addEventListener("click", () => data.links && app.openLink({ url: data.links.open }));
solution.addEventListener("click", () => {
  showSolution = !showSolution;
  render();
});

useLanguage(undefined);
app.connect();
