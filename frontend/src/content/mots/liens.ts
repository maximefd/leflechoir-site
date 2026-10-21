/**
 * Les adresses vers lesquelles les pages de mots invitent, une fois que la personne a trouvé son mot.
 *
 * La grille du jour (`/jouer`, ADR 0026), rubrique « Jouer » de la navigation. Elle n'est pas forcément plus
 * facile que celle qui résiste (sa force va de 1 à 4) : l'invitation ne le promet plus.
 */
export const ADRESSE_JOUER = "/jouer";

/** « Et si tu fabriquais la tienne ? » : le générateur, guidé pas à pas */
export const ADRESSE_CREER = "/grid";

/** Un mot qui manque : le formulaire de contact */
export const ADRESSE_CONTACT = "/contact";
