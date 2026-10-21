"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { InvitationApresRecherche, MotQuiManque } from "@/components/mots/invitation-apres-recherche";
import { BoutonSignaler, MotsEnColonnes, useSignalement } from "@/components/mots/mots-en-colonnes";
import { RangeeDeLettres } from "@/components/mots/rangee-de-lettres";
import { SelecteurDeLongueur } from "@/components/mots/selecteur-longueur";
import { enTeteSection, pastille } from "@/components/mots/style";
import { Button } from "@/components/ui/button";
import { LONGUEUR_MAX, LONGUEUR_MIN } from "@/content/mots/longueurs";
import { useDebounce } from "@/hooks/use-debounce";
import { apiFetch } from "@/lib/api-client";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** Le plus que l'API accepte de rendre d'un coup (`SearchRequest.limit`) */
const LIMITE = 500;

/** Le délai avant de chercher, une fois la dernière lettre tapée : comme la page `/search` */
const DELAI_MS = 300;

type Etat =
  | { statut: "repos" }
  | { statut: "recherche"; motif: string }
  | { statut: "trouve"; motif: string; mots: string[] }
  | { statut: "erreur"; motif: string; message: string };

/**
 * Le motif passé dans l'adresse (`?motif=A????`), nettoyé comme celui de `/search` (lettres et points
 * d'interrogation, sans accent) : on ne le garde que s'il a de 2 à 15 lettres et au moins une lettre connue. Sa
 * longueur peut différer de celle de la page : la rangée de cases s'y adapte.
 */
export function motifDeLAdresse(search: string): string | null {
  const brut = new URLSearchParams(search).get("motif") ?? "";
  const motif = brut.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z?]/g, "");
  return motif.length >= LONGUEUR_MIN && motif.length <= LONGUEUR_MAX && /[A-Z]/.test(motif) ? motif : null;
}

const lettresDuMotif = (motif: string) => [...motif].map((c) => (c === "?" ? "" : c));
const motifDesLettres = (lettres: string[]) => (lettres.every((l) => l === "") ? null : lettres.map((l) => l || "?").join(""));
const vides = (longueur: number) => Array<string>(longueur).fill("");

/**
 * L'outil d'une page « Mot de N lettres » : le choix du nombre de lettres, la rangée de cases et, dessous, les mots.
 *
 * - La recherche se met à jour toute seule pendant qu'on tape (300 ms après la dernière lettre, comme `/search`) ;
 *   « Chercher » et Entrée la lancent tout de suite. Le motif cherché est écrit dans l'adresse (`?motif=A????`), pour
 *   se partager, et relu au chargement.
 * - Une page de combinaison (`motifInitial`, `children`) arrive avec ses cases remplies et sa liste complète dans le
 *   HTML (les `children`, rendus au build) ; dès qu'on touche aux cases, les résultats la remplacent.
 * - Un hub (sans `children`) est vide tant qu'on ne cherche pas. Il montre en plus ses `raccourcis` (liens vers les
 *   pages de combinaison, rendus au build) ou, sans pages de combinaison, des boutons `finales` qui remplissent les
 *   cases ; les uns et les autres disparaissent quand on change de longueur sur place.
 * - Le sélecteur de longueur mène à la page de la longueur quand elle existe, sinon la rangée change de taille ici.
 */
