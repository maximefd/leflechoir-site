import { expect, test, type Page } from "@playwright/test";

/**
 * La balise d'audience (ADR 0016, point 3, #130). L'API n'est pas appelée : `/api/audience` est jouée, pour lire
 * ce que le navigateur enverrait — et ce qu'il n'enverrait pas.
 */
type Beacon = { kind: string; path: string; referrer: string; lang: string; visible_ms: number };

// Playwright pilote le navigateur : `navigator.webdriver` y est vrai, et la balise ne part pas (c'est voulu, voir
// le dernier test). Les autres parcours se jouent comme un lecteur, navigateur non piloté.
async function listen(page: Page, { robot = false } = {}): Promise<{ beacons: Beacon[]; headers: Record<string, string>[] }> {
  if (!robot) await page.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
  const seen = { beacons: [] as Beacon[], headers: [] as Record<string, string>[] };
  await page.route("**/api/audience", async (route) => {
    seen.beacons.push(route.request().postDataJSON());
    seen.headers.push(route.request().headers());
    await route.fulfill({ status: 204 });
  });
  return seen;
}

test("une page quittée est comptée, sans cookie ni identifiant", async ({ page }) => {
  const seen = await listen(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await page.waitForTimeout(300); // le temps visible d'une vraie page
  await page.getByRole("link", { name: "Guide", exact: true }).click();
  await expect(page).toHaveURL(/creer-des-mots-fleches/);

  await expect.poll(() => seen.beacons.length).toBeGreaterThan(0);
  const [first] = seen.beacons;
  expect(first.kind).toBe("view");
  expect(first.path).toBe("/");
  expect(first.visible_ms).toBeGreaterThanOrEqual(100);
  expect(first.lang).toMatch(/^[a-z]{2}/i);
  // Rien qui désigne une personne : ni cookie de session, ni jeton CSRF, ni en-tête d'autorisation
  for (const headers of seen.headers) {
    expect(headers["cookie"]).toBeUndefined();
    expect(headers["authorization"]).toBeUndefined();
    expect(headers["x-csrf-token"]).toBeUndefined();
  }
  // Le corps ne porte que ces champs
  expect(Object.keys(first).sort()).toEqual(["kind", "lang", "path", "referrer", "visible_ms"]);
});

test("rien n'est écrit dans le navigateur pour mesurer", async ({ page }) => {
  await listen(page);
  await page.goto("/");
  await page.waitForTimeout(300);
  await page.getByRole("link", { name: "Guide", exact: true }).click();
  await expect(page).toHaveURL(/creer-des-mots-fleches/);

  const written = await page.evaluate(() => ({
    local: window.localStorage.length,
    session: window.sessionStorage.length,
    cookie: document.cookie,
  }));
  expect(written).toEqual({ local: 0, session: 0, cookie: "" });
});

test("un refus enregistré dans le navigateur coupe la balise", async ({ page }) => {
  const seen = await listen(page);
  await page.addInitScript(() => window.localStorage.setItem("mesure", "non"));
  await page.goto("/");
  await page.waitForTimeout(300);
  await page.getByRole("link", { name: "Guide", exact: true }).click();
  await expect(page).toHaveURL(/creer-des-mots-fleches/);
  await page.waitForTimeout(300);

  expect(seen.beacons).toEqual([]);
});

test("Global Privacy Control coupe la balise", async ({ page }) => {
  const seen = await listen(page);
  await page.addInitScript(() => Object.defineProperty(navigator, "globalPrivacyControl", { value: true }));
  await page.goto("/");
  await page.waitForTimeout(300);
  await page.getByRole("link", { name: "Guide", exact: true }).click();
  await expect(page).toHaveURL(/creer-des-mots-fleches/);
  await page.waitForTimeout(300);

  expect(seen.beacons).toEqual([]);
  await page.goto("/privacy");
  await expect(page.getByTestId("audience-choice")).toContainText("Global Privacy Control");
});

test("le refus se prend depuis la page confidentialité, et se reprend", async ({ page }) => {
  const seen = await listen(page);
  await page.goto("/privacy");
  const choice = page.getByTestId("audience-choice");
  await expect(choice).toContainText("tes visites sont comptées");

  await choice.getByRole("button", { name: "Ne plus compter mes visites" }).click();
  await expect(choice).toContainText("tes visites ne sont pas comptées sur cet appareil");
  expect(await page.evaluate(() => window.localStorage.getItem("mesure"))).toBe("non");
  // Il tient au rechargement
  await page.reload();
  await expect(page.getByTestId("audience-choice")).toContainText("ne sont pas comptées");
  await page.waitForTimeout(300);
  await page.getByRole("contentinfo").getByRole("link", { name: "Contact", exact: true }).click();
  await expect(page).toHaveURL(/contact/);
  await page.waitForTimeout(300);
  expect(seen.beacons).toEqual([]);

  await page.goto("/privacy");
  await page.getByTestId("audience-choice").getByRole("button", { name: "Me compter à nouveau" }).click();
  expect(await page.evaluate(() => window.localStorage.getItem("mesure"))).toBeNull();
});

test("le pied de page dit que les pages sont comptées, et mène au refus", async ({ page }) => {
  await listen(page);
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await expect(footer).toContainText("Le site compte les pages vues, sans cookie ni identifiant.");
  await footer.getByRole("link", { name: "Tu peux refuser d'être compté." }).click();
  await expect(page).toHaveURL(/\/privacy\/?#audience$/);
  await expect(page.getByRole("heading", { name: "Les pages vues, sans cookie" })).toBeVisible();
});

test("le poste de pilotage n'est jamais compté", async ({ page }) => {
  const seen = await listen(page);
  await page.goto("/admin");
  await page.waitForTimeout(300);
  await page.goto("/");
  await page.waitForTimeout(300);

  expect(seen.beacons.filter((beacon) => beacon.path.startsWith("/admin"))).toEqual([]);
});

test("un navigateur piloté par un robot n'envoie rien", async ({ page }) => {
  const seen = await listen(page, { robot: true });
  await page.goto("/");
  await page.waitForTimeout(300);
  await page.getByRole("link", { name: "Guide", exact: true }).click();
  await expect(page).toHaveURL(/creer-des-mots-fleches/);
  await page.waitForTimeout(300);

  expect(seen.beacons).toEqual([]);
});
