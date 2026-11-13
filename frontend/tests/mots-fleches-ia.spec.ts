import { expect, test } from "@playwright/test";

// La page du connecteur (lot 4 de l'API ouverte) : la documentation qu'exigent les annuaires de Claude et de ChatGPT
test("la page des mots fléchés avec une IA donne l'adresse du connecteur et la marche à suivre pour chacun", async ({ page }) => {
  await page.goto("/mots-fleches-ia");

  await expect(page.getByTestId("adresse-connecteur")).toHaveText("https://mcp.leflechoir.fr/mcp");
  for (const assistant of ["Dans Claude", "Dans ChatGPT", "Dans Le Chat de Mistral"]) {
    await expect(page.getByRole("heading", { name: assistant })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "confidentialité", exact: true })).toHaveAttribute("href", "/privacy#api");
  await expect(page.getByRole("link", { name: "conditions", exact: true })).toHaveAttribute("href", "/terms#api");
  // Sans connecteur : le lien préparé, et l'API pour un programme
  await expect(page.getByRole("heading", { name: "Sans connecteur" })).toBeVisible();
  await expect(page.getByText(/\/creer\?taille=moyenne&mots=/)).toBeVisible();
  await expect(page.getByRole("link", { name: "l'API pour les développeurs" })).toHaveAttribute("href", "/developpeurs");
});

// Retour du 13/11/2026 : « aucune page ne documente ton API sur le site »
test("la page des développeurs documente l'API : adresse, quatre appels, routes, quotas, erreurs", async ({ page }) => {
  await page.goto("/developpeurs");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("L'API pour les développeurs");
  await expect(page.getByTestId("adresse-api")).toHaveText("https://api.leflechoir.fr/v1");
  await expect(page.getByRole("link", { name: "spécification OpenAPI" })).toHaveAttribute("href", "https://api.leflechoir.fr/v1/openapi.json");
  for (const route of ["POST /v1/grids", "GET /v1/grids/{id}", "POST /v1/clues/check", "POST /v1/render"]) {
    await expect(page.getByText(route, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText(/curl -i -X POST https:\/\/api\.leflechoir\.fr\/v1\/grids/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "La clé et les quotas" })).toBeVisible();
  await expect(page.getByText("quota_minute, quota_day, quota_words")).toBeVisible();
});

test("le pied de page mène à la page du connecteur et à celle de l'API", async ({ page }) => {
  await page.goto("/");
  const pied = page.getByRole("contentinfo");
  await expect(pied.getByRole("link", { name: "Avec une IA" })).toHaveAttribute("href", "/mots-fleches-ia");
  await pied.getByRole("link", { name: "API", exact: true }).click();
  await expect(page).toHaveURL(/\/developpeurs$/);
});

test("le générateur dit aux visiteurs venus avec un assistant comment s'en servir", async ({ page }) => {
  await page.goto("/grid");
  const bloc = page.getByTestId("avec-une-ia");
  await expect(bloc.getByRole("link", { name: "ajoute le connecteur" })).toHaveAttribute("href", "/mots-fleches-ia");
  // Le lien préparé est dans la page, replié, pour l'assistant qui la lit
  await expect(bloc.locator("details")).toContainText("/creer");
});
