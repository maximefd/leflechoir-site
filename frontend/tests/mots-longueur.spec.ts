import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * « Mot de N lettres » (`/mots/cinq-lettres`) : l'outil de qui est bloqué dans une grille. Une rangée de cases (les
 * lettres connues, les autres vides), « Chercher » qui affiche les mots sur la page même (API de recherche), des
 * boutons « commençant par » et « finissant par » qui remplissent les cases, le motif dans l'adresse (`?motif=`) et
 * une FAQ en données structurées. La page est statique : sans motif, aucun appel d'API à l'ouverture.
 */
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://leflechoir.fr").replace(/\/+$/, "");
const PAGE = "/mots/cinq-lettres";

test("la page : titre, rangée de 5 cases, chacune de 48 px au moins et étiquetée", async ({ page }) => {
  await page.goto(PAGE);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mot de 5 lettres : trouve celui qui te manque");
  for (let i = 1; i <= 5; i++) {
    const box = await page.getByLabel(`Lettre ${i} sur 5`, { exact: true }).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(48);
    expect(box?.height).toBeGreaterThanOrEqual(48);
  }
  await expect(page.getByLabel(/^Lettre \d sur 5$/)).toHaveCount(5);
  // L'outil est en haut : la première case est visible sans défiler
  await expect(page.getByLabel("Lettre 1 sur 5")).toBeInViewport();
  // Pas de liste de mots sur la page
  await expect(page.locator("main ul[aria-label]")).toHaveCount(0);
});

test("ouvrir la page ne fait aucun appel à l'API ; taper une lettre la lance seule, sans cliquer", async ({ page }) => {
  const appels: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/search")) appels.push(request.postData() ?? "");
  });

  await page.goto(PAGE);
  await page.waitForLoadState("networkidle");
  expect(appels).toEqual([]);

  // La recherche se met à jour pendant qu'on tape : aucun clic sur « Chercher »
  await page.getByLabel("Lettre 1 sur 5").fill("P");
  await expect(page.getByRole("list", { name: "Mots de 5 lettres pour P????" })).toBeVisible({ timeout: 20_000 });
  expect(appels.length).toBe(1);
  expect(JSON.parse(appels[0]).mask).toBe("P????");
});

test("la frappe rapide ne lance qu'une recherche : le délai anti-rebond (300 ms) attend la dernière lettre", async ({ page }) => {
  const appels: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/search")) appels.push(JSON.parse(request.postData() ?? "{}").mask);
  });
  await page.goto(PAGE);

  await page.getByLabel("Lettre 1 sur 5").click();
  await page.keyboard.type("pl", { delay: 30 });
  await expect(page.getByRole("list", { name: "Mots de 5 lettres pour PL???" })).toBeVisible({ timeout: 20_000 });

  expect(appels).toEqual(["PL???"]);
});

test("changer une lettre met la liste à jour, sans « Chercher »", async ({ page }) => {
  await page.goto(`${PAGE}?motif=P%3F%3F%3F%3F`);
  await expect(page.getByRole("list", { name: "Mots de 5 lettres pour P????" })).toBeVisible({ timeout: 20_000 });

  await page.getByLabel("Lettre 5 sur 5").fill("e");

  await expect(page.getByRole("list", { name: "Mots de 5 lettres pour P???E" })).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(new RegExp(`${PAGE}\\?motif=P%3F%3F%3FE$`));
});

