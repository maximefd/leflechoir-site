"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check, Pencil, Plus, StickyNote, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import type { TexteArticle } from "@/content/articles/types";

/**
 * L'édition du texte dans la page même (ADR 0027) : l'auteur rouvre ici les articles que l'agent lui propose,
 * au téléphone, pendant le tunnel de développement (`make preview-remote`). Sans compte : le crayon apparaît
 * dès que l'API accepte l'édition (dossier des textes monté, développement) — en production, rien, l'article
 * se lit comme toujours.
 *
 * La page ne change pas de peau : le crayon rend le texte lui-même écrivable, dans sa typographie, sans
 * cadres ni formulaires. Les notes de relecture s'accrochent aux sections (leur ancre ne bouge pas quand un
 * paragraphe bouge) ; elles se gardent toutes seules au flou, hors du site publié.
 */
const EDITION = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_SHOW_DRAFTS === "1";

/** La note qui regarde l'article entier ; les autres s'accrochent à l'identifiant d'une section. */
const NOTE_ARTICLE = "_article";

/** Une zone d'écriture sans cadre ni défilement : la typographie de la page, et l'écriture dedans. */
function Ecrit({
  valeur, change, classe, label, surFocus,
}: { valeur: string; change: (texte: string) => void; classe: string; label: string; surFocus?: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const zone = ref.current;
    if (zone) {
      zone.style.height = "auto";
      zone.style.height = `${zone.scrollHeight}px`;
    }
  }, [valeur]);
  return (
    <textarea
      ref={ref}
      rows={1}
      aria-label={label}
      value={valeur}
      onChange={(evenement) => change(evenement.target.value)}
      onFocus={surFocus}
      className={`-mx-1 w-full resize-none overflow-hidden rounded-sm bg-transparent px-1 text-base outline-none transition-colors hover:bg-secondary/40 focus:bg-secondary/60 ${classe}`}
    />
  );
}

