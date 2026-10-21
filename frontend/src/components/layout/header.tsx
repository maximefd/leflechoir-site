"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Menu } from "lucide-react";
import { useState } from "react";
import { site } from "@/config/site";
import { ACCUEIL, LIENS_CREER, LIENS_OUTILS, MES_GRILLES, RUBRIQUES, rubriqueActive } from "@/components/layout/rubriques";

/**
 * L'en-tête, d'après les maquettes de navigation du 07/10/2026 (la structure seulement : le nouveau style attend
 * l'accord de l'auteur). Ordinateur : le logo, le compte et « Créer une grille », puis la ligne des rubriques avec
 * « Mes grilles » à droite. Téléphone : le logo (qui ramène à l'accueil) et « Menu », puis quatre pastilles qui se
 * partagent la largeur, sans défilement. Sur téléphone, l'en-tête ne colle pas : clavier ouvert, il prendrait un tiers
 * de ce qui reste à l'écran pour jouer ou écrire dans une grille.
 */
export function Header() {
  const { isAuthenticated, logout } = useAuth();
  const pathname = usePathname();
  const active = rubriqueActive(pathname);
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const fermer = () => setMobileMenuOpen(false);

  const onglet = (href: string) =>
    cn(
      "px-3 py-2 rounded-md text-sm font-medium transition-colors",
      active === href
        ? "bg-secondary text-secondary-foreground"
        : "text-muted-foreground hover:bg-secondary/80 hover:text-secondary-foreground",
    );

  return (
    <header className="relative z-50 w-full border-b md:sticky md:top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" data-testid="logo-link" className="flex items-center gap-2 text-xl font-bold">
          <span role="img" aria-label="Pièce de puzzle">🧩</span>
          <span>{site.name}</span>
        </Link>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 md:flex">
            {isAuthenticated ? (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/account">Mon compte</Link>
                </Button>
                <Button onClick={logout} variant="outline" size="sm" data-testid="logout-button">
                  Déconnexion
                </Button>
              </>
            ) : (
              <Button asChild variant="ghost" size="sm" data-testid="login-button-link">
                <Link href="/login">Se connecter</Link>
              </Button>
            )}
            <Button asChild size="sm">
              <Link href="/creer">Créer une grille</Link>
            </Button>
          </div>

          <div className="md:hidden">
            <Sheet open={isMobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Menu className="h-5 w-5" aria-hidden />
                  Menu
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="overflow-y-auto">
                <SheetTitle className="sr-only">Menu</SheetTitle>
                <nav aria-label="Menu" className="mt-8 grid gap-6 px-6 text-lg">
                  <Link href="/" onClick={fermer} className="flex items-center gap-2 font-semibold">
                    <span role="img" aria-label="Pièce de puzzle">🧩</span> {site.name}
                  </Link>
                  <MenuGroupe titre="Créer" liens={LIENS_CREER} active={pathname} onClick={fermer} />
                  <MenuGroupe
                    titre="Jouer et lire"
                    liens={[
                      { href: "/jouer", label: "La grille du jour" },
                      { href: "/articles", label: "Articles" },
                      { href: "/creer-des-mots-fleches", label: "Le guide" },
                    ]}
                    active={pathname}
                    onClick={fermer}
                  />
                  <MenuGroupe titre="Outils" liens={LIENS_OUTILS} active={pathname} onClick={fermer} />
                  <div className="grid gap-3 border-t pt-6">
                    {isAuthenticated ? (
                      <>
                        <Link href="/account" onClick={fermer} className="text-muted-foreground hover:text-foreground">
                          Mon compte
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            fermer();
                            logout();
                          }}
                          className="text-left text-muted-foreground hover:text-foreground"
                        >
                          Déconnexion
                        </button>
                      </>
                    ) : (
                      <Link href="/login" onClick={fermer} className="text-muted-foreground hover:text-foreground">
                        Se connecter
                      </Link>
                    )}
                  </div>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      {/* Ordinateur et tablette : la ligne des rubriques, « Mes grilles » à droite. L'en-tête mesure alors 7,125 rem
          (114 px) : les bandeaux de définition des grilles à jouer collent juste dessous (`md:top-[7.125rem]`) */}
      <nav aria-label="Rubriques" className="hidden border-t md:block">
        <div className="container mx-auto flex items-center justify-between gap-2 px-4 py-1.5">
          <div className="flex items-center gap-1">
            {[ACCUEIL, ...RUBRIQUES].map((rubrique) => (
              <Link
                key={rubrique.href}
                href={rubrique.href}
                aria-current={active === rubrique.href ? "page" : undefined}
                className={onglet(rubrique.href)}
              >
                {rubrique.label}
              </Link>
            ))}
          </div>
          <Link
            href={MES_GRILLES.href}
            aria-current={active === MES_GRILLES.href ? "page" : undefined}
            className={onglet(MES_GRILLES.href)}
          >
            {MES_GRILLES.label}
          </Link>
        </div>
      </nav>

      {/* Téléphone : quatre pastilles qui se partagent la largeur */}
      <nav aria-label="Rubriques" className="border-t md:hidden">
        <div className="container mx-auto grid grid-cols-4 gap-2 px-4 py-2">
          {RUBRIQUES.map((rubrique) => (
            <Link
              key={rubrique.href}
              href={rubrique.href}
              aria-current={active === rubrique.href ? "page" : undefined}
              className={cn(
                "rounded-full py-2 text-center text-sm whitespace-nowrap transition-colors",
                active === rubrique.href
                  ? "bg-secondary font-semibold text-foreground ring-1 ring-foreground/25"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/70",
              )}
            >
              {rubrique.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}

function MenuGroupe({
  titre,
  liens,
  active,
  onClick,
}: {
  titre: string;
  liens: readonly { href: string; label: string }[];
  active: string;
  onClick: () => void;
}) {
  return (
    <div className="grid gap-3">
      <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{titre}</p>
      {liens.map((lien) => (
        <Link
          key={lien.href}
          href={lien.href}
          onClick={onClick}
          className={cn("text-muted-foreground hover:text-foreground", active === lien.href && "font-semibold text-foreground")}
        >
          {lien.label}
        </Link>
      ))}
    </div>
  );
}
