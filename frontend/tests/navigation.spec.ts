import { expect, test } from "@playwright/test";

/**
 * La navigation en rubriques (maquettes du 07/10/2026, retenues le 21/10/2026) : sur ordinateur, Accueil, Créer,
 * Jouer, Articles, Outils, et « Mes grilles » à droite ; sur téléphone, le logo, « Menu » et quatre pastilles.
 * La rubrique de la page est marquée (`aria-current`).
 */
test("ordinateur : la ligne des rubriques, et la rubrique de la page allumée", async ({ page }) => {
  await page.goto("/");
  const rubriques = page.getByRole("banner").getByRole("navigation", { name: "Rubriques" });

  await expect(rubriques.getByRole("link")).toHaveText(["Accueil", "Créer", "Jouer", "Articles", "Outils", "Mes grilles"]);
  await expect(rubriques.getByRole("link", { name: "Accueil" })).toHaveAttribute("aria-current", "page");

  for (const [chemin, rubrique] of [
    ["/grid", "Créer"],
    ["/jouer", "Jouer"],
    ["/creer-des-mots-fleches", "Articles"],
    ["/search", "Outils"],
    ["/mots/cinq-lettres", "Outils"],
  ] as const) {
    await page.goto(chemin);
    await expect(rubriques.locator('[aria-current="page"]'), chemin).toHaveText(rubrique);
  }
});

test("« Créer une grille » mène à la rubrique Créer, qui propose de générer ou de faire à la main", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("banner").getByRole("link", { name: "Créer une grille" }).click();

  await expect(page).toHaveURL(/\/creer$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Créer une grille");
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: /^Générer une grille/ })).toHaveAttribute("href", "/grid");
  await expect(main.getByRole("link", { name: /^Créer à la main/ })).toHaveAttribute("href", "/grids/new");
  await expect(main.getByRole("link", { name: /^Chercher un mot/ })).toHaveAttribute("href", "/search");
  // Une page de navigation : hors des moteurs, mais ses liens se suivent
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
});

test("la grille du jour s'appelle ainsi, plus « À toi de jouer »", async ({ page }) => {
  await page.goto("/jouer");

  await expect(page.getByRole("banner").getByText("À toi de jouer")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("À toi de jouer");
});

test.describe("téléphone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("le logo, « Menu », et quatre pastilles qui tiennent sur la largeur", async ({ page }) => {
    await page.goto("/search");
    const rubriques = page.getByRole("banner").getByRole("navigation", { name: "Rubriques" });

    await expect(rubriques.getByRole("link")).toHaveText(["Créer", "Jouer", "Articles", "Outils"]);
    await expect(rubriques.getByRole("link", { name: "Outils" })).toHaveAttribute("aria-current", "page");
    // Pas de défilement de côté : la page ne dépasse pas l'écran
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

    await page.getByRole("button", { name: "Menu" }).click();
    const menu = page.getByRole("navigation", { name: "Menu" });
    await expect(menu.getByRole("link", { name: "La grille du jour" })).toBeVisible();
    await menu.getByRole("link", { name: "Listes de mots" }).click();
    await expect(page).toHaveURL(/\/mots$/);
  });
});