test("vider toutes les cases à la main efface les résultats et le motif de l'adresse", async ({ page }) => {
  await page.goto(`${PAGE}?motif=P%3F%3F%3F%3F`);
  await expect(page.getByRole("list", { name: "Mots de 5 lettres pour P????" })).toBeVisible({ timeout: 20_000 });

  await page.getByLabel("Lettre 1 sur 5").fill("");

  await expect(page.getByRole("list", { name: /^Mots de 5 lettres pour / })).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${PAGE}$`));
});

test("taper deux lettres puis « Chercher » affiche les mots sur la page, avec le motif dans l'adresse", async ({ page }) => {
  await page.goto(PAGE);

  // Le clavier : P dans la première case, la saisie passe seule à la suivante (vide), E dans la dernière
  await page.getByLabel("Lettre 1 sur 5").click();
  await page.keyboard.type("p");
  await expect(page.getByLabel("Lettre 2 sur 5")).toBeFocused();
  await page.getByLabel("Lettre 5 sur 5").fill("é");
  await expect(page.getByLabel("Lettre 5 sur 5")).toHaveValue("E");
  await page.getByRole("button", { name: "Chercher" }).click();

  await expect(page).toHaveURL(new RegExp(`${PAGE}\\?motif=P%3F%3F%3FE$`));
  const resultats = page.getByRole("list", { name: "Mots de 5 lettres pour P???E" });
  await expect(resultats).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByRole("heading", { level: 2, name: /^(\d+ mots?|Les \d+ premiers mots) pour P\?\?\?E$/ }),
  ).toBeVisible();
  const mots = await resultats.getByRole("listitem").allTextContents();
  expect(mots.length).toBeGreaterThan(0);
  for (const mot of mots) expect(mot).toMatch(/^P[A-Z]{3}E$/);
  // Plus de lien vers la recherche complète : outil des créateurs, autre public (retour de l'auteur du 08/10/2026)
  await expect(page.getByRole("link", { name: "Ouvrir dans la recherche complète" })).toHaveCount(0);
  // On est toujours sur la page
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("clavier : passage à la case suivante, Retour arrière, flèches, Entrée", async ({ page }) => {
  await page.goto(PAGE);
  const cases = [1, 2, 3, 4, 5].map((i) => page.getByLabel(`Lettre ${i} sur 5`, { exact: true }));

  await cases[0].click();
  await page.keyboard.type("ab");
  await expect(cases[0]).toHaveValue("A");
  await expect(cases[1]).toHaveValue("B");
  await expect(cases[2]).toBeFocused();

  // Retour arrière sur une case vide : on revient en arrière et on efface la lettre d'avant
  await page.keyboard.press("Backspace");
  await expect(cases[1]).toHaveValue("");
  await expect(cases[1]).toBeFocused();
  // Retour arrière sur une case pleine : elle se vide
  await page.keyboard.type("c");
  await expect(cases[1]).toHaveValue("C");
  await cases[1].focus();
  await page.keyboard.press("Backspace");
  await expect(cases[1]).toHaveValue("");

  await page.keyboard.press("ArrowRight");
  await expect(cases[2]).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(cases[0]).toBeFocused();
  // Rien au-delà de la première case
  await page.keyboard.press("ArrowLeft");
  await expect(cases[0]).toBeFocused();

  // Retaper sur une case pleine remplace la lettre
  await page.keyboard.type("z");
  await expect(cases[0]).toHaveValue("Z");

  // Entrée lance la recherche, sur la page même
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`${PAGE}\\?motif=Z%3F%3F%3F%3F$`));
  await expect(page.getByRole("list", { name: "Mots de 5 lettres pour Z????" })).toBeVisible({ timeout: 20_000 });
});

test("un mot collé remplit les cases", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(PAGE);
  await page.evaluate(() => navigator.clipboard.writeText("plâne"));
  await page.getByLabel("Lettre 1 sur 5").click();
  await page.keyboard.press("ControlOrMeta+v");

  for (const [i, lettre] of [..."PLANE"].entries()) {
    await expect(page.getByLabel(`Lettre ${i + 1} sur 5`, { exact: true })).toHaveValue(lettre);
  }
});

test("« Chercher » sans aucune lettre demande d'en taper une, sans quitter la page", async ({ page }) => {
  await page.goto(PAGE);

  await page.getByRole("button", { name: "Chercher" }).click();

  await expect(page.getByRole("main").getByRole("alert")).toContainText("Tape au moins une lettre");
  await expect(page).toHaveURL(new RegExp(`${PAGE}$`));
  await expect(page.getByLabel("Lettre 1 sur 5")).toBeFocused();
});

test("« Effacer » vide les cases", async ({ page }) => {
  await page.goto(PAGE);
  await page.getByLabel("Lettre 1 sur 5").click();
  await page.keyboard.type("abc");

  await page.getByRole("button", { name: "Effacer" }).click();

  for (let i = 1; i <= 5; i++) await expect(page.getByLabel(`Lettre ${i} sur 5`, { exact: true })).toHaveValue("");
});

test("« Effacer » retire aussi les mots trouvés et le motif de l'adresse", async ({ page }) => {
  await page.goto(`${PAGE}?motif=C????`);
  await expect(page.getByRole("list", { name: "Mots de 5 lettres pour C????" })).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Effacer" }).click();

  await expect(page.getByRole("list", { name: /^Mots de 5 lettres pour / })).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${PAGE}$`));
});

