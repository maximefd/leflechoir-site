import { expect, test, type Page } from "@playwright/test";

/**
 * Jouer et écrire au doigt (saisie-grille.tsx) : le champ invisible qui ouvre le clavier se pose sur la case touchée,
 * la case suit l'écran (de côté dans une grande grille, en hauteur au-dessus du clavier), le Retour arrière marche
 * même quand le clavier ne nomme pas la touche (Android), et le double toucher change de sens sans zoomer.
 *
 * La grille du 14/10/2026 : 11 × 13, déjà parue, plus large qu'un téléphone (64 px par case au moins).
 */
const GRILLE = "/jouer/2026-10-14";
const CHAMP = 'input[aria-label="Lettre à écrire dans la grille"]';

/** La case sous le champ de saisie */
const caseDuChamp = (page: Page) =>
  page.evaluate((selecteur) => {
    const r = document.querySelector(selecteur)!.getBoundingClientRect();
    return (
      [...document.querySelectorAll("[data-cell]")]
        .find((cell) => {
          const b = cell.getBoundingClientRect();
          return Math.abs(b.left - r.left) < 2 && Math.abs(b.top - r.top) < 2;
        })
        ?.getAttribute("data-cell") ?? null
    );
  }, CHAMP);

const toucher = async (page: Page, cle: string) => {
  const cell = page.locator(`[data-cell="${cle}"]`);
  await cell.scrollIntoViewIfNeeded();
  const b = (await cell.boundingBox())!;
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
};

/** Ce qu'envoie un clavier de téléphone qui ne nomme pas ses touches : le champ change, sans keydown utile */
const clavierSansNom = (page: Page, valeur: (actuelle: string) => string, inputType: string) =>
  page.locator(CHAMP).evaluate(
    (el: HTMLInputElement, [suivante, type]) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, suivante);
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: type }));
    },
    [valeur(""), inputType] as const,
  );

const lettres = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("svg[role=img] text")].map((t) => t.textContent ?? "").filter((t) => /^[A-Z]$/.test(t)).join(""),
  );

test.beforeEach(async ({ page }) => {
  // Les parties d'essai ne comptent pas dans la mesure d'usage
  await page.route("**/api/audience**", (route) => route.fulfill({ status: 204, body: "" }));
});

test.describe("téléphone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("le champ se pose sur la case touchée, la grille suit le curseur, le Retour arrière d'Android efface", async ({ page }) => {
    await page.goto(GRILLE);
    await expect(page.locator("svg[role=img]").first()).toHaveCSS("touch-action", "manipulation");

    // Une case du bas : le champ (et donc le défilement du clavier qui s'ouvre) vient sur elle, pas en haut de grille
    await toucher(page, "0-11");
    await expect(page.locator(CHAMP)).toBeFocused();
    expect(await caseDuChamp(page)).toBe("0-11");
    await expect(page.getByTestId("grid-clue")).toHaveText("Chute à étages (7 lettres)");

    // Lettre après lettre, par le champ : la grille, plus large que l'écran, glisse pour garder le curseur
    for (const lettre of "CASCAD") await clavierSansNom(page, () => ` ${lettre}`, "insertText");
    await expect.poll(() => caseDuChamp(page)).toBe("6-11");
    const curseur = (await page.locator('[data-cell="6-11"]').boundingBox())!;
    expect(curseur.x + curseur.width).toBeLessThanOrEqual(390);
    expect(await lettres(page)).toBe("CASCAD");

    // Retour arrière sans touche nommée : le témoin du champ effacé suffit
    await clavierSansNom(page, () => "", "deleteContentBackward");
    await clavierSansNom(page, () => "", "deleteContentBackward");
    await expect.poll(() => lettres(page)).toBe("CASC");
    expect(await caseDuChamp(page)).toBe("4-11");

    // La définition en cours colle en haut de l'écran
    await expect(page.getByTestId("grid-clue")).toBeInViewport();
  });

  test("clavier ouvert : la case qu'on remplit reste au-dessus de lui", async ({ page }) => {
    await page.goto(GRILLE);
    // Le clavier prend la moitié de l'écran
    await page.setViewportSize({ width: 390, height: 420 });
    // Le premier toucher prend le mot horizontal de la case, le second son mot vertical
    await toucher(page, "5-5");
    await expect(page.getByTestId("grid-clue")).toHaveText("Roulées dans la chapelure (6 lettres)");
    await toucher(page, "5-5");
    await expect(page.getByTestId("grid-clue")).toHaveText("Un sabot par pied (8 lettres)");
    for (const lettre of "SOLIPED") await page.locator(CHAMP).press(`Key${lettre}`);

    await expect.poll(() => caseDuChamp(page)).toBe("5-12");
    const cell = (await page.locator('[data-cell="5-12"]').boundingBox())!;
    expect(cell.y + cell.height).toBeLessThanOrEqual(420);
    await expect(page.getByTestId("grid-clue")).toBeInViewport();
  });

  test("toucher deux fois une case change de sens", async ({ page }) => {
    await page.goto(GRILLE);
    await toucher(page, "3-11");
    await expect(page.getByTestId("grid-clue")).toHaveText("Chute à étages (7 lettres)");
    await toucher(page, "3-11");
    await expect(page.getByTestId("grid-clue")).not.toHaveText("Chute à étages (7 lettres)");
  });
});

test.describe("tablette", () => {
  test.use({ viewport: { width: 820, height: 560 }, hasTouch: true, isMobile: true });

  test("clavier ouvert, en remontant : la case ne passe ni sous l'en-tête ni sous la définition, qui colle dessous", async ({ page }) => {
    await page.goto(GRILLE);
    await toucher(page, "5-12");
    for (let i = 0; i < 12; i++) await page.locator(CHAMP).press("ArrowUp");

    const entete = (await page.getByRole("banner").boundingBox())!;
    const bandeau = (await page.locator("[data-collant]").boundingBox())!;
    expect(bandeau.y).toBeGreaterThanOrEqual(entete.y + entete.height - 1);
    const champ = (await page.locator(CHAMP).boundingBox())!;
    expect(champ.y).toBeGreaterThanOrEqual(bandeau.y + bandeau.height - 1);
  });
});
