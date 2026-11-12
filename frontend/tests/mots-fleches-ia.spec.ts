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
});
