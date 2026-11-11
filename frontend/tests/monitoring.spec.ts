import { expect, test } from "@playwright/test";
import { scrubBreadcrumb, scrubEvent, withoutSecrets } from "../src/lib/monitoring";

// Ce que Sentry reçoit d'une erreur : ni jeton, ni fragment d'adresse, où voyage une grille partagée et le nom de son
// auteur (avis juridique du 08/11/2026)
const LIEN = "https://leflechoir.fr/grille#mode=jouer&g=eNqrVkrOz0lNSVayUlBKy8xLVajNLMksSbXSNTJJKcnMS1Uo";

test("une adresse part sans son jeton ni son fragment", () => {
  expect(withoutSecrets(LIEN)).toBe("https://leflechoir.fr/grille");
  expect(withoutSecrets("https://leflechoir.fr/reset-password?token=abc#x")).toBe(
    "https://leflechoir.fr/reset-password?token=[retiré]");
});

test("un rapport d'erreur et son fil d'événements partent sans la grille partagée", () => {
  const event = scrubEvent({
    type: undefined, request: { url: LIEN, headers: { "User-Agent": "test", Referer: LIEN } },
    transaction: "/grille#g=abc", user: { ip_address: "203.0.113.7" },
    breadcrumbs: [{ category: "navigation", data: { from: "/", to: LIEN } }, { message: `fetch ${LIEN} échoué` }],
  });

  expect(JSON.stringify(event)).not.toContain("g=");
  expect(event.request?.url).toBe("https://leflechoir.fr/grille");
  expect(event.user).toBeUndefined();
  expect(scrubBreadcrumb({ message: "vu /grille#g=xyz" }).message).toBe("vu /grille");
});
