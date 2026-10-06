import { getApiBaseUrl } from "@/lib/utils";

// On utilise 'unknown' qui est plus sûr que 'any'
type ApiFetchOptions = Omit<RequestInit, 'body'> & {
  body?: Record<string, unknown>;
  /** Jeton CSRF à joindre : celui de l'accès (défaut) ou celui du refresh (déconnexion). */
  csrf?: "access" | "refresh";
};

/**
 * La session vit dans des cookies httpOnly posés par l'API (ADR 0015) : ce code ne voit jamais les jetons,
 * donc une faille XSS ne peut pas les voler. Il lit seulement les cookies CSRF, faits pour être lus, et en
 * recopie la valeur dans l'en-tête X-CSRF-TOKEN : un autre site peut faire envoyer les cookies, pas lire
 * celui-ci pour le recopier.
 */
const CSRF_COOKIES = { access: "csrf_access_token", refresh: "csrf_refresh_token" } as const;
const CSRF_HEADER = "X-CSRF-TOKEN";
// Anciennes sessions, d'avant les cookies : effacées au premier chargement
const LEGACY_TOKEN_KEYS = ["access_token", "refresh_token"];

/** Émis quand la session ne peut pas être renouvelée : le contexte d'authentification se déconnecte. */
export const SESSION_EXPIRED_EVENT = "terminator:session-expired";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const entry = document.cookie.split("; ").find((cookie) => cookie.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}

/**
 * Une session est-elle ouverte ? Le cookie CSRF du refresh vit aussi longtemps que la session (7 jours) :
 * sa présence suffit à le dire sans appeler l'API. Une session révoquée entre-temps se découvre au premier
 * 401, et SESSION_EXPIRED_EVENT déconnecte.
 */
export function hasSession(): boolean {
  return readCookie(CSRF_COOKIES.refresh) !== null;
}

export function forgetLegacyTokens() {
  LEGACY_TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
}

// Plusieurs requêtes peuvent expirer en même temps : un seul renouvellement partagé
let pendingRefresh: Promise<boolean> | null = null;

function refreshAccessToken(): Promise<boolean> {
  const csrf = readCookie(CSRF_COOKIES.refresh);
  if (!csrf) return Promise.resolve(false);

  if (!pendingRefresh) {
    pendingRefresh = fetch(`${getApiBaseUrl()}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { [CSRF_HEADER]: csrf },
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        pendingRefresh = null;
      });
  }
  return pendingRefresh;
}

/** Session perdue : l'API efface les cookies (sinon hasSession() mentirait), puis on prévient l'interface. */
async function endSession() {
  await fetch(`${getApiBaseUrl()}/api/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

/**
 * Erreur d'API qui conserve le corps de la réponse.
 *
 * Les refus de génération portent bien plus que leur message : quel mot obligatoire pose problème,
 * quels layouts l'accueilleraient, quels mots n'ont pas pu être placés. Sans cela, l'écran ne
 * pourrait afficher qu'« impossible », ce que l'on cherche précisément à éviter.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly data: Record<string, unknown>;
  /** L'identifiant de la requête (en-tête X-Request-ID), que « Signaler ce problème » joint au message. */
  readonly requestId: string | null;

  constructor(message: string, status: number, data: Record<string, unknown>, requestId: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
    this.requestId = requestId;
  }
}

async function readError(response: Response): Promise<ApiError> {
  let message = `Erreur ${response.status}: ${response.statusText}`;
  let data: Record<string, unknown> = {};
  try {
    data = await response.json();
    if (typeof data?.error === "string" && data.error) {
      message = data.error;
    }
  } catch {
    // Réponse non JSON : on garde le message générique
  }
  return new ApiError(message, response.status, data, response.headers.get("X-Request-ID"));
}

export async function apiFetch(endpoint: string, options: ApiFetchOptions = {}, allowRefresh = true) {
  const { csrf = "access", body: payload, ...init } = options;
  const url = `${getApiBaseUrl()}${endpoint}`;
  const method = (init.method || "GET").toUpperCase();

  const headers = new Headers(init.headers || {});

  if (payload && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Les lectures n'en ont pas besoin : l'API ne vérifie le jeton CSRF que pour les écritures
  const csrfToken = readCookie(CSRF_COOKIES[csrf]);
  if (csrfToken && method !== "GET" && method !== "HEAD") {
    headers.set(CSRF_HEADER, csrfToken);
  }

  const body = payload ? JSON.stringify(payload) : undefined;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers,
      body,
      credentials: "include",
    });
  } catch {
    // Erreur réseau (« Failed to fetch ») : connexion coupée, API arrêtée ou en cours de redémarrage.
    // Un visiteur ne peut rien lancer : en développement, c'est `make dev-api` qui manque.
    throw new Error("Impossible de joindre le serveur. Vérifie ta connexion, puis réessaie dans un instant.");
  }

  // Jeton expiré ou refusé : une seule tentative de renouvellement, puis déconnexion.
  // Les routes d'authentification sont exclues (un 401 y signifie « identifiants invalides »).
  if (response.status === 401 && hasSession() && allowRefresh && !endpoint.startsWith("/api/auth/")) {
    if (await refreshAccessToken()) {
      return apiFetch(endpoint, options, false);
    }
    await endSession();
  }

  if (!response.ok) {
    throw await readError(response);
  }

  if (response.status === 204) {
    return { success: true };
  }

  return response.json();
}

