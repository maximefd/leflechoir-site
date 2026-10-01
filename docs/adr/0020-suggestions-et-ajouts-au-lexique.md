# 0020 — Suggestions des utilisateurs et mots ajoutés au lexique

- Statut : acceptée
- Date : 2026-09-27

## Contexte

- Les utilisateurs voient les mots du lexique dans la recherche, les grilles générées et l'éditeur. Ce sont les mieux placés pour repérer un mot rare ou fautif, ou un mot qui manque. **Plus ils affinent le lexique commun, plus le site a de valeur** (décision du 25/09/2026, roadmap 1e).
- Le lexique est curé par l'auteur, sur son Mac, dans le curateur ([ADR 0005](0005-pipeline-du-lexique-et-decisions.md)) : `decisions.csv`, en ajout seul, garde ou supprime des mots **du DELA**. **Ajouter un mot absent du DELA est impossible.**
- Les suggestions naissent sur le serveur ; les décisions, sur le Mac ; et les contributeurs doivent voir ce que sont devenues les leurs.

## Décision

1. **Sur le site, un clic suffit**, avec ou sans compte, sans limite pour un humain (un plafond anti-robot de 60 par minute) : « Signaler ce mot » (à retirer) et « Propose-le » (à ajouter). Pas de raison à choisir, pas de commentaire libre (décisions de l'auteur, 27/09/2026).
2. **Le serveur garde les suggestions** (`word_suggestion`) : le mot normalisé, sa langue, sa provenance, le compte ou l'empreinte du jour ([ADR 0016](0016-mesure-d-usage-sans-cookie.md)), et un statut. S'y ajoutent, à l'export, des **signaux implicites** déjà présents : mots imposés inconnus du lexique, mots rangés par au moins deux personnes dans leurs dictionnaires, mots du lexique remplacés à la main dans l'éditeur.
3. **L'auteur décide, sur le Mac**, dans l'onglet « Suggestions » du curateur (`make suggestions-pull` récupère l'export, classé par nombre de personnes distinctes) : **→** le mot reste ou entre au lexique, **←** il en sort ou n'y entre pas.
4. **Deux fichiers versionnés, en ajout seul**, comme `decisions.csv` :
   - `data/lexicon/additions.csv` (`mot;forme;decision;date`, décision `add` ou `ignore`) : **les mots absents du DELA ajoutés au lexique**. L'export du lexique curé les verse après les mots du DELA (sans définition, fréquence 0) ;
   - `data/lexicon/suggestion-decisions.csv` (`type;mot;decision;date`, `accepted` ou `rejected`) : la réponse à chaque suggestion. Un retrait accepté s'écrit aussi dans `decisions.csv` (`delete`), un retrait refusé en `keep`.
5. **`make deploy-lexicon`** réexporte le lexique, le met en service, puis renvoie au serveur les réponses aux suggestions (`flask suggestions apply`) : les contributeurs voient « retenue », « écartée » ou « en attente » dans « Mon compte ».

## Conséquences

- ✅ Rien n'entre dans le lexique ni n'en sort sans l'auteur ; le spam ne peut qu'allonger la file.
- ✅ Même geste qu'au tri ; les décisions restent dans le dépôt, relisibles et réversibles (la dernière l'emporte).
- `suggestions.json` (l'export du serveur) n'est pas versionné : c'est l'état du serveur à un instant.
- Une normalisation unique ([#127](https://github.com/maximefd/terminator-app/issues/127), `backend/normalization.py`) est un prérequis : sinon « porte-monnaie » et « PORTEMONNAIE » feraient deux suggestions.
- Les suggestions sont des données personnelles légères : déclarées dans la page de confidentialité et le registre (traitement 11), gardées 13 mois, supprimées avec le compte. Les CGU précisent qu'elles sont données au site.
- Si les suggestions affluent, le tri de l'auteur devient le goulot : on mesurera alors si un seuil (par exemple dix personnes et aucune voix contraire) prédit bien sa décision, comme pour les règles automatiques ([ADR 0008](0008-regles-automatiques-et-revision.md)). Rien ne s'automatise avant cette mesure.
