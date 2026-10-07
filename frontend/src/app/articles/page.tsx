import { type Metadata } from "next";
import Link from "next/link";
import { formatDate } from "@/components/articles/article-view";
import { site } from "@/config/site";
import { LISTED } from "@/content/articles";
import { readingMinutes } from "@/content/articles/types";
import { publicPage } from "@/lib/seo";

/**
 * La liste des articles : créer une grille, le plaisir de jouer, les coulisses du métier,
 * le jeu dans le monde. « Articles » est un nom provisoire : l'auteur choisit le nom de la rubrique.
 */
const DESCRIPTION =
  "Écrire une définition, construire une grille, jouer à plusieurs, les mots fléchés ailleurs dans le monde : les articles de ceux qui fabriquent leurs grilles.";

export const metadata: Metadata = publicPage({ path: "/articles", title: "Articles sur les mots fléchés", description: DESCRIPTION });

/** Le guide existait avant la rubrique : il y figure comme un article */
const GUIDE = {
  href: "/creer-des-mots-fleches",
  title: "Comment créer des mots fléchés : de l’idée à la grille",
  chapo: "Dessiner la grille, la remplir, écrire les définitions : une grille de 7 sur 9 construite pas à pas, à la main.",
  published: "2026-09-30",
};

export default function ArticlesPage() {
  const items = [
    ...LISTED.map((article) => ({
      href: `/articles/${article.slug}`,
      title: article.title,
      chapo: article.chapo,
      published: article.published,
      minutes: readingMinutes(article),
      draft: article.draft,
    })),
    { ...GUIDE, minutes: null, draft: false },
  ].sort((a, b) => b.published.localeCompare(a.published));

  return (
    <main className="container mx-auto max-w-3xl p-4 md:p-8">
      <h1 className="text-3xl font-bold md:text-4xl">Articles</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Les questions qu’on se pose en fabriquant une grille, le plaisir d’y jouer, les coulisses du métier et le jeu
        ailleurs dans le monde. Chaque article a sa petite grille à résoudre.
      </p>
      <ul className="mt-8 space-y-6">
        {items.map((item) => (
          <li key={item.href} className="rounded-lg border p-4">
            <h2 className="text-xl font-semibold">
              <Link href={item.href} className="hover:text-primary hover:underline">{item.title}</Link>
            </h2>
            <p className="mt-2 text-muted-foreground">{item.chapo}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              <time dateTime={item.published}>{formatDate(item.published)}</time>
              {item.minutes && ` · ${item.minutes} min de lecture`}
              {item.draft && <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-foreground">Brouillon</span>}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-10 text-sm text-muted-foreground">
        Une question sur les mots fléchés que personne ne traite ? <Link href="/contact" className="underline underline-offset-2">Écris-moi</Link>,
        elle fera peut-être le prochain article {site.nameAfterDe}.
      </p>
    </main>
  );
}
