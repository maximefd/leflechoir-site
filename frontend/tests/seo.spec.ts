import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Référencement (#113) : les pages publiques ont un titre, une description, une canonique et un aperçu de
 * partage ; les pages privées sont en `noindex` ; robots.txt et le sitemap sont servis.
 *
 * L'adresse attendue est celle du site (src/config/site.ts), sauf si NEXT_PUBLIC_SITE_URL la remplace.
 */
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://leflechoir.fr").replace(/\/+$/, "");

/**
 * Les pages « commençant par » et « finissant par » des longueurs qui en ont : les effectifs du catalogue
 * (`make listes`) disent lesquelles existent. Initiales d'abord, puis terminaisons, comme dans le sitemap.
 */
const CATALOGUE: {
  listes: { slug: string; initiales: { lettre: string; total: number }[]; terminaisons: { fin: string; total: number }[] }[];
} = JSON.parse(
  readFileSync(join(__dirname, "../src/content/mots/catalogue.json"), "utf-8"),
);
const combinaisons = (slug: string) => {
  const liste = CATALOGUE.listes.find((entree) => entree.slug === slug);
  return [
    // Moins de cinq mots : la page existe, mais hors du sitemap (MIN_MOTS_INDEXES)
    ...(liste?.initiales ?? []).filter(({ total }) => total >= 5)
      .map(({ lettre }) => `${SITE_URL}/mots/${slug}/commencant-par-${lettre.toLowerCase()}`),
    ...(liste?.terminaisons ?? []).filter(({ total }) => total >= 5)
      .map(({ fin }) => `${SITE_URL}/mots/${slug}/finissant-par-${fin.toLowerCase()}`),
  ];
};
const NOMBRES = ["deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix"];

const PUBLIC_PAGES = [
  { path: "/", title: "Le Fléchoir — créer des mots fléchés de pro, simplement", canonical: SITE_URL },
  { path: "/search", title: "Recherche de mots | Le Fléchoir", canonical: `${SITE_URL}/search` },
  { path: "/grid", title: "Générer une grille | Le Fléchoir", canonical: `${SITE_URL}/grid` },
  {
    path: "/creer-des-mots-fleches",
    title: "Comment créer des mots fléchés : de l’idée à la grille | Le Fléchoir",
    canonical: `${SITE_URL}/creer-des-mots-fleches`,
  },
  { path: "/jouer", title: "Mots fléchés du jour, gratuits et en ligne | Le Fléchoir", canonical: `${SITE_URL}/jouer` },
  { path: "/articles", title: "Articles sur les mots fléchés | Le Fléchoir", canonical: `${SITE_URL}/articles` },
  { path: "/mots", title: "Listes de mots pour les mots fléchés | Le Fléchoir", canonical: `${SITE_URL}/mots` },
  ...[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({
    path: `/mots/${NOMBRES[n - 2]}-lettres`,
    title:
      n <= 3
        ? `Mots de ${n} lettres pour les mots fléchés | Le Fléchoir`
        : n === 10
          ? "Mot de 10 lettres commençant ou finissant par | Le Fléchoir"
          : `Mot de ${n} lettres commençant par, finissant par | Le Fléchoir`,
    canonical: `${SITE_URL}/mots/${NOMBRES[n - 2]}-lettres`,
  })),
  { path: "/a-propos", title: "Qui fait Le Fléchoir | Le Fléchoir", canonical: `${SITE_URL}/a-propos` },
  { path: "/contact", title: "Contact | Le Fléchoir", canonical: `${SITE_URL}/contact` },
  { path: "/legal", title: "Mentions légales | Le Fléchoir", canonical: `${SITE_URL}/legal` },
  { path: "/privacy", title: "Confidentialité | Le Fléchoir", canonical: `${SITE_URL}/privacy` },
  { path: "/terms", title: "Conditions d'utilisation | Le Fléchoir", canonical: `${SITE_URL}/terms` },
];

const PRIVATE_PAGES = ["/admin", "/account", "/grids", "/grids/new", "/grids/edit?id=1", "/dictionaries", "/login", "/register",
  "/forgot-password", "/reset-password", "/verify-email"];

for (const { path, title, canonical } of PUBLIC_PAGES) {
  test(`${path} : indexable, avec titre, description, canonique et aperçu`, async ({ page }) => {
    await page.goto(path);

    await expect(page).toHaveTitle(title);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.{50,}/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", canonical);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", `${SITE_URL}/og.png`);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    expect(await page.title()).not.toContain("Terminator");
  });
}

for (const path of PRIVATE_PAGES) {
  test(`${path} : en noindex, sans canonique`, async ({ page }) => {
    await page.goto(path);

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  });
}

test("l'accueil décrit l'application et ses questions fréquentes en données structurées", async ({ page }) => {
  await page.goto("/");

  const json = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  expect(json["@graph"][0]).toMatchObject({ "@type": "WebApplication", name: "Le Fléchoir", url: SITE_URL });
  // La FAQ des données structurées est celle qui s'affiche : mêmes questions, même ordre
  const faq = json["@graph"][1];
  expect(faq["@type"]).toBe("FAQPage");
  const affichees = await page.getByRole("region", { name: "Questions fréquentes" }).locator("dt").allTextContents();
  expect(affichees.length).toBeGreaterThanOrEqual(6);
  expect(faq.mainEntity.map((q: { name: string }) => q.name)).toEqual(affichees);
  expect(affichees).toContain("Comment créer des mots fléchés gratuitement ?");
});

