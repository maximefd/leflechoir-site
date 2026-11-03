/**
 * L'API ouverte du Fléchoir, vue du connecteur MCP (ADR 0032).
 *
 * Le connecteur ne calcule rien : il appelle l'API, sur le réseau interne, avec la clé de relais (`X-Relay-Key`) et le
 * client MCP de l'assistant (`X-Relay-Client`) ; l'API compte alors les quotas de cet assistant, pas d'une adresse.
 */

export type GridFile = {
  format: string;
  version: number;
  type: string;
  lang: string;
  level?: string;
  width: number;
  height: number;
  seed?: number;
  rows: string[];
  words: Array<{
    answer: string;
    x: number;
    y: number;
    direction: "across" | "down";
    length?: number;
    source?: string;
    display?: string;
    clue_cell?: { x: number; y: number } | null;
    arrow?: string | null;
    clue_shares_cell?: boolean;
    clue_max_chars?: number | null;
    clue?: string | null;
  }>;
  mystery?: { word: string; cells: Array<{ x: number; y: number }> };
  author?: string;
};

export type ApiError = { status: number; reason: string; error: string; retryAfter?: number; body: unknown };

export type ApiResult<T> = { ok: true; status: number; body: T; headers: Headers } | ({ ok: false } & ApiError);

export type ApiOptions = {
  baseUrl: string;
  relayKey: string;
  // Le client MCP de l'assistant (son User-Agent) : « openai-mcp », « Claude-User »… Pour la mesure seulement : il
  // s'invente
  assistant: string;
  // L'adresse de l'appelant (CF-Connecting-IP, posé par Cloudflare) : l'API reconnaît un assistant à son adresse
  // publiée, et compte les autres appelants à la leur (revue de sécurité du 02/11/2026)
  origin?: string;
  // La langue des messages de l'API : celle de la grille
  language?: string;
  fetchImpl?: typeof fetch;
};

export class FlechoirApi {
  constructor(private readonly options: ApiOptions) {}

  /** Le client MCP de l'assistant qui appelle (son User-Agent). */
  get assistant(): string {
    return this.options.assistant;
  }

  /** Le même client, avec les messages de l'API dans la langue de la grille. */
  withLanguage(language: string): FlechoirApi {
    return new FlechoirApi({ ...this.options, language });
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "Accept-Language": this.options.language ?? "en",
      "X-Relay-Key": this.options.relayKey,
      "X-Relay-Client": this.options.assistant.slice(0, 200),
      ...(this.options.origin ? { "X-Relay-Origin": this.options.origin } : {}),
      "User-Agent": "flechoir-mcp/1",
      ...extra,
    };
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const response = await fetchImpl(`${this.options.baseUrl}${path}`, {
      method,
      headers: this.headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const retryAfter = Number(response.headers.get("Retry-After")) || undefined;
    const type = response.headers.get("Content-Type") ?? "";
    const parsed = type.includes("application/json") ? await response.json() : await response.text();
    if (response.ok) {
      return { ok: true, status: response.status, body: parsed as T, headers: response.headers };
    }
    const error = (typeof parsed === "object" && parsed) ? parsed as { reason?: string; error?: string } : {};
    return {
      ok: false,
      status: response.status,
      reason: error.reason ?? "internal_error",
      error: error.error ?? "Error",
      retryAfter,
      body: parsed,
    };
  }

  async binary(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: Buffer; text: string }> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const response = await fetchImpl(`${this.options.baseUrl}${path}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    const data = Buffer.from(await response.arrayBuffer());
    return { ok: response.ok, status: response.status, data, text: data.toString("utf-8") };
  }
}
