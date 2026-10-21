import Link from "next/link";
import { enTeteSection, lienOcre } from "@/components/mots/style";
import type { QuestionFaq } from "@/content/mots/faq-longueur";

/**
 * Une FAQ affichée en clair : la question, sa réponse, et des liens après la réponse. La même liste nourrit les données
 * structurées de la page (`faqPageJsonLd`, lib/seo.ts) : ce qui se lit est ce que les moteurs reprennent.
 */
export function QuestionsFrequentes({ questions, className = "" }: { questions: QuestionFaq[]; className?: string }) {
  return (
    <section aria-labelledby="questions" className={className}>
      <h2 id="questions" className={enTeteSection}>Questions fréquentes</h2>
      <dl className="mt-5 space-y-6">
        {questions.map(({ question, reponse, liens }) => (
          <div key={question}>
            <dt className="text-lg font-medium text-foreground">{question}</dt>
            <dd className="mt-1 text-[1.05rem] leading-relaxed text-muted-foreground">
              <p>{reponse}</p>
              {liens && (
                <p className="mt-2">
                  {liens.map(({ texte, href }, i) => (
                    <span key={href}>
                      {i > 0 && " · "}
                      <Link href={href} className={lienOcre}>{texte}</Link>
                    </span>
                  ))}
                </p>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
