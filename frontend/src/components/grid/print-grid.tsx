"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GridSvg } from "@/components/grid/grid-svg";
import type { GridData } from "@/components/grid/grid-display";
import { useAuth } from "@/contexts/auth-context";
import { exportPdf } from "@/lib/grid-export";
import { withNext } from "@/lib/next-path";
import { site } from "@/config/site";

/**
 * Imprimer la grille qu'on vient de générer, même sans compte : la grille vierge (cases définitions vides, à
 * remplir à la main) puis la solution. Sans compte, une fenêtre dit d'abord ce que le compte gratuit ajoute.
 */
export function PrintGrid({ grid }: { grid: GridData }) {
  const { isAuthenticated } = useAuth();
  const [asking, setAsking] = useState(false);
  const [printing, setPrinting] = useState(false);
  const blankRef = useRef<HTMLDivElement>(null);
  const solutionRef = useRef<HTMLDivElement>(null);

  const print = async () => {
    setAsking(false);
    const blank = blankRef.current?.querySelector("svg");
    if (!blank) return;
    setPrinting(true);
    try {
      await exportPdf(`Mots fléchés ${grid.width}×${grid.height}`, blank, solutionRef.current?.querySelector("svg") ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "L'impression a échoué.");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={printing} onClick={() => (isAuthenticated ? print() : setAsking(true))}>
        {printing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
        Imprimer (grille et solution)
      </Button>

      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Imprimer ta grille</DialogTitle>
            <DialogDescription>
              Tu recevras un PDF : la grille avec ses cases définitions vides, à remplir à la main, puis la solution.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            Avec un <strong>compte gratuit</strong>, tu peux aussi modifier ta grille et écrire tes propres
            définitions directement sur {site.name}, puis les imprimer avec la grille.
          </p>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button asChild variant="outline">
              <Link href={withNext("/register", "/grid")}>Créer un compte gratuit</Link>
            </Button>
            <Button type="button" onClick={print}>Imprimer sans compte</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Les rendus du PDF : hors cadre mais mis en page, sinon l'export ne mesure rien */}
      <div ref={blankRef} aria-hidden className="pointer-events-none absolute -left-[9999px] top-0 w-[640px]">
        <GridSvg grid={grid} variant="vierge" />
      </div>
      <div ref={solutionRef} aria-hidden className="pointer-events-none absolute -left-[9999px] top-0 w-[640px]">
        <GridSvg grid={grid} variant="solution" />
      </div>
    </>
  );
}
