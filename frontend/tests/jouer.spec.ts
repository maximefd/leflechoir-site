import { readFileSync, readdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

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
const nomDuMois = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const jourEnLettres = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).replace(/^1 /, "1er ");
const midi = (date: string) => new Date(`${date}T12:00:00+02:00`);
const plus = (date: string, jours: number) => new Date(midi(date).getTime() + jours * 86_400_000);

type Mot = { text: string; x: number; y: number; direction: "across" | "down" };

/** Remplit la grille d'une date avec sa solution (le JSON publié), mot après mot depuis la liste des définitions */
async function remplir(page: Page, date: string) {
  const mots: Mot[] = JSON.parse(readFileSync(`src/content/grilles/${date}.json`, "utf8")).response.grid.words;
  // L'ordre de la liste affichée (grid-player.tsx) : les horizontaux d'abord, de haut en bas puis de gauche à droite
  const ordre = [...mots].sort(
    (a, b) => Number(a.direction === "down") - Number(b.direction === "down") || a.y - b.y || a.x - b.x,
  );
  const remplies = new Set<string>();
  const boutons = page.getByRole("list", { name: "Les définitions" }).getByRole("button");
  for (const [i, mot] of ordre.entries()) {
    const cases = [...mot.text].map((_, k) => (mot.direction === "across" ? `${mot.x + k}-${mot.y}` : `${mot.x}-${mot.y + k}`));
    const debut = cases.findIndex((key) => !remplies.has(key));
    if (debut < 0) continue;
    await boutons.nth(i).click();
    await page.keyboard.type(mot.text.slice(debut));
    cases.forEach((key) => remplies.add(key));
  }
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/audience**", (route) => route.fulfill({ status: 204, body: "" }));
});

test("le stock épuisé : la page le dit, et propose de rejouer les grilles parues", async ({ page }) => {
  await page.clock.setFixedTime(plus(DERNIERE, 3));
  await page.goto("/jouer");

  await expect(page.getByTestId("grille-repli")).toHaveText(/La grille du jour arrive bientôt/);
  // Le calendrier, juste en dessous, s'ouvre sur le mois de la dernière grille
  const calendrier = page.getByRole("region", { name: "Les grilles parues" });
  await expect(calendrier.getByTestId("calendrier-mois")).toHaveText(new RegExp(nomDuMois(DERNIERE), "i"));
  await expect(calendrier.getByRole("link", { name: new RegExp(`^Mots fléchés du ${jourEnLettres(DERNIERE)}`) })).toHaveAttribute("href", `/jouer/${DERNIERE}`);
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
  // Toutes les grilles parues, mois par mois dans le calendrier
  for (const date of DATES.filter((date) => date <= aujourdhui())) expect(html, date).toContain(`href="/jouer/${date}"`);
  if (AVENIR) expect(html).not.toContain(`href="/jouer/${AVENIR}"`);
});

test("le calendrier passe d'un mois à l'autre, sans lien vers une grille à venir", async ({ page }) => {
  // La veille de la dernière grille du stock : les mois parus depuis le build s'ajoutent dans le navigateur, et la
  // dernière, à paraître le lendemain, n'y a pas de lien
  const jour = DATES[1];
  const parues = DATES.filter((date) => date <= jour);
  const mois = [...new Set(parues.map((date) => date.slice(0, 7)))];
  test.skip(mois.length < 2, "un seul mois de grilles");
  await page.clock.setFixedTime(midi(jour));
  await page.goto("/jouer");

  const calendrier = page.getByRole("region", { name: "Les grilles parues" });
  const titre = calendrier.getByTestId("calendrier-mois");
  await expect(titre).toHaveText(new RegExp(nomDuMois(parues[0]), "i"));
  await expect(calendrier.getByRole("button", { name: "Mois suivant" })).toBeDisabled();
  await calendrier.getByRole("button", { name: "Mois précédent" }).click();
  await expect(titre).toHaveText(new RegExp(nomDuMois(`${mois[1]}-15`), "i"));
  const visibles = calendrier.locator(`[data-mois="${mois[1]}"]`).getByRole("link");
  await expect(visibles).toHaveCount(parues.filter((date) => date.startsWith(mois[1])).length);
  await expect(page.locator(`a[href="/jouer/${DERNIERE}"]`)).toHaveCount(0);
});