test("hub de 5 lettres : des liens vers les pages « commençant par » et « finissant par », pas de boutons", async ({ page }) => {
  await page.goto(PAGE);
  const main = page.getByRole("main");

  await expect(main.getByRole("heading", { level: 2, name: "Mots de 5 lettres commençant par…" })).toBeVisible();
  await expect(main.getByRole("heading", { level: 2, name: "Mots de 5 lettres finissant par…" })).toBeVisible();
  // Une page par initiale qui a des mots (jamais une page vide : pas les 26 lettres), et les terminaisons
  const initiales = await main.getByRole("link", { name: /^Mots de 5 lettres commençant par / }).count();
  expect(initiales).toBeGreaterThanOrEqual(20);
  expect(initiales).toBeLessThanOrEqual(26);
  await expect(main.getByRole("link", { name: "Mots de 5 lettres commençant par A" })).toHaveAttribute(
    "href", `${PAGE}/commencant-par-a`);
  await expect(main.getByRole("link", { name: "Mots de 5 lettres finissant par EZ", exact: true })).toHaveAttribute(
    "href", `${PAGE}/finissant-par-ez`);
  expect(await main.getByRole("link", { name: /^Mots de 5 lettres finissant par / }).count()).toBeGreaterThanOrEqual(10);
  await expect(main.getByRole("button", { name: /^Mots de 5 lettres (commençant|finissant) par / })).toHaveCount(0);
});

// Depuis le 20/10/2026, 2 à 8 lettres ont leurs pages par initiale et terminaison ; 9 et 10 gardent les boutons
test("hub de 9 lettres : des boutons « commençant par » qui remplissent les cases et affichent les mots", async ({ page }) => {
  await page.goto("/mots/neuf-lettres");
  const main = page.getByRole("main");
  await expect(main.getByRole("button", { name: /^Mots de 9 lettres commençant par / })).toHaveCount(26);

  await main.getByRole("button", { name: "Mots de 9 lettres commençant par C" }).click();

  await expect(page.getByLabel("Lettre 1 sur 9", { exact: true })).toHaveValue("C");
  for (const i of [2, 5, 9]) await expect(page.getByLabel(`Lettre ${i} sur 9`, { exact: true })).toHaveValue("");
  await expect(page).toHaveURL(/\/mots\/neuf-lettres\?motif=C(%3F){8}$/);
  const liste = page.getByRole("list", { name: "Mots de 9 lettres pour C????????" });
  await expect(liste).toBeVisible({ timeout: 20_000 });
  const mots = await liste.getByRole("listitem").allTextContents();
  expect(mots.length).toBeGreaterThan(0);
  for (const mot of mots) expect(mot).toMatch(/^C[A-Z]{8}$/);
});

test("hub de 9 lettres : un bouton « finissant par » remplit les dernières cases et affiche les mots", async ({ page }) => {
  await page.goto("/mots/neuf-lettres");

  await page.getByRole("button", { name: "Mots de 9 lettres finissant par ER", exact: true }).click();

  await expect(page.getByLabel("Lettre 8 sur 9", { exact: true })).toHaveValue("E");
  await expect(page.getByLabel("Lettre 9 sur 9", { exact: true })).toHaveValue("R");
  await expect(page.getByLabel("Lettre 1 sur 9", { exact: true })).toHaveValue("");
  const liste = page.getByRole("list", { name: "Mots de 9 lettres pour ???????ER" });
  await expect(liste).toBeVisible({ timeout: 20_000 });
  const mots = await liste.getByRole("listitem").allTextContents();
  expect(mots.length).toBeGreaterThan(0);
  for (const mot of mots) expect(mot).toMatch(/^[A-Z]{7}ER$/);
});

