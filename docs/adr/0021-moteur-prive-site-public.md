# 0021 — Le moteur en privé, le site et l'API en open source

- Statut : acceptée
- Date : 2026-10-01
- Remplace : la ligne « Dépôt GitHub » de l'[ADR 0013](0013-cible-hebergement-production.md) (tout le dépôt en privé)

## Contexte

- L'auteur veut protéger **la génération** contre un concurrent qui la copierait, ainsi que **le lexique curé** (sa curation : `decisions.csv`, les règles, les ajouts). Les layouts n'ont pas à être protégés.
- Le reste du site (pages, API Flask) peut rester en open source.
- L'auteur ne veut pas que le moteur reste lisible dans l'**historique** public : retirer le moteur du dépôt public aujourd'hui ne suffirait pas, ses versions passées resteraient consultables.
- Réécrire l'historique d'un dépôt public (`git filter-repo`) casserait les liens et les PR existantes, sans effacer les copies déjà faites.
- Contrainte : rester simple, sans budget supplémentaire.

## Décision

1. **Le dépôt de travail `maximefd/terminator-app` devient privé.** Il garde tout : moteur, lexique, historique, issues, PR. On continue d'y travailler comme avant.
2. **Un dépôt public `maximefd/leflechoir-site`** reçoit la partie open source : le site, l'API Flask, les layouts, le déploiement et la documentation hors moteur.
   - Il est produit par `tools/public/export.sh` : le commit en cours, **sans historique**, moins les chemins de `tools/public/prive.txt`, poussé en un seul commit.
   - `make deploy` le met à jour après chaque mise en ligne ; `make publish-public` le fait à la demande.
3. **Restent privés** (`tools/public/prive.txt`) : `backend/engine/`, le générateur, l'index de mots, les mesures (`backend/benchmarks`, `test_harness.py`), leurs tests, `data/lexicon/`, le DELA nettoyé, les outils de curation (`tools/lexicon`, `tools/curator`), la documentation du moteur et du lexique (`docs/ENGINE.md`, `docs/LEXICON.md`, ADR 0005, 0008, 0009).
4. **Au plus simple** : le dépôt public n'est pas autonome. L'API y appelle un moteur absent ; il sert de vitrine et de référence, pas de kit d'installation. Les contributions passent par l'adresse de contact.

## Conséquences

- ✅ Les améliorations du moteur et de la curation ne sont plus publiques à partir de cette date.
- ⚠️ Ce qui a été public jusque-là a pu être copié ; les clones et forks existants ne sont pas concernés par la bascule. Un fork public d'un dépôt qui passe en privé **reste public** : un collaborateur doit supprimer le sien et travailler sur le dépôt privé.
- Sur GitHub Free, le dépôt privé perd la protection de branche obligatoire et le signalement privé des failles, et la CI passe à **2 000 minutes par mois**. Compensations :
  - les fusions restent soumises à une CI verte et à l'accord de l'auteur ;
  - la CI est allégée : runs remplacés annulés, documentation seule sans CI, parcours de bout en bout sur les PR seulement ;
  - **révision du 26/10/2026** (alerte des 90 % : 1 806 minutes au 25 du mois, dont 1 336 pour nos PR, 469 pour
    Dependabot et 256 pour les fusions sur `main`) :
    - la CI ne tourne plus que sur les PR : le commit fusionné y est déjà passé, et `main` ne se déploie que par
      `make livrer` ;
    - un job « tri » ne lance que ce que la PR touche : les tests Python pour `backend/`, `tools/`, `data/` et les
      fichiers du site qu'ils lisent ; le site et ses parcours pour `frontend/` et `backend/` ;
    - les parcours ne visent plus que l'export publié (le serveur de développement l'est en local), et les contrôles du
      site (audit, lint, types) partagent son installation et son build ;
    - Dependabot passe au mois, une PR groupée par écosystème ;
    - un budget de 0 $ pour Actions, réglé par l'auteur : au-delà du forfait, la CI s'arrête au lieu d'être facturée ;
    - puis, le même jour, la CI passe sur le Mac ([ADR 0030](0030-ci-locale.md)) : Actions ne sert plus qu'en secours.
  - le `security.txt` du site (déjà en place), pour le signalement des failles (#122).
- Toute nouvelle partie liée au moteur ou au lexique doit être ajoutée à `tools/public/prive.txt` ; le script vérifie qu'aucun chemin listé ne subsiste dans l'export.