test("une grille datée mène à la veille, au lendemain paru et au calendrier, ouvert sur son mois", async ({ page }) => {
  const parues = DATES.filter((date) => date <= aujourdhui());
  test.skip(parues.length < 3, "pas assez de grilles parues");
  const [lendemain, date, veille] = parues;
  await page.goto(`/jouer/${date}`);

  // En haut, près du titre : la veille et le lendemain
  const nav = page.getByRole("navigation", { name: "Les autres jours", exact: true });
  await expect(nav.getByRole("link", { name: `La grille du ${jourEnLettres(veille)}` })).toHaveAttribute("href", `/jouer/${veille}`);
  await expect(nav.getByRole("link", { name: `La grille du ${jourEnLettres(lendemain)}` })).toHaveAttribute("href", `/jouer/${lendemain}`);
  await expect(nav.getByRole("link", { name: "Toutes les grilles" })).toHaveAttribute("href", "#grilles-parues");

  // Le calendrier, sous la grille, entoure celle de la page et s'ouvre sur son mois
  const calendrier = page.getByRole("region", { name: "Les grilles parues" });
  await expect(calendrier.getByTestId("calendrier-mois")).toHaveText(new RegExp(nomDuMois(date), "i"));
  await expect(calendrier.locator(`a[href="/jouer/${date}"]`)).toHaveAttribute("aria-current", "page");

  // La grille la plus récente n'annonce pas le lendemain, qui n'est pas encore paru
  await page.goto(`/jouer/${lendemain}`);
  await expect(nav.getByRole("link", { name: /^La grille du / })).toHaveCount(1);
});

test("la plus ancienne grille a aussi son calendrier, ouvert sur son mois", async ({ page }) => {
  const premiere = DATES.at(-1)!;
  await page.goto(`/jouer/${premiere}`);

  const calendrier = page.getByRole("region", { name: "Les grilles parues" });
  await expect(calendrier.getByTestId("calendrier-mois")).toHaveText(new RegExp(nomDuMois(premiere), "i"));
  await expect(calendrier.locator(`a[href="/jouer/${premiere}"]`)).toHaveAttribute("aria-current", "page");
});

test("une grille réussie se coche dans le calendrier, et la série se compte", async ({ page }) => {
  const parues = DATES.filter((date) => date <= aujourdhui());
  test.skip(parues.length < 2, "pas assez de grilles parues");
  const [derniere, avant] = parues;
  // La veille est déjà réussie, comme le noterait le navigateur (lib/reussites.ts)
  await page.addInitScript((date) => {
    if (!localStorage.getItem("leflechoir.reussites")) {
      localStorage.setItem("leflechoir.reussites", JSON.stringify({ [date]: { ms: 200000, le: date } }));
    }
  }, avant);

  await page.goto(`/jouer/${avant}`);
  await expect(page.getByTestId("deja-reussie")).toHaveText("Réussie, en 3 min 20 s");

  // La plus récente, jouée jusqu'au bout avec sa solution (le JSON de la grille)
  await page.goto(`/jouer/${derniere}`);
  await expect(page.getByTestId("deja-reussie")).toHaveCount(0);
  await remplir(page, derniere);
  await expect(page.getByTestId("grid-end")).toContainText("Bravo, la grille est juste !");
  // Le panneau de fin vient à l'écran de lui-même, sans avoir à descendre
  await expect(page.getByTestId("grid-end")).toBeInViewport();
  await expect(page.getByTestId("serie")).toHaveText("2 grilles réussies d’affilée !");
  await expect(page.getByTestId("fin-compte")).toContainText("Cochée dans le calendrier de ce navigateur. Crée un compte");
  await expect(page.getByTestId("deja-reussie")).toBeVisible();

  await page.goto("/jouer");
  const calendrier = page.getByRole("region", { name: "Les grilles parues" });
  await expect(calendrier.getByTestId("progression")).toContainText("2 grilles réussies, dont les 2 dernières d’affilée");
  await expect(calendrier.getByRole("link", { name: "Crée un compte" })).toHaveAttribute("href", /^\/register\?next=%2Fjouer/);
  await expect(calendrier.locator(`a[href="/jouer/${derniere}"]`)).toHaveAttribute("data-reussie", "true");
  await expect(calendrier.locator(`a[href="/jouer/${avant}"]`)).toHaveAttribute("data-reussie", "true");
});

