import { expect, test } from "@playwright/test";

/**
 * Barre de progression (#220) : pendant la recherche, une barre qui avance au rythme des événements `progress`,
 * sans grille intermédiaire ni « Garder celle-ci » ; puis une seule grille, la meilleure.
 *
 * Des mots souhaités qu'aucune grille ne peut tous porter : la recherche dure jusqu'à l'arrêt anticipé.
 */
test("une barre de progression pendant la recherche, puis une seule grille", async ({ page }) => {
  test.setTimeout(90_000);
  await page.route("**/api/grids/generate", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    const wish = ["MERCI", "SALON", "TABLE", "RADIO", "SALUT", "PAIRE", "CHAISE", "JARDIN", "ORANGE"];
    await route.continue({
      postData: JSON.stringify({ ...body, quality: "best", wish_words: wish, must_words: [] }),
    });
  });

  await page.goto("/grid");
  await page.locator("label").filter({ hasText: /^Petite\s*7\s*×\s*9$/ }).click();
  await page.getByRole("button", { name: "Générer la grille" }).click();

  const result = page.getByRole("region", { name: "Grille générée" });
  await expect(result.getByRole("progressbar", { name: "Génération de la grille" })).toBeVisible();
  // Aucune grille pendant la recherche, et plus de bouton pour en garder une en cours de route
  await expect(result.locator("svg[role='img']")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Garder celle-ci" })).toHaveCount(0);
  await expect(page.getByText(/Essai n°/)).toHaveCount(0);

  // La première génération charge le lexique
  await expect(page.getByText("Cette grille te plaît ?")).toBeVisible({ timeout: 60_000 });
  await expect(result.getByRole("progressbar")).toHaveCount(0);
  await expect(result.getByText(/7 × 9 · \d+ mots/)).toBeVisible();
  // Une grille est affichée : le bouton propose d'en générer une autre
  await expect(page.getByRole("button", { name: "Générer une autre grille" })).toBeEnabled();
});
