import { expect, test, type Page } from "@playwright/test";

/**
 * E-mails du compte (ADR 0014) : confirmer son adresse, changer un mot de passe oublié.
 *
 * Les e-mails arrivent dans Mailpit (docker compose en local, service de la CI) : le parcours y lit le lien,
 * comme l'auteur le lirait dans sa boîte. Sans Mailpit, ces tests sont ignorés.
 */
const MAILPIT = process.env.MAILPIT_URL || "http://localhost:8025";
const PASSWORD = "TestPassword123";

let mailpitAvailable = false;
test.beforeAll(async ({ request }) => {
  mailpitAvailable = await request.get(`${MAILPIT}/api/v1/info`).then((r) => r.ok(), () => false);
});
test.beforeEach(() => test.skip(!mailpitAvailable, "Mailpit injoignable"));

/** Chemin du lien (sans l'hôte : le frontend du test n'est pas forcément sur le port des e-mails). */
async function linkFromMail(page: Page, to: string, path: string): Promise<string> {
  let text = "";
  await expect(async () => {
    const search = await page.request.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:"${to}"` } });
    const messages = (await search.json()).messages as { ID: string; Subject: string }[];
    const ids = messages.map((m) => m.ID);
    for (const id of ids) {
      const message = await (await page.request.get(`${MAILPIT}/api/v1/message/${id}`)).json();
      if ((message.Text as string).includes(path)) {
        text = message.Text;
        return;
      }
    }
    throw new Error(`Aucun e-mail pour ${to} ne contient ${path}`);
  }).toPass({ timeout: 15_000 });
  const url = new URL(text.match(/https?:\/\/\S+/)![0]);
  return `${url.pathname}${url.search}`;
}

async function registerAccount(page: Page, prefix: string) {
  const email = `${prefix}_${Date.now()}@test.com`;
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Créer un compte" }).click();
  await expect(page.getByTestId("logout-button")).toBeVisible();
  return email;
}

test("le lien reçu à l'inscription confirme l'adresse", async ({ page }) => {
  const email = await registerAccount(page, "confirmation");
  await page.goto("/account");
  await expect(page.getByText("pas encore confirmée")).toBeVisible();
  // Une clé d'API se rattache à une adresse confirmée
  await expect(page.getByTestId("cles-api")).toContainText("Confirme d'abord ton adresse e-mail pour créer une clé.");

  await page.goto(await linkFromMail(page, email, "/verify-email"));
  await expect(page.getByRole("status")).toHaveText("Adresse confirmée.");

  await page.goto("/account");
  await expect(page.getByText("Adresse confirmée.")).toBeVisible();

  // Puis la clé d'API (lot 5) : les conditions cochées à la main, la clé montrée une seule fois, révocable
  const cles = page.getByTestId("cles-api");
  await cles.getByLabel("Nom de la clé (ton application)").fill("Essai e2e");
  await expect(cles.getByRole("button", { name: "Créer une clé" })).toBeDisabled();
  await cles.getByTestId("cle-conditions").check();
  await cles.getByRole("button", { name: "Créer une clé" }).click();
  await expect(cles.getByTestId("cle-creee")).toContainText(/flk_[A-Za-z0-9_-]{20,}/);
  await expect(cles.getByTestId("liste-cles")).toContainText("Essai e2e");
  await expect(cles.getByTestId("liste-cles")).toContainText("pas encore servie");

  await page.reload();
  await expect(cles.getByTestId("cle-creee")).toHaveCount(0);
  await cles.getByRole("button", { name: "Révoquer" }).click();
  await expect(cles.getByText("Aucune clé pour l'instant.")).toBeVisible();
});

test("un mot de passe oublié se change par le lien reçu, une seule fois", async ({ page }) => {
  const email = await registerAccount(page, "oubli");
  await page.getByTestId("logout-button").click();

  await page.goto("/login");
  await page.getByRole("link", { name: "Mot de passe oublié ?" }).click();
  // Attendre la nouvelle page : sinon le champ « Email » trouvé est encore celui de la connexion
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Recevoir le lien" }).click();
  await expect(page.getByRole("status")).toContainText("Si un compte existe pour cette adresse");

  const link = await linkFromMail(page, email, "/reset-password");
  await page.goto(link);
  await page.getByLabel("Nouveau mot de passe").fill("NouveauSecret42");
  await page.getByRole("button", { name: "Changer le mot de passe" }).click();
  await expect(page.getByRole("status")).toContainText("Mot de passe changé");

  // Le même lien ne sert pas deux fois
  await page.goto(link);
  await page.getByLabel("Nouveau mot de passe").fill("EncoreUnAutre42");
  await page.getByRole("button", { name: "Changer le mot de passe" }).click();
  await expect(page.getByText("Ce lien n'est plus valable")).toBeVisible();

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill("NouveauSecret42");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByTestId("logout-button")).toBeVisible();
});
