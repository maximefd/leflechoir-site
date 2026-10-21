import { expect, test } from "@playwright/test";

/**
 * Les listes de mots (`/mots`) : de 2 à 8 lettres, toutes au même format depuis le 20/10/2026 (un outil par longueur,
 * une page par initiale et par terminaison, avec la liste complète dans le HTML) ; 9 et 10 lettres, l'outil seul.
 * La recherche lit le motif de l'adresse (`?motif=`).
 */
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://leflechoir.fr").replace(/\/+$/, "");

const PETITES = [
  { slug: "deux-lettres", longueur: 2, mot: "LE", initiale: "l" },
  { slug: "trois-lettres", longueur: 3, mot: "EAU", initiale: "e" },
];

for (const { slug, longueur, mot, initiale } of PETITES) {
  test(`/mots/${slug} : l'outil, et la page de chaque initiale avec ses mots`, async ({ page }) => {
    await page.goto(`/mots/${slug}`);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Mot de ${longueur} lettres : trouve celui qui te manque`);
    await expect(page.getByLabel(/^Lettre \d+ sur /)).toHaveCount(longueur);

    await page.getByRole("main").getByRole("link", { name: `Mots de ${longueur} lettres commençant par ${initiale.toUpperCase()}`, exact: true }).first().click();

    await expect(page).toHaveURL(new RegExp(`/mots/${slug}/commencant-par-${initiale}$`));
    await expect(page.getByRole("main").getByText(mot, { exact: true }).first()).toBeVisible();
    // Aucune fréquence, aucune définition : seulement des mots
    await expect(page.getByText(/zipf|fréquence/i)).toHaveCount(0);
  });
}

test("la recherche lit le motif de l'adresse, en nettoyant ce qui n'est pas une lettre", async ({ page }) => {
  await page.goto("/search?motif=p%3F%3Fle%3Cb%3E");

  await expect(page.getByLabel("Motif à rechercher")).toHaveValue("P??LEB");
});

test("la recherche sans motif dans l'adresse reste vide", async ({ page }) => {
  await page.goto("/search");

  await expect(page.getByLabel("Motif à rechercher")).toHaveValue("");
});

test("/mots présente les outils de 2 à 10 lettres, et les pages par initiale et terminaison de 2 à 8", async ({ page }) => {
  await page.goto("/mots");

  const titres = await page.getByRole("main").locator("h3 a").evaluateAll((a) => a.map((l) => l.getAttribute("href")));
  expect(titres).toEqual([
    "/mots/deux-lettres", "/mots/trois-lettres", "/mots/quatre-lettres", "/mots/cinq-lettres", "/mots/six-lettres",
    "/mots/sept-lettres", "/mots/huit-lettres", "/mots/neuf-lettres", "/mots/dix-lettres",
  ]);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Listes de mots");
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: "Mots de 2 lettres commençant par A" })).toHaveAttribute(
    "href", "/mots/deux-lettres/commencant-par-a");
  await expect(main.getByRole("link", { name: "Mots de 5 lettres finissant par EZ" })).toHaveAttribute(
    "href", "/mots/cinq-lettres/finissant-par-ez");
  await expect(main.getByRole("link", { name: "Mots de 8 lettres finissant par ION" })).toHaveAttribute(
    "href", "/mots/huit-lettres/finissant-par-ion");
});

test("le pied de page mène à /mots, et /mots à chaque longueur", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Listes de mots" }).click();

  await expect(page).toHaveURL(/\/mots$/);
  await page.getByRole("link", { name: "Mot de 2 lettres", exact: true }).click();
  await expect(page).toHaveURL(/\/mots\/deux-lettres$/);
});

test("les listes de mots sont dans la rubrique Outils de l'en-tête", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("banner").getByRole("navigation", { name: "Rubriques" }).getByRole("link", { name: "Outils" }).click();

  await expect(page).toHaveURL(/\/outils$/);
  await page.getByRole("main").getByRole("link", { name: /^Listes de mots/ }).click();
  await expect(page).toHaveURL(/\/mots$/);
  // La rubrique reste allumée dans les pages qu'elle regroupe
  await expect(page.getByRole("banner").getByRole("link", { name: "Outils" })).toHaveAttribute("aria-current", "page");
});

test("les pages de mots sont dans le sitemap, après /mots, chaque outil suivi de ses combinaisons", async ({ request }) => {
  const body = await (await request.get("/sitemap.xml")).text();
  const urls = [...body.matchAll(/<loc>(.*?)<\/loc>/g)].map(([, url]) => url);

  const debut = urls.indexOf(`${SITE_URL}/mots`);
  expect(debut).toBeGreaterThan(-1);
  expect(urls.slice(debut, debut + 3)).toEqual([
    `${SITE_URL}/mots`, `${SITE_URL}/mots/deux-lettres`, `${SITE_URL}/mots/deux-lettres/commencant-par-a`,
  ]);
  expect(urls).toContain(`${SITE_URL}/mots/cinq-lettres/commencant-par-a`);
  expect(urls).toContain(`${SITE_URL}/mots/cinq-lettres/finissant-par-ez`);
  expect(urls).toContain(`${SITE_URL}/mots/six-lettres/finissant-par-eur`);
  // Les combinaisons suivent leur outil
  expect(urls.indexOf(`${SITE_URL}/mots/cinq-lettres/commencant-par-a`)).toBe(urls.indexOf(`${SITE_URL}/mots/cinq-lettres`) + 1);
});

test("le sitemap date les listes de mots (lastmod : la date de génération des listes)", async ({ request }) => {
  const body = await (await request.get("/sitemap.xml")).text();
  const entrees = new Map(
    [...body.matchAll(/<url>\s*<loc>(.*?)<\/loc>([\s\S]*?)<\/url>/g)].map(([, url, reste]) => [url, reste] as const),
  );

  for (const chemin of ["/mots", "/mots/cinq-lettres", "/mots/cinq-lettres/finissant-par-ez", "/mots/six-lettres/commencant-par-a", "/mots/deux-lettres", "/mots/huit-lettres"]) {
    expect(entrees.get(`${SITE_URL}${chemin}`), chemin).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}/);
  }
  // Un outil sans liste n'a pas de date inventée
  expect(entrees.get(`${SITE_URL}/mots/neuf-lettres`)).not.toContain("<lastmod>");
});
