/**
 * Le style des pages de mots : celui du site actuel (décision de l'auteur du 08/10/2026 : pas encore la police ni les
 * couleurs des maquettes), avec une seule touche d'ocre, discrète, sur la lettre ou la longueur où l'on est. Les
 * survols et les apparitions sont animés, brièvement (`transition`, `tw-animate-css`).
 */

/** Le gris des textes secondaires */
export const texteDoux = "text-muted-foreground";

/** Plus de police de titre à part : on reste sur celle du site */
export const serif = "";

/** Le cadre d'un bloc : celui des cartes du site */
export const cadre = "rounded-lg border bg-card";

/** L'en-tête d'une section */
export const enTeteSection = "text-xl font-semibold text-foreground md:text-2xl";

const pastilleBase =
  "inline-flex h-11 min-w-11 items-center justify-center rounded-md border px-3 text-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** Un bouton ou un lien de raccourci (une lettre, une terminaison) */
export const pastille = `${pastilleBase} bg-background text-foreground hover:bg-accent`;

/** La pastille de la page où l'on est : la seule touche d'ocre, cernée pour ne pas tenir à la couleur seule */
export const pastilleCourante = `${pastilleBase} border-amber-500 bg-amber-100 font-medium text-foreground`;

/** Le gros bouton d'action : le bouton principal du site */
export const boutonOcre =
  "inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-lg font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50";

/** Un lien en texte, comme ailleurs sur le site */
export const lienOcre = "text-foreground underline underline-offset-4 transition-colors hover:text-primary/80";
