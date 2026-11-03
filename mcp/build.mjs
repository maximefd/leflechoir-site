// Construit le connecteur : le serveur (dist/main.js) et l'interface en un seul fichier HTML (dist/grille.html),
// script et styles compris : une MCP App ne charge rien d'ailleurs (ADR 0032).
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });

const app = await build({
  entryPoints: ["app/grille.ts"],
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  write: false,
});
const script = app.outputFiles[0].text.replaceAll("</script", "<\\/script");
// La police des grilles, embarquée une fois dans l'interface : les dessins arrivent sans elle (80 Ko de moins chacun)
const font = (await readFile("app/archivo-narrow-700.ttf")).toString("base64");
const css = `@font-face{font-family:ArchivoNarrow;font-weight:700;src:url(data:font/ttf;base64,${font}) format('truetype');}\n`
  + await readFile("app/grille.css", "utf-8");
// Remplacement par une fonction : une chaîne de remplacement interpréterait les « $& » et « $' » du code minifié
const html = (await readFile("app/grille.html", "utf-8"))
  .replace("/* STYLES */", () => css)
  .replace("/* SCRIPT */", () => script);
await writeFile("dist/grille.html", html);

// L'adresse de l'interface change avec son contenu : un assistant qui garde l'ancienne en cache la recharge
const uiVersion = createHash("sha256").update(html).digest("hex").slice(0, 12);
await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "dist/main.js",
  packages: "external",
  define: { __UI_VERSION__: JSON.stringify(uiVersion) },
});
console.log("dist/main.js et dist/grille.html construits");
