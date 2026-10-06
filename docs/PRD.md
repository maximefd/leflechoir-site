# 🧩 Product Requirements Document (PRD) — Terminator

> Vision produit. Pour le « comment » et le « quand », voir [ROADMAP.md](ROADMAP.md) (privée depuis le 02/10/2026) et [ARCHITECTURE.md](ARCHITECTURE.md).
> Dernière mise à jour : 2 octobre 2026.

## 1. Problème et proposition de valeur

### Le problème
Créer une grille de mots fléchés prend du temps. À la main, on bute sur la case qui manque : il faut un mot d'une longueur donnée, avec certaines lettres imposées par les croisements. Remplir automatiquement une grille est encore plus dur : les mots doivent tous exister et tous se croiser. Et pour qu'une grille paraisse professionnelle, il faut respecter les mises en page des publications françaises et utiliser des mots naturels.

### La proposition
Un atelier pour l'auteur de mots fléchés :
1. **Création manuelle assistée** : trouver instantanément les mots correspondant à un motif (`P??LE`), dans un grand dictionnaire et dans ses propres listes.
2. **Création automatique** : choisir un format, donner quelques mots qu'on veut absolument voir ou aimerait voir (environ 30 % de la grille), et laisser le moteur compléter avec le dictionnaire commun.
3. **Rendu professionnel** : des layouts recopiés de vrais livres, un vocabulaire courant, puis des flèches, des définitions et un export.

Ce n'est **pas un jeu**, c'est un **outil de création**.

**Positionnement (octobre 2026)** : **des grilles de qualité pro, dans un outil facile à prendre en main**. Le site sert aussi bien le créateur passionné que la personne qui veut offrir une grille faite avec ses mots ; le cœur reste la création.

## 2. Personas

| Persona | Besoin | Aujourd'hui |
|---------|--------|-------------|
| **L'auteur** (créateur du projet) | Gagner du temps sur ses grilles, avec un résultat de qualité professionnelle | Cible principale |
| **Créateur passionné, expérimenté ou professionnel** | Grilles denses, esthétiques, vocabulaire maîtrisé, export ; outils de création (motif, dictionnaires, layouts) | Cible principale depuis l'ouverture ; options payantes pour les pros |
| **Particulier qui offre une grille** | Une grille faite avec ses mots (anniversaire, mariage, départ), avec ses définitions, prête à offrir, sans effort | Cible principale depuis octobre 2026 |
| **Joueur** | Résoudre la grille qu'on lui a offerte | Prévu |
| **Visiteur** | Découvrir l'outil via la recherche par motif ou une grille, sans compte | Supporté ; un compte pour garder son travail |
| **L'auteur, pilote du site** | Savoir qui utilise le site, ce qui marche, ce qui casse et ce que coûte le serveur | ✅ Poste de pilotage (Phase 8) |
| **Auteurs et joueurs d'autres pays** | Le même outil dans leur langue, avec leurs conventions | En pause (Phase 10) |

## 3. Fonctionnalités

| # | Fonctionnalité | Détail | État |
|---|----------------|--------|------|
| F1 | Recherche par motif | `?` = lettre inconnue ; accents ignorés ; résultats personnels en tête | ✅ (~90 %) |
| F2 | Dictionnaires personnels | Plusieurs par utilisateur, un actif, mots avec définition | ✅ |
| F3 | Comptes | Inscription, connexion, session renouvelée, suppression des données | ✅ |
| F4 | Génération automatique | À partir d'un layout ; déterministe par seed ; budget temps | ✅ 20/20 sur les 21 layouts sans mot imposé ; fragile dès trois mots imposés longs ([#73](https://github.com/maximefd/terminator-app/issues/73)) |
| F5 | Lexique curé | Tri manuel rapide des mots rares, aidé par la fréquence et les définitions | Phase 1 |
| F6 | Catalogue de layouts | Nombreux formats et mises en page issus de livres ; éditeur | Phase 2 |
| F7 | Mots imposés | Obligatoires, souhaités, dictionnaires thématiques choisis un à un | ✅ ; la difficulté est annoncée avant de générer ([ADR 0009](adr/0009-annoncer-la-difficulte.md)) |
| F8 | Écran de génération et grilles conservées | Sources des mots, difficulté, historique cherchable et archivable | ✅ ; reste le choix du layout, qui demande `layout_id` |
| F9 | Rendu mots fléchés | Flèches déduites, cases définitions, saisie des définitions, export PDF | ✅ |
| F10 | Retouche d'une grille | Corriger une lettre à la main, mots recalculés et vérifiés, propositions qui respectent les croisements | ✅ ([ADR 0012](adr/0012-grille-modifiable.md)) |
| F11 | Bloc-notes par grille | Les idées avant les définitions, gardées avec la grille | ✅ |
| F12 | Mesure d'usage et poste de pilotage | Événements côté serveur, sans cookie ni script tiers ; espace d'administration réservé à l'auteur | Phase 6 (collecte), Phase 8 (poste de pilotage) ([ADR 0016](adr/0016-mesure-d-usage-sans-cookie.md)) |
| F13 | Contact et signalement | Une adresse de contact à l'ouverture ; ensuite un formulaire, « Signaler ce problème » et une boîte de réception | Phases 6 et 8 |
| F14 | Référencement | Pages publiques indexées, application en `noindex`, contenus d'usage, visibilité dans les moteurs de réponse IA | Phase 6 (technique), Phase 9 (contenus) |
| F15 | Autres langues | Un site et un nom par langue : anglais, allemand, espagnol | Phase 10 ([ADR 0017](adr/0017-un-site-par-langue.md)) |
| F16 | Grilles à thème par IA | Mots du thème et définitions proposés par l'IA, grille prête à imprimer ; offre payante | Phase 11 |
| F17 | Suggestions de mots | Signaler un mot à retirer du lexique, proposer un mot à ajouter ; l'auteur tranche dans le curateur | Après la Phase 8 (1e) |

