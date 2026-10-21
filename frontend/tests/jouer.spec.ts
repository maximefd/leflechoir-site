import { readdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * La grille du jour et les grilles datées (ADR 0026), quand le calendrier ne suit pas le stock :
 * - le stock épuisé, `/jouer` le dit et propose les grilles parues, au lieu de faire passer une ancienne pour celle
 *   du jour ;
 * - une grille à venir ne se voit pas avant son jour, ni dans le sitemap, ni sur sa page ;
 * - le jour venu, sa page la charge, sans qu'il faille redéployer.
 * L'horloge du navigateur est fixée (`page.clock`) ; le jour se lit à Paris.
 */
const DATES = readdirSync("src/content/grilles")
  .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
  .map((file) => file.replace(/\.json$/, ""))
  .sort((a, b) => b.localeCompare(a));
const DERNIERE = DATES[0];
const aujourdhui = () => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
const AVENIR = DATES.filter((date) => date > aujourdhui()).at(-1);
const midi = (date: string) => new Date(`${date}T12:00:00+02:00`);
const plus = (date: string, jours: number) => new Date(midi(date).getTime() + jours * 86_400_000);

test.beforeEach(async ({ page }) => {
  await page.route("**/api/audience**", (route) => route.fulfill({ status: 204, body: "" }));
});

test("le stock épuisé : la page le dit, et propose de rejouer les grilles parues", async ({ page }) => {
  await page.clock.setFixedTime(plus(DERNIERE, 3));
  await page.goto("/jouer");

  await expect(page.getByTestId("grille-repli")).toHaveText(/La grille du jour arrive bientôt/);
  // Les quatorze plus récentes, juste en dessous
  const liens = page.getByRole("region", { name: "Les grilles parues" }).getByRole("link");
  await expect(liens).toHaveCount(Math.min(DATES.length, 14));
  await expect(liens.first()).toHaveAttribute("href", `/jouer/${DERNIERE}`);
  // Aucune grille ne se fait passer pour celle du jour
  await expect(page.locator("svg[role=img]")).toHaveCount(0);
});

test("une grille à venir ne se voit pas avant son jour : ni sa page, ni le sitemap", async ({ page, request }) => {
  test.skip(!AVENIR, "aucune grille à venir dans le stock");
  await page.goto(`/jouer/${AVENIR}`);

  await expect(page.getByText(/Cette grille paraîtra le/)).toBeVisible();
  await expect(page.locator("svg[role=img]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Voir la solution" })).toHaveCount(0);
  expect(await (await request.get("/sitemap.xml")).text()).not.toContain(`/jouer/${AVENIR}<`);
});

test("le jour venu, la page de la grille la charge, sans redéployer", async ({ page }) => {
  test.skip(!AVENIR, "aucune grille à venir dans le stock");
  await page.clock.setFixedTime(midi(AVENIR!));
  await page.goto(`/jouer/${AVENIR}`);

  await expect(page.locator("svg[role=img]").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Voir la solution" })).toBeVisible();
});

test("/jouer, le jour d'une grille : c'est elle qui se joue", async ({ page }) => {
  await page.clock.setFixedTime(midi(DERNIERE));
  await page.goto("/jouer");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(new RegExp(`^Mots fléchés du `));
  await expect(page.locator("svg[role=img]").first()).toBeVisible();
});

test("/jouer écrit dans sa page, avant tout script, ce qu'on y trouve et les grilles parues", async ({ request }) => {
  // Ce que lit un moteur avant d'exécuter la page : la présentation de la rubrique et les liens vers l'archive
  const html = await (await request.get("/jouer")).text();
  expect(html).toContain("Une grille par jour");
  const parues = DATES.filter((date) => date <= aujourdhui()).slice(0, 14);
  for (const date of parues) expect(html, date).toContain(`href="/jouer/${date}"`);
  if (AVENIR) expect(html).not.toContain(`href="/jouer/${AVENIR}"`);
});
