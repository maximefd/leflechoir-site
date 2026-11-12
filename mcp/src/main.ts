/**
 * Le connecteur MCP en service : HTTP « streamable », sans état, sur `/mcp` (ADR 0032).
 *
 * Un serveur par requête : l'assistant qui appelle (son client MCP, en-tête User-Agent) est connu à chaque fois, et ses
 * quotas sont comptés par l'API. Aucune donnée n'est gardée ici. Réglages :
 * - `API_URL` : l'API sur le réseau interne (http://api:5000) ;
 * - `API_RELAY_SECRET` : la clé de relais, la même que celle de l'API ;
 * - `PORT` : 8080 par défaut.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import type { Request, Response } from "express";

import { FlechoirApi } from "./api.js";
import { createServer } from "./server.js";

const DIST = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8080);
const apiUrl = (process.env.API_URL ?? "http://api:5000").replace(/\/$/, "");
const relayKey = process.env.API_RELAY_SECRET ?? "";
if (!relayKey) {
  console.warn("API_RELAY_SECRET vide : l'API comptera chaque appel comme un appel sans clé");
}

let appHtml: string | undefined;
const loadAppHtml = async () => (appHtml ??= await readFile(path.join(DIST, "grille.html"), "utf-8"));

// Les noms d'hôte publics du connecteur (« mcp.leflechoir.fr ») : protection contre le « DNS rebinding ». Vide en
// local seulement
const allowedHosts = (process.env.MCP_ALLOWED_HOSTS ?? "").split(",").map((host) => host.trim()).filter(Boolean);
// En service (l'image pose NODE_ENV=production), ni nom d'hôte ni clé de relais : on refuse de démarrer plutôt que de
// tourner mal protégé. MCP_REQUIRE_CONFIG=0 pour la pile de développement
const production = process.env.NODE_ENV === "production" && process.env.MCP_REQUIRE_CONFIG !== "0";
if (production && (!allowedHosts.length || !relayKey)) {
  console.error("MCP_ALLOWED_HOSTS et API_RELAY_SECRET sont obligatoires en service (docs/PRODUCTION.md)");
  process.exit(1);
}
// « localhost » en plus : le contrôle de santé du conteneur (Docker, server.sh) l'appelle de l'intérieur ; le tunnel,
// lui, n'amène que le nom d'hôte public
// Un appel d'outil tient en quelques Ko (70 définitions d'une grille de 15 × 15 : 5 Ko environ)
const app = createMcpExpressApp(allowedHosts.length
  ? { host: "0.0.0.0", allowedHosts: [...allowedHosts, "localhost"], jsonLimit: "64kb" }
  : { host: "0.0.0.0", jsonLimit: "64kb" });

// En développement seulement : un hôte de test dans le navigateur (l'hôte de démonstration des MCP Apps) appelle le
// connecteur depuis une autre origine. Les vrais assistants l'appellent de serveur à serveur : jamais de CORS en service
const devOrigin = process.env.MCP_DEV_CORS_ORIGIN;
if (devOrigin) {
  app.use((req: Request, res: Response, next: () => void) => {
    res.set({ "Access-Control-Allow-Origin": devOrigin, "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Expose-Headers": "*" });
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });
}

/**
 * L'adresse de l'appelant. En service, le connecteur n'est joignable que par le tunnel : `CF-Connecting-IP`, posé par
 * Cloudflare, est digne de confiance. Sans lui (en local), l'adresse de la connexion.
 */
function callerAddress(req: Request): string | undefined {
  const forwarded = (req.get("CF-Connecting-IP") ?? "").trim();
  const address = forwarded || (req.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
  return /^[0-9a-fA-F:.]{2,45}$/.test(address) ? address : undefined;
}

// La preuve de propriété du domaine que demande OpenAI pour l'annuaire de ChatGPT : le jeton seul, en texte brut
// (OPENAI_APPS_CHALLENGE, donné par le tableau de bord d'OpenAI ; docs/ANNUAIRES.md)
const openaiChallenge = (process.env.OPENAI_APPS_CHALLENGE ?? "").trim();
app.get("/.well-known/openai-apps-challenge", (_req: Request, res: Response) => {
  if (!openaiChallenge) {
    res.status(404).end();
    return;
  }
  res.type("text/plain").send(openaiChallenge);
});

// La réserve de fouille de textes et de données (TDMRep du W3C) et les conditions, comme sur l'API : pas
// d'entraînement commercial d'IA sur ces réponses (conditions de l'API, avis juridique du 08/11/2026)
const termsUrl = process.env.TERMS_URL ?? "https://leflechoir.fr/terms#api";
app.use((_req: Request, res: Response, next: () => void) => {
  res.set({ "tdm-reservation": "1", "tdm-policy": termsUrl, Link: `<${termsUrl}>; rel="terms-of-service"` });
  next();
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.all("/mcp", async (req: Request, res: Response) => {
  const api = new FlechoirApi({ baseUrl: apiUrl, relayKey, assistant: req.get("User-Agent") ?? "unknown",
    origin: callerAddress(req) });
  const server = createServer(api, loadAppHtml);
  const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Erreur MCP :", error);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
});

const http = app.listen(port, () => {
  console.log(`Connecteur MCP sur http://0.0.0.0:${port}/mcp (API : ${apiUrl})`);
});
const stop = () => http.close(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