test("une adresse avec ?motif= remplit les cases et affiche les mots au chargement", async ({ page }) => {
  await page.goto(`${PAGE}?motif=p%3F%3F%3Fe`);

  await expect(page.getByLabel("Lettre 1 sur 5", { exact: true })).toHaveValue("P");
  await expect(page.getByLabel("Lettre 5 sur 5", { exact: true })).toHaveValue("E");
  const liste = page.getByRole("list", { name: "Mots de 5 lettres pour P???E" });
  await expect(liste).toBeVisible({ timeout: 20_000 });
  const mots = await liste.getByRole("listitem").allTextContents();
  expect(mots.length).toBeGreaterThan(0);
  for (const mot of mots) expect(mot).toMatch(/^P[A-Z]{3}E$/);
});

test("un motif sans lettre, trop court, trop long ou qui n'en est pas un dans l'adresse est ignoré", async ({ page }) => {
  for (const motif of ["%3F%3F%3F%3F%3F", "A", "ABCDEFGHIJKLMNOP", "12345"]) {
    await page.goto(`${PAGE}?motif=${motif}`);
    await expect(page.getByLabel("Lettre 1 sur 5", { exact: true })).toBeVisible();
    await expect(page.getByLabel(/^Lettre \d+ sur /)).toHaveCount(5);
    for (const i of [1, 2, 3, 4, 5]) await expect(page.getByLabel(`Lettre ${i} sur 5`, { exact: true })).toHaveValue("");
    await expect(page.getByRole("list", { name: /^Mots de \d+ lettres pour / })).toHaveCount(0);
  }
});

test("un motif d'une autre longueur dans l'adresse (2 à 15) change la rangée de cases sur place", async ({ page }) => {
  await page.goto(`${PAGE}?motif=A%3FE`);

  await expect(page.getByLabel(/^Lettre \d+ sur /)).toHaveCount(3);
  await expect(page.getByLabel("Lettre 1 sur 3", { exact: true })).toHaveValue("A");
  await expect(page.getByLabel("Lettre 3 sur 3", { exact: true })).toHaveValue("E");
  await expect(page.getByRole("list", { name: "Mots de 3 lettres pour A?E" })).toBeVisible({ timeout: 20_000 });
});

test("sélecteur de longueur : 2 à 15, des liens vers les pages qui existent, des boutons au-delà de 10", async ({ page }) => {
  await page.goto(PAGE);
  const selecteur = page.getByRole("navigation", { name: "Nombre de lettres" });
  await selecteur.getByRole("button", { name: "Changer de longueur" }).click();

  // 14 choix, du 2 au 15 ; celui de la page est marqué
  await expect(selecteur.getByRole("listitem")).toHaveCount(14);
  await expect(selecteur.locator('[aria-current="true"]')).toHaveText("5");
  await expect(selecteur.getByRole("link", { name: "2 lettres" })).toHaveAttribute("href", "/mots/deux-lettres");
  await expect(selecteur.getByRole("link", { name: "4 lettres" })).toHaveAttribute("href", "/mots/quatre-lettres");
  await expect(selecteur.getByRole("link", { name: "6 lettres" })).toHaveAttribute("href", "/mots/six-lettres");
  await expect(selecteur.getByRole("link", { name: "10 lettres" })).toHaveAttribute("href", "/mots/dix-lettres");
  for (const n of [11, 12, 13, 14, 15]) await expect(selecteur.getByRole("button", { name: `${n} lettres` })).toBeVisible();

  await selecteur.getByRole("link", { name: "7 lettres" }).click();

  await expect(page).toHaveURL(/\/mots\/sept-lettres$/);
  await expect(page.getByLabel(/^Lettre \d+ sur /)).toHaveCount(7);
});