test("robots.txt ouvre tout le site, sauf les listes de mots aux robots d'entraînement, et donne le sitemap", async ({ request }) => {
  const body = await (await request.get("/robots.txt")).text();

  expect(body).toContain("Allow: /");
  // Seule interdiction : /mots/ pour les robots qui aspirent des textes pour entraîner des IA (15/10/2026)
  expect(body.match(/Disallow: .*/g)).toEqual(["Disallow: /mots/"]);
  expect(body).toContain("User-Agent: GPTBot");
  const tousLesRobots = body.split(/\n\s*\n/).find((bloc) => bloc.includes("User-Agent: *")) ?? "";
  expect(tousLesRobots).not.toContain("Disallow");
  expect(body).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  // Le poste de pilotage n'y est jamais cité (ADR 0016) : il porte noindex, en balise et en X-Robots-Tag
  expect(body).not.toContain("admin");
});

test("le sitemap liste les pages publiques, et elles seules", async ({ request }) => {
  const body = await (await request.get("/sitemap.xml")).text();
  const urls = [...body.matchAll(/<loc>(.*?)<\/loc>/g)].map(([, url]) => url);

  // Les grilles à jouer (ADR 0026) : une page par date parue, de la plus récente à la plus ancienne,
  // telles que produites dans src/content/grilles
  // Seulement celles déjà parues : une grille à venir n'est pas donnée aux moteurs avant son jour (heure de Paris)
  const jour = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
  const dates = readdirSync("src/content/grilles")
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .map((file) => file.replace(/\.json$/, ""))
    .filter((date) => date <= jour)
    .sort((a, b) => b.localeCompare(a));

  // Les pages, puis les articles publiés (les brouillons restent dehors), puis les grilles à jouer
  // (les pages « commençant par » et « finissant par » suivent l'outil de leur longueur)
  const attendues = PUBLIC_PAGES.flatMap(({ canonical }) => {
    const slug = canonical.match(/\/mots\/((?:deux|trois|quatre|cinq|six|sept|huit)-lettres)$/)?.[1];
    return slug ? [canonical, ...combinaisons(slug)] : [canonical];
  });
  expect(urls).toEqual([
    ...attendues,
    `${SITE_URL}/articles/mots-fleches-dans-le-monde`,
    ...dates.map((date) => `${SITE_URL}/jouer/${date}`),
  ]);
});

test("llms.txt présente le site aux assistants IA : ses outils, ses pages et sa FAQ, avec des adresses absolues", async ({ request }) => {
  const response = await request.get("/llms.txt");

  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("text/plain");
  const body = await response.text();
  expect(body.startsWith("# Le Fléchoir\n\n> ")).toBe(true);
  expect(body).toContain(`(${SITE_URL}/grid)`);
  expect(body).toContain(`(${SITE_URL}/articles/mots-fleches-dans-le-monde)`);
  expect(body).toContain(`(${SITE_URL}/mots/cinq-lettres)`);
  expect(body).toContain("### Comment créer des mots fléchés gratuitement ?");
  // Que des liens vers le site lui-même, aucun brouillon
  for (const [, url] of body.matchAll(/\]\((.*?)\)/g)) expect(url.startsWith(`${SITE_URL}/`), url).toBe(true);
  expect(body).not.toContain("ecrire-une-definition-de-mots-fleches");
});

test("la page « Qui fait le site » se trouve depuis le pied de page, avec ses données structurées", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Qui fait le site" }).click();

  await expect(page).toHaveURL(/\/a-propos$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Qui fait Le Fléchoir");
  const json = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  expect(json).toMatchObject({ "@type": "AboutPage", about: { "@type": "Organization", name: "Le Fléchoir", url: SITE_URL } });
});

test("l'image de partage est un PNG", async ({ request }) => {
  const response = await request.get("/og.png");

  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("image/png");
});

test("security.txt donne l'adresse des failles et une date d'expiration de moins d'un an", async ({ request }) => {
  const response = await request.get("/.well-known/security.txt");
  const body = await response.text();

  expect(response.headers()["content-type"]).toContain("text/plain");
  expect(body).toContain("Contact: mailto:securite@leflechoir.fr");
  const expires = Date.parse(body.match(/^Expires: (.+)$/m)?.[1] ?? "");
  expect(expires - Date.now()).toBeGreaterThan(0);
  expect(expires - Date.now()).toBeLessThan(365 * 24 * 60 * 60 * 1000);
});

test("la page contact donne les deux adresses, et le pied de page y mène", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Contact" }).click();

  await expect(page).toHaveURL(/\/contact$/);
  await expect(page.getByRole("link", { name: "contact@leflechoir.fr" })).toHaveAttribute(
    "href", "mailto:contact@leflechoir.fr");
  await expect(page.getByRole("link", { name: "securite@leflechoir.fr" })).toHaveAttribute(
    "href", "mailto:securite@leflechoir.fr");
});

test("les pages publiques ne renvoient plus vers GitHub, qui deviendra privé", async ({ page }) => {
  for (const { path } of PUBLIC_PAGES) {
    await page.goto(path);
    await expect(page.locator('a[href*="github.com"]'), path).toHaveCount(0);
  }
});

test("une adresse inconnue répond en français", async ({ page }) => {
  await page.goto("/page-inexistante");

  await expect(page.getByRole("heading", { name: "Cette page n'existe pas" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Retour à l'accueil" })).toBeVisible();
});
