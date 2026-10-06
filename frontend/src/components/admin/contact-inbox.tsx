"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, MailOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dateTime, Empty, Group, number, Section } from "@/components/admin/parts";
import { apiFetch } from "@/lib/api-client";
import { site } from "@/config/site";

/** `GET /api/admin/contact` (backend/admin.py) : la seule rubrique du poste de pilotage qui montre des messages. */
type Inbox = {
  unread: number;
  messages: {
    id: number;
    at: string;
    reason: "suggestion" | "problem" | "data";
    message: string;
    reply_email: string | null;
    request_id: string | null;
    from_account: boolean;
    read: boolean;
  }[];
};

const REASONS = { suggestion: "Suggestion", problem: "Problème", data: "Données personnelles" } as const;

/**
 * La boîte de réception des messages du formulaire de contact (Phase 8, #131). Les seules écritures sont « marquer
 * comme lu » et « supprimer » (ADR 0016, point 6). Le texte s'affiche tel quel, jamais interprété.
 */
export function ContactInbox() {
  const queryClient = useQueryClient();
  const inbox = useQuery<Inbox>({
    queryKey: ["admin-contact"],
    retry: false,
    queryFn: () => apiFetch("/api/admin/contact"),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-contact"] });
  const mark = useMutation({
    mutationFn: ({ id, read }: { id: number; read: boolean }) =>
      apiFetch(`/api/admin/contact/${id}`, { method: "PATCH", body: { read } }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/contact/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });

  const unread = inbox.data?.unread ?? 0;
  return (
    <Group id="messages" title={unread > 0 ? `Boîte de réception (${number.format(unread)} non lu${unread > 1 ? "s" : ""})` : "Boîte de réception"}>
      <Section title="Messages du formulaire de contact"
        description="Les plus récents d'abord. Gardés 12 mois ; le message ne quitte jamais le serveur dans un e-mail de notification.">
        {inbox.isError ? (
          <p className="text-sm text-destructive">Boîte de réception indisponible.</p>
        ) : !inbox.data || inbox.data.messages.length === 0 ? <Empty /> : (
          <ul className="space-y-4">
            {inbox.data.messages.map((item) => (
              <li key={item.id} className={`rounded-lg border p-4 ${item.read ? "" : "border-2 border-primary"}`}>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
                  <p className="font-medium">
                    {REASONS[item.reason] ?? item.reason}
                    {!item.read && <span className="ml-2 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">Non lu</span>}
                  </p>
                  <p className="text-muted-foreground">
                    {dateTime.format(new Date(item.at))} UTC{item.from_account ? " · depuis un compte" : ""}
                  </p>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.message}</p>
                {item.request_id && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Requête <span className="font-mono">{item.request_id}</span> (à chercher dans Sentry et les journaux)
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {item.reply_email ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={`mailto:${item.reply_email}?subject=${encodeURIComponent(`Re : ton message ${site.nameAfterA}`)}`}>
                        Répondre à {item.reply_email}
                      </a>
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Pas d&apos;adresse de réponse.</span>
                  )}
                  <Button type="button" variant="ghost" size="sm" disabled={mark.isPending}
                    onClick={() => mark.mutate({ id: item.id, read: !item.read })}>
                    {item.read ? <Mail className="mr-1.5 h-4 w-4" /> : <MailOpen className="mr-1.5 h-4 w-4" />}
                    {item.read ? "Marquer comme non lu" : "Marquer comme lu"}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={remove.isPending}
                    onClick={() => { if (window.confirm("Supprimer ce message, définitivement ?")) remove.mutate(item.id); }}>
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    Supprimer
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {(mark.isError || remove.isError) && <p role="alert" className="mt-2 text-sm text-destructive">L&apos;action n&apos;a pas abouti.</p>}
      </Section>
    </Group>
  );
}