test("sélecteur de longueur : au-delà de 10 lettres, la rangée change sur place et la recherche s'y fait", async ({ page }) => {
  await page.goto(PAGE);
  const selecteur = page.getByRole("navigation", { name: "Nombre de lettres" });
  await selecteur.getByRole("button", { name: "Changer de longueur" }).click();

  await selecteur.getByRole("button", { name: "12 lettres" }).click();

  await expect(page).toHaveURL(new RegExp(`${PAGE}$`));
  await expect(page.getByLabel(/^Lettre \d+ sur /)).toHaveCount(12);
  await expect(selecteur).toContainText("Mot de 12 lettres");
  // Les raccourcis de la page (5 lettres) disparaissent : ils ne vaudraient plus pour 12 lettres
  await expect(page.getByRole("main").getByRole("link", { name: /^Mots de 5 lettres commençant par / })).toHaveCount(0);

  await page.getByLabel("Lettre 1 sur 12").fill("c");
  await page.getByLabel("Lettre 2 sur 12").fill("o");

  await expect(page).toHaveURL(new RegExp(`${PAGE}\\?motif=CO%3F%3F%3F%3F%3F%3F%3F%3F%3F%3F$`));
  const liste = page.getByRole("list", { name: "Mots de 12 lettres pour CO??????????" });
  await expect(liste).toBeVisible({ timeout: 20_000 });
  for (const mot of await liste.getByRole("listitem").allTextContents()) expect(mot).toMatch(/^CO[A-Z]{10}$/);

  // Revenir à la longueur de la page remet la page comme elle est arrivée
  // Le sélecteur se replie quand la rangée change de taille : on le rouvre
  await selecteur.getByRole("button", { name: "Changer de longueur" }).click();
  await selecteur.getByRole("button", { name: "5 lettres", exact: true }).click();
  await expect(page.getByLabel(/^Lettre \d+ sur /)).toHaveCount(5);
  await expect(page).toHaveURL(new RegExp(`${PAGE}$`));
  await expect(page.getByRole("main").getByRole("link", { name: "Mots de 5 lettres commençant par A" })).toBeVisible();
});

test("sélecteur de longueur : un motif de 15 lettres tient dans l'écran d'un téléphone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(`${PAGE}?motif=A%3F%3F%3F%3F%3F%3F%3F%3F%3F%3F%3F%3F%3F%3F`);

  await expect(page.getByLabel(/^Lettre \d+ sur /)).toHaveCount(15);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  const boites = await Promise.all([1, 8, 15].map((i) => page.getByLabel(`Lettre ${i} sur 15`, { exact: true }).boundingBox()));
  for (const boite of boites) {
    expect((boite?.x ?? 0) + (boite?.width ?? 0)).toBeLessThanOrEqual(360);
    expect(boite?.width ?? 0).toBeGreaterThanOrEqual(28);
  }
});

test("hub vide par défaut : ni liste ni résultats avant d'avoir cherché, la liste s'affiche avec ?motif=", async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.getByRole("main").locator("ul[aria-label]")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2, name: /^Les \d+ mots/ })).toHaveCount(0);
  // L'invitation vient après les résultats, pas avant
  await expect(page.getByRole("complementary", { name: "Pour la suite" })).toHaveCount(0);

  await page.goto(`${PAGE}?motif=C%3F%3F%3F%3F`);
  await expect(page.getByRole("list", { name: "Mots de 5 lettres pour C????" })).toBeVisible({ timeout: 20_000 });
});

test("après les résultats : l'invitation à jouer la grille du jour et à fabriquer la sienne", async ({ page }) => {
  await page.goto(`${PAGE}?motif=C%3F%3F%3F%3F`);
  const invitation = page.getByRole("complementary", { name: "Pour la suite" });

  await expect(invitation).toBeVisible({ timeout: 20_000 });
  await expect(invitation).toContainText("Cette grille te donne du fil à retordre ?");
  // En attendant /jouer (la grille du jour, pas encore sur main) : l'article qui a une petite grille
  await expect(invitation.getByRole("link", { name: "la grille du jour" })).toHaveAttribute(
    "href", "/jouer");
  await expect(invitation).toContainText("Et si tu fabriquais la tienne ?");
  await expect(invitation.getByRole("link", { name: "C’est guidé pas à pas" })).toHaveAttribute("href", "/grid");
  await expect(page.getByRole("link", { name: "Écris-moi" }).first()).toHaveAttribute("href", "/contact");
});

