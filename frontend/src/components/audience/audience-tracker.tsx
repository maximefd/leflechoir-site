"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { externalHost, trackPageView } from "@/lib/audience";

// Le référent du navigateur ne décrit que l'arrivée sur le site : les pages suivantes viennent du site lui-même
let firstPage = true;

/**
 * Compte la page quand on la quitte, avec le temps où elle est restée visible (lib/audience.ts).
 *
 * « Quitter » : changer de page dans le site, fermer l'onglet, ou masquer l'onglet (sur téléphone, c'est le
 * seul signal fiable). Une page n'est comptée qu'une fois ; revenir sur un onglet masqué ne la recompte pas.
 */
export function AudienceTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const referrer = firstPage ? externalHost(document.referrer) : "";
    firstPage = false;
    let visibleMs = 0;
    let shownAt: number | null = document.visibilityState === "visible" ? performance.now() : null;
    let counted = false;

    const stopClock = () => {
      if (shownAt !== null) {
        visibleMs += performance.now() - shownAt;
        shownAt = null;
      }
    };
    const count = () => {
      stopClock();
      if (counted) return;
      counted = true;
      trackPageView(pathname, referrer, visibleMs);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") count();
      else if (!counted) shownAt = performance.now();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", count);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", count);
      count();
    };
  }, [pathname]);

  return null;
}
