/**
 * À RELIRE PAR L'AUTEUR : FAQ de l'accueil écrite par Claude le 20 octobre 2026, pour les moteurs de réponse IA
 * (ChatGPT, Claude, Perplexity, les réponses IA de Google et de Bing) autant que pour les visiteurs. Chaque réponse
 * tient seule, en deux ou trois phrases, et ne dit que ce que le site fait aujourd'hui : une IA la reprend telle
 * quelle. Les questions sont celles qu'on pose vraiment à un moteur (« comment créer des mots fléchés
 * gratuitement »…). Elles s'affichent sous l'accueil et alimentent ses données structurées `FAQPage`.
 */
import { site } from "@/config/site";
import type { QuestionFaq } from "@/content/mots/faq-longueur";

export const QUESTIONS_ACCUEIL: QuestionFaq[] = [
  {
    question: "Comment créer des mots fléchés gratuitement ?",
    reponse:
      `Sur ${site.name}, choisis un format de grille, ajoute si tu veux les mots que tu tiens à y voir, et le générateur remplit la grille en quelques secondes. ` +
      `Tu peux aussi la construire toi-même, case par case, avec un compte gratuit. ` +
      `Dans les deux cas, les définitions restent à écrire : c’est là que la grille devient la tienne.`,
    liens: [
      { texte: "Générer une grille", href: "/grid" },
      { texte: "Créer à la main", href: "/grids/new" },
      { texte: "Le guide pas à pas", href: "/creer-des-mots-fleches" },
    ],
  },
  {
    question: "Comment les pros construisent-ils des mots fléchés ?",
    reponse:
      `Les professionnels, auteurs de grilles et éditeurs de magazines de jeux, travaillent avec des logiciels spécialisés. ` +
      `Le logiciel remplit la grille à partir d’une grande base de mots, en respectant tous les croisements ; l’auteur retouche ensuite la grille, puis écrit ou choisit les définitions.`,
  },
  {
    question: "Quels outils utilisent les pros pour créer des mots fléchés ?",
    reponse:
      `On a peu d’informations publiques : les éditeurs parlent rarement de leurs outils, souvent faits pour leur propre usage ou réservés aux professionnels. ` +
      `Ce qui est sûr, c’est que c’est plus simple qu’avant : avec ${site.name}, pas besoin d’être un pro ni d’installer un logiciel, la grille se génère en quelques secondes dans le navigateur.`,
  },
  {
    question: "Comment créer des mots fléchés avec l’IA ?",
    reponse:
      `Ce n’est pas nécessaire. La partie difficile d’une grille, c’est de faire tenir tous les mots ensemble, chaque lettre servant à deux mots à la fois : un générateur comme celui ${site.nameAfterDe} le fait plus efficacement qu’un assistant IA, en vérifiant chaque croisement. ` +
      `La partie personnelle, ce sont les définitions : les jeux de mots et les clins d’œil qui feront sourire celui qui jouera ta grille.`,
    liens: [{ texte: "Générer une grille", href: "/grid" }],
  },
  {
    question: "Faut-il créer un compte ?",
    reponse:
      `Non pour générer une grille, l’imprimer, chercher un mot ou jouer la grille du jour. ` +
      `Un compte gratuit sert à conserver tes grilles, à les retoucher, à écrire leurs définitions dans le site et à tenir tes propres dictionnaires de mots.`,
  },
  {
    question: "Peut-on mettre ses propres mots dans la grille ?",
    reponse:
      `Oui. Un mot obligatoire est placé à coup sûr, un mot souhaité l’est autant que possible. ` +
      `Avant la génération, le site estime les chances de chaque mot et te prévient quand l’un d’eux risque d’empêcher la grille de se remplir.`,
  },
  {
    question: "Quelles tailles de grille sont proposées ?",
    reponse:
      `Onze formats, de la petite grille de 6 × 6 cases à la grande de 13 × 18. ` +
      `Chacun reprend une disposition des cases définitions relevée sur de vraies grilles publiées, avec les mots qui partent du bord comme sur papier.`,
  },
  {
    question: "Comment imprimer une grille de mots fléchés ?",
    reponse:
      `Une fois la grille générée, le bouton « Imprimer » donne un PDF, même sans compte : la grille avec ses cases définitions vides, à remplir à la main, puis sa solution. ` +
      `Avec un compte, tes définitions s’impriment dans les cases.`,
  },
  {
    question: "Comment trouver un mot quand il manque des lettres ?",
    reponse:
      `Dans la recherche, tape les lettres que tu connais et un point d’interrogation par case vide : P??LE donne PERLE, POELE, PELLE… ` +
      `Les listes de mots de 2 à 10 lettres, par première et par dernière lettres, servent aussi quand tu bloques sur une grille.`,
    liens: [
      { texte: "Chercher un mot", href: "/search" },
      { texte: "Les listes de mots", href: "/mots" },
    ],
  },
  {
    question: "Y a-t-il une grille à jouer chaque jour ?",
    reponse:
      `Oui : chaque jour, une nouvelle grille de mots fléchés à jouer dans le navigateur, sur téléphone comme sur ordinateur, gratuitement et sans compte. ` +
      `Elle se joue aussi bien au doigt qu’au clavier, et la solution reste à portée de main.`,
    liens: [{ texte: "La grille du jour", href: "/jouer" }],
  },
  {
    question: "Mots fléchés ou mots croisés : quelle différence ?",
    reponse:
      `Dans les mots croisés, les définitions sont numérotées en marge et des cases noires séparent les mots. ` +
      `Dans les mots fléchés, chaque définition est écrite dans une case de la grille, et une flèche indique où part le mot : on n’a jamais besoin de quitter la grille des yeux.`,
    liens: [{ texte: "Le jeu dans le monde", href: "/articles/mots-fleches-dans-le-monde" }],
  },
];
