"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Check, Grid3x3, Loader2, RefreshCw } from "lucide-react";
import { AccountBenefits } from "@/components/account/account-benefits";
import { PrintGrid } from "@/components/grid/print-grid";
import { ApiError, apiFetch, apiStream } from "@/lib/api-client";
import { useDebounce } from "@/hooks/use-debounce";
import { GridDisplay, type GridData } from "@/components/grid/grid-display";
import { WordList, type WordEntry } from "@/components/grid/word-list";
import { DifficultyPanel, FitNotice, SizeAdvice, type Difficulty } from "@/components/grid/difficulty-panel";
import { DictionaryPicker } from "@/components/grid/dictionary-picker";
import { SaveGrid, type SavedRef } from "@/components/grid/save-grid";
import { loadLastGrid, storeLastGrid } from "@/lib/last-grid";
import { mysteryProblem } from "@/lib/mystery";

/** La grille est là, mais le mot mystère n'a pas pu y être écrit : il manque des lettres (#218). */
type MysteryError = { error: string; reason: string; missing: string[] };

type GridSize = { width: number; height: number };

const sizeKey = (size: GridSize) => `${size.width}x${size.height}`;

/**
 * Toutes les grilles sont dessinées par le moteur (#220) : le choix « Du catalogue » / « Sur mesure » a quitté
 * l'écran, la taille est libre. Bornes de l'API (`GENERATED_SIDES`, backend/grid_generator.py).
 */
const SIDES = { min: 5, max: 20 };
const isSide = (side: number) => Number.isInteger(side) && side >= SIDES.min && side <= SIDES.max;
/** Trois tailles d'un clic (#220, retour de l'auteur du 06/10/2026) ; toute autre taille passe par « Taille libre ». */
const PRESETS: (GridSize & { name: string })[] = [
  { name: "Petite", width: 7, height: 9 },
  { name: "Moyenne", width: 10, height: 13 },
  { name: "Grande", width: 13, height: 16 },
];
const DEFAULT_SIZE = { width: "10", height: "13" };

/** Où en est la recherche (#209, #220) : de quoi faire avancer la barre, sans montrer de grille intermédiaire. */
type Search = {
  /** Début de la recherche, horloge du navigateur (ms). */
  startedAt: number;
  /** Fin attendue annoncée par l'API (`expected_s`), en secondes depuis le début ; `null` avant le premier événement. */
  expected: number | null;
  record: number | null;
  words: number;
};

// Le moteur écrit sans accent ni tiret : ARC-EN-CIEL est placé sous la forme ARCENCIEL
const plainWord = (word: string) => word.normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase();

/** Une demande d'estimation, gardée en texte le temps que la saisie se pose (`useDebounce`). */
function parseRequestKey(key: string): { words: string[]; size: GridSize | null } {
  const { words, size } = JSON.parse(key) as { words: string[]; size: string };
  const [width, height] = size.split("x").map(Number);
  return { words, size: size ? { width, height } : null };
}

/**
 * Ce que veulent dire des échecs répétés, quand l'estimation annonçait mieux.
 *
 * À 66 % par tentative, trois échecs de suite n'arrivent qu'une fois sur 26. Le dire vaut mieux que
 * de laisser l'auteur relancer indéfiniment : la vraie information, c'est que l'estimation — mesurée
 * sur des mots courants du lexique — ne colle pas à ses mots.
 */
function RepeatedFailures({ attempts, rate, hardest }: { attempts: number; rate: number | null; hardest: string | null }) {
  if (attempts < 2) return null;
  const improbable = rate !== null && rate > 0 && rate < 1 ? Math.round(1 / Math.pow(1 - rate, attempts)) : null;

  return (
    <div className="mt-3 space-y-2 border-t border-destructive/20 pt-3 text-sm">
      <p>
        <strong>
          {attempts} tentatives, {attempts} échecs.
        </strong>{" "}
        {improbable !== null && rate !== null
          ? `À ${Math.round(rate * 100)} % par tentative, cela n'arrive qu'une fois sur ${improbable} :` +
            " l'estimation ne colle pas à tes mots."
          : "Relancer encore ne changera probablement rien."}
      </p>
      <p className="text-muted-foreground">
        Ce qui change vraiment les choses, dans l&apos;ordre :
      </p>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        {hardest && (
          <li>
            décocher « Obligatoire » pour <span className="font-mono font-semibold">{hardest}</span> : il
            sera placé s&apos;il rentre, sans faire échouer la grille ;
          </li>
        )}
        <li>raccourcir : c&apos;est la longueur qui décide, bien plus que le nombre de mots ;</li>
        <li>prendre la taille conseillée : pour des mots longs, une grande grille offre plus d&apos;emplacements.</li>
      </ul>
    </div>
  );
}