export type StreamEvent = (event: string, data: Record<string, unknown>) => void;

/**
 * Comme `apiFetch`, mais en flux SSE (#209) : la requête demande `text/event-stream`, `onEvent` reçoit les
 * événements intermédiaires (`progress`, `best`), et la promesse rend les données de `done` — le corps qu'aurait
 * rendu le mode JSON. Un événement `error` la rejette avec une `ApiError` aux mêmes `reason`. Une réponse JSON
 * (refus d'avant la génération) se lit comme avec `apiFetch`. `signal` arrête le flux : la promesse rejette
 * alors l'erreur d'abandon de `fetch`.
 */
export async function apiStream(
  endpoint: string,
  options: ApiFetchOptions & { signal?: AbortSignal },
  onEvent: StreamEvent,
  allowRefresh = true,
): Promise<Record<string, unknown>> {
  const { csrf = "access", body: payload, ...init } = options;
  const method = (init.method || "POST").toUpperCase();
  const headers = new Headers(init.headers || {});
  headers.set("Accept", "text/event-stream");
  if (payload && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const csrfToken = readCookie(CSRF_COOKIES[csrf]);
  if (csrfToken && method !== "GET" && method !== "HEAD") {
    headers.set(CSRF_HEADER, csrfToken);
  }

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
      ...init,
      method,
      headers,
      body: payload ? JSON.stringify(payload) : undefined,
      credentials: "include",
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error("Impossible de joindre le serveur. Vérifie ta connexion, puis réessaie dans un instant.");
  }

  if (response.status === 401 && hasSession() && allowRefresh && !endpoint.startsWith("/api/auth/")) {
    if (await refreshAccessToken()) {
      return apiStream(endpoint, options, onEvent, false);
    }
    await endSession();
  }
  if (!response.ok) {
    throw await readError(response);
  }
  if (!response.headers.get("Content-Type")?.includes("text/event-stream") || !response.body) {
    return response.json();
  }

  const requestId = response.headers.get("X-Request-ID");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Un événement se termine par une ligne vide ; le dernier morceau peut être incomplet
    let end = buffer.indexOf("\n\n");
    while (end !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      end = buffer.indexOf("\n\n");
      let name = "message";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) name = line.slice(7);
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      const parsed = (data ? JSON.parse(data) : {}) as Record<string, unknown>;
      if (name === "done") {
        await reader.cancel().catch(() => {});
        return parsed;
      }
      if (name === "error") {
        await reader.cancel().catch(() => {});
        const message = typeof parsed.error === "string" ? parsed.error : "La génération a échoué.";
        const status = typeof parsed.status === "number" ? parsed.status : 422;
        throw new ApiError(message, status, parsed, requestId);
      }
      onEvent(name, parsed);
    }
  }
  throw new Error("La génération s'est interrompue avant la fin. Réessaie dans un instant.");
}
