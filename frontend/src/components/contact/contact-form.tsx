"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/auth-context";
import { ApiError, apiFetch } from "@/lib/api-client";

const REASONS = [
  { value: "suggestion", label: "Une suggestion" },
  { value: "problem", label: "Un problème" },
  { value: "data", label: "Une demande sur mes données" },
] as const;
type Reason = (typeof REASONS)[number]["value"];

const MIN = 10;
const MAX = 2000;

function isReason(value: string | null): value is Reason {
  return REASONS.some((reason) => reason.value === value);
}

/**
 * Le formulaire de contact (Phase 8, #131). « Signaler ce problème » y arrive avec le motif réglé sur « problème » et
 * l'identifiant de la requête qui a échoué : `/contact?reason=problem&request=…`. Connecté, le message est lié au compte
 * et disparaît avec lui ; l'adresse de réponse est alors préremplie.
 */
function Form() {
  const params = useSearchParams();
  const { isAuthenticated } = useAuth();
  const initial = params.get("reason");
  const requestId = params.get("request") ?? "";

  const [reason, setReason] = useState<Reason>(isReason(initial) ? initial : "suggestion");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // le pot de miel : jamais rempli par une personne
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const account = useQuery<{ email: string }>({
    queryKey: ["me-email"],
    enabled: isAuthenticated,
    retry: false,
    queryFn: () => apiFetch("/api/users/me"),
  });
  useEffect(() => {
    if (account.data?.email) setEmail((current) => current || account.data.email);
  }, [account.data]);

  const tooShort = message.trim().length < MIN;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (tooShort) return;
    setState("sending");
    setError(null);
    try {
      await apiFetch("/api/contact", { method: "POST", body: { reason, message, email, request_id: requestId, website } });
      setState("sent");
    } catch (failure) {
      setState("idle");
      if (failure instanceof ApiError && failure.status === 429) {
        setError("Tu as déjà envoyé plusieurs messages : réessaie dans une heure, ou écris à l'adresse ci-dessus.");
      } else {
        setError(failure instanceof Error ? failure.message : "Le message n'a pas pu partir.");
      }
    }
  };

  if (state === "sent") {
    return (
      <p role="status" className="rounded-lg border border-emerald-600/40 bg-emerald-50 p-4 text-foreground dark:bg-emerald-950/20">
        Merci, ton message est bien arrivé. L&apos;auteur le lira et te répondra à l&apos;adresse indiquée, s&apos;il y en a une.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Écrire un message">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">Ton message concerne</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {REASONS.map((item) => (
            <label key={item.value} className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <input type="radio" name="reason" value={item.value} checked={reason === item.value}
                onChange={() => setReason(item.value)} className="size-4 accent-primary" />
              {item.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="contact-message">Ton message</Label>
        <textarea id="contact-message" value={message} onChange={(event) => setMessage(event.target.value)}
          rows={7} maxLength={MAX} required aria-describedby="contact-message-help"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
        <p id="contact-message-help" className="text-xs text-muted-foreground">
          {reason === "problem"
            ? "Ce que tu faisais, ce que tu attendais et ce qui s'est passé."
            : reason === "data"
              ? "Quelle donnée, et ce que tu veux en faire : la consulter, la corriger, la recevoir ou l'effacer."
              : "Un format de grille, un mot qui manque ou qui n'a rien à faire dans le lexique…"}
          {" "}Entre {MIN} et {MAX.toLocaleString("fr-FR")} caractères ({message.trim().length.toLocaleString("fr-FR")} aujourd&apos;hui).
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-email">Ton adresse, pour te répondre (facultatif)</Label>
        <Input id="contact-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)}
          autoComplete="email" maxLength={254} />
        {reason === "data" && !isAuthenticated && (
          <p className="text-xs text-muted-foreground">
            Pour une demande sur tes données, écris depuis l&apos;adresse de ton compte : c&apos;est ainsi que l&apos;auteur sait que la demande vient de toi.
          </p>
        )}
      </div>

      {/* Le pot de miel : hors de l'écran et de la navigation au clavier, ignoré des lecteurs d'écran */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Laisse ce champ vide
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website}
            onChange={(event) => setWebsite(event.target.value)} />
        </label>
      </div>

      {requestId && (
        <p className="text-xs text-muted-foreground">
          L&apos;identifiant de la requête qui a échoué sera joint (<span className="font-mono">{requestId}</span>) : il aide à la retrouver.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {isAuthenticated
          ? "Ton message est lié à ton compte, et disparaît avec lui."
          : "Sans compte, rien ne désigne l'auteur du message à part l'adresse que tu choisis de donner."}
      </p>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={state === "sending" || tooShort}>
        {state === "sending" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Envoyer le message
      </Button>
    </form>
  );
}

export function ContactForm() {
  // useSearchParams impose une frontière Suspense dans un export statique
  return (
    <Suspense fallback={null}>
      <Form />
    </Suspense>
  );
}
