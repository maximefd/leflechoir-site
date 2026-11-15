import { expect, test, type Page } from "@playwright/test";

/**
 * Se connecter avec Google ou Microsoft (ADR 0034). Le fournisseur est hors d'atteinte des tests : l'API est simulée
 * là où elle répond au site (`/api/auth/providers`, `/api/users/me`, le ticket), et le parcours chez le fournisseur
 * est vérifié par les tests de l'API (backend/tests/test_oidc.py).
 */
async function withProviders(page: Page, providers: string[] = ["google", "microsoft"]) {
  await page.route("**/api/auth/providers", (route) => route.fulfill({ json: { providers } }));
}

test("sans fournisseur configuré, la connexion reste celle du mot de passe", async ({ page }) => {
  await withProviders(page, []);
  await page.goto("/login");

  await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
  await expect(page.getByTestId("fournisseurs")).toHaveCount(0);
});

test("« Continuer avec Google » part vers l'API, avec la page où revenir", async ({ page }) => {
  await withProviders(page);
  let started: URL | null = null;
  await page.route("**/api/auth/oidc/google/start**", async (route) => {
    started = new URL(route.request().url());
    await route.fulfill({ contentType: "text/html", body: "<title>Fournisseur</title><p>Chez le fournisseur</p>" });
  });
  await page.goto("/login?next=%2Fgrids");

  await expect(page.getByRole("button", { name: "Continuer avec Microsoft" })).toBeVisible();
  await page.getByRole("button", { name: "Continuer avec Google" }).click();

  await expect(page.getByText("Chez le fournisseur")).toBeVisible();
  expect(started).not.toBeNull();
  expect(started!.pathname).toBe("/api/auth/oidc/google/start");
  expect(started!.searchParams.get("next")).toBe("/grids");
});

test("avec un fournisseur, on choisit d'abord : le formulaire vient avec « ton adresse e-mail »", async ({ page }) => {
  await withProviders(page, ["google"]);
  await page.goto("/login");

  await expect(page.getByRole("button", { name: "Continuer avec Google" })).toBeVisible();
  await expect(page.getByLabel("Mot de passe")).toHaveCount(0);

  await page.getByRole("button", { name: "Continuer avec ton adresse e-mail" }).click();
  await expect(page.getByLabel("Email")).toBeFocused();
  await expect(page.getByRole("button", { name: "Continuer avec Google" })).toHaveCount(0);

  await page.getByRole("button", { name: "← Choisir une autre façon" }).click();
  await expect(page.getByRole("button", { name: "Continuer avec Google" })).toBeVisible();
});

test("une connexion refusée par l'API dit pourquoi", async ({ page }) => {
  await withProviders(page);
  await page.goto("/login?erreur=email_unverified_taken");

  await expect(page.getByText(/Un compte existe déjà avec cette adresse/)).toBeVisible();
});

test("un compte sans mot de passe se supprime après s'être reconnecté chez Google", async ({ page, baseURL }) => {
  await withProviders(page);
  await page.context().addCookies([
    { name: "csrf_refresh_token", value: "simule", url: baseURL! },
    { name: "csrf_access_token", value: "simule", url: baseURL! },
  ]);
  await page.route("**/api/users/me", async (route) => {
    if (route.request().method() === "DELETE") {
      await route.fulfill({ json: { message: "Ton compte et toutes tes données ont été supprimés avec succès." } });
      return;
    }
    await route.fulfill({
      json: {
        email: "marie@exemple.fr", email_verified: true, dictionaries: 1, words: 0, grids: 0, reussites: 0, api_keys: 0,
        has_password: false, identities: [{ provider: "google", created_at: "2026-11-14T10:00:00" }],
      },
    });
  });
  const intents: string[] = [];
  await page.route("**/api/auth/oidc/google/ticket", async (route) => {
    intents.push(route.request().postDataJSON().intent);
    // Le fournisseur reconnecte la personne, puis l'API la renvoie ici : on saute l'aller-retour
    await route.fulfill({ json: { url: `${baseURL}/account?confirme=google` } });
  });
  await page.route("**/api/auth/logout", (route) => route.fulfill({ json: { message: "Déconnecté." } }));
  // Le reste de « Mon compte », simulé aussi : un 401 de la vraie API fermerait la session simulée
  await page.route("**/api/suggestions/mine", (route) => route.fulfill({ json: { suggestions: [] } }));
  await page.route("**/api/account/api-keys", (route) => route.fulfill({ json: { keys: [], max_keys: 3 } }));

  await page.goto("/account");
  const connexion = page.getByRole("region", { name: "Connexion" });
  await expect(connexion).toContainText("Ton compte n'a pas de mot de passe");
  // Seule façon d'entrer : on ne peut pas la délier
  await expect(connexion.getByRole("button", { name: "Délier" })).toBeDisabled();
  await expect(connexion.getByRole("button", { name: "Relier mon compte Microsoft" })).toBeEnabled();
  await expect(page.getByLabel("Ton mot de passe, pour confirmer")).toHaveCount(0);

  await page.getByRole("button", { name: "Reconfirmer avec Google…" }).click();

  await expect(page.getByRole("dialog")).toContainText("marie@exemple.fr");
  expect(intents).toEqual(["reauth"]);
  await expect(page).toHaveURL(/\/account$/);  // l'adresse est nettoyée du retour du fournisseur
  await page.getByRole("button", { name: "Supprimer définitivement" }).click();
  await expect(page).toHaveURL("/");
});
