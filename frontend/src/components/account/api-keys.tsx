"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";

type ApiKey = { id: number; name: string; prefix: string; created_at: string; last_used_at: string | null };
type Keys = { keys: ApiKey[]; max_keys: number };

const day = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/**
 * Les clés de l'API ouverte (ADR 0032, lot 5) : backend/api_keys.py les créait depuis le lot 1, sans écran pour le
 * faire. Les conditions s'acceptent en cochant une case non cochée d'avance (avis juridique du 08/11/2026) ; la clé
 * ne paraît en clair qu'une fois, à sa création.
 */
export function ApiKeys({ emailVerified }: { emailVerified: boolean }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [accept, setAccept] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  const keys = useQuery<Keys>({ queryKey: ["api-keys"], queryFn: () => apiFetch("/api/account/api-keys") });

  const create = useMutation({
    mutationFn: () => apiFetch("/api/account/api-keys", { method: "POST", body: { name, accept_terms: accept } }),
    onSuccess: (data: ApiKey & { key: string }) => {
      setCreated(data.key);
      setName("");
      setAccept(false);
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revoke = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/account/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Clé révoquée : elle ne marche plus.");
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const list = keys.data?.keys ?? [];
  const full = keys.data ? list.length >= keys.data.max_keys : false;

  return (
    <section className="space-y-4 rounded-lg border p-6" aria-labelledby="cles-api" data-testid="cles-api">
      <div>
        <h2 id="cles-api" className="text-lg font-semibold">Clés d&apos;API</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pour appeler l&apos;API depuis ton programme avec des quotas plus hauts que sans clé. Gratuites. Le mode
          d&apos;emploi :{" "}
          <Link href="/developpeurs" className="underline underline-offset-2 hover:text-foreground">l&apos;API pour les développeurs</Link>.
        </p>
      </div>

      {created && (
        <div className="space-y-2 rounded-md border-2 border-primary/40 p-3 text-sm" data-testid="cle-creee">
          <p className="font-medium">Ta nouvelle clé : copie-la maintenant, elle ne s&apos;affichera plus.</p>
          <p className="break-all rounded bg-secondary/30 p-2 font-mono text-foreground">{created}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(created).then(
              () => toast.success("Clé copiée."), () => toast.error("Copie impossible : sélectionne-la à la main."))}>
              Copier
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>C&apos;est noté</Button>
          </div>
        </div>
      )}

      {keys.isError ? (
        <p className="text-sm text-destructive">{keys.error.message}</p>
      ) : list.length > 0 ? (
        <ul className="divide-y rounded-md border text-sm" data-testid="liste-cles">
          {list.map((key) => (
            <li key={key.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{key.name}</p>
                <p className="text-muted-foreground">
                  <span className="font-mono">{key.prefix}…</span>, créée le {day(key.created_at)}
                  {key.last_used_at ? `, servie le ${day(key.last_used_at)}` : ", pas encore servie"}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => revoke.mutate(key.id)} disabled={revoke.isPending}>
                Révoquer
              </Button>
            </li>
          ))}
        </ul>
      ) : keys.data ? (
        <p className="text-sm text-muted-foreground">Aucune clé pour l&apos;instant.</p>
      ) : null}

      {!emailVerified ? (
        <p className="text-sm text-muted-foreground">Confirme d&apos;abord ton adresse e-mail pour créer une clé.</p>
      ) : full ? (
        <p className="text-sm text-muted-foreground">Tu as le nombre maximal de clés : révoque celle qui ne sert plus.</p>
      ) : (
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="cle-nom">Nom de la clé (ton application)</Label>
            <Input id="cle-nom" value={name} onChange={(event) => setName(event.target.value)} maxLength={60}
              placeholder="Mon appli de grilles" className="max-w-sm" />
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
            <input type="checkbox" checked={accept} onChange={(event) => setAccept(event.target.checked)}
              className="mt-0.5 size-4 accent-primary" data-testid="cle-conditions" />
            <span>
              J&apos;accepte les{" "}
              <Link href="/terms#api" className="underline underline-offset-2">conditions d&apos;utilisation de l&apos;API</Link>.
            </span>
          </label>
          <Button type="submit" size="sm" disabled={!name.trim() || !accept || create.isPending}>
            {create.isPending ? "Création…" : "Créer une clé"}
          </Button>
        </form>
      )}
    </section>
  );
}
