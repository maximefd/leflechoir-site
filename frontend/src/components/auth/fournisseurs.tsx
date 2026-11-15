"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { getApiBaseUrl } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Se connecter avec un compte Google ou Microsoft (ADR 0034). Le bouton quitte le site pour l'API, qui renvoie chez le
 * fournisseur puis ramène ici, session ouverte : aucun script du fournisseur n'est chargé. Seuls les fournisseurs que
 * l'API a configurés ont un bouton.
 */
export type Provider = "google" | "microsoft";

export const PROVIDER_LABELS: Record<Provider, string> = { google: "Google", microsoft: "Microsoft" };

/** Les codes `reason` que l'API renvoie dans `?erreur=`, en clair */
const MESSAGES: Record<string, string> = {
  provider_unavailable: "Cette connexion n'est pas disponible pour le moment.",
  oidc_cancelled: "Connexion annulée.",
  oidc_state: "La connexion a expiré, ou a été ouverte dans un autre onglet. Réessaie.",
  oidc_failed: "La connexion n'a pas abouti. Réessaie dans un instant.",
  email_missing: "Ce compte ne nous a pas donné d'adresse e-mail : impossible d'ouvrir un compte avec.",
  email_unverified_taken:
    "Un compte existe déjà avec cette adresse. Connecte-toi avec ton mot de passe, puis relie ce compte depuis « Mon compte ».",
  session_required: "Ta session a expiré : reconnecte-toi, puis recommence.",
  identity_taken: "Ce compte est déjà relié à un autre compte du site.",
  provider_already_linked: "Un autre compte de ce fournisseur est déjà relié : délie-le d'abord.",
  identity_mismatch: "Ce n'est pas le compte relié : reconnecte-toi avec celui-là.",
};

export function providerMessage(reason: string): string {
  return MESSAGES[reason] ?? MESSAGES.oidc_failed;
}

function useProviderQuery() {
  return useQuery<{ providers: Provider[] }>({
    queryKey: ["auth-providers"],
    queryFn: () => apiFetch("/api/auth/providers"),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
}

function knownProviders(providers: Provider[] | undefined): Provider[] {
  return (providers ?? []).filter((provider): provider is Provider => provider in PROVIDER_LABELS);
}

export function useProviders(): Provider[] {
  return knownProviders(useProviderQuery().data?.providers);
}

export function startUrl(provider: Provider, next: string): string {
  return `${getApiBaseUrl()}/api/auth/oidc/${provider}/start?next=${encodeURIComponent(next)}`;
}

export function ProviderLogo({ provider }: { provider: Provider }) {
  if (provider === "google") {
    return (
      <svg aria-hidden="true" viewBox="0 0 48 48" className="size-4">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 21 21" className="size-4">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

/**
 * Le premier écran de la connexion et de l'inscription : « Continuer avec Google » ou « Continuer avec ton adresse
 * e-mail », et le formulaire (`children`) seulement une fois l'e-mail choisi. Sans fournisseur configuré, le
 * formulaire s'affiche directement, comme avant.
 */
export function AuthChoice({ next, error, children }: { next: string; error?: string | null; children: ReactNode }) {
  const query = useProviderQuery();
  const providers = knownProviders(query.data?.providers);
  const [withEmail, setWithEmail] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (withEmail) formRef.current?.querySelector("input")?.focus();
  }, [withEmail]);

  // La liste arrive de l'API : rien plutôt qu'un formulaire qui disparaîtrait aussitôt
  if (query.isPending) return <div className="min-h-32" aria-busy="true" />;
  if (providers.length === 0) return <>{children}</>;
  if (withEmail) {
    return (
      <div ref={formRef} className="grid gap-4">
        <button type="button" onClick={() => setWithEmail(false)}
          className="justify-self-start text-sm text-muted-foreground underline hover:text-foreground">
          ← Choisir une autre façon
        </button>
        {children}
      </div>
    );
  }
  return (
    <div className="grid gap-3" data-testid="fournisseurs">
      {providers.map((provider) => (
        <Button key={provider} type="button" variant="outline" className="w-full gap-2"
          onClick={() => window.location.assign(startUrl(provider, next))}>
          <ProviderLogo provider={provider} />
          Continuer avec {PROVIDER_LABELS[provider]}
        </Button>
      ))}
      <Button type="button" variant="outline" className="w-full gap-2" onClick={() => setWithEmail(true)}>
        <Mail aria-hidden="true" className="size-4" />
        Continuer avec ton adresse e-mail
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Avec {providers.map((provider) => PROVIDER_LABELS[provider]).join(" ou ")}, un compte est créé s&apos;il
        n&apos;existe pas encore : tu acceptes alors les{" "}
        <Link href="/terms" className="underline">conditions d&apos;utilisation</Link>. Nous ne recevons que ton adresse
        e-mail{" "}
        (<Link href="/privacy#connexions" className="underline">confidentialité</Link>).
      </p>
    </div>
  );
}
