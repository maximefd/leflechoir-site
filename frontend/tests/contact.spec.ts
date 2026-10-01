import { expect, test } from "@playwright/test";

/**
 * Le formulaire de contact (Phase 8, #131). L'API est jouée : on lit ce que le formulaire enverrait.
 */
type Sent = { reason: string; message: string; email: string; request_id: string; website: string };

test("un message part avec son motif, sans rien d'autre", async ({ page }) => {
  const sent: Sent[] = [];
  await page.route("**/api/contact", async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, json: { message: "Merci" } });
  });
  await page.goto("/contact");

  const form = page.getByRole("form", { name: "Écrire un message" });
  const submit = form.getByRole("button", { name: "Envoyer le message" });
  await expect(submit).toBeDisabled(); // pas de message, pas d'envoi
  await form.getByLabel("Ton message", { exact: true }).fill("Le mot ECOLE manque dans les mots de six lettres.");
  await form.getByLabel(/Ton adresse, pour te répondre/).fill("marie@exemple.fr");
  await form.getByLabel("Une suggestion").check();
  await submit.click();

  await expect(page.getByRole("status")).toContainText("ton message est bien arrivé");
  expect(sent).toEqual([{
    reason: "suggestion",
    message: "Le mot ECOLE manque dans les mots de six lettres.",
    email: "marie@exemple.fr",
    request_id: "",
    website: "", // le pot de miel reste vide
  }]);
});

test("« Signaler ce problème » arrive réglé sur « problème », avec l'identifiant de la requête", async ({ page }) => {
  let sent: Sent | null = null;
  await page.route("**/api/contact", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { message: "Merci" } });
  });
  await page.goto("/contact?reason=problem&request=abc-123-def");

  const form = page.getByRole("form", { name: "Écrire un message" });
  await expect(form.getByLabel("Un problème")).toBeChecked();
  await expect(form).toContainText("abc-123-def");
  await form.getByLabel("Ton message", { exact: true }).fill("La génération a échoué trois fois de suite.");
  await form.getByRole("button", { name: "Envoyer le message" }).click();

  await expect(page.getByRole("status")).toBeVisible();
  expect(sent).toMatchObject({ reason: "problem", request_id: "abc-123-def" });
});

test("le pot de miel est caché des yeux et du clavier", async ({ page }) => {
  await page.goto("/contact");
  const trap = page.locator('input[name="website"]');
  await expect(trap).toHaveAttribute("tabindex", "-1");
  await expect(trap).not.toBeInViewport();
  expect(await trap.evaluate((node) => node.closest("[aria-hidden]") !== null)).toBe(true);
});

test("la limite de cinq messages par heure est expliquée", async ({ page }) => {
  await page.route("**/api/contact", (route) => route.fulfill({ status: 429, json: { error: "Trop de requêtes." } }));
  await page.goto("/contact");
  const form = page.getByRole("form", { name: "Écrire un message" });
  await form.getByLabel("Ton message", { exact: true }).fill("Un sixième message dans la même heure.");
  await form.getByRole("button", { name: "Envoyer le message" }).click();

  await expect(form.getByRole("alert")).toContainText("réessaie dans une heure");
});

test("un message trop court n'est pas envoyé", async ({ page }) => {
  await page.goto("/contact");
  const form = page.getByRole("form", { name: "Écrire un message" });
  await form.getByLabel("Ton message", { exact: true }).fill("court");
  await expect(form.getByRole("button", { name: "Envoyer le message" })).toBeDisabled();
});
