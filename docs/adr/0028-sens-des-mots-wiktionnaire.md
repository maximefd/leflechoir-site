# 0028 — Le sens des mots, tiré du Wiktionnaire, à côté des grilles

- Statut : acceptée (19/10/2026), mise en œuvre sur la branche `feat/sens-des-mots`
- Date : 2026-10-19
- Complète [#83](https://github.com/maximefd/terminator-app/issues/83) (Wiktionnaire hors du site) et l'[ADR 0024](0024-source-des-definitions.md) (source des définitions proposées), sans les contredire : le Wiktionnaire n'alimente toujours aucune définition de case.
- **Ce document n'est pas un avis juridique.**

> **En bref**
> - On affiche, **à côté** de la grille, le sens de ses mots tiré du Wiktionnaire : un aide-mémoire pour reconnaître un mot technique ou rare (ÉGOÏNE, ADRET, AUBIER). Nom de la fonction : **« Le sens des mots »** (choix délégué par l'auteur le 19/10/2026).
> - **Quatre endroits** : sous la grille générée, dans l'éditeur, dans la recherche par motif, et sous la grille du jour **une fois finie**.
> - **Jamais** dans les cases, dans le PDF (ni grille ni solution), pendant une partie, sur les pages de listes de mots, ni dans les définitions proposées de l'ADR 0024.
> - Texte cité tel quel, avec **une mention par écran** : « Sens tirés du Wiktionnaire, sous licence CC BY-SA 4.0, parfois abrégés », un seul lien vers le Wiktionnaire et un vers la licence.
> - Données à part (`sens.sqlite`), route à part (`/api/sens`), composant à part : rien ne relie ces sens au champ de définition des cases.

## Contexte

- Le lexique du site est construit en partie à partir du Wiktionnaire (extrait kaikki.org). Ses définitions servent au tri dans le curateur, sur le Mac de l'auteur. Le site ne les sert pas : `make deploy-lexicon` retire la colonne et la recherche renvoie `definition: null` pour les mots du lexique ([LICENCES.md](../LICENCES.md), [PRODUCTION.md](../PRODUCTION.md)).
- #83 (fermée « non planifiée » le 02/10/2026) et l'[ADR 0024](0024-source-des-definitions.md) ont écarté le Wiktionnaire comme **source des définitions de cases** : une banque de définitions qui en dériverait, même reformulée par une IA, devrait être publiée sous CC BY-SA, ce qui contredit l'[ADR 0021](0021-moteur-prive-site-public.md) et la donnerait aux concurrents.
- Le besoin est autre (auteur, 19/10/2026). Une grille générée contient des mots que son créateur ne connaît pas toujours, et le joueur de la grille du jour aimerait savoir ce qu'il vient d'écrire. Il ne s'agit pas d'écrire la définition de la case, qui reste libre à l'auteur de la grille, mais de **rappeler le sens du mot**.
- **CC BY-SA 4.0**, ce que la licence demande pour un texte cité tel quel :
  - attribution : source, lien vers la licence, indication des modifications ;
  - partage à l'identique : seulement pour les adaptations de ces textes ;
  - aucune restriction supplémentaire sur ces textes : ni conditions qui en interdisent la réutilisation, ni mesure technique.

  Notre liste de mots est distincte : des mots isolés ne sont pas protégeables, et notre sélection ne dérive pas du texte du Wiktionnaire. Tant que les deux restent séparés, la licence ne s'étend pas à la liste.
- Qualité constatée : la base du curateur ne garde que la **première acception de la première entrée**, et ce n'est pas toujours la bonne.
  - PRIME donne « Première heure canoniale », alors que l'entrée « Somme payée par un assuré… » vient plus loin.
  - DIANE donne « La lune », un sens marqué *poétique*.
  - ARLÉSIEN renvoie d'abord aux Anses-d'Arlet.
  - RUSE donne « Personne rusée ».

  L'extrait kaikki contient toutes les entrées et toutes les acceptions, avec des étiquettes : *dated* (12 571), *obsolete* (11 738), *rare* (9 336), *poetic*, *archaic*, *literary*… Le choix des sens peut donc s'améliorer.

## Décision

1. **Afficher le sens des mots, sans en faire des définitions.** C'est un texte d'aide, en petit, sous le mot, toujours présenté comme « le sens du mot ». Il n'a ni bouton « Utiliser », ni copie automatique vers une case.
2. **Quatre endroits**, et seulement ceux-là :
   - **Générer** (`GridDisplay`, section « Les mots de la grille ») : le sens sous chaque mot, avec une case « Afficher le sens des mots » mémorisée dans le navigateur ;
   - **Éditeur**, mode Définitions : un encadré « Sens du mot » sous le champ du mot sélectionné, en lecture seule, distinct de « Dans ton dictionnaire… » ;
   - **Recherche par motif** : le sens sous chaque résultat, en texte droit. Les définitions des dictionnaires personnels restent en italique ;
   - **Grille du jour** : une section dépliable « Les mots de la grille et leur sens », qui n'apparaît qu'une fois la grille finie ou la solution affichée.
3. **Exclusions** : ni dans les cases, ni dans le PDF (grille et solution), ni pendant une partie, ni sur les pages de listes de mots, ni dans les grilles partagées à jouer. Les définitions proposées automatiquement (ADR 0024) ne lisent jamais ces sens, et aucune invite d'IA ne les reçoit.
4. **Mention** : une fois par écran, sous la liste des sens : « Sens tirés du Wiktionnaire, sous licence CC BY-SA 4.0, parfois abrégés », avec un seul lien vers le Wiktionnaire et un vers la licence. Pas de lien par mot. Les crédits de la page des mentions légales citent le Wiktionnaire.
5. **Texte cité tel quel.** Pas de reformulation. Une coupe éventuelle (au plus deux acceptions, texte trop long) est couverte par « parfois abrégés ».
6. **Données et code séparés.** Les sens vivent dans leur propre fichier (`sens.sqlite`), passent par leur propre route (`/api/sens`) et leur propre composant. Ils ne partagent ni table, ni champ, ni type avec les définitions de cases ou de dictionnaires.
7. **Pas de restriction ajoutée sur ces textes.** La mention anti-copie des pages de listes de mots ne vise pas les sens, qui n'y figurent pas. Les CGU précisent que les sens tirés du Wiktionnaire restent sous CC BY-SA.

## Conséquences

- Le site affiche pour la première fois du contenu sous CC BY-SA. [LICENCES.md](../LICENCES.md) passe la ligne du Wiktionnaire de ⚠️ à « affiché avec attribution », et #83 trouve sa réponse pour l'affichage, pas pour les définitions.
- `make deploy-lexicon` envoie un second fichier, `sens.sqlite`, de l'ordre de 20 à 40 Mo [estimation]. L'API l'ouvre en lecture seule, sans le charger en mémoire : la RAM du VPS ne bouge pas.
- Le dépôt public ([ADR 0021](0021-moteur-prive-site-public.md)) reçoit le code de la route et des composants, rien de plus. Le fichier des sens n'est pas versionné, comme le lexique.
- Mesure d'usage ([ADR 0016](0016-mesure-d-usage-sans-cookie.md)) : rien de nouveau, la case à cocher n'est pas mesurée. La page confidentialité ne change pas.
- Effet secondaire utile : le curateur peut afficher les mêmes sens mieux choisis (règle du point « Données » ci-dessous).

## Mise en œuvre (cadrage du lot)

**Notre angle** : le métier de verbicruciste rendu facile. On comprend chaque mot de sa grille sans quitter la page, et sa définition reste la sienne. **Nom** : « Le sens des mots » (vérifié contre la liste de [CONCURRENCE.md](../CONCURRENCE.md), §4).

### 1. Données (`tools/lexicon/`, privé)

- `tools/lexicon/sens.py` lit l'extrait kaikki et écrit `data/lexicon/build/sens.sqlite` (environ 43 Mo) : une table `sens(lang, lemme_norm, cle, lemme, rang, texte)` et une table `formes(lang, norm, lemme_norm, cle)` pour rattacher chaque mot du lexique en service à ses sens (ULULENT → ululer). `cle` porte la nature du mot quand elle change le choix (NOYANT, forme du verbe : « asphyxier par immersion », pas l'arbre). Le fichier porte sa langue ([ADR 0017](0017-un-site-par-langue.md)).
- **Choix des sens** :
  - on écarte les acceptions étiquetées *form-of*, *alt-of*, *obsolete*, *archaic*, *dated*, *poetic*, *rare* et *literary* ;
  - l'entrée la plus **traduite** passe d'abord, puis la plus fournie : le nombre de traductions signale le sens courant (PRIME : l'assurance, 24 traductions, avant l'heure canoniale, aucune ; PUPILLE : l'œil avant l'orphelin) ;
  - on garde **deux acceptions**, de cette entrée puis de la suivante ;
  - une forme fléchie prend les sens de son lemme, sauf si elle a des sens à elle traduits au moins trois fois (ÉTÉ : la saison, pas « être » ; CONTINUE : « continuer », pas l'appareil de filature) ;
  - les textes sont nettoyés (renvois de notes, codes de couleur, notes d'usage, balisage du wiki), sinon cités tels quels ; au-delà de 220 caractères, coupés sur un mot.
- **Contrôle de la règle**, fait par Claude, pas par l'auteur : 200 mots tirés au hasard (la moitié parmi les mots courants), en deux passes. Première règle : 96 % ; règle finale : environ 97 % de mots dont le sens courant figure parmi les deux affichés. Ratés restants : des homonymes dont le sens rare est le plus traduit (MANCHOT, l'oiseau d'abord ; OBJECTIF, le sens philosophique) et quelques sens mal classés dans le Wiktionnaire (MINISTÈRE, PODIUM, REJETON).
- `make lexicon-sens` construit le fichier, et `make deploy-lexicon` l'envoie avec le lexique (même vérification d'empreinte, même retour arrière). `tools/public/prive.txt` reçoit `tools/lexicon/sens.py`.

### 2. API (`backend/`)

- `POST /api/sens`, corps `{ "mots": ["ADRET", …] }` validé par `parse_body(SensRequest)`, 200 mots au plus. La langue est celle du site (`SITE_LANG`). Réponse : `{ "sens": { "ADRET": { "lemme": "adret", "textes": ["…"] } }, "source": "Wiktionnaire", "licence": "CC BY-SA 4.0" }`.
- Erreurs en français avec un `reason` stable, en anglais comme les autres de l'API : `too_many_words`, `senses_unavailable` (fichier absent : 503, la page se passe des sens et n'affiche rien).
- Route publique : ce sont les mots d'une grille déjà affichée, sans donnée personnelle. On applique la limite de débit commune, et le `Cache-Control` long, puisque le fichier ne change qu'au déploiement.
- La recherche par motif ajoute un champ `sens` à chaque résultat, **distinct** de `definition`, qui reste réservé aux dictionnaires.
- Le moteur (`backend/engine/`) n'est pas touché : pas de benchmark à refaire.

### 3. Site (`frontend/`)

- Un seul composant, `SensDesMots` (nom technique), et un seul appel via `apiFetch`. La mention de licence est un composant partagé, posé une fois par écran.
- **Générer** : dans `GridDisplay`, sous chaque mot de « Les mots de la grille ». La case « Afficher le sens des mots » est cochée d'office, et son état est mémorisé dans `localStorage`.
- **Éditeur** : dans `grid-editor.tsx`, l'encadré « Sens du mot » sous « Dans ton dictionnaire… », pour le mot sélectionné. Les sens de toute la grille sont chargés en un appel.
- **Recherche** : `search-form.tsx` affiche `word.sens` sous `word.definition`.
- **Grille du jour** : dans `grille-du-jour.tsx`, la section dépliable ne se monte qu'à la fin de la partie ou à l'affichage de la solution. Avant, aucun appel à `/api/sens` (vérifiable dans l'onglet Réseau).
- Clavier : rien de nouveau. La case et le dépliable sont des contrôles natifs (Tab, Espace, Entrée).

### 4. Textes à mettre à jour

[LICENCES.md](../LICENCES.md), la page des mentions légales (crédits), les CGU (point 7), [PRODUCTION.md](../PRODUCTION.md) (le second fichier de `deploy-lexicon`) et le CHANGELOG.

### 5. Tests

- **API** : la forme de la réponse ; les trois `reason` ; une forme fléchie renvoie le sens de son lemme ; un mot hors lexique ne renvoie rien ; le champ `definition` de la recherche reste vide pour les mots du lexique.
- **Site** (e2e) : les sens s'affichent sous une grille générée, avec une seule mention ; la grille du jour n'appelle pas `/api/sens` avant la fin ; le PDF n'en contient pas.
- **Garde-fou** : un test vérifie que le code des définitions proposées (ADR 0024, à venir) n'importe ni `sens.sqlite` ni la route.

### 6. Ordre et estimation

1. Le script des sens et le contrôle sur 200 mots : 1 jour.
2. La route et son envoi au déploiement : 1 jour.
3. Générer et l'éditeur : 1 jour.
4. La recherche et la grille du jour : 0,5 jour.
5. Les textes, puis la recette locale par l'auteur avant tout push.

### Choix de l'auteur (19/10/2026)

- Nom : choix délégué à Claude, qui retient « Le sens des mots ».
- Sens affiché d'office sous la grille générée ; la case se décoche.
- Deux acceptions par mot.