test("signaler un mot : un mode à activer, puis un drapeau par mot qui envoie l'origine « mots »", async ({ page }) => {
  const envois: Record<string, unknown>[] = [];
  // Rien ne part vraiment : on simule la réponse de l'API et on lit ce que la page envoie
  await page.route("**/api/suggestions", async (route) => {
    envois.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, contentType: "application/json", body: "{}" });
  });
  await page.goto(`${PAGE}?motif=C%3F%3F%3F%3F`);
  const liste = page.getByRole("list", { name: "Mots de 5 lettres pour C????" });
  await expect(liste).toBeVisible({ timeout: 20_000 });

  // Par défaut, la liste est propre : aucun bouton par mot
  await expect(liste.getByRole("button")).toHaveCount(0);
  await page.getByRole("button", { name: "Signaler un mot" }).click();
  await expect(page.getByRole("button", { name: "Terminer le signalement" })).toHaveAttribute("aria-pressed", "true");
  const premier = (await liste.getByRole("listitem").first().innerText()).trim();
  await liste.getByRole("button", { name: new RegExp(`Signaler « ${premier} »`) }).click();

  await expect.poll(() => envois).toEqual([{ kind: "remove", word: premier, source: "mots" }]);
  await page.getByRole("button", { name: "Terminer le signalement" }).click();
  await expect(liste.getByRole("button")).toHaveCount(0);
});

test("aucun mot : un message clair, dans la zone annoncée aux lecteurs d'écran", async ({ page }) => {
  await page.goto(PAGE);
  // La zone est dans la page avant toute recherche, pour que son contenu soit annoncé quand il arrive
  const zone = page.locator('main [aria-live="polite"]');
  await expect(zone).toHaveCount(1);

  await page.goto(`${PAGE}?motif=QQQQQ`);

  await expect(zone).toContainText("Aucun mot de 5 lettres ne correspond à QQQQQ", { timeout: 20_000 });
});

test("l'API ne répond pas : un message d'erreur et un bouton « Réessayer »", async ({ page }) => {
  await page.route("**/api/search", (route) => route.abort());
  await page.goto(`${PAGE}?motif=A%3F%3F%3F%3F`);

  await expect(page.getByRole("main").getByRole("alert")).toContainText("Impossible de joindre le serveur");

  await page.unroute("**/api/search");
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByRole("list", { name: "Mots de 5 lettres pour A????" })).toBeVisible({ timeout: 20_000 });
});

test("avec des résultats affichés, la page n'a aucune violation d'accessibilité", async ({ page }) => {
  await page.goto(`${PAGE}?motif=A%3F%3F%3F%3F`);
  await expect(page.getByRole("list", { name: "Mots de 5 lettres pour A????" })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('main [aria-live="polite"]').getByRole("list")).toHaveCount(1);
  await page.waitForTimeout(400);

  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude("nextjs-portal")
    .analyze();

  expect(violations.map((v) => ({ règle: v.id, éléments: v.nodes.map((n) => n.target.join(" ")) }))).toEqual([]);
});

