/**
 * Suivi des erreurs du navigateur avec Sentry (ADR 0013), inactif sans `NEXT_PUBLIC_SENTRY_DSN`.
 *
 * Seules les erreurs partent, et rien qui identifie l'utilisateur ou ouvre son compte : ni cookies, ni
 * adresse IP, ni le jeton des liens reçus par e-mail (`/reset-password?token=…`), que l'adresse de la page
 * porte et que Sentry joindrait sinon au rapport et à son fil d'événements.
 *
 * Ni, surtout, ce qui suit le « # » : une grille partagée y voyage entière, avec le nom de son auteur (`/grille#g=…`).
 * Le navigateur ne l'envoie jamais au serveur ; Sentry, lui, l'emporterait avec l'adresse de la page (avis juridique
 * du 08/11/2026). Le fragment est retiré à l'émission, partout où une adresse peut se trouver.
 */
import type { Breadcrumb, ErrorEvent } from "@sentry/browser";

/** Adresse sans ses paramètres sensibles ni son fragment : `?token=abc#g=…` devient `?token=[retiré]`. */
export function withoutSecrets(url: string | undefined): string | undefined {
  if (!url) return url;
  return withoutFragment(url.replace(/([?&](?:token|password)=)[^&#\s]*/gi, "$1[retiré]"));
}

/** Un texte sans fragment d'adresse : tout ce qui suit un « # » collé à une adresse, jusqu'à l'espace suivant. */
export function withoutFragment(text: string): string {
  return text.replace(/#[^\s"']*/g, "");
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    event.request.url = withoutSecrets(event.request.url);
    delete event.request.cookies;
    delete event.request.query_string;
    const userAgent = event.request.headers?.["User-Agent"];
    event.request.headers = userAgent ? { "User-Agent": userAgent } : {};
  }
  delete event.user;
  if (event.transaction) event.transaction = withoutFragment(event.transaction);
  event.breadcrumbs = event.breadcrumbs?.map(scrubBreadcrumb);
  return event;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const data = breadcrumb.data;
  if (data) {
    for (const key of ["url", "from", "to"]) {
      if (typeof data[key] === "string") data[key] = withoutSecrets(data[key]);
    }
  }
  if (breadcrumb.message) breadcrumb.message = withoutFragment(breadcrumb.message);
  return breadcrumb;
}

export async function initMonitoring(dsn: string | undefined) {
  if (!dsn) return;
  // Chargé seulement s'il sert : sans DSN, le module ne quitte jamais le serveur
  const Sentry = await import("@sentry/browser");
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    // Rien sur l'utilisateur, ni cookies, ni en-têtes, ni corps, ni paramètres d'adresse : scrubEvent le
    // vérifie encore avant l'envoi, au cas où une intégration en ajouterait
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
}
