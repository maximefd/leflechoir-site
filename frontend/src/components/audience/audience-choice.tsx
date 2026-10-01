"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { gpcActive, hasDeclined, setDeclined } from "@/lib/audience";

type State = "unknown" | "measured" | "declined" | "gpc";

/** Le refus d'être compté (page confidentialité) : retenu dans le navigateur, seule chose qu'il y écrit. */
export function AudienceChoice() {
  const [state, setState] = useState<State>("unknown");

  // Lu après l'affichage : le stockage du navigateur n'existe pas au moment du rendu statique
  useEffect(() => {
    setState(gpcActive() ? "gpc" : hasDeclined() ? "declined" : "measured");
  }, []);

  if (state === "unknown") return null;

  if (state === "gpc") {
    return (
      <p className="rounded-lg border p-4 text-foreground" data-testid="audience-choice">
        Ton navigateur envoie « Global Privacy Control » : tes visites ne sont pas comptées, sans rien à faire.
      </p>
    );
  }

  const declined = state === "declined";
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border p-4" data-testid="audience-choice">
      <p className="text-foreground">
        {declined
          ? "C'est noté : tes visites ne sont pas comptées sur cet appareil."
          : "Pour l'instant, tes visites sont comptées."}
      </p>
      <Button
        variant="outline"
        onClick={() => {
          setDeclined(!declined);
          setState(declined ? "measured" : "declined");
        }}
      >
        {declined ? "Me compter à nouveau" : "Ne plus compter mes visites"}
      </Button>
    </div>
  );
}
