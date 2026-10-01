"use client";

import { useState } from "react";
import { Check, Flag, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";

type Source = "search" | "search_empty" | "grid" | "editor" | "editor_unknown";

/**
 * Suggérer un mot en un clic (roadmap 1e) : le signaler (à retirer du lexique) ou le proposer (à y ajouter).
 * Rien ne change dans le lexique : l'auteur relit chaque suggestion. Avec ou sans compte, sans limite.
 */
export function SuggestWord({ word, kind, source }: { word: string; kind: "remove" | "add"; source: Source }) {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");

  const send = async () => {
    setState("sending");
    try {
      await apiFetch("/api/suggestions", { method: "POST", body: { kind, word, source } });
      setState("done");
      toast.success(kind === "remove"
        ? `« ${word} » signalé, merci : il sera relu avant d'être retiré.`
        : `« ${word} » proposé, merci : il sera relu avant d'être ajouté.`);
    } catch (error) {
      setState("idle");
      toast.error(error instanceof Error ? error.message : "La suggestion n'a pas pu partir.");
    }
  };

  if (kind === "remove") {
    const label = state === "done" ? `« ${word} » est signalé` : `Signaler « ${word} » : il ne devrait pas être dans le lexique`;
    return (
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground"
        disabled={state !== "idle"} onClick={send} aria-label={label} title={label}>
        {state === "sending" ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : state === "done" ? <Check className="h-3.5 w-3.5 text-emerald-600" />
          : <Flag className="h-3.5 w-3.5" />}
      </Button>
    );
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={state !== "idle"} onClick={send}>
      {state === "sending" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        : state === "done" ? <Check className="mr-1 h-3.5 w-3.5 text-emerald-600" />
        : <Plus className="mr-1 h-3.5 w-3.5" />}
      {state === "done" ? "Proposé, merci" : source === "search_empty" ? "Ce mot manque ? Propose-le" : "Proposer"}
    </Button>
  );
}
