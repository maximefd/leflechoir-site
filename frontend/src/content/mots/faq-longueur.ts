/**
 * À RELIRE PAR L'AUTEUR : FAQ réécrite par Claude le 8 octobre 2026 pour le joueur qui bloque sur sa grille et cherche
 * son mot (retour de l'auteur), la seule FAQ de la page. Aucun chiffre
 * hors la longueur du mot de la page. Ils s'affichent sur chaque page « Mot de N lettres » et alimentent ses données
 * structurées `FAQPage` : les questions sont paramétrées par la longueur (2 à 10 lettres). La sixième question
 * (compte gratuit et dictionnaires personnels) reprend la formule de l'auteur du 08/10/2026.
 */
import { ADRESSE_CREER, ADRESSE_JOUER } from "@/content/mots/liens";

export type QuestionFaq = {
  question: string;
  reponse: string;
  /** Des liens après la réponse (la réponse structurée reste du texte seul) */
  liens?: { texte: string; href: string }[];
};

/**
 * Les questions d'une page « Mot de N lettres », dans l'ordre où elles s'affichent. `combinaisons` : la longueur a ses
 * pages « commençant par » et « finissant par » (liens) plutôt que des boutons qui remplissent les cases.
 */
export function questionsLongueur(longueur: number, combinaisons = false): QuestionFaq[] {
  const exemple = "P" + "?".repeat(longueur - 2) + "E";
  const questions: QuestionFaq[] = [
    {
      question: `Je bloque sur un mot de ${longueur} lettres dans ma grille : comment le trouver ?`,
      reponse:
        `Compte les cases du mot, puis tape dans la rangée les lettres que les mots croisés t’ont déjà données, chacune à sa place. ` +
        `Laisse vides les cases que tu ne connais pas : les mots de ${longueur} lettres qui collent s’affichent tout seuls, et la liste se resserre à chaque lettre ajoutée. ` +
        `Il ne te reste qu’à garder celui qui va avec ta définition.`,
    },
    {
      question: "Je n’ai que deux lettres : ça suffit ?",
      reponse:
        `Souvent, oui. P dans la première case et E dans la dernière (${exemple}) donnent déjà une liste courte. ` +
        "La première et la dernière lettre trient le mieux. Si la liste reste longue, cherche d’abord un mot croisé plus facile : il te donnera une lettre de plus.",
    },
    {
      question: combinaisons ? "Comment voir tous les mots qui commencent ou finissent par une lettre ?" : "Et si je ne connais que la première ou la dernière lettre ?",
      reponse: combinaisons
        ? `Choisis une lettre dans « commençant par » ou une terminaison dans « finissant par » : tu arrives sur la liste complète des mots de ${longueur} lettres qui commencent, ou qui finissent, ainsi.`
        : "Tape-la dans la première ou dans la dernière case, ou utilise les raccourcis « commençant par » et « finissant par » : la liste s’affiche aussitôt.",
    },
    {
      question: "Pas de résultat : qu’est-ce qui cloche ?",
      reponse:
        "Le plus souvent, une lettre fausse : un seul mot croisé mal rempli, et le bon mot ne peut plus sortir. Vide la case dont tu es le moins sûr et regarde ce qui apparaît. " +
        "Vérifie aussi le nombre de cases, et tape les lettres sans accent : dans une grille, É s’écrit E. " +
        "Si le mot manque vraiment, dis-le-moi : j’enrichis la liste au fil des messages.",
      liens: [{ texte: "Signaler un mot qui manque", href: "/contact" }],
    },
    {
      question: "Ça marche pour les mots croisés aussi ?",
      reponse:
        "Oui. Mots fléchés ou mots croisés, la question est la même : un mot d’une longueur donnée, dont tu connais quelques lettres. La rangée de cases sert aux deux.",
    },
    {
      question: "Ce n’est pas un peu tricher ?",
      reponse:
        "Un peu, et ce n’est pas grave : tout le monde a déjà buté sur le dernier mot d’une grille. " +
        "Si ta grille te résiste trop, fais une pause avec la grille du jour, ici, ou amuse-toi à fabriquer la tienne : c’est guidé pas à pas.",
      liens: [
        { texte: "La grille du jour", href: ADRESSE_JOUER },
        { texte: "Fabriquer ma grille", href: ADRESSE_CREER },
      ],
    },
    {
      question: "Tu crées tes propres grilles ?",
      reponse:
        "Alors la recherche par motif est faite pour toi : avec un compte gratuit, elle met en premier les mots de tes dictionnaires personnels, " +
        "pour donner à ta grille le ton que tu veux.",
      liens: [
        { texte: "Chercher un mot", href: "/search" },
        { texte: "Créer un compte gratuit", href: "/register" },
      ],
    },
  ];
  // Un mot de deux lettres : « je n'ai que deux lettres » n'a pas de sens, il suffit d'une
  return longueur > 2 ? questions : questions.filter((_, i) => i !== 1);
}

/** Les mêmes questions en données structurées `FAQPage` (schema.org), à mettre dans le `@graph` de la page */
export function faqJsonLd(longueur: number, combinaisons = false) {
  return {
    "@type": "FAQPage",
    mainEntity: questionsLongueur(longueur, combinaisons).map(({ question, reponse }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: reponse },
    })),
  };
}
