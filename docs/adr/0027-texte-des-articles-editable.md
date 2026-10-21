# 0027 — Le texte des articles, repris dans la page

- Statut : proposée
- Date : 2026-10-07
- Décision de la demande de l'auteur du 07/10 (reprendre au téléphone les articles proposés par l'agent)

> **En bref**
> - Le texte d'un article devient une **donnée** (`textes/<slug>.json`), rendue par une coquille TSX qui garde
>   dates, brouillon, liens du bas et grille.
> - En développement seulement, l'auteur **édite le texte dans la page même** : un crayon apparaît, sans compte
>   à ouvrir, et le texte devient écrivable **dans sa typographie** — pas de plein écran, pas de formulaire
>   (retour de l'auteur du 07/10 au soir : « comme si on écrivait dans la page web directement »).
> - Des **notes de relecture** s'accrochent aux sections (une par section, plus une pour l'article entier) et
>   se gardent toutes seules ; elles vivent hors du site publié.
> - L'API réécrit le fichier **du dépôt** (dossier monté) : le **git reste la seule vérité**, l'auteur relit le
>   diff et committe. Pas de base de données, pas d'interface d'administration type WordPress — refusée par l'auteur.
> - En production, rien : le dossier n'est pas monté, l'adresse répond 404 comme si elle n'existait pas.

## Contexte

- L'agent rédige des brouillons d'articles (trois en attente de relecture) ; l'auteur veut les **reprendre au
  téléphone**, ajouter une phrase, corriger un mot, pendant qu'il lit — pas ouvrir un fichier dans un éditeur de
  code. Le tunnel de développement (`make preview-remote`) lui donne le site sur son téléphone depuis partout.
- Premier essai (plein écran, un champ par champ, défilement latéral) : l'auteur n'en veut pas — « pas fan des
  paragraphes séparés avec le scroll sur le côté ». Il veut écrire **dans la page**, et pouvoir laisser des
  **annotations** en relisant. D'où la reprise : édition en place, notes de relecture.
- Le site est un **export statique** (ADR 0013) : pas de CMS servi, pas de base de données de contenu. Faire du
  site un gestionnaire de contenu casserait ce choix — et l'auteur ne veut pas d'un panneau d'administration
  séparé, où le texte se relit hors de sa mise en page.
- Le dépôt est privé, le site public (ADR 0021) : les articles sont publiés par `make deploy`, jamais édités en
  ligne. Et le cap (ADR 0023) veut que **l'auteur valide avant tout push sur `main`** : l'édition ne peut pas
  contourner la relecture du diff.

## Décision

1. **Le texte est une donnée.** `frontend/src/content/articles/textes/<slug>.json` porte titre, description,
   chapeau et sections (identifiant d'ancre, titre, paragraphes). Un balisage léger suffit — `**gras**` pour les
   amorces, `[libellé](/adresse)` pour les liens internes — rendu par `Prose`. La coquille TSX de l'article
   assemble texte et reste (dates, brouillon, liens, grille) par `articleAvecTexte` ; `ArticleSection.body`
   reste un nœud React, donc comptage de mots, SEO et sitemap ne changent pas.
2. **L'édition se fait dans la page, en développement seulement.** Sur la page de l'article, sans compte (le
   développement suffit, voir le point 4), un crayon flottant rend **le texte même écrivable, dans sa
   typographie** : la page ne change pas de peau, chaque zone (titre, chapeau, titres de section, paragraphes)
   devient une zone d'écriture sans cadre qui grandit avec le texte ; le paragraphe touché montre ses gestes
   (« Une phrase dessous », suppression), la description des moteurs se règle en tête, une barre fixe en bas
   enregistre ou ferme. Pensé pour le téléphone, au pouce. La grille, le sommaire et les liens du bas ne
   s'éditent pas : ils reviennent à la fermeture.
3. **Des notes de relecture, dans la page aussi.** Une note jaune s'accroche à une **section** (repérée par son
   ancre, stable : elle ne dérive pas quand un paragraphe bouge ou disparaît), une autre regarde l'article
   entier. Elles se gardent toutes seules quand elles perdent le focus — vidées, elles disparaissent. Elles
   vivent dans `data/annotations/<slug>.json` (`NOTES_DIR`), **hors du texte publié** : jamais dans le bundle
   du navigateur, jamais dans le dépôt public (`tools/public/prive.txt`) — c'est du travail privé, que l'agent
   relit pour reprendre le texte.
4. **L'API réécrit le fichier du dépôt.** `GET`/`PUT /api/articles/<slug>/texte` et `GET`/`PUT
   /api/articles/<slug>/notes` (blueprint `article_texte`) :
   - **sans compte** : d'abord réservée à l'administrateur, l'édition s'en passe depuis le retour de l'auteur
     du 07/10/2026 — le dossier monté ne l'est qu'en développement, un rôle n'y ajoutait rien. Le tunnel
     (`make preview-remote`) expose bien cette adresse à qui a son lien, temporaire et aléatoire : au pire, un
     texte modifié, visible dans le `git diff` avant tout commit. En production (`APP_ENV=production`), 404
     même si un dossier était monté par erreur ;
   - **fermé sans dossier monté** : seul le conteneur de développement monte
     `frontend/src/content/articles/textes` (TEXTES_DIR) et `data/annotations` (NOTES_DIR) ; sans montage,
     l'adresse répond `edition_indisponible` en 404 — aucune surface nouvelle ;
   - **aucune création** : seuls les articles existants se rééditent (un nouvel article reste un fichier que
     l'agent écrit), aucun slug hors motif `[a-z0-9-]+` (pas de traversée de chemin), écriture **atomique**,
     et une clé de note hors ancres connues (`_article` ou une ancre de section) est refusée ;
   - validation stricte du corps (longueurs, ancres uniques) : un texte refusé n'effrite jamais le fichier.
5. **Le git reste la seule vérité — pour le texte.** Le PUT réécrit le JSON dans le dépôt ; le serveur de
   développement relit la page à la volée ; l'auteur relit le `git diff` et committe. Les notes, elles, ne
   se committent pas : elles traversent (travail privé), puis disparaissent une fois reprises. Rien ne part
   en production sans l'auteur — le cap tient.

## Conséquences

- Un article se crée toujours en trois fichiers (coquille TSX, texte JSON, grille JSON) : le coût d'entrée
  d'un nouvel article ne change pas, seule sa relecture change — elle se fait maintenant dans la page, au
  téléphone.
- Le format du texte est figé par le schéma Pydantic côté API et par `TexteArticle` côté navigateur : ajouter
  une donnée à un article (une image, par exemple) se fera en étendant les deux ensemble, pas en acceptant du
  HTML libre. Pas d'éditeur riche : le balisage léger tient dans une zone de texte et se relit tel quel.
- Les notes s'adressent à **l'agent**, pas au site : le flux de relecture devient « l'auteur note dans la page,
  l'agent reprend le texte d'après les notes ». Le jour où les deux veulent se parler autrement (une discussion
  par section, par exemple), le format `data/annotations/<slug>.json` pourra grandir sans toucher au texte publié.
- Si un jour l'édition devait exister en production (corriger une coquille sans redéployer), ce serait une
  autre ADR : il faudrait une base, une authentification renforcée et une décision sur l'export statique. Rien
  n'est prêt pour cela, volontairement.

## Notre angle, en une ligne

Le CMS du site, c'est la page elle-même : l'auteur lit son article, touche un mot, et le dépôt retient.
