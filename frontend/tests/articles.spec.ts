import { expect, test } from "@playwright/test";

/**
 * Les articles : la liste, la petite grille à jouer au clavier et au toucher, la force notée
 * de 1 à 6, les données structurées, et les brouillons tenus hors des moteurs.
 *
 * Ces parcours visent l'article publié : la CI construit le site sans les brouillons. La note de force
 * demande l'API.
 */
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://leflechoir.fr").replace(/\/+$/, "");
// L'article publié : il se lit partout, en développement comme au build (la CI construit sans les brouillons)
const SLUG = "mots-fleches-dans-le-monde";
const TITLE = "Mots fléchés, mots croisés, Schwedenrätsel : le jeu dans le monde";
const GRID = "Une grille qui voyage un peu";
const DRAFT = "ecrire-une-definition-de-mots-fleches";

test("le pied de page mène à la liste, qui montre le guide et l'article publié", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Articles" }).click();

  await expect(page).toHaveURL(/\/articles$/);
  await expect(page.getByRole("link", { name: "Comment créer des mots fléchés : de l’idée à la grille" })).toBeVisible();
  const item = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: TITLE }) });
  await expect(item.getByText(/\d+ min de lecture/)).toBeVisible();
  await expect(item.getByText("Brouillon")).toHaveCount(0);
});

test("un article publié est indexable, dans le sitemap, avec ses données structurées", async ({ page, request }) => {
  await page.goto(`/articles/${SLUG}`);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(TITLE);
  await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${SITE_URL}/articles/${SLUG}`);
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
  await expect(page.getByRole("navigation", { name: "Sommaire" })).toBeVisible();

  const json = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  expect(json["@graph"]).toEqual([
    expect.objectContaining({ "@type": "Article", headline: TITLE, inLanguage: "fr", url: `${SITE_URL}/articles/${SLUG}` }),
    expect.objectContaining({
      "@type": "BreadcrumbList",
      itemListElement: [
        expect.objectContaining({ position: 1, item: SITE_URL }),
        expect.objectContaining({ position: 2, item: `${SITE_URL}/articles` }),
        expect.objectContaining({ position: 3, name: TITLE }),
      ],
    }),
  ]);

  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain(`${SITE_URL}/articles/${SLUG}</loc>`);
  expect(sitemap).not.toContain(DRAFT);
});

test("un brouillon reste en noindex, hors du sitemap", async ({ page }) => {
  await page.goto(`/articles/${DRAFT}`);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("la petite grille se joue au clavier : lettres, Retour arrière, Entrée, solution", async ({ page }) => {
  await page.goto(`/articles/${SLUG}`);
  const game = page.getByRole("figure", { name: GRID });
  const clue = game.getByTestId("mini-grid-clue");
  const status = game.getByRole("status");
  const input = game.getByLabel("Lettre à écrire dans la grille");

  await input.focus();
  await expect(clue).toHaveText(/\(\d+ lettres?\)$/);
  const first = await clue.textContent();
  // Aucun mot de la grille ne commence par X : une erreur sûre
  await input.pressSequentially("x");
  await game.getByRole("button", { name: "Vérifier" }).click();
  await expect(status).toHaveText("1 lettre à revoir, soulignée en rouge.");

  await input.focus();
  await input.press("Backspace");
  await game.getByRole("button", { name: "Vérifier" }).click();
  await expect(status).toHaveText(/^Aucune erreur pour l’instant\. Il reste \d+ cases à remplir\.$/);

  await input.focus();
  await input.press("Enter");
  await expect(clue).not.toHaveText(first ?? "");

  await game.getByRole("button", { name: "Voir la solution" }).click();
  await expect(status).toHaveText("Voici la solution.");
  await game.getByRole("button", { name: "Vérifier" }).click();
  await expect(status).toHaveText("Bravo, la grille est juste !");
});

test("au toucher, une case définition choisit son mot, et une case touchée deux fois change de sens", async ({ page }) => {
  await page.goto(`/articles/${SLUG}`);
  const game = page.getByRole("figure", { name: GRID });
  const clue = game.getByTestId("mini-grid-clue");
  const svg = game.locator("svg").first();
  await svg.scrollIntoViewIfNeeded();
  const box = (await svg.boundingBox())!;
  // viewBox de 705 unités pour 7 cases de 100, décalée de 2,5 : le centre de la case (x, y)
  const tap = (x: number, y: number) =>
    page.mouse.click(box.x + ((x * 100 + 52.5) / 705) * box.width, box.y + ((y * 100 + 52.5) / 705) * box.height);

  await tap(5, 3);
  await expect(clue).toHaveText("Autrement appelé (3 lettres)");
  await tap(4, 2);
  await expect(clue).toHaveText("Secrets ou de la circulation (6 lettres)");
  await tap(4, 2);
  await expect(clue).toHaveText("Se donne au chat (6 lettres)");
});

test("les définitions se lisent en clair sous la grille, et chacune choisit son mot", async ({ page }) => {
  await page.goto(`/articles/${SLUG}`);
  const game = page.getByRole("figure", { name: GRID });
  const list = game.getByRole("list", { name: "Les définitions" });
  await expect(list.getByRole("listitem")).toHaveCount(16);
  await list.getByRole("button", { name: /Se donne au chat/ }).click();
  await expect(game.getByTestId("mini-grid-clue")).toHaveText("Se donne au chat (6 lettres)");
});

test("le lecteur note la force de la grille, et voit la moyenne", async ({ page }) => {
  await page.goto(`/articles/${SLUG}`);
  const summary = page.getByTestId("force-summary");
  await expect(summary).toHaveText(/Pas encore d’avis|Force moyenne/);

  await page.getByRole("button", { name: "Force 4 sur 6" }).click();

  await expect(page.getByRole("button", { name: "Force 4 sur 6" })).toHaveAttribute("aria-pressed", "true");
  await expect(summary).toHaveText(/^Merci, c’est noté\. Force moyenne : \d,\d sur 6, \d+ avis$/);
});
