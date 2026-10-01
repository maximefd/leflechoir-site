"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

type Suggestion = { word: string; display: string; kind: "remove" | "add"; status: "pending" | "accepted" | "rejected" };

const STATUS = {
  pending: { label: "en attente", className: "bg-muted text-muted-foreground" },
  accepted: { label: "retenue", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  rejected: { label: "écartée", className: "bg-secondary text-secondary-foreground" },
} as const;

/** Ce que sont devenues les suggestions du compte (roadmap 1e) : de quoi donner envie de continuer. */
export function MySuggestions() {
  const { data, isPending, isError } = useQuery<{ suggestions: Suggestion[] }>({
    queryKey: ["my-suggestions"],
    queryFn: () => apiFetch("/api/suggestions/mine"),
  });

  return (
    <section className="space-y-3 rounded-lg border p-6">
      <div>
        <h2 className="text-lg font-semibold">Mes suggestions de mots</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Les mots que tu as signalés ou proposés. Chacun est relu avant que le lexique change.
        </p>
      </div>
      {isPending ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Tes suggestions n&apos;ont pas pu être chargées.</p>
      ) : data.suggestions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucune pour l&apos;instant. Un mot bizarre dans la recherche ou dans une grille ? Le petit drapeau le
          signale ; un mot qui manque se propose depuis la recherche.
        </p>
      ) : (
        <ul className="divide-y text-sm">
          {data.suggestions.map((suggestion) => (
            <li key={`${suggestion.kind}-${suggestion.word}`} className="flex items-center justify-between gap-3 py-2">
              <span>
                <span className="font-mono font-semibold">{suggestion.word}</span>{" "}
                <span className="text-muted-foreground">
                  {suggestion.kind === "remove" ? "à retirer" : "à ajouter"}
                </span>
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[suggestion.status].className}`}>
                {STATUS[suggestion.status].label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
