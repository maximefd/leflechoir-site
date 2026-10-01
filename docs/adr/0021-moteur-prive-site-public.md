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
  - `security.txt` sur le site, pour le signalement des failles (#122).
- Toute nouvelle partie liée au moteur ou au lexique doit être ajoutée à `tools/public/prive.txt` ; le script vérifie qu'aucun chemin listé ne subsiste dans l'export.
