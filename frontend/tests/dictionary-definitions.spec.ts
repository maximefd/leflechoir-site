import { expect, test, type Page } from "@playwright/test";

/**
 * #91 : une définition écrite dans un dictionnaire est proposée dans l'éditeur, quand le mot tombe dans une grille.
 *
 * Proposée, jamais recopiée d'office : l'auteur la reprend d'un clic. Crée un compte jetable (quota d'inscription :
 * voir `saved-grids.spec.ts`).
 */
const caseDe = (page: Page, x: number, y: number) =>
  page.getByLabel("Grille, correction des lettres").locator(`svg rect[x="${x * 100}"][y="${y * 100}"]`).last();

async function ecrire(page: Page, x: number, y: number, lettres: string) {
  await caseDe(page, x, y).click();
  for (const lettre of lettres) {
    const saved = page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes("/api/grids/"));
    await page.keyboard.press(lettre);
    await saved;
  }
}

test("la définition d'un mot du dictionnaire est proposée dans l'éditeur", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("/register");
  await page.getByLabel("Email").fill(`defs_${Date.now()}@test.com`);
  await page.getByLabel("Mot de passe").fill("TestPassword123");
  await page.getByRole("button", { name: "Créer un compte" }).click();
  await expect(page.getByTestId("logout-button")).toBeVisible();

  // Le mot et sa définition, rangés dans le dictionnaire
  await page.goto("/dictionaries");
  await page.getByLabel("Nouveau mot").fill("rire");
  await page.getByLabel("Définition (optionnel)").fill("Se moquer gaiement");
  await page.getByRole("button", { name: "Ajouter le mot" }).click();
  await expect(page.getByText("Se moquer gaiement")).toBeVisible();

  // Une petite grille à la main où le mot tombe
  await page.goto("/grids/new");
  await page.getByLabel("Largeur").fill("4");
  await page.getByLabel("Hauteur").fill("4");
  await page.getByRole("button", { name: /Créer une grille vide de 4\s*×\s*4/ }).click();
  await page.getByRole("button", { name: "Passer le tutoriel" }).click();
  await page.getByRole("button", { name: "Préremplir" }).click();
  await ecrire(page, 0, 1, "SALE");
  await ecrire(page, 0, 3, "RIRE");
  await page.getByRole("button", { name: "Les mots me conviennent : écrire les définitions" }).click();

  // La définition est proposée sous le champ, pas écrite d'office
  await page.locator("li").filter({ hasText: /^RIRE/ }).getByRole("button").click();
  const champ = page.getByRole("textbox", { name: "Définition de RIRE" });
  await expect(champ).toHaveValue("");
  await expect(page.getByText("Dans ton dictionnaire « Dictionnaire par défaut » :")).toBeVisible();
  const saved = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && (r.request().postData() ?? "").includes("Se moquer gaiement"),
  );
  await page.getByRole("button", { name: "Utiliser" }).click();
  await expect(champ).toHaveValue("Se moquer gaiement");
  await saved;

  // Reprise : la suggestion disparaît, la définition est enregistrée
  await page.reload();
  await page.getByRole("button", { name: /Définitions/ }).first().click();
  await page.locator("li").filter({ hasText: /^RIRE/ }).getByRole("button").click();
  await expect(page.getByRole("textbox", { name: "Définition de RIRE" })).toHaveValue("Se moquer gaiement");
  await expect(page.getByRole("button", { name: "Utiliser" })).toHaveCount(0);
});
