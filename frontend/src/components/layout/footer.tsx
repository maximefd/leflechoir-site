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
    </footer>
  );
}