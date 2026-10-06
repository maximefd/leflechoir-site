import { expect, test } from "@playwright/test";

/**
 * La taille de la grille (#220) : toutes les grilles sont dessinées par le moteur. Plus de choix « Du catalogue » /
 * « Sur mesure » : quelques tailles d'un clic, une taille libre de 5 à 20, et la taille conseillée pour les mots
 * imposés, à prendre d'un clic.
 */
test("une grille en taille libre, dessinée par le moteur", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/grid");

  await expect(page.getByText("Du catalogue")).toHaveCount(0);
  await expect(page.getByText("Sur mesure")).toHaveCount(0);
  // Trois tailles d'un clic (06/10/2026), « Moyenne » 10 × 13 par défaut
  const presets = page.getByRole("radiogroup", { name: "Tailles courantes" }).getByRole("radio");
  await expect(presets).toHaveCount(3);
  await expect(page.getByRole("radio", { name: /Petite\s*7\s*×\s*9/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Grande\s*13\s*×\s*16/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Moyenne\s*10\s*×\s*13/ })).toBeChecked();
  await page.getByLabel("Largeur").fill("8");
  await page.getByLabel("Hauteur").fill("6");
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);

  const request = page.waitForRequest((req) => req.url().endsWith("/api/grids/generate") && req.method() === "POST");
  await page.getByRole("button", { name: "Générer la grille" }).click();
  const body = JSON.parse((await request).postData() || "{}");
  expect(body.geometry).toBe("sur_mesure");
  expect(body.size).toEqual({ width: 8, height: 6 });

  // La première génération charge le lexique
  const result = page.getByRole("region", { name: "Grille générée" });
  await expect(result.getByText(/8 × 6 · \d+ mots/)).toBeVisible({ timeout: 60_000 });
});

test("une taille libre hors bornes ne se génère pas", async ({ page }) => {
  await page.goto("/grid");
  await page.getByLabel("Largeur").fill("25");

  await expect(page.getByText("De 5 à 20 cases de côté.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Générer la grille" })).toBeDisabled();
});

test("la taille conseillée pour les mots imposés se prend d'un clic", async ({ page }) => {
  await page.goto("/grid");
  await page.locator("label").filter({ hasText: /^Petite\s*7\s*×\s*9$/ }).click();
  const mot = page.getByLabel("Mot à placer dans la grille");
  await mot.fill("CHOCOLAT");
  await mot.press("Enter");

  // `best_size` vient de la table de difficulté du sur mesure (#219)
  const advice = page.getByText(/Taille conseillée pour tes mots/);
  await expect(advice).toBeVisible();
  const take = page.getByRole("button", { name: /^Prendre \d+\s*×\s*\d+$/ });
  if (await take.isVisible()) {
    const [, width, height] = (await take.textContent())!.match(/(\d+)\s*×\s*(\d+)/)!;
    await take.click();
    await expect(page.getByLabel("Largeur")).toHaveValue(width);
    await expect(page.getByLabel("Hauteur")).toHaveValue(height);
  }
  await expect(page.getByText("(c'est celle choisie)")).toBeVisible();
});

test("un mot de 13 lettres : la taille conseillée le loge, dès la saisie", async ({ page }) => {
  await page.goto("/grid");
  // Ordre du panneau (06/10/2026) : les mots, la taille, le mot mystère, puis les dictionnaires
  const headings = page.locator("form h2, form summary");
  await expect(headings.first()).toContainText("Imposer des mots");
  const texts = await headings.allTextContents();
  const order = ["Imposer des mots", "Taille de la grille", "Mot mystère", "Puiser dans tes dictionnaires"].map(
    (title) => texts.findIndex((text) => text.includes(title)),
  );
  expect(order.every((index) => index >= 0)).toBe(true);
  expect(order).toEqual([...order].sort((a, b) => a - b));

  const mot = page.getByLabel("Mot à placer dans la grille");
  await mot.fill("ORNITHORYNQUE");
  await mot.press("Enter");
  // #222 : un mot de plus de 9 lettres n'est plus refusé, il demande une grille d'au moins 13 cases de côté
  await page.getByRole("button", { name: /^Prendre 13\s*×\s*13$/ }).click();
  await expect(page.getByLabel("Largeur")).toHaveValue("13");
  await expect(page.getByLabel("Hauteur")).toHaveValue("13");
  await expect(page.getByText("Ces mots ne tiennent pas dans une grille de cette taille")).toHaveCount(0);
});
