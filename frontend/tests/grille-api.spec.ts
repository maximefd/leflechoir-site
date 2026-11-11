import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";

/**
 * Les grilles de l'API ouverte sur le site (ADR 0032) : rien n'est stocké, la grille voyage dans le lien.
 * - `/grille#g=…` : une grille faite par une IA avec l'API, jouée avec le lecteur de la grille du jour ;
 * - `/creer?…` : le lien préparé qu'une IA écrit sans outil, lu avec tolérance (un « & » oublié, essai du 27/10/2026).
 */

type Mot = { text: string; x: number; y: number; direction: "across" | "down" };

/** Une grille du jour, mise au format du fichier de grille de l'API, avec ses définitions */
function fichierDeGrille(date: string) {
  const data = JSON.parse(readFileSync(`src/content/grilles/${date}.json`, "utf8"));
  const grid = data.response.grid;
  const at = new Map(grid.cells.map((cell: { x: number; y: number; char: string; is_black: boolean }) => [`${cell.x}-${cell.y}`, cell]));
  const rows = Array.from({ length: grid.height }, (_, y) => Array.from({ length: grid.width }, (_, x) => {
    const cell = at.get(`${x}-${y}`) as { char: string; is_black: boolean };
    return cell.is_black ? "#" : cell.char;
  }).join(""));
  const words = (grid.words as Mot[]).map((word) => ({
    answer: word.text, x: word.x, y: word.y, direction: word.direction, source: "lexicon", clue: data.clues[word.text],
  }));
  return { format: "flechoir.grid", version: 1, type: "arrowword", lang: "fr", level: "easy", seed: 1, rows, words };
}

const lien = (grid: object, mode = "") =>
  `/grille#${mode ? `mode=${mode}&` : ""}g=${deflateSync(Buffer.from(JSON.stringify(grid))).toString("base64url")}`;

test.beforeEach(async ({ page }) => {
  await page.route("**/api/audience**", (route) => route.fulfill({ status: 204, body: "" }));
});

test("une grille faite avec l'API se joue depuis son lien, sans rien demander au serveur", async ({ page }) => {
  const grille = fichierDeGrille("2026-10-28");
  const adresse = lien(grille, "jouer");
  const donnees = adresse.split("g=")[1];
  const envoyees: string[] = [];
  page.on("request", (request) => envoyees.push(`${request.url()} ${request.postData() ?? ""}`));

  await page.goto(adresse);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Une grille de mots fléchés");
  await expect(page.getByText(`9 × 9 cases, ${grille.words.length} mots`)).toBeVisible();
  // Le lecteur de la grille du jour, avec les définitions écrites par l'IA
  const definitions = page.getByRole("list", { name: "Les définitions" });
  await expect(definitions).toContainText(grille.words[0].clue);
  // Sans compte : de quoi la garder ; et la grille n'est jamais partie au serveur (elle est après le « # »)
  // Les liens de compte ne recopient pas le fragment : le suivre enverrait la grille au serveur
  await expect(page.getByRole("link", { name: "Crée un compte" })).toHaveAttribute("href", "/register?next=%2Fgrille");
  await expect(page.getByRole("link", { name: "connecte-toi" })).toHaveAttribute("href", "/login?next=%2Fgrille");
  expect(envoyees.filter((requete) => requete.includes(donnees.slice(0, 40)))).toEqual([]);

  // Au retour de la connexion, dans le même onglet, sans fragment : la grille attendait dans l'onglet
  await page.goto("/grille");
  await expect(page.getByText(`9 × 9 cases, ${grille.words.length} mots`)).toBeVisible();
  expect(envoyees.filter((requete) => requete.includes(donnees.slice(0, 40)))).toEqual([]);
});

test("une grille signée dit le nom de son auteur", async ({ page }) => {
  await page.goto(lien({ ...fichierDeGrille("2026-10-28"), author: "Mamie Jo" }, "jouer"));

  await expect(page.getByTestId("auteur")).toHaveText("Une grille de Mamie Jo");
  // Le texte est le sien, et la grille ne nous parvient pas : la page le dit, et dit à qui s'adresser
  await expect(page.getByTestId("grille-tiers")).toContainText("écrites par Mamie Jo");
  await expect(page.getByTestId("grille-tiers")).toContainText("nous ne la recevons pas");
});

test("signaler un contenu gardé : la bonne foi déclarée, et un accusé de réception promis", async ({ page }) => {
  // Règlement sur les services numériques, art. 16 (avis juridiques des 08 et 09/11/2026)
  await page.goto("/signaler");

  await expect(page.getByText("nous ne la recevons pas et ne pouvons pas la retirer")).toBeVisible();
  const envoyer = page.getByRole("button", { name: "Envoyer le signalement" });
  await page.getByLabel("Le contenu en cause").fill("gen_dJAdP6Oy55HsvpFnavIKSQ");
  await page.getByLabel("Pourquoi ce contenu te paraît illicite").fill("Une définition vise une personne nommée.");
  await page.getByLabel("Ton nom").fill("Camille Martin");
  await page.getByLabel("Ton adresse e-mail").fill("camille@exemple.fr");
  await expect(envoyer).toBeDisabled(); // sans la déclaration de bonne foi
  await page.getByLabel(/Je déclare de bonne foi/).check();
  await envoyer.click();

  await expect(page.getByRole("status")).toContainText("Un accusé de réception part à ton adresse");
});

test("un mot sans définition : la grille ne se joue pas encore, et la page le dit", async ({ page }) => {
  const grille = fichierDeGrille("2026-10-28");
  grille.words[0].clue = "";

  await page.goto(lien(grille));

  await expect(page.getByTestId("definitions-manquantes")).toContainText("Un mot n'a pas encore de définition");
});

test("un lien abîmé ne casse pas la page", async ({ page }) => {
  await page.goto("/grille#g=pas-une-grille");

  await expect(page.getByTestId("grille-absente")).toContainText("Ce lien est abîmé");
});

test("le lien préparé d'une IA : ce qui est compris, un « & » oublié compris quand même, puis le générateur", async ({ page }) => {
  // Le lien tel que Le Chat l'a écrit le 27/10/2026 : « mystere » collé aux mots faute de « & »
  await page.goto("/creer?lang=fr&taille=10x10&mots=grandmere,Léo,Jade,cadeau,gateau,bougie,mystere=anniversaire&niveau=facile&utm_source=chat.mistral.ai");

  const bloc = page.getByTestId("lien-prepare");
  await expect(bloc).toContainText("10 × 10 cases");
  await expect(page.getByTestId("lien-mots")).toHaveText("grandmere, Léo, Jade, cadeau, gateau, bougie");
  await expect(page.getByTestId("lien-mystere")).toHaveText("anniversaire");
  await expect(page.getByTestId("lien-ignore")).toHaveCount(0);

  await page.getByTestId("lien-preparer").click();

  await expect(page).toHaveURL(/\/grid$/);
  await expect(page.getByText(/^cadeau$/i).first()).toBeVisible();
});

test("sans paramètres, /creer reste le carrefour « Créer une grille »", async ({ page }) => {
  await page.goto("/creer");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Créer une grille");
  await expect(page.getByTestId("lien-prepare")).toHaveCount(0);
});
