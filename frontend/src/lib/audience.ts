import { getApiBaseUrl } from "@/lib/utils";

/**
 * La balise d'audience ([ADR 0016](../../../docs/adr/0016-mesure-d-usage-sans-cookie.md), point 3, #130).
 *
 * Elle compte les pages vues et le temps où elles restent visibles, sans cookie ni identifiant :
 * - elle n'écrit rien dans le navigateur pour mesurer. La seule chose notée est le **refus** du visiteur
 *   (`localStorage`, clé `mesure` = `non`), pour ne pas le lui redemander à chaque page ;
 * - elle ne part pas si le visiteur a refusé, si son navigateur envoie Global Privacy Control, ou s'il est piloté
 *   par un robot ;
 * - elle n'utilise pas `apiFetch` : celui-ci joint la session et son jeton CSRF, or la balise ne doit porter
 *   aucun cookie (`credentials: "omit"`), même connecté ;
 * - c'est `fetch` en JSON avec `keepalive` : `sendBeacon` enverrait du `text/plain`, que l'API refuse.
 */

const DECLINED_KEY = "mesure";
/** Une page affichée moins longtemps n'est qu'un rebond (redirection, double rendu du mode développement). */
const MIN_VISIBLE_MS = 100;
/** Ce que l'API accepte comme chemin (backend/schemas.py, `AudienceRequest`). */
const PATH_PATTERN = /^\/[A-Za-z0-9/_.-]{0,99}$/;

type Navigator_ = Navigator & { globalPrivacyControl?: boolean };

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // navigation privée, stockage bloqué : la page se mesure comme si de rien n'était
  }
}

/** Le visiteur a-t-il refusé d'être compté, sur cet appareil ? */
export function hasDeclined(): boolean {
  return store()?.getItem(DECLINED_KEY) === "non";
}

/** Global Privacy Control : le navigateur dit déjà non, sans rien à faire. */
export function gpcActive(): boolean {
  return typeof navigator !== "undefined" && (navigator as Navigator_).globalPrivacyControl === true;
}

export function setDeclined(declined: boolean) {
  const storage = store();
  if (!storage) return;
  if (declined) storage.setItem(DECLINED_KEY, "non");
  else storage.removeItem(DECLINED_KEY);
}

/** Cette visite peut-elle être comptée ? */
export function isMeasured(): boolean {
  if (typeof navigator === "undefined") return false;
  return !gpcActive() && !hasDeclined() && !navigator.webdriver;
}

/** Le nom d'hôte seul d'un référent venu d'un autre site : l'adresse complète peut contenir une recherche. */
export function externalHost(referrer: string): string {
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    return host && host !== window.location.hostname && host.length <= 100 ? host : "";
  } catch {
    return "";
  }
}

export function isMeasurablePath(path: string): boolean {
  // Le poste de pilotage est celui de l'auteur : jamais compté
  return PATH_PATTERN.test(path) && !path.startsWith("/admin");
}

type Beacon = { kind: "view" | "pdf"; path: string; referrer?: string; visible_ms?: number };

function send(beacon: Beacon) {
  if (!isMeasured() || !isMeasurablePath(beacon.path)) return;
  fetch(`${getApiBaseUrl()}/api/audience`, {
    method: "POST",
    credentials: "omit",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...beacon,
      referrer: beacon.referrer ?? "",
      lang: navigator.language ?? "",
      visible_ms: Math.round(beacon.visible_ms ?? 0),
    }),
  }).catch(() => {
    // Mesurer ne doit jamais gêner : une balise perdue est une page vue de moins
  });
}

export function trackPageView(path: string, referrer: string, visibleMs: number) {
  if (visibleMs < MIN_VISIBLE_MS) return;
  send({ kind: "view", path, referrer, visible_ms: Math.min(visibleMs, 1_800_000) });
}

/** Un export PDF se fait dans le navigateur : le serveur ne le voit pas. */
export function trackPdfExport() {
  send({ kind: "pdf", path: window.location.pathname });
}
