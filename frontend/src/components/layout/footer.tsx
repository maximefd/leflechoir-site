// DANS src/components/layout/footer.tsx

import Link from "next/link";
import { site } from "@/config/site";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t">
      <div className="container mx-auto flex flex-col items-center justify-between gap-4 p-4 md:flex-row">
        <p className="text-sm text-muted-foreground">
          &copy; {currentYear} {site.name}. Tous droits réservés.
        </p>
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <Link href="/creer-des-mots-fleches" className="hover:text-primary">
            Guide
          </Link>
          {/* Nom provisoire de la rubrique : l'auteur le choisit */}
          <Link href="/articles" className="hover:text-primary">
            Articles
          </Link>
          <Link href="/contact" className="hover:text-primary">
            Contact
          </Link>
          <Link href="/legal" className="hover:text-primary">
            Mentions légales
          </Link>
          <Link href="/terms" className="hover:text-primary">
            Conditions
          </Link>
          <Link href="/privacy" className="hover:text-primary">
            Confidentialité
          </Link>
        </nav>
      </div>
      <p className="container mx-auto px-4 pb-4 text-center text-xs text-muted-foreground">
        Le site compte les pages vues, sans cookie ni identifiant.{" "}
        <Link href="/privacy#audience" className="underline underline-offset-2 hover:text-primary">
          Tu peux refuser d&apos;être compté.
        </Link>
      </p>
    </footer>
  );
}