test("FAQ : sept questions visibles, reprises à l'identique dans les données FAQPage", async ({ page }) => {
  await page.goto(PAGE);

  const json = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  const faq = json["@graph"].find((noeud: { "@type": string }) => noeud["@type"] === "FAQPage");
  expect(faq.mainEntity.length).toBe(7);
  for (const question of faq.mainEntity) {
    expect(question["@type"]).toBe("Question");
    expect(question.acceptedAnswer["@type"]).toBe("Answer");
    // Une FAQ en données structurées doit être lisible sur la page
    await expect(page.getByText(question.name, { exact: true })).toBeVisible();
    await expect(page.getByText(question.acceptedAnswer.text, { exact: true })).toBeVisible();
  }
  expect(faq.mainEntity.map((q: { name: string }) => q.name)).toEqual(
    expect.arrayContaining([
      "Je bloque sur un mot de 5 lettres dans ma grille : comment le trouver ?",
      "Je n’ai que deux lettres : ça suffit ?",
      "Pas de résultat : qu’est-ce qui cloche ?",
      "Ça marche pour les mots croisés aussi ?",
      "Ce n’est pas un peu tricher ?",
      "Tu crées tes propres grilles ?",
    ]),
  );
});

test("FAQ : la question des créateurs de grilles mène à la recherche et à l'inscription", async ({ page }) => {
  await page.goto(PAGE);
  const reponse = page.locator("dd").filter({ hasText: "dictionnaires personnels" });

  await expect(reponse).toContainText("avec un compte gratuit, elle met en premier les mots de tes dictionnaires personnels");
  await expect(reponse.getByRole("link", { name: "Chercher un mot" })).toHaveAttribute("href", "/search");
  await expect(reponse.getByRole("link", { name: "Créer un compte gratuit" })).toHaveAttribute("href", "/register");
});

test("tous les hubs (2 à 10 lettres) : outil, FAQ, FAQPage et fil d'Ariane", async ({ page }) => {
  for (const [slug, n] of [["deux", 2], ["trois", 3], ["quatre", 4], ["six", 6], ["sept", 7], ["huit", 8], ["neuf", 9], ["dix", 10]] as const) {
    await page.goto(`/mots/${slug}-lettres`);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Mot de ${n} lettres : trouve celui qui te manque`);
    await expect(page.getByLabel(/^Lettre \d+ sur /)).toHaveCount(n);
    const json = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
    expect(json["@graph"].map((noeud: { "@type": string }) => noeud["@type"])).toEqual(["BreadcrumbList", "FAQPage"]);
    // À 2 lettres, « je n'ai que deux lettres » n'a pas de sens : six questions
    expect(json["@graph"][1].mainEntity).toHaveLength(n === 2 ? 6 : 7);
    expect((await page.title()).length).toBeLessThanOrEqual(60);
  }
});

test("données structurées, liens vers le générateur et le guide", async ({ page }) => {
  await page.goto(PAGE);

  const json = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  expect(json["@graph"]).toEqual([
    expect.objectContaining({
      "@type": "BreadcrumbList",
      itemListElement: [
        expect.objectContaining({ position: 1, item: SITE_URL }),
        expect.objectContaining({ position: 2, name: "Listes de mots", item: `${SITE_URL}/mots` }),
        expect.objectContaining({ position: 3, name: "Mot de 5 lettres", item: `${SITE_URL}${PAGE}` }),
      ],
    }),
    expect.objectContaining({ "@type": "FAQPage" }),
  ]);
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: "Générer une grille" })).toHaveAttribute("href", "/grid");
  await expect(main.getByRole("link", { name: "Comment créer des mots fléchés" })).toHaveAttribute(
    "href", "/creer-des-mots-fleches");
});

test("la description de la page tient pour les moteurs, et le titre en 60 caractères", async ({ page }) => {
  await page.goto(PAGE);

  expect((await page.title()).length).toBeLessThanOrEqual(60);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /lettres/);
});

test("sur téléphone, la rangée tient dans l'écran, sans défilement horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(PAGE);

  const largeur = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(largeur).toBeLessThanOrEqual(360);
  const derniere = await page.getByLabel("Lettre 5 sur 5").boundingBox();
  expect((derniere?.x ?? 0) + (derniere?.width ?? 0)).toBeLessThanOrEqual(360);
  const hauteurs = await Promise.all([1, 2, 3, 4, 5].map(async (i) => (await page.getByLabel(`Lettre ${i} sur 5`, { exact: true }).boundingBox())?.y));
  expect(new Set(hauteurs).size).toBe(1);
});
