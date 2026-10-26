import { readFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Les pages « Mots de 5 lettres commençant par A » et « … finissant par EZ » (et leurs sœurs de 6 lettres) : la liste
 * complète est dans le HTML (statique, indexable), groupée, en caractères normaux ; les cases sont déjà remplies du
 * motif ; dès qu'on les modifie, les résultats de l'API remplacent la liste. Chaque page a sa canonique, son titre
 * (60 caractères au plus), sa description unique, son fil d'Ariane, ses voisines. Aucune page vide n'existe.
 */
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://leflechoir.fr").replace(/\/+$/, "");

type EntreeCatalogue = { slug: string; total: number; initiales: { lettre: string; total: number }[]; terminaisons: { fin: string; total: number }[] };
const CATALOGUE: { listes: EntreeCatalogue[] } = JSON.parse(
  readFileSync(join(__dirname, "../src/content/mots/catalogue.json"), "utf-8"),
);
const liste = (slug: string) => CATALOGUE.listes.find((entree) => entree.slug === slug)!;

const EZ = "/mots/cinq-lettres/finissant-par-ez";
const A = "/mots/cinq-lettres/commencant-par-a";

test("la liste complète est dans le HTML, sans exécuter de script", async ({ request }) => {
  const html = await (await request.get(EZ)).text();

  // Les mots sont dans le document que reçoit un robot, avant tout JavaScript
  for (const mot of ["ALLEZ", "AIMEZ", "VENEZ"]) expect(html).toContain(`<span>${mot}</span>`);
  const mots = [...html.matchAll(/<li class="[^"]*break-inside-avoid[^"]*"><span>([A-Z]+)<\/span>/g)].map(([, mot]) => mot);
  expect(mots.length).toBe(liste("cinq-lettres").terminaisons.find((t) => t.fin === "EZ")!.total);
  for (const mot of mots) expect(mot).toMatch(/^[A-Z]{3}EZ$/);
  expect(new Set(mots).size).toBe(mots.length);
});

test("titre, liste groupée par initiale, mots en caractères normaux (pas de gras), nombre de mots annoncé", async ({ page }) => {
  await page.goto(EZ);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mots de 5 lettres finissant par EZ");
  const mots = page.locator("main section#la-liste ul[aria-label] li span");
  const textes = await mots.allTextContents();
  const attendu = liste("cinq-lettres").terminaisons.find((t) => t.fin === "EZ")!.total;
  expect(textes.length).toBe(attendu);
  await expect(page.getByRole("heading", { level: 2, name: `Les ${attendu} mots` })).toBeVisible();
  // Un groupe par initiale, dans l'ordre alphabétique
  const groupes = await page.locator("main section#la-liste h3").evaluateAll((h) => h.map((e) => e.textContent?.[0]));
  expect(groupes).toEqual([...groupes].sort());
  // Caractères normaux : ni gras (poids 400), ni police à chasse fixe
  const style = await mots.first().evaluate((e) => {
    const c = getComputedStyle(e);
    return { poids: Number(c.fontWeight), police: c.fontFamily };
  });
  expect(style.poids).toBeLessThanOrEqual(400);
  expect(style.police).not.toMatch(/mono/i);
  // Aucune fréquence ni définition
  await expect(page.getByText(/zipf|fréquence/i)).toHaveCount(0);
});

test("« commençant par » : groupé par deuxième lettre", async ({ page }) => {
  await page.goto(A);

  const titres = await page.locator("main section#la-liste h3").evaluateAll((h) => h.map((e) => e.textContent ?? ""));
  expect(titres.length).toBeGreaterThan(5);
  for (const titre of titres) expect(titre).toMatch(/^A[A-Z]\d+ mots?$/);
  // Chaque mot est dans le groupe de ses deux premières lettres
  const mots = await page.locator('main section[id^="groupe-"]').evaluateAll((sections) =>
    sections.map((section) => ({
      cle: section.id.replace("groupe-", ""),
      mots: [...section.querySelectorAll("ul li span")].map((e) => e.textContent ?? ""),
    })),
  );
  for (const { cle, mots: dedans } of mots) for (const mot of dedans) expect(mot.startsWith(`A${cle}`)).toBe(true);
  const total = mots.reduce((somme, groupe) => somme + groupe.mots.length, 0);
  expect(total).toBe(liste("cinq-lettres").initiales.find((i) => i.lettre === "A")!.total);
});

test("canonique, titre de 60 caractères au plus, description avec le nombre de mots, différente d'une page à l'autre", async ({ page }) => {
  const descriptions = new Set<string>();
  for (const chemin of [A, EZ, "/mots/six-lettres/finissant-par-eur", "/mots/six-lettres/commencant-par-b"]) {
    await page.goto(chemin);

    expect((await page.title()).length, chemin).toBeLessThanOrEqual(60);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${SITE_URL}${chemin}`);
    const description = (await page.locator('meta[name="description"]').getAttribute("content")) ?? "";
    expect(description).toMatch(/^\d+ mots de [56] lettres (commençant|finissant) par /);
    expect(description.length).toBeLessThanOrEqual(175);
    descriptions.add(description);
  }
  expect(descriptions.size).toBe(4);
  await page.goto(EZ);
  await expect(page).toHaveTitle("Mots de 5 lettres finissant par EZ | Le Fléchoir");
});

test("fil d'Ariane en données structurées : listes de mots, outil, page ; pas de FAQ sur une page de liste", async ({ page }) => {
  await page.goto(EZ);

  const json = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  expect(json["@graph"]).toEqual([
    expect.objectContaining({
      "@type": "BreadcrumbList",
      itemListElement: [
        expect.objectContaining({ position: 1, item: SITE_URL }),
        expect.objectContaining({ position: 2, name: "Listes de mots", item: `${SITE_URL}/mots` }),
        expect.objectContaining({ position: 3, name: "Mot de 5 lettres", item: `${SITE_URL}/mots/cinq-lettres` }),
        expect.objectContaining({ position: 4, name: "Mots de 5 lettres finissant par EZ", item: `${SITE_URL}${EZ}` }),
      ],
    }),
  ]);
});

test("maillage : avant et après, toutes les initiales et terminaisons, l'autre longueur, l'outil, l'index", async ({ page }) => {
  await page.goto("/mots/cinq-lettres/commencant-par-b");
  const main = page.getByRole("main");

  await expect(main.getByRole("link", { name: "Mots de 5 lettres commençant par A", exact: true }).first()).toHaveAttribute(
    "href", A);
  await expect(page.locator('a[rel="prev"]')).toHaveAttribute("href", A);
  await expect(page.locator('a[rel="next"]')).toHaveAttribute("href", "/mots/cinq-lettres/commencant-par-c");
  // La page où l'on est est marquée, sans lien
  await expect(main.locator('[aria-current="page"]').filter({ hasText: /^B$/ })).toBeVisible();
  await expect(main.getByRole("link", { name: "Mots de 5 lettres finissant par EZ", exact: true })).toHaveAttribute("href", EZ);
  await expect(main.getByRole("link", { name: "Mots de 6 lettres commençant par B" })).toHaveAttribute(
    "href", "/mots/six-lettres/commencant-par-b");
  await expect(main.getByRole("link", { name: "Mot de 5 lettres" }).first()).toHaveAttribute("href", "/mots/cinq-lettres");
  await expect(main.getByRole("link", { name: "Toutes les listes de mots" })).toHaveAttribute("href", "/mots");
  // Une lettre sans mot n'a pas de lien : une pastille par initiale du catalogue, sauf la page courante (sans lien)
  const initiales = await main.getByRole("link", { name: /^Mots de 5 lettres commençant par [A-Z]$/ }).count();
  expect(initiales).toBe(liste("cinq-lettres").initiales.length - 1);
});

test("aucune page vide : une combinaison sans mot est une 404", async ({ request }) => {
  const sans = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].filter((lettre) => !liste("cinq-lettres").initiales.some((i) => i.lettre === lettre));
  test.skip(sans.length === 0, "toutes les initiales ont des mots");
  for (const lettre of sans) {
    expect((await request.get(`/mots/cinq-lettres/commencant-par-${lettre.toLowerCase()}`)).status(), lettre).toBe(404);
  }
  expect((await request.get("/mots/cinq-lettres/finissant-par-zzz")).status()).toBe(404);
  expect((await request.get("/mots/cinq-lettres/nimportequoi")).status()).toBe(404);
});

test("les cases arrivent remplies du motif de la page, et la liste ne bouge pas tant qu'on n'y touche pas", async ({ page }) => {
  const appels: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/search")) appels.push(request.url());
  });
  await page.goto(EZ);

  for (const [i, lettre] of ["", "", "", "E", "Z"].entries()) {
    await expect(page.getByLabel(`Lettre ${i + 1} sur 5`, { exact: true })).toHaveValue(lettre);
  }
  await expect(page.locator("main section#la-liste")).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(appels).toEqual([]);
});

test("modifier une case remplace la liste statique par les résultats ; « Effacer » vide tout", async ({ page }) => {
  await page.goto(A);
  await expect(page.locator("main section#la-liste")).toBeVisible();

  await page.getByLabel("Lettre 2 sur 5").fill("l");

  const resultats = page.getByRole("list", { name: "Mots de 5 lettres pour AL???" });
  await expect(resultats).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("main section#la-liste")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${A}\\?motif=AL%3F%3F%3F$`));
  for (const mot of await resultats.getByRole("listitem").allTextContents()) expect(mot).toMatch(/^AL[A-Z]{3}$/);

  await page.getByRole("button", { name: "Effacer" }).click();

  await expect(page.getByLabel("Lettre 1 sur 5", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Lettre 2 sur 5", { exact: true })).toHaveValue("");
  await expect(page.locator("main section#la-liste")).toHaveCount(0);
  await expect(resultats).toHaveCount(0);
});

test("un lien partagé avec ?motif= ouvre directement les résultats à la place de la liste", async ({ page }) => {
  await page.goto(`${A}?motif=AB%3F%3F%3F`);

  await expect(page.getByRole("list", { name: "Mots de 5 lettres pour AB???" })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("main section#la-liste")).toHaveCount(0);
});

test("changer de longueur depuis une page de combinaison mène à la page de la longueur, ou change sur place", async ({ page }) => {
  await page.goto(A);
  const selecteur = page.getByRole("navigation", { name: "Nombre de lettres" });
  await selecteur.getByRole("button", { name: "Changer de longueur" }).click();

  await selecteur.getByRole("button", { name: "13 lettres" }).click();
  await expect(page.getByLabel(/^Lettre \d+ sur /)).toHaveCount(13);
  // La liste de 5 lettres ne vaut plus pour 13 : elle laisse la place
  await expect(page.locator("main section#la-liste")).toHaveCount(0);

  // Le sélecteur se replie quand la rangée change de taille : on le rouvre
  await selecteur.getByRole("button", { name: "Changer de longueur" }).click();
  await selecteur.getByRole("link", { name: "6 lettres" }).click();
  await expect(page).toHaveURL(/\/mots\/six-lettres$/);
});

test("signaler un mot de la liste : mode signalement, puis un clic envoie l'origine « mots »", async ({ page }) => {
  const envois: Record<string, unknown>[] = [];
  await page.route("**/api/suggestions", async (route) => {
    envois.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, contentType: "application/json", body: "{}" });
  });
  await page.goto(EZ);
  const premier = page.locator("main section#la-liste ul li").first();
  await expect(premier.getByRole("button")).toHaveCount(0);

  await page.getByRole("button", { name: "Signaler un mot" }).click();
  const mot = ((await premier.locator("span").textContent()) ?? "").trim();
  await premier.getByRole("button", { name: new RegExp(`Signaler « ${mot} »`) }).click();

  await expect.poll(() => envois).toEqual([{ kind: "remove", word: mot, source: "mots" }]);
});

