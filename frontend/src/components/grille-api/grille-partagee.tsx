"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GridPlayer } from "@/components/grid/grid-player";
import { linkClass } from "@/components/legal/section";
import { apiFetch, hasSession } from "@/lib/api-client";
import { decodeGrid, fragmentParams, missingClues, savedGridOf, specOf, type GridFile } from "@/lib/grille-api";
import { withNext } from "@/lib/next-path";

// Le lien de la grille, gardé le temps de l'onglet : il survit au détour par l'inscription ou la connexion
const KEY = "terminator:grille-api";

const LANGUES: Record<string, string> = { fr: "français", de: "allemand", en: "anglais" };

type State = { status: "loading" } | { status: "empty" } | { status: "error"; message: string }
  | { status: "ready"; grid: GridFile; play: boolean };

function readHash(): string {
  const hash = window.location.hash;
  try {
    if (hash.includes("g=")) {
      sessionStorage.setItem(KEY, hash);
      return hash;
    }
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return hash;
  }
}

/**
 * Une grille de l'API ouverte (ADR 0032), lue dans son lien : rien n'est stocké chez nous. On la joue avec le lecteur
 * de la grille du jour, on l'imprime, ou on l'enregistre dans son compte pour la retoucher (« Mes grilles »).
 */
export function GrillePartagee() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    setConnected(hasSession());
    const params = fragmentParams(readHash());
    const data = params.get("g");
    if (!data) {
      setState({ status: "empty" });
      return;
    }
    decodeGrid(data)
      .then((grid) => setState({ status: "ready", grid, play: params.get("mode") === "jouer" }))
      .catch(() => setState({ status: "error", message: "Ce lien est abîmé ou incomplet : la grille ne se lit pas." }));
  }, []);

  if (state.status === "loading") {
    return <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lecture de la grille…</p>;
  }
  if (state.status === "empty" || state.status === "error") {
    return (
      <div className="space-y-3" data-testid="grille-absente">
        <p>{state.status === "error" ? state.message : "Ce lien ne contient pas de grille."}</p>
        <p className="text-muted-foreground">
          Demande à l&apos;assistant de te redonner le lien en entier, ou{" "}
          <Link href="/grid" className={linkClass}>crée ta propre grille</Link>.
        </p>
      </div>
    );
  }

  const { grid } = state;
  const missing = missingClues(grid);
  const foreign = grid.lang !== "fr" ? LANGUES[grid.lang] ?? grid.lang : null;

  const save = async () => {
    setSaving(true);
    try {
      const { payload, definitions } = savedGridOf(grid);
      const created = await apiFetch("/api/grids", { method: "POST", body: { grid: payload } });
      if (Object.keys(definitions).length) {
        await apiFetch(`/api/grids/${created.id}`, { method: "PATCH", body: { definitions } });
      }
      setSavedId(created.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "La grille n'a pas pu être enregistrée.");
    } finally {
      setSaving(false);
    }
  };

  const here = typeof window === "undefined" ? "/grille" : `/grille${window.location.hash}`;

  return (
    <div className="space-y-6">
      {grid.author && (
        <p className="text-lg font-medium" data-testid="auteur">Une grille de {grid.author.slice(0, 60)}</p>
      )}
      <p className="text-muted-foreground">
        {grid.rows[0].length} × {grid.rows.length} cases, {grid.words.length} mots
        {grid.mystery ? `, un mot mystère en ${grid.mystery.word.replace(/ /g, "").length} lettres` : ""}
        {foreign ? ` — grille en ${foreign}` : ""}.
      </p>

      {missing > 0 ? (
        <div className="rounded-lg border p-4" data-testid="definitions-manquantes">
          <p>
            {missing === 1 ? "Un mot n'a" : `${missing} mots n'ont`} pas encore de définition : la grille ne se joue
            pas encore.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Enregistre-la dans ton compte pour écrire ce qui manque, ou demande à l&apos;assistant de les écrire.
          </p>
        </div>
      ) : (
        <GridPlayer spec={specOf(grid)} title="Ta grille de mots fléchés" />
      )}

      <section className="rounded-lg border p-4" aria-labelledby="garder">
        <h2 id="garder" className="font-semibold">La garder, la retoucher</h2>
        {savedId !== null ? (
          <Button asChild className="mt-3">
            <Link href={`/grids/edit?id=${savedId}`}>
              Ouvrir dans l&apos;éditeur <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        ) : connected ? (
          <Button onClick={save} disabled={saving} className="mt-3" data-testid="enregistrer-grille">
            {saving ? "Enregistrement…" : "Enregistrer dans mes grilles"}
          </Button>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Ce lien suffit pour la rejouer ou l&apos;imprimer : rien n&apos;est gardé chez nous.{" "}
            <Link href={withNext("/register", here)} className={linkClass}>Crée un compte</Link>{" "}
            (ou <Link href={withNext("/login", here)} className={linkClass}>connecte-toi</Link>) pour
            l&apos;enregistrer et retoucher ses définitions.
          </p>
        )}
      </section>

      {/* Le texte vient de qui a créé la grille, pas de nous (revue de sécurité du 02/11/2026) : on le dit */}
      <p className="text-xs text-muted-foreground" data-testid="grille-tiers">
        Cette grille et ses définitions ont été écrites par {grid.author ? grid.author.slice(0, 60) : "son auteur"}, avec
        l&apos;aide d&apos;une IA et de notre moteur : nous ne les relisons pas.{" "}
        <Link href="/contact" className={linkClass}>Signaler un contenu</Link>.
      </p>

      <p className="text-sm text-muted-foreground">
        Envie de la tienne ? <Link href="/grid" className={linkClass}>Crée une grille autour de tes mots</Link>.
      </p>
    </div>
  );
}