test("la solution montrée ne compte pas comme une réussite", async ({ page }) => {
  const [derniere] = DATES.filter((date) => date <= aujourdhui());
  await page.goto(`/jouer/${derniere}`);
  await page.getByRole("button", { name: "Voir la solution" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Abandonner" }).click();
  await expect(page.getByTestId("grid-end")).toContainText("Voici la solution.");

  await page.goto("/jouer");
  await expect(page.getByTestId("progression")).toContainText("Chaque grille réussie se coche ici.");
});

test("un coup d'œil sur la solution est une aide : la grille finie juste se coche quand même", async ({ page }) => {
  const [derniere] = DATES.filter((date) => date <= aujourdhui());
  await page.goto(`/jouer/${derniere}`);
  await page.getByRole("button", { name: "Voir la solution" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Regarder vite fait/ }).click();
  await page.getByRole("button", { name: "J’ai vu" }).click();
  await remplir(page, derniere);
  await expect(page.getByTestId("grid-end")).toContainText("Bravo, la grille est juste !");
  await expect(page.getByTestId("deja-reussie")).toBeVisible();

  await page.goto("/jouer");
  await expect(page.getByRole("region", { name: "Les grilles parues" }).locator(`a[href="/jouer/${derniere}"]`))
    .toHaveAttribute("data-reussie", "true");
});

test("avec un compte, les réussites du navigateur le rejoignent et se retrouvent sur un autre appareil", async ({ page, browser }) => {
  const parues = DATES.filter((date) => date <= aujourdhui());
  test.skip(parues.length < 2, "pas assez de grilles parues");
  const [derniere, avant] = parues;
  // Sans compte, la veille réussie dans ce navigateur
  await page.addInitScript((date) => {
    if (!sessionStorage.getItem("deja")) {
      sessionStorage.setItem("deja", "1");
      localStorage.setItem("leflechoir.reussites", JSON.stringify({ [date]: { ms: 200000, le: date } }));
    }
  }, avant);
  await page.goto(`/jouer/${derniere}`);

  // L'invitation de la fin de partie mène à l'inscription, qui ramène à la grille
  await remplir(page, derniere);
  await page.getByTestId("fin-compte").getByRole("link", { name: "Crée un compte" }).click();
  await expect(page).toHaveURL(new RegExp(`/register\\?next=%2Fjouer%2F${derniere}`));
  const email = `reussites_${Date.now()}@test.com`;
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill("TestPassword123");
  await page.getByRole("button", { name: "Créer un compte" }).click();
  await expect(page).toHaveURL(new RegExp(`/jouer/${derniere}$`));
  await expect(page.getByRole("region", { name: "Les grilles parues" }).getByTestId("progression-compte"))
    .toHaveText("Gardées avec ton compte, sur tous tes appareils.");

  // Un autre appareil : un navigateur neuf, la même personne
  const ailleurs = await browser.newContext();
  const telephone = await ailleurs.newPage();
  await telephone.route("**/api/audience**", (route) => route.fulfill({ status: 204, body: "" }));
  await telephone.goto("/login");
  await telephone.getByLabel("Email").fill(email);
  await telephone.getByLabel("Mot de passe").fill("TestPassword123");
  await telephone.getByRole("button", { name: /Se connecter/ }).click();
  await expect(telephone.getByTestId("logout-button")).toBeVisible();
  await telephone.goto("/jouer");
  const calendrier = telephone.getByRole("region", { name: "Les grilles parues" });
  await expect(calendrier.getByTestId("progression")).toContainText("2 grilles réussies, dont les 2 dernières d’affilée");
  await expect(calendrier.locator(`a[href="/jouer/${avant}"]`)).toHaveAttribute("data-reussie", "true");

  // Déconnecté, le navigateur les oublie : elles restent avec le compte
  await telephone.getByTestId("logout-button").click();
  await telephone.goto("/jouer");
  await expect(telephone.getByTestId("progression")).toContainText("Chaque grille réussie se coche ici.");
  await ailleurs.close();
});

test("dans les résultats de recherche, une grille datée donne envie : « gratuits » au titre, une de ses définitions en accroche", async ({ request }) => {
  const [date] = DATES.filter((d) => d <= aujourdhui());
  const html = await (await request.get(`/jouer/${date}`)).text();
  const titre = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
  const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
  const { clues } = JSON.parse(readFileSync(`src/content/grilles/${date}.json`, "utf8")) as { clues: Record<string, string> };

  expect(titre).toBe(`Mots fléchés gratuits du ${jourEnLettres(date)} | Le Fléchoir`);
  expect(titre.length).toBeLessThanOrEqual(60);
  // Une définition de la grille et la longueur de sa réponse, jamais la réponse elle-même
  const [mot, definition] = Object.entries(clues).find(([, d]) => d.trim().split(/\s+/).length > 2)!;
  expect(description).toContain(`« ${definition.trim().replace(/'/g, "&#x27;")} », en ${mot.length} lettres ?`);
  expect(description).not.toContain(mot);
  expect(description).toContain("Gratuit, sans inscription");
  expect(description.replace(/&#x27;/g, "'").length).toBeLessThanOrEqual(160);
});
