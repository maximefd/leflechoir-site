"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { site } from "@/config/site";
import { ApiError, apiFetch } from "@/lib/api-client";

const MIN = 10;
const MAX = 2000;

/**
 * Le signalement d'un contenu (règlement sur les services numériques, art. 16 ; avis juridique du 08/11/2026) :
 * l'adresse précise du contenu, les raisons, le nom et l'adresse de qui signale, sa déclaration de bonne foi. Il ne
 * porte que sur ce que nous gardons : une grille demandée à l'API (24 heures) ou un mot du dictionnaire. Une grille
 * partagée voyage dans son lien sans jamais nous parvenir (avis complémentaire du 09/11/2026).
 */
export function ReportForm() {
  const [url, setUrl] = useState("");
  const [explanation, setExplanation] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [goodFaith, setGoodFaith] = useState(false);
  const [website, setWebsite] = useState(""); // le pot de miel : jamais rempli par une personne
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const ready = url.trim() && explanation.trim().length >= MIN && name.trim().length >= 2 && email.trim() && goodFaith;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setState("sending");
    setError(null);
    try {
      await apiFetch("/api/contact/signalement", {
        method: "POST", body: { url, explanation, name, email, good_faith: goodFaith, website },
      });
      setState("sent");
    } catch (failure) {
      setState("idle");
      if (failure instanceof ApiError && failure.status === 429) {
        setError(`Tu as déjà envoyé plusieurs messages : réessaie dans une heure, ou écris à ${site.contactEmail}.`);
      } else {
        setError(failure instanceof Error ? failure.message : "Le signalement n'a pas pu partir.");
      }
    }
  };

  if (state === "sent") {
    return (
      <p role="status" className="rounded-lg border border-emerald-600/40 bg-emerald-50 p-4 text-foreground dark:bg-emerald-950/20">
        Merci : ton signalement est bien arrivé. Un accusé de réception part à ton adresse, et nous te dirons ce que
        nous en avons fait.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Signaler un contenu">
      <div className="space-y-2">
        <Label htmlFor="report-url">Le contenu en cause</Label>
        <Input id="report-url" value={url} onChange={(event) => setUrl(event.target.value)}
          required maxLength={8000} placeholder={`gen_… ou ${site.url}/mots/…`} />
        <p className="text-xs text-muted-foreground">
          Le numéro d&apos;une grille demandée à l&apos;API (« gen_… », gardée 24 heures), ou la page du site où
          paraît le mot.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="report-explanation">Pourquoi ce contenu te paraît illicite</Label>
        <textarea id="report-explanation" value={explanation} onChange={(event) => setExplanation(event.target.value)}
          rows={5} maxLength={MAX} required
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="report-name">Ton nom</Label>
          <Input id="report-name" value={name} onChange={(event) => setName(event.target.value)} required
            maxLength={120} autoComplete="name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="report-email">Ton adresse e-mail</Label>
          <Input id="report-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)}
            required maxLength={254} autoComplete="email" />
        </div>
      </div>
      <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
        <input type="checkbox" checked={goodFaith} onChange={(event) => setGoodFaith(event.target.checked)}
          className="mt-0.5 size-4 accent-primary" />
        Je déclare de bonne foi que les informations et les raisons de ce signalement sont exactes et complètes.
      </label>

      {/* Le pot de miel : hors de l'écran et de la navigation au clavier, ignoré des lecteurs d'écran */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Laisse ce champ vide
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website}
            onChange={(event) => setWebsite(event.target.value)} />
        </label>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={state === "sending" || !ready}>
        {state === "sending" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Envoyer le signalement
      </Button>
    </form>
  );
}
