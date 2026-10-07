import { Fragment } from "react";
import Link from "next/link";
import { ForceRating } from "@/components/articles/force-rating";
import { MiniGridGame } from "@/components/articles/mini-grid-game";
import { linkClass } from "@/components/legal/section";
import { site } from "@/config/site";
import { readingMinutes, SHOW_DRAFTS, wordCount, type Article, type RelatedFeature } from "@/content/articles/types";
import { articleJsonLd } from "@/lib/seo";

/** La signature des articles, écrits à la première personne. Provisoire : l'auteur choisit comment il signe. */
export const BYLINE = `Par l’auteur ${site.nameAfterDe}`;

const RELATED: Record<RelatedFeature, { href: string; label: string; text: string }> = {
  generer: { href: "/grid", label: "Générer une grille", text: "Le moteur remplit la grille, tu écris les définitions." },
  recherche: { href: "/search", label: "Recherche par motif", text: "Le mot qui manque, d’après les lettres que tu as : P??LE." },
  mystere: { href: "/grid", label: "Mot mystère", text: "Un prénom ou un message caché dans la grille, à retrouver lettre à lettre." },
  guide: { href: "/creer-des-mots-fleches", label: "Comment créer des mots fléchés", text: "Une grille construite pas à pas, du premier mot aux définitions." },
};

export function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** La page d'un article : titre, chapeau, signature, sommaire, texte, grille à jouer et sa force, liens vers le site. */
export function ArticleView({ article }: { article: Article }) {
  if (article.draft && !SHOW_DRAFTS) {
    return (
      <main className="container mx-auto max-w-3xl p-4 md:p-8">
        <h1 className="text-3xl font-bold md:text-4xl">{article.title}</h1>
        <p className="mt-4 text-muted-foreground">
          Cet article est en préparation. En attendant, <Link href="/articles" className={linkClass}>les autres articles</Link> t’attendent.
        </p>
      </main>
    );
  }

  const minutes = readingMinutes(article);
  const grid = (
    <section aria-labelledby="a-toi-de-jouer" className="space-y-2">
      <h2 id="a-toi-de-jouer" className="scroll-mt-20 pt-6 text-2xl font-semibold text-foreground">À toi de jouer</h2>
      <MiniGridGame spec={article.grid.spec} title={article.grid.title} />
      <ForceRating slug={article.slug} />
    </section>
  );
  const gridAfter = article.grid.after ?? article.sections[article.sections.length - 1]?.id;

  return (
    <main className="container mx-auto max-w-3xl p-4 md:p-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd(article, wordCount(article))) }} />
      <nav aria-label="Fil d’Ariane" className="mb-4 text-sm text-muted-foreground">
        <Link href="/" className={linkClass}>Accueil</Link>
        <span aria-hidden="true"> › </span>
        <Link href="/articles" className={linkClass}>Articles</Link>
      </nav>

      {article.draft && (
        <p role="note" className="mb-6 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-foreground">
          <strong>Brouillon à relire.</strong> Invisible des moteurs (noindex), absent du sitemap et de la liste des
          articles. Pour le publier : <code>draft: false</code> dans <code>src/content/articles/{article.slug}.tsx</code>.
        </p>
      )}

      <h1 className="text-3xl font-bold md:text-4xl">{article.title}</h1>
      <p className="mt-4 text-lg text-muted-foreground">{article.chapo}</p>
      <p className="mt-4 text-sm text-muted-foreground">
        {BYLINE} · <time dateTime={article.published}>{formatDate(article.published)}</time>
        {article.updated && (
          <> · mis à jour le <time dateTime={article.updated}>{formatDate(article.updated)}</time></>
        )}
        {" · "}
        {minutes} min de lecture
      </p>

      {article.sections.length >= 4 && (
        <nav aria-labelledby="sommaire" className="mt-8 rounded-lg border bg-secondary/20 p-4">
          <h2 id="sommaire" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sommaire</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            {article.sections.map(({ id, title }) => (
              <li key={id}>
                <a href={`#${id}`} className={linkClass}>{title}</a>
              </li>
            ))}
            <li>
              <a href="#a-toi-de-jouer" className={linkClass}>À toi de jouer</a>
            </li>
          </ol>
        </nav>
      )}

      <article className="mt-6 space-y-6 leading-relaxed text-muted-foreground [&_p]:text-[1.05rem]">
        {article.sections.map(({ id, title, body }) => (
          <Fragment key={id}>
            <section aria-labelledby={id} className="space-y-4">
              <h2 id={id} className="scroll-mt-20 pt-6 text-2xl font-semibold text-foreground">{title}</h2>
              {body}
            </section>
            {id === gridAfter && grid}
          </Fragment>
        ))}
      </article>

      {article.related.length > 0 && (
        <aside aria-labelledby="sur-le-site" className="mt-12 border-t pt-6">
          <h2 id="sur-le-site" className="text-lg font-semibold">Sur le site</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {article.related.map((key) => (
              <li key={key} className="rounded-lg border p-3">
                <Link href={RELATED[key].href} className="font-medium text-foreground underline underline-offset-2 hover:text-primary">
                  {RELATED[key].label}
                </Link>
                <p className="mt-1 text-sm text-muted-foreground">{RELATED[key].text}</p>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </main>
  );
}
