import { expect, test, type Page } from "@playwright/test";

/**
 * La première grille faite à la main, guidée de bout en bout (roadmap 5B).
 *
 * Le parcours suit les gestes d'un débutant, pas les boutons du tutoriel : refuser le préremplissage puis
 * changer d'avis, écrire des mots, passer aux définitions par le bouton du panneau. C'est sur ce chemin que
 * l'étape « Écris ta première définition » manquait. Crée un compte jetable (quota d'inscription : voir
 * `saved-grids.spec.ts`).
 */
const etape = (page: Page, numero: number) => page.getByRole("dialog", { name: new RegExp(`étape ${numero} sur 8`) });

/** La case (x, y) de la grille affichée (l'éditeur garde hors écran deux copies pour l'export PDF). */
const caseDe = (page: Page, x: number, y: number) =>
  page.getByLabel("Grille, correction des lettres").locator(`svg rect[x="${x * 100}"][y="${y * 100}"]`).last();

/** Clique la case (x, y) de la grille de l'éditeur, puis tape des lettres dans le sens courant. */
async function ecrire(page: Page, x: number, y: number, lettres: string) {
  await caseDe(page, x, y).click();
  for (const lettre of lettres) {
    const saved = page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes("/api/grids/"));
    await page.keyboard.press(lettre);
    await saved;
  }
}

test("une première grille à la main est guidée jusqu'aux définitions", async ({ page }) => {
  test.setTimeout(180_000);

  await page.goto("/register");
  await page.getByLabel("Email").fill(`main_${Date.now()}@test.com`);
  await page.getByLabel("Mot de passe").fill("TestPassword123");
  await page.getByRole("button", { name: "Créer un compte" }).click();
  await expect(page.getByTestId("logout-button")).toBeVisible();

  // L'outil est dans le menu du haut, et il conseille de commencer petit
  await page.getByRole("link", { name: "Créer à la main" }).first().click();
  await expect(page.getByText(/Première grille \? Un petit format/)).toBeVisible();
  await page.getByLabel("Largeur").fill("4");
  await page.getByLabel("Hauteur").fill("4");
  await page.getByRole("button", { name: /Créer une grille vide de 4\s*×\s*4/ }).click();

  // Étape 1 : l'auteur refuse le préremplissage… puis change d'avis, tant que les bords sont vides
  await expect(etape(page, 1)).toBeVisible();
  // Avant toute lettre, une case définition se pose sans avertissement
  await caseDe(page, 3, 3).click();
  await page.getByRole("button", { name: "En faire une case définition" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.getByRole("button", { name: "En faire une case lettre" }).click();
  await page.getByRole("button", { name: "Je les place moi-même" }).click();
  await expect(etape(page, 2)).toBeVisible();
  await page.getByRole("button", { name: "Préremplir" }).click();
  await expect(page.getByRole("button", { name: "Préremplir" })).toHaveCount(0);

  // Étapes 2 et 3 : elles se valident en écrivant
  await ecrire(page, 0, 1, "SALE");
  await expect(etape(page, 3)).toBeVisible();
  await ecrire(page, 0, 3, "RIRE");
  await expect(etape(page, 4)).toBeVisible();

  // Le reste de la grille : la ligne du milieu et les deux cases du haut
  await ecrire(page, 1, 2, "ROI");
  await ecrire(page, 1, 0, "T");
  await ecrire(page, 3, 0, "A");

  // Étape 5 : grille remplie. L'auteur passe aux définitions par le bouton du panneau, pas par le tutoriel
  await expect(etape(page, 5)).toBeVisible();
  await page.getByRole("button", { name: "Les mots me conviennent : écrire les définitions" }).click();
  await expect(etape(page, 6)).toBeVisible();

  // Étapes 6 à 8 : une définition, puis toutes
  for (let i = 0; i < 20; i += 1) {
    if (await etape(page, 8).isVisible()) break;
    const champ = page.getByRole("textbox", { name: /^Définition de / });
    await champ.fill(`Définition ${i + 1}`);
    await champ.press("Enter");
    if (i === 0) await expect(etape(page, 7)).toBeVisible();
  }
  await expect(etape(page, 8)).toBeVisible();
  await page.getByRole("button", { name: "Voir la mise en page", exact: true }).click();
  await expect(page.getByRole("button", { name: /Mise en page et export/ })).toHaveAttribute("aria-current", "step");
});