## 4. Contraintes

- **Aspect professionnel français** : les layouts viennent de publications réelles ; les mots doivent être courants.
- **Clavier AZERTY** : raccourcis sans Maj ni AltGr.
- **UX irréprochable** : chaque écran explique ce qu'il fait et ce qui se passe ensuite, même pour un public expert.
- **Sécurité** dès maintenant (données utilisateur en base), même sans mise en production.
- **Pratiques d'ingénierie de niveau production** (tests, CI, revue, ADR) malgré l'usage personnel.
- **Vie privée** : mesure d'usage côté serveur, sans cookie ni script tiers ; l'adresse IP n'est jamais enregistrée ([ADR 0016](adr/0016-mesure-d-usage-sans-cookie.md)).
- **Multilingue anticipé** : un site et un nom par langue. Le nom public vient de la configuration du site ; Terminator nomme le moteur ([ADR 0017](adr/0017-un-site-par-langue.md)).

## 5. Hors périmètre (pour l'instant)

- Collaboration multi-utilisateurs.
- Mots croisés : à réfléchir comme différenciation, avec l'international. Rien n'est prévu avant.

Planifiés (voir la [roadmap](ROADMAP.md)) :
- la mise en ligne (Phase 6), faite le 25/09/2026 ;
- les autres langues (Phase 10), en pause depuis le 02/10/2026 ;
- une offre payante réservée aux besoins des pros et aux demandes spéciales ; l'usage courant reste gratuit.

## 6. Critères de succès

| Critère | Mesure | Aujourd'hui |
|---------|--------|-------------|
| Recherche rapide | Réponse `/api/search` < 200 ms (P95) | ✅ (arrêt du parcours à la limite) |
| Génération fiable | ≥ 95 % de succès en 20 s pour chaque layout du catalogue (benchmark, 20 seeds) | ✅ 100 % sur les 16 layouts du catalogue, jusqu'au 13×16 (61 mots) |
| Qualité des mots | Grilles sans formes fléchies rares, jugées publiables par l'auteur | ❌ avant la Phase 1 |
| Mots imposés | Mots obligatoires toujours placés, ou échec expliqué | Phase 3 |
| Qualité technique | CI verte ; couverture ≥ 70 % sur le moteur et le pipeline du lexique | Tests en place, couverture non mesurée |
| Ouverture | Site en ligne sur son domaine, checklist de production 14/14, sauvegarde restaurée, mesures collectées dès la première visite | Phase 6 |
| Curation terminée | Critère 1d de la [roadmap](ROADMAP.md) : plus rien à trier jusqu'à 8 lettres, 18 grilles sur 20 sans mot impubliable | En cours |
| Pilotage | Chaque question de l'auteur (visiteurs, générations, erreurs, ressources) trouve sa réponse dans le poste de pilotage | Phase 8 |

## 7. Architecture (résumé)

Frontend Next.js ↔ API Flask ↔ PostgreSQL ; dictionnaire DELA chargé en mémoire dans un Trie ; moteur de génération par backtracking guidé. Détails : [ARCHITECTURE.md](ARCHITECTURE.md) et [ENGINE.md](ENGINE.md).
