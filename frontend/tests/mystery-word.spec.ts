import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

/**
 * Le mot mystère (#218) : générer une grille avec « MARIE », voir les cases numérotées et la rangée au-dessus
 * de la grille (#220), puis l'imprimer avec sa solution ; et, dans l'éditeur, le poser, le changer et le retirer.
 */
const API = process.env.PLAYWRIGHT_API_URL || "http://localhost:5001";

/** La grille affichée : la page garde aussi, hors écran, les deux dessins du PDF. */
const shownGrid = (page: Page) =>
  page.locator("section[aria-label='Grille générée'] div:not([aria-hidden]) > svg[role='img']");

test("générer une grille avec MARIE en mot mystère, la voir numérotée et l'imprimer", async ({ page }) => {
  test.setTimeout(180_000);

  await page.goto("/grid");
  // Une grande grille : ses cent lettres portent presque toujours celles de MARIE
  await page.locator("label").filter({ hasText: /^Moyenne\s*10\s*×\s*13$/ }).click();
  await page.locator("summary", { hasText: "Mot mystère" }).click();
  const field = page.getByLabel("Mot mystère", { exact: true });
  await field.fill("Ma");
  await expect(page.getByText(/De 3 à 20 lettres/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Générer la grille" })).toBeDisabled();
  await field.fill("Marie");

  await page.getByRole("button", { name: "Générer la grille" }).click();
  // Une lettre peut manquer à une grille : l'écran le dit, garde la grille et propose de relancer
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await expect(page.getByText("Cette grille te plaît ?")).toBeVisible({ timeout: 60_000 });
    const retry = page.getByRole("button", { name: "Relancer la génération" });
    if (!(await retry.isVisible())) break;
    await expect(page.getByText(/Il manque .* pour écrire le mot mystère/)).toBeVisible();
    await retry.click();
  }

  const grid = shownGrid(page);
  await expect(grid).toHaveAttribute("aria-label", /mot mystère en 5 lettres/);
  // Cinq cases numérotées dans la grille, cinq cases dans la rangée, que la solution remplit
  await expect(grid.locator("[data-mystery-number]")).toHaveCount(5);
  await expect(grid.locator("[data-mystery-box]")).toHaveCount(5);
  await expect(grid.getByText("MOT MYSTÈRE")).toBeVisible();
  // Au-dessus de la grille (#220) : la rangée finit avant les cases numérotées
  const rowBox = await grid.locator("[data-mystery-row]").boundingBox();
  const cellBox = await grid.locator("[data-mystery-number]").first().boundingBox();
  expect(rowBox!.y + rowBox!.height).toBeLessThan(cellBox!.y);
  expect((await grid.locator("[data-mystery-letter]").allTextContents()).join("")).toBe("MARIE");
  await expect(page.getByText(/mot mystère : MARIE/)).toBeVisible();

  // La grille vierge garde les numéros et la rangée, sans les lettres : c'est celle du joueur
  await page.getByRole("button", { name: "Grille vierge" }).click();
  await expect(grid.locator("[data-mystery-number]")).toHaveCount(5);
  await expect(grid.locator("[data-mystery-letter]")).toHaveCount(0);

  // Le PDF part des mêmes dessins : grille vierge et solution, chacune avec sa rangée
  await expect(page.locator("[aria-hidden] svg [data-mystery-row]")).toHaveCount(2);
  await page.getByRole("button", { name: "Imprimer (grille et solution)" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Imprimer sans compte" }).click();
  const pdf = await download;
  const pdfPath = path.join(test.info().outputDir, "mot-mystere.pdf");
  await pdf.saveAs(pdfPath);
  const raw = readFileSync(pdfPath).toString("latin1");
  expect(raw.startsWith("%PDF-")).toBe(true);
  // Deux pages : la grille à remplir, puis la solution
  expect(raw.match(/\/Type\s*\/Page[^s]/g)?.length).toBe(2);
});

const GRID = {
  width: 3,
  height: 2,
  layout: "3x2-001",
  seed: 7,
  cells: [
    { x: 0, y: 0, char: "", is_black: true },
    { x: 1, y: 0, char: "A", is_black: false },
    { x: 2, y: 0, char: "S", is_black: false },
    { x: 0, y: 1, char: "I", is_black: false },
    { x: 1, y: 1, char: "L", is_black: false },
    { x: 2, y: 1, char: "E", is_black: false },
  ],
  words: [
    { text: "AS", x: 1, y: 0, direction: "across", source: "common" },
    { text: "ILE", x: 0, y: 1, direction: "across", source: "common" },
  ],
  fill_ratio: 1,
  wish_ratio: 0,
  must_words: [],
};

test("poser, changer et retirer le mot mystère d'une grille conservée", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Email").fill(`mystere_${Date.now()}@test.com`);
  await page.getByLabel("Mot de passe").fill("TestPassword123");
  await page.getByRole("button", { name: "Créer un compte" }).click();
  await expect(page.getByTestId("logout-button")).toBeVisible();

  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === "csrf_access_token")!.value;
  const created = await page.request.post(`${API}/api/grids`, {
    headers: { "X-CSRF-TOKEN": csrf },
    data: { name: "Grille à offrir", grid: GRID },
  });
  expect(created.status()).toBe(201);
  const gridId = (await created.json()).id as number;

  await page.goto(`/grids/edit?id=${gridId}`);
  await page.getByRole("button", { name: /Mise en page et export/ }).click();
  const shown = page.locator("svg[role='img']").first();
  const field = page.getByLabel("Mot mystère", { exact: true });

  // Une lettre absente : refusé, et l'écran dit laquelle
  await field.fill("Zoé");
  await page.getByRole("button", { name: "Placer", exact: true }).click();
  await expect(page.getByText(/^Il manque un Z et un O dans la grille/)).toBeVisible();

  await field.fill("Sel");
  await page.getByRole("button", { name: "Placer", exact: true }).click();
  await expect(shown.locator("[data-mystery-number]")).toHaveCount(3);
  await expect(shown.locator("[data-mystery-box]")).toHaveCount(3);
  // L'aperçu est la grille vierge : la rangée attend ses lettres, la page solution les écrit
  await expect(shown.locator("[data-mystery-letter]")).toHaveCount(0);
  expect((await page.locator("[aria-hidden] svg [data-mystery-letter]").allTextContents()).join("")).toBe("SEL");

  await page.reload();
  await page.getByRole("button", { name: /Mise en page et export/ }).click();
  await expect(page.getByLabel("Mot mystère", { exact: true })).toHaveValue("SEL");
  await expect(shown.locator("[data-mystery-number]")).toHaveCount(3);

  await page.getByRole("button", { name: "Retirer le mot mystère" }).click();
  await expect(shown.locator("[data-mystery-number]")).toHaveCount(0);
  await expect(page.getByLabel("Mot mystère", { exact: true })).toHaveValue("");
});