test("« Il manque un mot ? Écris-moi » et l'invitation à jouer ou à créer, sous la liste", async ({ page }) => {
  await page.goto(EZ);

  await expect(page.getByRole("link", { name: "Écris-moi" })).toHaveAttribute("href", "/contact");
  const invitation = page.getByRole("complementary", { name: "Pour la suite" });
  await expect(invitation.getByRole("link", { name: "la grille du jour" })).toHaveAttribute(
    "href", "/jouer");
  await expect(invitation.getByRole("link", { name: "C’est guidé pas à pas" })).toHaveAttribute("href", "/grid");
});

test("deux pages voisines n'ont pas le même texte d'accroche", async ({ page }) => {
  const accroches = new Set<string>();
  for (const lettre of ["a", "b", "c", "d", "e", "f"]) {
    await page.goto(`/mots/cinq-lettres/commencant-par-${lettre}`);
    accroches.add(((await page.locator("main h1 + div").textContent()) ?? "").replace(/\bpar [A-Z]\b|\b[A-Z]\b/g, "_").replace(/\d+/g, "N").replace(/[A-Z]{5}/g, "MOT"));
  }
  expect(accroches.size).toBeGreaterThanOrEqual(4);
});

test("sans violation d'accessibilité, sur ordinateur et sur téléphone, avec ses 375 px sans défilement horizontal", async ({ page }) => {
  for (const [largeur, hauteur] of [[1280, 900], [375, 812]] as const) {
    await page.setViewportSize({ width: largeur, height: hauteur });
    await page.goto(EZ);
    await expect(page.locator("main section#la-liste")).toBeVisible();
    // « Resserrer la liste » apparaît en fondu : mesuré pendant le fondu, son contraste serait faux
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity));

    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("nextjs-portal").analyze();
    expect(violations.map((v) => ({ règle: v.id, éléments: v.nodes.map((n) => n.target.join(" ")) }))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(largeur);
  }
});
