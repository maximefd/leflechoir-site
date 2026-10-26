"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch } from "@/lib/api-client";

/**
 * Les grilles du jour réussies (J3, « faire revenir les joueurs » ; choix de l'auteur des 25 et 26/10/2026 : la liste
 * des réussites et la série en cours).
 *
 * - **Sans compte**, elles restent dans ce navigateur (`localStorage`) : rien ne part sur le serveur.
 * - **Avec un compte**, elles sont gardées avec lui (`/api/reussites`, backend/reussites.py) et suivent la personne
 *   d'un appareil à l'autre. À la connexion, celles notées sans compte rejoignent le compte ; à la déconnexion, le
 *   navigateur les oublie (`oublierReussites`, appelé par auth-context).
 *
 * Une grille est réussie quand elle est juste sans que la solution ait été dévoilée : le joker et le coup d'œil de
 * trois secondes sont des aides, ils ne l'empêchent pas.
 */
export type Reussite = {
  /** Le meilleur temps, en millisecondes (null si l'horloge n'a pas tourné) */
  ms: number | null;
  /** Le jour de la première réussite (AAAA-MM-JJ) */
  le: string;
};
export type Reussites = Record<string, Reussite>;

const CLE = "leflechoir.reussites";
/** Prévient les autres composants de la page (calendrier, grille) qu'une réussite vient d'être notée */
const EVENEMENT = "leflechoir:reussites";

function lireLocales(): Reussites {
  try {
    const brut = JSON.parse(window.localStorage.getItem(CLE) ?? "{}");
    return brut && typeof brut === "object" ? brut : {};
  } catch {
    return {};
  }
}

function ecrireLocales(reussites: Reussites): void {
  try {
    window.localStorage.setItem(CLE, JSON.stringify(reussites));
  } catch {
    // Stockage refusé (navigation privée…) : la partie reste jouée, simplement pas notée ici
  }
  window.dispatchEvent(new Event(EVENEMENT));
}

/** La déconnexion : les réussites du compte ne restent pas dans un navigateur partagé */
export function oublierReussites(): void {
  try {
    window.localStorage.removeItem(CLE);
  } catch {
    // rien à oublier
  }
  envoi = null;
}

/** Une réussite de plus ; une seconde réussite ne garde que le meilleur temps et le premier jour */
function fusionner(reussites: Reussites, date: string, ajout: Reussite): Reussites {
  const avant = reussites[date];
  if (!avant) return { ...reussites, [date]: ajout };
  const ms = avant.ms == null ? ajout.ms : ajout.ms == null ? avant.ms : Math.min(avant.ms, ajout.ms);
  return { ...reussites, [date]: { ms, le: avant.le < ajout.le ? avant.le : ajout.le } };
}

// Une seule mise en commun avec le compte par page, même si le calendrier et la grille la demandent tous deux
let envoi: Promise<void> | null = null;

/** Le navigateur et le compte mis en commun : les réussites locales partent au compte, le compte rend le tout */
function synchroniser(): Promise<void> {
  envoi ??= (async () => {
    const locales = Object.entries(lireLocales()).map(([date, { ms, le }]) => ({ date, ms, le }));
    const reponse = locales.length
      ? await apiFetch("/api/reussites", { method: "POST", body: { reussites: locales } })
      : await apiFetch("/api/reussites");
    ecrireLocales(reponse.reussites ?? {});
  })().catch(() => {
    // Hors ligne, ou API indisponible : le navigateur garde les siennes, on réessaiera à la prochaine page
    envoi = null;
  });
  return envoi;
}

/**
 * Les réussites, telles que la page les montre : celles du navigateur tout de suite, celles du compte dès qu'elles
 * arrivent. `noter` en ajoute une (et la garde avec le compte si l'on est connecté). Avant le montage (rendu du
 * build), aucune : la page écrite au build ne dit rien de personne.
 */
export function useReussites() {
  const { isAuthenticated, isLoading } = useAuth();
  const [reussites, setReussites] = useState<Reussites>({});

  useEffect(() => {
    const relire = () => setReussites(lireLocales());
    relire();
    window.addEventListener(EVENEMENT, relire);
    window.addEventListener("storage", relire); // un autre onglet
    return () => {
      window.removeEventListener(EVENEMENT, relire);
      window.removeEventListener("storage", relire);
    };
  }, []);

  useEffect(() => {
    if (!isLoading && isAuthenticated) synchroniser();
  }, [isAuthenticated, isLoading]);

  const noter = useCallback((date: string, ms: number | null, aujourdhui: string) => {
    const ajout = { ms, le: aujourdhui };
    ecrireLocales(fusionner(lireLocales(), date, ajout));
    if (isAuthenticated) {
      apiFetch("/api/reussites", { method: "POST", body: { reussites: [{ date, ...ajout }] } })
        .then((reponse) => ecrireLocales(reponse.reussites ?? {}))
        .catch(() => {
          // Notée dans le navigateur : elle rejoindra le compte à la prochaine page
          envoi = null;
        });
    }
  }, [isAuthenticated]);

  return { reussites, noter, connecte: isAuthenticated };
}

/**
 * La série en cours : les grilles parues d'affilée (de la plus récente à la plus ancienne) qui sont réussies. La
 * grille du jour pas encore jouée ne casse pas la série : on part de la veille.
 */
export function serieEnCours(reussites: Reussites, parues: string[], aujourdhui: string): number {
  const dates = [...parues].filter((date) => date <= aujourdhui).sort((a, b) => b.localeCompare(a));
  if (dates[0] === aujourdhui && !reussites[aujourdhui]) dates.shift();
  let serie = 0;
  for (const date of dates) {
    if (!reussites[date]) break;
    serie += 1;
  }
  return serie;
}
