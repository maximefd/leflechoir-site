# Polices embarquées

**Archivo Narrow** (Omnibus-Type), sous [SIL Open Font License 1.1](https://openfontlicense.org/), texte et notice dans [`OFL.txt`](OFL.txt) :
`archivo-narrow-500.ttf` (Medium, déclaré en graisse 400) et `archivo-narrow-700.ttf` (Bold).

Elle sert au rendu des grilles — définitions et lettres — à l'écran **et** dans le PDF exporté.
C'est une étroite de labeur, dessinée pour du texte dense : c'est exactement ce qu'est une définition
de mots fléchés, quelques mots dans une demi-case.

**Architects Daughter** (Kimberly Geswein), sous [SIL Open Font License 1.1](https://openfontlicense.org/)
aussi, notice dans [`OFL-ArchitectsDaughter.txt`](OFL-ArchitectsDaughter.txt) : `architects-daughter.ttf`.
Elle sert à l'**écriture du joueur** dans les grilles à jouer (ADR 0026) : des capitales imprimées à la
main, le remplissage a l'air d'un crayon. Elle ne part pas dans le PDF — la grille s'imprime vierge.

Les fichiers sont versionnés plutôt que chargés depuis Google Fonts, pour deux raisons : Terminator
tourne en local sans dépendre d'un service extérieur, et le PDF embarque **le même fichier** que
l'écran — sans quoi le texte calé à l'écran déborde sur le papier (vu en vrai).