/** Une note de relecture, jaune, sous ce qu'elle regarde. Vidée puis quittée, elle disparaît. */
function Note({ texte, aLeFlou }: { texte: string; aLeFlou: (valeur: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [brouillon, setBrouillon] = useState(texte);
  useLayoutEffect(() => {
    const zone = ref.current;
    if (zone) {
      zone.style.height = "auto";
      zone.style.height = `${zone.scrollHeight}px`;
    }
  }, [brouillon]);
  return (
    <textarea
      ref={ref}
      rows={1}
      aria-label="Note de relecture"
      placeholder="Ta note — à vérifier, à raccourcir, un doute…"
      value={brouillon}
      onChange={(evenement) => setBrouillon(evenement.target.value)}
      onBlur={() => brouillon !== texte && aLeFlou(brouillon)}
      className="w-full resize-none overflow-hidden rounded-md border border-amber-400/70 bg-amber-100/70 p-2 text-sm leading-relaxed text-foreground outline-none placeholder:text-amber-900/50"
    />
  );
}

export function ArticleEditor({ slug, signature, children }: { slug: string; signature: string; children: ReactNode }) {
  const [texte, setTexte] = useState<TexteArticle | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [edite, setEdite] = useState(false);
  const [sale, setSale] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [active, setActive] = useState<string | null>(null); // le paragraphe touché : ses gestes se montrent

  useEffect(() => {
    if (!EDITION) return;
    let vivant = true;
    Promise.all([
      apiFetch(`/api/articles/${slug}/texte`).then((reponse: { texte: TexteArticle }) => reponse.texte),
      apiFetch(`/api/articles/${slug}/notes`).then((reponse: { notes?: Record<string, string> }) => reponse.notes ?? {}),
    ])
      .then(([unTexte, desNotes]) => {
        if (vivant) {
          setTexte(unTexte);
          setNotes(desNotes);
        }
      })
      .catch(() => {
        if (vivant) setTexte(null); // édition fermée : rien à montrer, l'article se lit
      });
    return () => {
      vivant = false;
    };
  }, [slug]);

  // Lecture : toujours la même forme d'arbre, bouton ou non. Sinon l'arrivée du texte (l'API répond après le
  // premier rendu) remonterait tout l'article, et la petite grille perdrait sa partie en cours.
  if (!EDITION || !texte || !edite) {
    return (
      <>
        {children}
        {EDITION && texte && (
          <button
            type="button"
            data-testid="article-edit"
            onClick={() => setEdite(true)}
            className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg"
          >
            <Pencil className="h-4 w-4" aria-hidden /> Modifier le texte
          </button>
        )}
      </>
    );
  }

  const maj = (modifie: (brouillon: TexteArticle) => TexteArticle) => {
    setTexte((brouillon) => (brouillon ? modifie(brouillon) : brouillon));
    setSale(true);
  };
  const majSection = (numero: number, paragraphes: (ancien: string[]) => string[], titre?: string) =>
    maj((brouillon) => ({
      ...brouillon,
      sections: brouillon.sections.map((section, index) =>
        index !== numero
          ? section
          : {
              ...section,
              title: titre ?? section.title,
              paragraphs: paragraphes(section.paragraphs),
            },
      ),
    }));

  /** Ouvre la note d'une ancre (ou la referme si elle est vide : c'est le geste d'annulation). */
  const basculerNote = (cle: string) => {
    if (cle in notes && !notes[cle].trim()) {
      const sans = { ...notes };
      delete sans[cle];
      setNotes(sans);
      return;
    }
    if (!(cle in notes)) setNotes({ ...notes, [cle]: "" });
  };
  /** La note quitte son cadre : elle se garde seule (vidée, elle disparaît). */
  const garderNote = (cle: string, valeur: string) => {
    const propres = valeur.trim();
    const nouvelles = { ...notes };
    if (propres) nouvelles[cle] = propres;
    else delete nouvelles[cle];
    setNotes(nouvelles);
    apiFetch(`/api/articles/${slug}/notes`, { method: "PUT", body: { notes: nouvelles } })
      .catch(() => toast.error("La note n’a pas pu être gardée."));
  };

  const enregistrer = async () => {
    if (!texte) return;
    // Les paragraphes vides (créés puis jamais remplis) ne partent pas ; le reste s'ajuste aux bords
    const corps = {
      ...texte,
      title: texte.title.trim(),
      description: texte.description.trim(),
      chapo: texte.chapo.trim(),
      sections: texte.sections.map((section) => ({
        ...section,
        title: section.title.trim(),
        paragraphs: section.paragraphs.map((paragraphe) => paragraphe.trim()).filter(Boolean),
      })),
    };
    if (!corps.title || !corps.chapo || !corps.description) {
      toast.error("Le titre, le chapeau et la description ne peuvent pas être vides.");
      return;
    }
    if (corps.sections.some((section) => !section.title)) {
      toast.error("Un titre de section est vide.");
      return;
    }
    if (corps.sections.some((section) => section.paragraphs.length === 0)) {
      toast.error("Une section n’a plus aucun paragraphe.");
      return;
    }
    setEnvoi(true);
    try {
      await apiFetch(`/api/articles/${slug}/texte`, { method: "PUT", body: corps });
      setTexte(corps);
      setSale(false);
      toast.success("Texte enregistré. La page se relit toute seule — sinon, recharge-la.");
    } catch (erreur) {
      toast.error(erreur instanceof Error ? erreur.message : "L’enregistrement a échoué.");
    } finally {
      setEnvoi(false);
    }
  };
  const fermer = () => {
    if (sale && !window.confirm("Fermer sans enregistrer ? Tes reprises seront perdues.")) return;
    setEdite(false);
  };

  return (
    <div className="pb-2">
      {/* Le régime de la page : l'état, la description des moteurs (invisible dans la page), le balisage */}
      <div className="space-y-2 rounded-lg border bg-secondary/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold" data-testid="article-editor">
            Édition du texte {sale ? "· non enregistré" : "· à jour"}
          </p>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Noter l’article"
            onClick={() => basculerNote(NOTE_ARTICLE)}
          >
            <StickyNote className={`mr-1 h-4 w-4 ${notes[NOTE_ARTICLE] ? "text-amber-600" : ""}`} aria-hidden />
            Note
          </Button>
        </div>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Description (moteurs et partages)
          </span>
          <input
            className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
            value={texte.description}
            onChange={(evenement) => maj((brouillon) => ({ ...brouillon, description: evenement.target.value }))}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Du **gras** pour une amorce, un [lien](/adresse) vers le site — tout le reste s’écrit tel quel.
        </p>
      </div>

      {/* Le texte, comme la page le montre, mais écrivable */}
      <Ecrit
        valeur={texte.title}
        change={(valeur) => maj((brouillon) => ({ ...brouillon, title: valeur }))}
        classe="mt-6 text-3xl font-bold md:text-4xl"
        label="Titre"
      />
      <Ecrit
        valeur={texte.chapo}
        change={(valeur) => maj((brouillon) => ({ ...brouillon, chapo: valeur }))}
        classe="mt-4 text-lg leading-relaxed text-muted-foreground"
        label="Chapeau"
      />
      <p className="mt-4 text-sm text-muted-foreground">{signature}</p>
      {notes[NOTE_ARTICLE] !== undefined && (
        <div className="mt-3">
          <Note texte={notes[NOTE_ARTICLE]} aLeFlou={(valeur) => garderNote(NOTE_ARTICLE, valeur)} />
        </div>
      )}

      {texte.sections.map((section, numero) => (
        <section key={section.id} className="mt-6 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <Ecrit
              valeur={section.title}
              change={(valeur) => majSection(numero, (paragraphes) => paragraphes, valeur)}
              classe="pt-6 text-2xl font-semibold"
              label={`Titre de la section ${section.title}`}
            />
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Noter la section ${section.title}`}
              onClick={() => basculerNote(section.id)}
            >
              <StickyNote className={`h-4 w-4 ${notes[section.id] ? "text-amber-600" : ""}`} aria-hidden />
            </Button>
          </div>
          {notes[section.id] !== undefined && (
            <Note texte={notes[section.id]} aLeFlou={(valeur) => garderNote(section.id, valeur)} />
          )}
          <div className="space-y-1">
            {section.paragraphs.map((paragraphe, rang) => (
              <div key={rang}>
                <Ecrit
                  valeur={paragraphe}
                  change={(valeur) => majSection(numero, (paragraphes) => paragraphes.map((p, j) => (j === rang ? valeur : p)))}
                  surFocus={() => setActive(`${numero}:${rang}`)}
                  classe="text-[1.05rem] leading-relaxed"
                  label={`Paragraphe ${rang + 1} de la section ${section.title}`}
                />
                {active === `${numero}:${rang}` && (
                  /* mousedown tenu : les boutons prennent le focus sans voler celui du paragraphe */
                  <div className="flex flex-wrap gap-1 py-1" onMouseDown={(evenement) => evenement.preventDefault()}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => majSection(numero, (paragraphes) => [...paragraphes.slice(0, rang + 1), "", ...paragraphes.slice(rang + 1)])}
                    >
                      <Plus className="mr-1 h-3 w-3" aria-hidden /> Une phrase dessous
                    </Button>
                    {section.paragraphs.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => majSection(numero, (paragraphes) => paragraphes.filter((_, j) => j !== rang))}
                      >
                        <Trash2 className="mr-1 h-3 w-3" aria-hidden /> Supprimer
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => majSection(numero, (paragraphes) => [...paragraphes, ""])}
            >
              <Plus className="mr-1 h-3 w-3" aria-hidden /> Un paragraphe ici
            </Button>
          </div>
        </section>
      ))}

      <p className="mt-6 text-xs text-muted-foreground">
        La grille, le sommaire et les liens du bas ne se règlent pas ici : ils reviennent à la fermeture.
      </p>

      {/* La barre du pouce : enregistrer, fermer */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-3xl gap-2 px-4">
          <Button onClick={enregistrer} disabled={envoi || !sale} data-testid="article-save" className="flex-1">
            <Check className="mr-2 h-4 w-4" aria-hidden /> Enregistrer
          </Button>
          <Button variant="outline" onClick={fermer}>
            <X className="mr-2 h-4 w-4" aria-hidden /> Fermer
          </Button>
        </div>
      </div>
    </div>
  );
}