/** « Signaler ce problème » : le formulaire de contact, déjà réglé sur « problème » et muni de l'identifiant de la requête. */
function ReportProblem({ requestId }: { requestId: string | null }) {
  const href = requestId ? `/contact?reason=problem&request=${encodeURIComponent(requestId)}` : "/contact?reason=problem";
  return (
    <p className="text-sm">
      <Link href={href} className="underline underline-offset-2">Signaler ce problème</Link>
    </p>
  );
}

/** Refus de génération : chaque cause mérite sa propre explication, pas un « impossible » commun. */
function FailureNotice({
  error,
  attempts,
  rate,
  hardest,
}: {
  error: ApiError;
  attempts: number;
  rate: number | null;
  hardest: string | null;
}) {
  const data = error.data as {
    reason?: string;
    details?: { word: string; problem: string }[];
    unplaced?: string[];
  };

  return (
    <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-4">
      <p className="font-medium text-destructive">{error.message}</p>

      {data.reason === "must_words" && (
        <>
          <ul className="space-y-1 text-sm">
            {(data.details ?? []).map((detail) => (
              <li key={detail.word}>
                <span className="font-mono font-semibold">{detail.word}</span> — {detail.problem}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            Agrandis la grille, raccourcis ces mots, ou décoche « Obligatoire ».
          </p>
        </>
      )}

      {data.reason === "must_words_unplaced" && (
        <p className="text-sm">
          Le solveur n&apos;a pas réussi à placer{" "}
          <span className="font-mono font-semibold">{(data.unplaced ?? []).join(", ")}</span>. Ces mots entrent
          dans la grille, mais aucun croisement ne fonctionne. Relance pour tenter une autre disposition, ou
          décoche « Obligatoire ».
        </p>
      )}

      {data.reason === "timeout" && (
        <p className="text-sm">Relance : chaque tentative suit un chemin différent.</p>
      )}

      <RepeatedFailures attempts={attempts} rate={rate} hardest={hardest} />
      <ReportProblem requestId={error.requestId} />
    </div>
  );
}

/** Au-delà de trois mots, ou sous 70 % de chances, un mot ajouté arrive souhaité. */
const MAX_REQUIRED_BY_DEFAULT = 3;
const REQUIRED_THRESHOLD = 0.7;

/**
 * La taille de la grille (#220) : quelques tailles d'un clic, et la largeur et la hauteur, libres de 5 à 20.
 * Les tailles d'un clic sont des boutons radio natifs, masqués : les flèches du clavier passent de l'une à
 * l'autre ; dans les champs, elles font varier la taille d'une case.
 */
function SizePicker({
  value,
  onChange,
  disabled,
}: {
  value: { width: string; height: string };
  onChange: (value: { width: string; height: string }) => void;
  disabled?: boolean;
}) {
  const valid = isSide(Number(value.width)) && isSide(Number(value.height));
  const current = `${value.width}x${value.height}`;
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Tailles courantes" className="grid grid-cols-3 gap-2">
        {PRESETS.map((preset) => {
          const key = sizeKey(preset);
          const checked = current === key;
          return (
            <label key={key} className="relative">
              <input
                type="radio"
                name="size-preset"
                value={key}
                checked={checked}
                onChange={() => onChange({ width: String(preset.width), height: String(preset.height) })}
                disabled={disabled}
                className="peer sr-only"
              />
              {/* Choisie : une case cochée, une bordure épaisse et un fond à peine teinté */}
              <span className="flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-1 py-1.5 text-sm tabular-nums transition-colors hover:bg-secondary/60 peer-checked:border-2 peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:font-semibold peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
                <span
                  aria-hidden
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border ${
                    checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/60"
                  }`}
                >
                  {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className="flex flex-col items-start leading-tight">
                  <span>{preset.name}</span>
                  <span className="text-xs">{preset.width}&nbsp;×&nbsp;{preset.height}</span>
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Taille libre</p>
        <div className="flex items-end gap-2">
          {(["width", "height"] as const).map((side, index) => (
            <div key={side} className="flex items-end gap-2">
              {index > 0 && <span aria-hidden className="pb-2 text-sm text-muted-foreground">×</span>}
              <label className="space-y-1">
                <span className="block text-xs font-medium">{side === "width" ? "Largeur" : "Hauteur"}</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={SIDES.min}
                  max={SIDES.max}
                  step={1}
                  value={value[side]}
                  onChange={(event) => onChange({ ...value, [side]: event.target.value })}
                  disabled={disabled}
                  aria-invalid={!isSide(Number(value[side]))}
                  className="w-20 tabular-nums"
                />
              </label>
            </div>
          ))}
        </div>
        <p className={`text-xs ${valid ? "text-muted-foreground" : "text-destructive"}`}>
          De {SIDES.min} à {SIDES.max} cases de côté.
        </p>
      </div>
    </div>
  );
}

/**
 * La barre de progression (#220) : une seule grille, rendue à la fin. Le moteur s'arrête dès que tous les mots
 * sont placés, ou quand la meilleure grille ne s'améliore plus ; l'API annonce cette fin attendue (`expected_s`),
 * que la barre suit au dixième de seconde. Elle ne recule jamais, et attend la grille avant d'atteindre le bout.
 */
function SearchProgress({ search }: { search: Search }) {
  const [now, setNow] = useState(() => Date.now());
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, []);
  const elapsed = Math.max(0, (now - search.startedAt) / 1000);
  const ratio = Math.min(0.97, elapsed / Math.max(0.5, search.expected ?? 5));
  useEffect(() => setShown((previous) => Math.max(previous, ratio)), [ratio]);
  const percent = Math.round(Math.max(shown, ratio) * 100);

  return (
    <div className="w-full max-w-sm space-y-3">
      <p className="flex items-center justify-center gap-2 text-sm font-medium text-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Le moteur dessine ta grille…
      </p>
      <div
        role="progressbar"
        aria-label="Génération de la grille"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-100 ease-linear" style={{ width: `${percent}%` }} />
      </div>
      {search.words > 0 && search.record !== null && (
        <p className="text-xs" role="status">
          Pour l&apos;instant, {search.record} de tes {search.words} mot{search.words > 1 ? "s" : ""} placé
          {search.record > 1 ? "s" : ""}.
        </p>
      )}
    </div>
  );
}

/**
 * L'écran de génération.
 *
 * Pensé pour quelqu'un qui arrive sans rien savoir : une taille, un bouton, une grille. Imposer des
 * mots reste possible, mais c'est une **option**, repliée par défaut — l'ancien écran ouvrait sur la
 * liste de mots et laissait croire qu'il fallait la remplir.
 *
 * La demande et la dernière grille sont gardées dans le navigateur (`last-grid`) : on peut aller se
 * connecter et revenir la conserver.
 */
export function GridClientLayout() {
  const [entries, setEntries] = useState<WordEntry[]>([]);
  const [sizeFields, setSizeFields] = useState(DEFAULT_SIZE);
  const [dictionaryIds, setDictionaryIds] = useState<number[]>([]);
  const [gridData, setGridData] = useState<GridData | null>(null);
  const [saved, setSaved] = useState<SavedRef | null>(null);
  // Les mots demandés que le moteur n'a pas pu placer : un souhaité absent doit se voir
  const [unplaced, setUnplaced] = useState<string[]>([]);
  const [restored, setRestored] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  // Où en est la recherche (#220) : la barre, pas de grille intermédiaire
  const [search, setSearch] = useState<Search | null>(null);
  const streamRef = useRef<AbortController | null>(null);
  // Échecs consécutifs pour une même demande : c'est leur répétition qui informe, pas le dernier
  const [failures, setFailures] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  // Le mot mystère tapé, et son échec sur la dernière grille (lettres absentes) : la grille, elle, est là
  const [mystery, setMystery] = useState("");
  const [mysteryOpen, setMysteryOpen] = useState(false);
  const [mysteryError, setMysteryError] = useState<MysteryError | null>(null);
  const resultRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Lu après le montage : le stockage n'existe pas au rendu statique, et l'y lire casserait l'hydratation
  useEffect(() => {
    const last = loadLastGrid();
    if (last) {
      if (last.size) setSizeFields({ width: String(last.size.width), height: String(last.size.height) });
      setEntries(last.entries);
      setDictionaryIds(last.dictionaryIds);
      setGridData(last.grid);
      setSaved(last.saved);
      setMystery(last.mystery ?? "");
      if (last.mystery) setMysteryOpen(true);
    }
    setRestored(true);
  }, []);

  const width = Number(sizeFields.width);
  const height = Number(sizeFields.height);
  // La taille demandée, nulle tant qu'elle sort des bornes
  const size: GridSize | null = isSide(width) && isSide(height) ? { width, height } : null;
  const sizeLabel = size ? sizeKey(size) : "";

  useEffect(() => {
    // Avant la lecture, ce serait écraser la grille gardée par un écran encore vide
    if (!restored) return;
    const [storedWidth, storedHeight] = sizeLabel.split("x").map(Number);
    storeLastGrid({
      size: sizeLabel ? { width: storedWidth, height: storedHeight } : null,
      entries,
      dictionaryIds,
      grid: gridData,
      saved,
      mystery,
    });
  }, [restored, sizeLabel, entries, dictionaryIds, gridData, saved, mystery]);
  const mysteryHint = mysteryProblem(mystery);

  const chooseSize = (next: GridSize) => setSizeFields({ width: String(next.width), height: String(next.height) });

  const required = entries.filter((entry) => entry.required).map((entry) => entry.text);
  const wished = entries.filter((entry) => !entry.required).map((entry) => entry.text);
  // Le chiffre ne doit pas sauter à chaque frappe : on attend que la saisie se pose
  const estimateKey = useDebounce(JSON.stringify({ words: required, size: sizeLabel }), 300);

  // Tous les mots imposés, obligatoires ou souhaités : ceux qui ne tiennent pas dans la taille (un mot
  // souhaité impossible serait accepté sans rien dire, et jamais placé), et la taille conseillée (#220)
  // Dès qu'un mot est saisi ou changé, même avant de savoir s'il sera obligatoire ; sans taille valide, la taille
  // conseillée seule (retour de l'auteur du 06/10/2026)
  const fitKey = useDebounce(
    JSON.stringify({ words: entries.map((entry) => entry.text), size: sizeLabel }),
    300,
  );
  const [fit, setFit] = useState<Pick<Difficulty, "impossible" | "best_size"> | null>(null);
  useEffect(() => {
    const { words, size } = parseRequestKey(fitKey);
    if (!words.length) {
      setFit(null);
      return;
    }
    let cancelled = false;
    apiFetch("/api/grids/difficulty", {
      method: "POST",
      body: { must_words: words, ...(size ? { size } : {}), geometry: "sur_mesure" },
    })
      .then((data) => { if (!cancelled) setFit(data); })
      .catch(() => { if (!cancelled) setFit(null); });
    return () => { cancelled = true; };
  }, [fitKey]);

  // Changer un mot ou la taille, c'est une autre demande : les échecs précédents ne la concernent plus
  useEffect(() => setFailures(0), [estimateKey]);

  useEffect(() => {
    const { words, size } = parseRequestKey(estimateKey);
    if (!words.length) {
      setDifficulty(null);
      return;
    }
    let cancelled = false;
    setIsEstimating(true);
    apiFetch("/api/grids/difficulty", {
      method: "POST",
      body: { must_words: words, ...(size ? { size } : {}), geometry: "sur_mesure" },
    })
      .then((data) => { if (!cancelled) setDifficulty(data); })
      .catch(() => { if (!cancelled) setDifficulty(null); })
      .finally(() => { if (!cancelled) setIsEstimating(false); });
    return () => { cancelled = true; };
  }, [estimateKey]);

  /**
   * Obligatoire ou souhaité, décidé à l'ajout : les trois premiers mots arrivent obligatoires tant
   * que la grille garde **plus de 70 %** de chances d'aboutir avec eux ; au-delà, souhaités. Le taux
   * est celui de l'ensemble — PORTE seul passe à 100 %, PORTE et MUSIQUE ensemble tombent à 61 %.
   * Un mot à la fois, dans l'ordre de saisie, puisque chacun change le taux du suivant. L'auteur qui
   * bascule un mot avant la réponse a le dernier mot : sa décision n'est pas écrasée.
   */
  useEffect(() => {
    const next = entries.find((entry) => entry.pending);
    if (!next || !sizeLabel) return;
    const [width, height] = sizeLabel.split("x").map(Number);
    let cancelled = false;
    const already = entries.filter((entry) => entry.required).map((entry) => entry.text);
    const settle = (isRequired: boolean) =>
      setEntries((list) =>
        list.map((entry) =>
          entry.id === next.id && entry.pending ? { ...entry, required: isRequired, pending: false } : entry,
        ),
      );
    if (already.length >= MAX_REQUIRED_BY_DEFAULT) {
      settle(false);
      return;
    }
    apiFetch("/api/grids/difficulty", {
      method: "POST",
      body: { must_words: [...already, next.text], size: { width, height }, geometry: "sur_mesure" },
    })
      // Sans taux mesuré, le mot arrive souhaité : il ne peut pas faire échouer la grille
      .then((data) => {
        if (!cancelled) settle(typeof data.success_rate === "number" && data.success_rate > REQUIRED_THRESHOLD);
      })
      .catch(() => { if (!cancelled) settle(false); });
    return () => { cancelled = true; };
  }, [entries, sizeLabel]);

  const generate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!size || mysteryHint) return;
    setIsGenerating(true);
    setFailure(null);
    setGridData(null);
    setSaved(null);
    setUnplaced([]);
    setMysteryError(null);
    // Sur téléphone, le résultat tombe sous le formulaire : on l'amène à l'écran. Sur grand écran il
    // est déjà à côté, et faire défiler cacherait le titre.
    if (window.matchMedia("(max-width: 1023px)").matches) {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // En flux (#209) : les événements `progress` font avancer la barre (#220) ; la grille arrive avec `done`
    const stream = new AbortController();
    streamRef.current = stream;
    setSearch({ startedAt: Date.now(), expected: null, record: null, words: 0 });
    try {
      const data = await apiStream(
        "/api/grids/generate",
        {
          method: "POST",
          signal: stream.signal,
          body: {
            size,
            geometry: "sur_mesure",
            seed: Math.floor(Math.random() * 1_000_000),
            must_words: required,
            wish_words: wished,
            wish_dictionary_ids: dictionaryIds,
            ...(mystery.trim() ? { mystery_word: mystery.trim() } : {}),
          },
        },
        (event, payload) => {
          if (event !== "progress") return;
          setSearch((current) =>
            current && {
              ...current,
              expected: typeof payload.expected_s === "number" ? payload.expected_s : current.expected,
              record: typeof payload.record === "number" ? payload.record : current.record,
              words: Number(payload.words ?? current.words),
            },
          );
        },
      );
      const grid = data.grid as GridData;
      setGridData(grid);
      setMysteryError((data.mystery_error as MysteryError | undefined) ?? null);
      setUnplaced(wished.filter((word) => !grid.words.some((placed) => plainWord(placed.text) === plainWord(word))));
      setFailures(0);
    } catch (error) {
      // Page quittée : rien à afficher
      if (stream.signal.aborted) return;
      setFailures((count) => count + 1);
      setFailure(error instanceof ApiError
        ? error
        : new ApiError(error instanceof Error ? error.message : "Une erreur inattendue est survenue.", 0, {}));
    } finally {
      if (streamRef.current === stream) {
        streamRef.current = null;
        setIsGenerating(false);
        setSearch(null);
      }
    }
  };

  // Une recherche en cours s'arrête si la page est quittée
  useEffect(() => () => streamRef.current?.abort(), []);

  return (
    <main className="container mx-auto p-4 md:p-8">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Générer une grille</h1>
        <p className="mt-2 text-muted-foreground">
          Choisis une taille : le moteur dessine la grille en quelques secondes. Tu relis ensuite
          ses mots et écris les définitions.
        </p>
      </div>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        <div className="space-y-6">
        <form ref={formRef} onSubmit={generate} className="space-y-6 rounded-lg border p-5">
          {/* Ordre du panneau (retour de l'auteur du 06/10/2026) : les mots, leurs chances, la taille (conseillée ou
              libre), le mot mystère, puis les dictionnaires. Les mots sont une option : sans eux, le moteur choisit */}
          <section className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold">
                Imposer des mots
                <span className="ml-1.5 font-normal text-muted-foreground">(facultatif)</span>
              </h2>
              <p className="text-xs text-muted-foreground">Un thème, des prénoms… Sinon, le moteur choisit tout seul.</p>
            </div>
            <WordList entries={entries} onChange={setEntries} disabled={isGenerating} />
            {fit && fit.impossible?.length > 0 && <FitNotice fit={fit} />}
            {required.length > 0 && (
              <DifficultyPanel difficulty={difficulty} isLoading={isEstimating} hasRequiredWords />
            )}
          </section>

          <section className="space-y-3 border-t pt-4">
            <h2 className="text-sm font-semibold">Taille de la grille</h2>
            {fit?.best_size && (
              <SizeAdvice best={fit.best_size} current={size} onApply={chooseSize} disabled={isGenerating} />
            )}
            <SizePicker value={sizeFields} onChange={setSizeFields} disabled={isGenerating} />
          </section>

          {/* Repliée : une option de plus, que l'on ouvre quand on prépare un cadeau (#218) */}
          <details
            className="group border-t pt-4"
            open={mysteryOpen}
            onToggle={(event) => setMysteryOpen(event.currentTarget.open)}
          >
            <summary className="cursor-pointer text-sm font-semibold">
              Mot mystère
              <span className="ml-1.5 font-normal text-muted-foreground">(facultatif)</span>
            </summary>
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                Un prénom, « MERCI », « JOYEUX NOEL »… Ses lettres sont numérotées dans la grille : on peut le
                deviner avant de l&apos;avoir finie. Une rangée de cases l&apos;attend au-dessus de la grille.
              </p>
              <Input
                value={mystery}
                maxLength={40}
                disabled={isGenerating}
                placeholder="Ex : MARIE"
                onChange={(event) => setMystery(event.target.value)}
                aria-label="Mot mystère"
                aria-invalid={mysteryHint ? true : undefined}
                aria-describedby={mysteryHint ? "mystery-hint" : undefined}
              />
              {mysteryHint && (
                <p id="mystery-hint" className="text-xs text-destructive">
                  {mysteryHint}
                </p>
              )}
            </div>
          </details>

          <section className="space-y-2 border-t pt-4">
            <h2 className="text-sm font-semibold">Puiser dans tes dictionnaires</h2>
            <DictionaryPicker selected={dictionaryIds} onChange={setDictionaryIds} disabled={isGenerating} />
          </section>

          <Button type="submit" size="lg" disabled={isGenerating || !size || Boolean(mysteryHint)} className="w-full">
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Génération en cours…
              </>
            ) : gridData ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Générer une autre grille
              </>
            ) : (
              "Générer la grille"
            )}
          </Button>
        </form>
        <AccountBenefits next="/grid" page="generation" />
        </div>

        <section ref={resultRef} aria-label="Grille générée" aria-live="polite" className="scroll-mt-20">
          {failure && (
            <FailureNotice
              error={failure}
              attempts={failures}
              rate={difficulty?.success_rate ?? null}
              hardest={difficulty?.hardest ?? null}
            />
          )}
          {gridData && !isGenerating ? (
            <div className="space-y-6">
              {mysteryError && (
                <div role="status" className="space-y-2 rounded-md border border-amber-500/60 bg-amber-500/5 p-4">
                  <p className="flex items-start gap-2 text-sm font-medium">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
                    Mot mystère : {mysteryError.error}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    En attendant, la grille ci-dessous est prête, sans mot mystère. Tu peux aussi changer de mot
                    avant de relancer.
                  </p>
                  <Button type="button" size="sm" disabled={isGenerating} onClick={() => formRef.current?.requestSubmit()}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Relancer la génération
                  </Button>
                </div>
              )}
              <SaveGrid grid={gridData} saved={saved} onSaved={setSaved} />
              <div className="flex justify-center">
                <PrintGrid grid={gridData} />
              </div>
              <GridDisplay gridData={gridData} unplaced={unplaced} />
            </div>
          ) : (
            !failure && (
              <div className="flex min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                {isGenerating && search ? (
                  <SearchProgress search={search} />
                ) : (
                  <>
                    <Grid3x3 className="h-8 w-8 opacity-40" />
                    <p className="mt-3 text-sm">Ta grille apparaîtra ici.</p>
                  </>
                )}
              </div>
            )
          )}
        </section>
      </div>
    </main>
  );
}
