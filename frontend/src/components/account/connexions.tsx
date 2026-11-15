"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { PROVIDER_LABELS, ProviderLogo, useProviders, type Provider } from "@/components/auth/fournisseurs";

/**
 * Les façons d'entrer dans le compte (ADR 0034) : le mot de passe, et les comptes Google ou Microsoft reliés. Relier
 * passe par un ticket demandé en POST (jeton CSRF), puis par le fournisseur ; délier n'est possible que s'il reste une
 * autre façon d'entrer.
 */
export type AccountIdentity = { provider: Provider; created_at: string };

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/** Demande un ticket à l'API, puis quitte le site pour le fournisseur. */
export async function goToProvider(provider: Provider, intent: "link" | "reauth") {
  const { url } = await apiFetch(`/api/auth/oidc/${provider}/ticket`, { method: "POST", body: { intent } });
  window.location.assign(url);
}

export function AccountConnections({ hasPassword, identities }: { hasPassword: boolean; identities: AccountIdentity[] }) {
  const providers = useProviders();
  const queryClient = useQueryClient();
  const link = useMutation({
    mutationFn: (provider: Provider) => goToProvider(provider, "link"),
    onError: (error: Error) => toast.error(error.message),
  });
  const unlink = useMutation({
    mutationFn: (provider: Provider) => apiFetch(`/api/auth/identities/${provider}`, { method: "DELETE" }),
    onSuccess: (data: { message: string }) => {
      toast.success(data.message);
      void queryClient.invalidateQueries({ queryKey: ["account"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Un fournisseur relié reste affiché même si l'API ne le propose plus : on doit pouvoir le délier
  const shown = Array.from(new Set<Provider>([...providers, ...identities.map((identity) => identity.provider)]));
  if (shown.length === 0) return null;

  return (
    <section className="space-y-4 rounded-lg border p-6" aria-labelledby="connexions-titre">
      <div>
        <h2 id="connexions-titre" className="text-lg font-semibold">Connexion</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasPassword
            ? "Tu te connectes avec ton adresse e-mail et ton mot de passe."
            : "Ton compte n'a pas de mot de passe : « Mot de passe oublié ? », sur la page de connexion, permet d'en choisir un."}{" "}
          Un compte relié ouvre aussi le tien, sans mot de passe.
        </p>
      </div>
      <ul className="divide-y rounded-md border">
        {shown.map((provider) => {
          const identity = identities.find((item) => item.provider === provider);
          const lastWay = identity && !hasPassword && identities.length === 1;
          return (
            <li key={provider} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-center gap-2 text-sm">
                <ProviderLogo provider={provider} />
                <span>
                  <span className="font-medium">{PROVIDER_LABELS[provider]}</span>
                  <span className="text-muted-foreground">
                    {identity ? ` · relié depuis le ${DATE.format(new Date(identity.created_at))}` : " · pas relié"}
                  </span>
                </span>
              </span>
              {identity ? (
                <Button size="sm" variant="outline" disabled={unlink.isPending || lastWay}
                  title={lastWay ? "C'est ta seule façon de te connecter : choisis d'abord un mot de passe." : undefined}
                  onClick={() => unlink.mutate(provider)}>
                  Délier
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled={link.isPending} onClick={() => link.mutate(provider)}>
                  Relier mon compte {PROVIDER_LABELS[provider]}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
