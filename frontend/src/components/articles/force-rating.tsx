"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Summary = { count: number; average: number | null };

const FORCES = [1, 2, 3, 4, 5, 6] as const;

/** « Force moyenne : 3,4 sur 6, 27 avis » */
export function describeForce({ count, average }: Summary): string {
  if (!count || average === null) return "Pas encore d’avis : donne le premier.";
  const value = average.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `Force moyenne : ${value} sur 6, ${count} avis`;
}

/**
 * La force de la grille, notée de 1 à 6 par le lecteur, et la moyenne des avis.
 *
 * La note part à l'API sans cookie ni identifiant : l'API la rattache à l'empreinte du jour, le temps de
 * pouvoir la changer (ADR 0016, page confidentialité). Rien n'est gardé dans le navigateur.
 */
export function ForceRating({ slug }: { slug: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [mine, setMine] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    apiFetch(`/api/articles/${slug}/force`)
      .then((body: Summary) => setSummary(body))
      .catch(() => setSummary(null));
  }, [slug]);

  const rate = async (force: number) => {
    setSending(true);
    setError("");
    try {
      const body: Summary = await apiFetch(`/api/articles/${slug}/force`, { method: "POST", body: { force } });
      setSummary(body);
      setMine(force);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La note n’a pas pu être envoyée.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section aria-labelledby={`force-${slug}`} className="not-prose my-6 rounded-lg border p-4">
      <h3 id={`force-${slug}`} className="font-semibold text-foreground">Quelle force pour cette grille ?</h3>
      <p className="mt-1 text-sm text-muted-foreground">De 1, elle se fait d’une traite, à 6, elle t’a résisté.</p>
      <div role="group" aria-label="Force de la grille, de 1 à 6" className="mt-3 flex flex-wrap gap-2">
        {FORCES.map((force) => (
          <button
            key={force}
            type="button"
            disabled={sending}
            aria-pressed={mine === force}
            aria-label={`Force ${force} sur 6`}
            onClick={() => void rate(force)}
            className={cn(
              "size-10 rounded-md border text-base font-semibold transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              mine === force && "border-primary bg-primary text-primary-foreground hover:bg-primary",
            )}
          >
            {force}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm text-foreground" aria-live="polite" data-testid="force-summary">
        {mine ? `Merci, c’est noté. ` : ""}
        {summary ? describeForce(summary) : " "}
      </p>
      {error && <p className="mt-1 text-sm text-destructive" role="alert">{error}</p>}
    </section>
  );
}
