import { readFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Le poste de pilotage (ADR 0016, point 6) : la page est dans l'export statique, donc publique, mais tout autre
 * visiteur que l'administrateur n'y voit que la page 404. Les chiffres, eux, sont gardés par l'API (test_admin.py).
 */
test("un visiteur voit la page 404 sur /admin", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Cette page n'existe pas" })).toBeVisible();
  await expect(page.getByText("Poste de pilotage")).toHaveCount(0);
});

test("un compte ordinaire aussi", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Email").fill(`pilotage_${Date.now()}@test.com`);
  await page.getByLabel("Mot de passe").fill("TestPassword123");
  await page.getByRole("button", { name: "Créer un compte" }).click();
  await expect(page.getByTestId("logout-button")).toBeVisible();

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Cette page n'existe pas" })).toBeVisible();
  await expect(page.getByText("Poste de pilotage")).toHaveCount(0);
});

test("la page n'est liée nulle part sur l'accueil", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('a[href*="admin"]')).toHaveCount(0);
});

// --- Le tableau de bord lui-même, sur des données fictives ---
//
// L'API garde les chiffres, et le rôle ne se pose qu'en ligne de commande : ici, ses réponses sont jouées.
// `fixtures/admin-stats.json` est la vraie réponse de `GET /api/admin/stats` sur le jeu de données fictives
// (`flask usage seed-demo`) ; `backend/tests/test_stats_tables.py` vérifie qu'elle garde la forme de la route.
const stats = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "admin-stats.json"), "utf-8"));
// De même pour `GET /api/admin/system` (`backend/tests/test_system_samples.py`)
const system = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "admin-system.json"), "utf-8"));
const suggestions = {
  pending: [
    { kind: "add", word: "PADEL", display: "padel", people: 4, sources: { must_unknown: 3, search_empty: 1 } },
    { kind: "remove", word: "ZYEUTA", display: "zyeuta", people: 1, sources: { search: 1 } },
  ],
  counts: { pending: 5, accepted: 2, rejected: 1 },
};

async function asAdmin(page: Page, baseURL: string | undefined, server: unknown = system) {
  // La session se reconnaît à son cookie CSRF, lisible par le site (ADR 0015)
  await page.context().addCookies(["csrf_access_token", "csrf_refresh_token"].map((name) => (
    { name, value: "essai", url: baseURL ?? "http://localhost:3000" }
  )));
  await page.route("**/api/users/me", (route) => route.fulfill({
    json: { email: "pilote@exemple.fr", email_verified: true, dictionaries: 0, words: 0, grids: 0 },
  }));
  await page.route("**/api/admin/stats", (route) => route.fulfill({ json: stats }));
  await page.route("**/api/admin/suggestions", (route) => route.fulfill({ json: suggestions }));
  await page.route("**/api/admin/system", (route) => route.fulfill({ json: server }));
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Poste de pilotage" })).toBeVisible();
}

test("l'administrateur lit l'usage, les générations et les erreurs", async ({ page, baseURL }) => {
  await asAdmin(page, baseURL);

  for (const name of ["Usage", "Audience", "Générations", "Erreurs et refus"]) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  // Les seuils de l'ADR 0013, en toutes lettres : jamais la couleur seule
  await expect(page.getByLabel("Seuils de l'ADR 0013").getByText("Dans le seuil").first()).toBeVisible();
  // L'évolution par jour : un graphique par mesure, résumé pour qui ne le voit pas
  await expect(page.getByRole("img", { name: /^Visiteurs\. \d/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /^Générations\. .* grilles obtenues/ })).toBeVisible();
  // L'audience de la balise : pages vues, sources dont les moteurs de réponse IA, langues des navigateurs
  await expect(page.getByRole("img", { name: /^Pages vues\. \d/ })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "Moteurs de réponse IA" })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "chatgpt.com" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Pages les plus vues" }).getByRole("rowheader", { name: "/grid", exact: true })).toBeVisible();
  // Le parcours, de la visite à la grille conservée
  for (const step of ["Visites", "Recherche ou génération", "Grille obtenue", "Compte créé", "Grille conservée"]) {
    await expect(page.getByRole("listitem").filter({ hasText: step }).first()).toBeVisible();
  }
  // Les générations : format × issue, puis nombre et longueur des mots imposés (#73)
  const formats = page.getByRole("table", { name: "Issues des générations par format" });
  await expect(formats.getByRole("row", { name: /^6x7/ })).toBeVisible();
  await expect(formats.getByRole("columnheader", { name: "N'entrent pas" })).toBeVisible();
  const matrix = page.getByRole("table", { name: /selon le nombre de mots imposés et la longueur/ });
  await expect(matrix.getByRole("rowheader", { name: "3 et plus" })).toBeVisible();
  await expect(matrix.getByRole("columnheader", { name: "11 lettres et plus" })).toBeVisible();
  // Les refus « occupé », serveur et visiteur séparés
  await expect(page.getByRole("rowheader", { name: /serveur occupé/ })).toBeVisible();
});

