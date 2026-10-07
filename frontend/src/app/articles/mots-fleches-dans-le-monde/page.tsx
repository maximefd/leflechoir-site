import { ArticleView } from "@/components/articles/article-view";
import { article } from "@/content/articles/mots-fleches-dans-le-monde";
import { articlePage } from "@/lib/seo";

// Une page par article, sans route dynamique (export statique) : le texte est dans src/content/articles
export const metadata = articlePage(article);

export default function ArticlePage() {
  return <ArticleView article={article} />;
}
