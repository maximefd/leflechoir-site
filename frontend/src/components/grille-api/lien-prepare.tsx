"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { readPreparedLink } from "@/lib/grille-api";

/**
 * Le lien préparé (ADR 0032) : une IA écrit `/creer?lang=fr&taille=10x10&mots=…&mystere=…&niveau=…` sans rien
 * installer. Depuis le 13/11/2026 (demande de l'auteur : « un clic de trop »), on passe tout droit au générateur avec
 * les mêmes paramètres : il les lit, montre les réglages dans son formulaire et lance la grille sans attendre. Sans
 * paramètres, rien ne s'affiche : la page reste le carrefour « Créer ».
 */
export function LienPrepare() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!readPreparedLink(window.location.search)) return;
    setLeaving(true);
    // `replace` : le bouton « Retour » ne ramène pas sur un lien qui relancerait la grille
    router.replace(`/grid${window.location.search}`);
  }, [router]);

  if (!leaving) return null;
  return (
    <p className="mb-8 flex items-center gap-2 text-muted-foreground" role="status" data-testid="lien-prepare">
      <Loader2 className="h-4 w-4 animate-spin" /> Ta grille se prépare…
    </p>
  );
}