test("l'administrateur lit l'état du serveur et le journal des alertes", async ({ page, baseURL }) => {
  await asAdmin(page, baseURL);

  await expect(page.getByRole("heading", { name: "Système", exact: true })).toBeVisible();
  const state = page.getByLabel("État du serveur");
  await expect(state.getByText("Mémoire du serveur")).toBeVisible();
  await expect(state.getByText("seuil : 75 %")).toBeVisible();
  await expect(state.getByText("Dernière sauvegarde copiée hors du serveur")).toBeVisible();
  await expect(page.getByLabel("Dernier échantillon").getByText("Places de génération prises")).toBeVisible();
  // 24 heures heure par heure, 30 jours jour par jour, le seuil de mémoire tracé
  const hourly = page.getByRole("img", { name: /^Mémoire, au plus haut de l'heure\. / });
  await expect(hourly).toBeVisible();
  await hourly.hover({ position: { x: 5, y: 20 } });
  // La première heure de la réponse enregistrée : le 30 septembre à 16 h (UTC)
  await expect(page.locator("figure").filter({ has: hourly })).toContainText(/30 sept\..*16 h : .* Mo/);
  await expect(page.getByRole("img", { name: /^Mémoire, au plus haut du jour\. / })).toBeVisible();
  await expect(page.getByRole("img", { name: /^Taille de la base\. / })).toBeVisible();
  // Le journal des envois et ses plafonds
  const journal = page.getByRole("table").filter({ hasText: "Ce qui s'est passé" });
  await expect(journal.getByRole("row").filter({ hasText: "Erreurs 500" })).toContainText("Parti");
  await expect(page.getByText(/plafond de 10 ; une alerte par type et par 24 heures/)).toBeVisible();
});

test("sans échantillon récent, la page dit que le minuteur ne tourne plus", async ({ page, baseURL }) => {
  await asAdmin(page, baseURL, {
    ...system,
    fresh: false,
    thresholds: { ...system.thresholds, ram_level: "unknown", backup_level: "unknown" },
  });

  await expect(page.getByRole("status").filter({ hasText: "Le minuteur ne tourne plus." })).toBeVisible();
  // Aucun seuil n'est déclaré tenu sur un chiffre périmé
  await expect(page.getByLabel("État du serveur").getByText("Pas encore de mesure")).toHaveCount(2);
});

test("avant l'installation du minuteur, la rubrique Système l'explique", async ({ page, baseURL }) => {
  await asAdmin(page, baseURL, {
    ...system,
    latest: null,
    fresh: false,
    alerts: { sent: [], last_24h: 0, daily_cap: 10, cooldown_h: 24, enabled: false },
  });

  await expect(page.getByText(/flask system tick/)).toBeVisible();
  await expect(page.getByText("Aucun destinataire (ALERT_EMAIL) : rien ne part.")).toBeVisible();
});

test("le survol d'un jour donne ses chiffres, et le tableau les donne tous", async ({ page, baseURL }) => {
  await asAdmin(page, baseURL);

  const chart = page.getByRole("img", { name: /^Visiteurs\. / });
  const figure = page.locator("figure").filter({ has: chart });
  await expect(figure).toContainText("visiteurs d'un jour en 30 jours");
  await chart.hover({ position: { x: 5, y: 20 } });
  // Le premier jour de la série : le mercredi 2 septembre 2026 de la réponse enregistrée
  await expect(figure).toContainText(/mer\. 2 sept\. : \d+/);

  await page.getByText("Les 30 jours en tableau").click();
  const table = page.getByRole("table", { name: /Chiffres par jour/ });
  await expect(table.getByRole("row")).toHaveCount(31);
});

for (const viewport of [{ name: "ordinateur", width: 1280, height: 900 }, { name: "téléphone", width: 390, height: 844 }]) {
  test(`aucune violation WCAG A/AA sur le poste de pilotage (${viewport.name})`, async ({ page, baseURL }) => {
    // La page est longue (une dizaine de tableaux) : axe y passe plusieurs secondes
    test.slow();
    await page.setViewportSize(viewport);
    await asAdmin(page, baseURL);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .exclude("nextjs-portal")
      .analyze();

    expect(
      results.violations.map((violation) => ({
        règle: violation.id,
        description: violation.help,
        éléments: violation.nodes.map((node) => node.target.join(" ")),
      })),
    ).toEqual([]);
    // Rien ne dépasse de l'écran : les tableaux larges défilent dans leur cadre
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  });
}
