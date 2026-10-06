"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api-client";
import { brokenDescription, mysteryProblem, normalizeMystery } from "@/lib/mystery";
import type { GridData, Mystery } from "@/components/grid/grid-display";

/**
 * Le mot mystère d'une grille conservée (#218) : le poser, le changer, lui donner d'autres cases, le retirer.
 *
 * Les cases se choisissent sur le serveur, comme à la génération : loin des mots de l'auteur, un numéro par
 * mot autant que possible, réparties sur la grille. Une lettre absente est dite ici, sous le champ.
 */
export function MysteryPanel({
  gridId,
  mystery,
  onUpdated,
}: {
  gridId: number;
  mystery: Mystery | null | undefined;
  onUpdated: (grid: GridData) => void;
}) {
  const [draft, setDraft] = useState(mystery?.word ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Le mot affiché suit le serveur : posé, changé ou retiré ailleurs (annulation, autre onglet)
  useEffect(() => setDraft(mystery?.word ?? ""), [mystery?.word]);

  const hint = mysteryProblem(draft);
  const unchanged = Boolean(mystery) && normalizeMystery(draft) === mystery?.word;

  const send = async (body: Record<string, unknown>) => {
    setPending(true);
    setError(null);
    try {
      const updated = await apiFetch(`/api/grids/${gridId}`, { method: "PATCH", body });
      onUpdated(updated.grid);
    } catch (sendError) {
      if (sendError instanceof ApiError && sendError.data.reason === "mystery_letters_missing") setError(sendError.message);
      else toast.error(sendError instanceof Error ? sendError.message : "Le mot mystère n'a pas pu être enregistré.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Mot mystère <span className="font-normal normal-case">(facultatif)</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Des cases numérotées dont les lettres, remises dans l&apos;ordre, forment un mot à deviner : un prénom,
        « MERCI »… Une rangée de cases l&apos;attend au-dessus de la grille, et la page solution l&apos;écrit.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!hint && draft.trim() && !unchanged) void send({ mystery_word: draft.trim() });
        }}
      >
        <Input
          aria-label="Mot mystère"
          placeholder="Ex : MARIE"
          maxLength={40}
          value={draft}
          disabled={pending}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          aria-invalid={hint || error ? true : undefined}
        />
        <Button type="submit" size="sm" className="h-9" disabled={pending || Boolean(hint) || !draft.trim() || unchanged}>
          {mystery ? "Changer" : "Placer"}
        </Button>
      </form>
      {hint && <p className="text-xs text-destructive">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {mystery && (
        <>
          {(mystery.broken ?? []).length > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Incomplet : {brokenDescription(mystery)}, et aucune case libre ne porte cette lettre. Remets-la dans la
              grille, ou change de mot.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              // Une autre seed : d'autres cases aussi bonnes, quand la grille en offre
              onClick={() => void send({ mystery_word: mystery.word, mystery_seed: Math.floor(Math.random() * 1_000_000) })}
            >
              <Shuffle className="mr-1 h-4 w-4" />
              Autres cases
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => void send({ mystery_word: "" })}>
              Retirer le mot mystère
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