export function OutilLongueur({
  longueur,
  finales,
  raccourcis,
  motifInitial,
  children,
  motsInitiaux,
}: {
  /** La longueur de la page */
  longueur: number;
  finales?: readonly string[];
  raccourcis?: ReactNode;
  motifInitial?: string;
  children?: ReactNode;
  /** Les mots de la liste statique (page de combinaison), pour proposer de la resserrer */
  motsInitiaux?: string[];
}) {
  const pathname = usePathname();
  const lettresInitiales = motifInitial ? lettresDuMotif(motifInitial) : vides(longueur);
  const [courante, setCourante] = useState(longueur);
  const [lettres, setLettres] = useState<string[]>(lettresInitiales);
  // Faux : la page est comme au build (sa liste statique, ses cases d'origine) ; vrai dès qu'on a touché à l'outil
  const [remplace, setRemplace] = useState(false);
  const [etat, setEtat] = useState<Etat>({ statut: "repos" });
  const [requete, setRequete] = useState<{ motif: string; numero: number } | null>(null);
  const dernierMotif = useRef<string | null>(null);
  const resultats = useRef<HTMLDivElement>(null);

  const motif = motifDesLettres(lettres);
  const motifRetarde = useDebounce(motif, DELAI_MS);

  const ecrireAdresse = useCallback(
    (nouveau: string | null) => {
      window.history.replaceState(window.history.state, "", nouveau ? `${pathname}?motif=${encodeURIComponent(nouveau)}` : pathname);
    },
    [pathname],
  );

  /** Lance la recherche de ce motif, sauf s'il vient d'être demandé (et qu'on ne force pas) ; `null` : plus rien à chercher */
  const demander = useCallback(
    (nouveau: string | null, forcer = false) => {
      if (nouveau === dernierMotif.current && !forcer) return;
      dernierMotif.current = nouveau;
      ecrireAdresse(nouveau);
      if (nouveau === null) {
        setRequete(null);
        setEtat({ statut: "repos" });
      } else {
        setRequete((avant) => ({ motif: nouveau, numero: (avant?.numero ?? 0) + 1 }));
      }
    },
    [ecrireAdresse],
  );

  // Un motif dans l'adresse (lien partagé) : cases remplies, longueur adaptée et résultats, dès le chargement
  useEffect(() => {
    const dansAdresse = motifDeLAdresse(window.location.search);
    if (!dansAdresse) return;
    setCourante(dansAdresse.length);
    setLettres(lettresDuMotif(dansAdresse));
    setRemplace(true);
    demander(dansAdresse);
  }, [demander]);

  // La mise à jour automatique : le motif tapé, une fois la frappe posée (le motif retardé a rattrapé les cases)
  useEffect(() => {
    if (remplace && motifRetarde === motif) demander(motif);
  }, [motifRetarde, motif, remplace, demander]);

  useEffect(() => {
    if (!requete) return;
    let annule = false;
    const cherche = requete.motif;
    setEtat({ statut: "recherche", motif: cherche });
    apiFetch("/api/search", { method: "POST", body: { mask: cherche, limit: LIMITE } })
      .then((donnees) => {
        if (annule) return;
        const mots: string[] = (donnees.results ?? []).map((resultat: { mot: string }) => resultat.mot);
        setEtat({ statut: "trouve", motif: cherche, mots });
      })
      .catch((erreur: unknown) => {
        if (annule) return;
        setEtat({
          statut: "erreur",
          motif: cherche,
          message: erreur instanceof Error ? erreur.message : "La recherche a échoué.",
        });
      });
    return () => {
      annule = true;
    };
  }, [requete]);

  // Après un clic sur un raccourci, on ramène les mots à l'écran (pas pendant la frappe, qui garde les cases en vue)
  const defilerVersLesMots = useRef(false);
  useEffect(() => {
    if (defilerVersLesMots.current && (etat.statut === "trouve" || etat.statut === "erreur")) {
      defilerVersLesMots.current = false;
      resultats.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [etat]);

  const saisir = (nouvelles: string[]) => {
    setLettres(nouvelles);
    setRemplace(true);
    // Le temps du délai, on le dit au lieu d'afficher des mots qui ne correspondent plus à rien
    const nouveau = motifDesLettres(nouvelles);
    if (nouveau) setEtat((avant) => (avant.statut === "repos" ? { statut: "recherche", motif: nouveau } : avant));
  };

  const chercher = (nouveau: string) => {
    setRemplace(true);
    // Après une erreur, « Chercher » réessaie même avec le même motif
    demander(nouveau, etat.statut === "erreur");
  };

  const raccourci = (nouveau: string) => {
    defilerVersLesMots.current = true;
    setLettres(lettresDuMotif(nouveau));
    chercher(nouveau);
  };

  /** Retour à la page telle qu'elle est arrivée : cases d'origine, liste statique, adresse sans motif */
  const reinitialiser = (nouvelleLongueur: number, nouvellesLettres: string[], remplacer: boolean) => {
    dernierMotif.current = null;
    setCourante(nouvelleLongueur);
    setLettres(nouvellesLettres);
    setRemplace(remplacer);
    setRequete(null);
    setEtat({ statut: "repos" });
    ecrireAdresse(null);
  };

  const choisirLongueur = (n: number) => {
    if (n === longueur) reinitialiser(longueur, lettresInitiales, false);
    else reinitialiser(n, vides(n), true);
  };

  const effacer = () => {
    // « Effacer » vide les cases, partout : sur une page de combinaison, la liste disparaît aussi (retour de l'auteur
    // du 08/10/2026 : « Remettre la liste » ne se comprenait pas)
    reinitialiser(courante, vides(courante), Boolean(children) || courante !== longueur);
  };

  const surPlace = courante !== longueur;
  const apresRecherche = etat.statut === "trouve" && etat.mots.length > 0;

  return (
    <>
      <div className="mt-8">
        <RangeeDeLettres
          key={courante}
          longueur={courante}
          lettres={lettres}
          onLettres={saisir}
          onChercher={chercher}
          onEffacer={effacer}
          libelleEffacer="Effacer"
          avant={<SelecteurDeLongueur courante={courante} pageLongueur={longueur} onChoisir={choisirLongueur} />}
        />
      </div>

      {!surPlace && finales && (
        <>
          <section aria-labelledby="commencant-par" className="mt-10">
            <h2 id="commencant-par" className={enTeteSection}>
              Mots de {longueur} lettres commençant par…
            </h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {ALPHABET.map((lettre) => (
                <li key={lettre}>
                  <button
                    type="button"
                    className={pastille}
                    aria-label={`Mots de ${longueur} lettres commençant par ${lettre}`}
                    onClick={() => raccourci(lettre + "?".repeat(longueur - 1))}
                  >
                    {lettre}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="finissant-par" className="mt-10">
            <h2 id="finissant-par" className={enTeteSection}>
              Mots de {longueur} lettres finissant par…
            </h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {finales.map((finale) => (
                <li key={finale}>
                  <button
                    type="button"
                    className={pastille}
                    aria-label={`Mots de ${longueur} lettres finissant par ${finale}`}
                    onClick={() => raccourci("?".repeat(longueur - finale.length) + finale)}
                  >
                    {finale}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <PistesPourResserrer
        pistes={
          remplace
            ? etat.statut === "trouve" ? pistesPourResserrer(etat.motif, etat.mots) : []
            : motifInitial && motsInitiaux ? pistesPourResserrer(motifInitial, motsInitiaux) : []
        }
        onChoisir={({ position, lettre }) => {
          const nouvelles = [...lettres];
          nouvelles[position] = lettre;
          saisir(nouvelles);
        }}
      />

      <div ref={resultats} aria-live="polite" className="scroll-mt-4">
        {remplace ? (
          <Resultats key={etat.statut === "repos" ? "repos" : `${etat.statut}-${"motif" in etat ? etat.motif : ""}`} etat={etat} longueur={courante} reessayer={() => requete && setRequete({ motif: requete.motif, numero: requete.numero + 1 })} />
        ) : (
          children
        )}
      </div>

      {(apresRecherche || (!remplace && children)) && <InvitationApresRecherche />}
      {(etat.statut === "trouve" || (!remplace && children)) && <MotQuiManque />}

      {!surPlace && raccourcis}
    </>
  );
}


/** Une piste pour resserrer la liste : la lettre d'une case encore vide, et combien de mots elle garde */
type Piste = { position: number; lettre: string; libelle: string; total: number };

/**
 * Les pistes pour resserrer une liste (retour de l'auteur du 08/10/2026) : la case vide qui touche les lettres connues
 * (juste après le début connu, sinon juste avant la fin connue), et pour chaque lettre que prennent les mots à cet
 * endroit, le fragment à cliquer (« EN », « ET »…) et le nombre de mots qu'il garde. Rien à proposer sous deux mots.
 */
export function pistesPourResserrer(motif: string, mots: string[]): Piste[] {
  const cases = motif.split("");
  let position = -1;
  if (cases[0] !== "?") position = cases.indexOf("?");
  else if (cases[cases.length - 1] !== "?") position = cases.lastIndexOf("?");
  else position = cases.indexOf("?");
  if (position < 0 || mots.length < 2) return [];
  const comptes = new Map<string, number>();
  for (const mot of mots) {
    const lettre = mot[position];
    if (lettre) comptes.set(lettre, (comptes.get(lettre) ?? 0) + 1);
  }
  if (comptes.size < 2) return [];
  // Le fragment affiché : les lettres connues collées à la case, de son côté
  let avant = "";
  for (let i = position - 1; i >= 0 && cases[i] !== "?"; i--) avant = cases[i] + avant;
  let apres = "";
  if (!avant) for (let i = position + 1; i < cases.length && cases[i] !== "?"; i++) apres += cases[i];
  return [...comptes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([lettre, total]) => ({ position, lettre, libelle: avant + lettre + apres, total }));
}

function PistesPourResserrer({ pistes, onChoisir }: { pistes: Piste[]; onChoisir: (piste: Piste) => void }) {
  if (pistes.length === 0) return null;
  return (
    <section aria-labelledby="resserrer" className="mt-8 animate-in fade-in duration-300">
      <h2 id="resserrer" className="text-lg font-medium text-foreground">Resserrer la liste</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {pistes.map((piste) => (
          <li key={piste.lettre}>
            <button
              type="button"
              className={`${pastille} gap-2`}
              aria-label={`Mots en ${piste.libelle} : ${piste.total}`}
              onClick={() => onChoisir(piste)}
            >
              {piste.libelle}
              <span className="text-sm text-muted-foreground">{piste.total}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Les premiers mots seulement, pour que la FAQ et la suite de la page restent à portée ; le reste sur demande */
const APERCU = 60;

function Resultats({ etat, longueur, reessayer }: { etat: Etat; longueur: number; reessayer: () => void }) {
  const [toutVoir, setToutVoir] = useState(false);
  const [signaler, setSignaler] = useSignalement();
  if (etat.statut === "repos") return null;

  const motif = <span className="font-mono">{etat.motif}</span>;

  if (etat.statut === "recherche") {
    return <p className="mt-8 text-lg italic text-muted-foreground">Recherche des mots {motif}…</p>;
  }

  if (etat.statut === "erreur") {
    return (
      <div role="alert" className="mt-8 rounded-lg border border-destructive/40 p-4">
        <p className="text-[1.05rem] font-medium text-destructive">{etat.message}</p>
        <Button type="button" variant="outline" className="mt-3" onClick={reessayer}>
          Réessayer
        </Button>
      </div>
    );
  }

  const { mots } = etat;

  if (mots.length === 0) {
    return (
      <div className="mt-8 rounded-lg border border-dashed p-4">
        <p className="text-[1.05rem] text-foreground">Aucun mot de {longueur} lettres ne correspond à {motif}.</p>
        <p className="mt-2 text-[1.05rem] text-muted-foreground">
          Vérifie tes lettres, ou vide la case dont tu doutes le plus : le bon mot sortira.
        </p>
      </div>
    );
  }

  const montres = toutVoir ? mots : mots.slice(0, APERCU);
  return (
    <div className="mt-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <h2 className={enTeteSection}>
        {mots.length >= LIMITE ? `Les ${mots.length} premiers mots` : `${mots.length} mot${mots.length > 1 ? "s" : ""}`} pour{" "}
        <span className="font-mono">{etat.motif}</span>
      </h2>
      {mots.length >= LIMITE && (
        <p className="mt-3 text-[1.05rem] text-muted-foreground">Il y en a peut-être d’autres : ajoute une lettre pour resserrer la liste.</p>
      )}
      <div className="mt-5">
        <MotsEnColonnes mots={montres} nom={`Mots de ${longueur} lettres pour ${etat.motif}`} signaler={signaler} />
      </div>
      {montres.length < mots.length && (
        <Button variant="outline" className="mt-4" onClick={() => setToutVoir(true)}>
          Afficher les {mots.length - montres.length} autres mots
        </Button>
      )}
      <BoutonSignaler actif={signaler} onChange={setSignaler} />
    </div>
  );
}
