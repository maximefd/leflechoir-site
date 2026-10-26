# ADR 0030 — La CI sur le Mac, affichée sur la PR

- **Statut** : proposée (26/10/2026), à accepter par l'auteur
- **Contexte** :
  - Le dépôt est privé (ADR 0021) : sa CI dispose de 2 000 minutes d'Actions par mois. Le 25/10, 1 806 étaient
    consommées : 1 336 par nos PR, 469 par Dependabot et 256 par les fusions sur `main`.
  - Une PR coûtait environ 23 minutes, et chaque push la relançait. Le 26/10, sur des runners plus lents, les seuls
    tests Python en ont pris 11 à 14.
  - Les budgets de l'auteur sont à 0 $ et bloquants : rien ne serait facturé. En revanche, la CI s'arrêterait jusqu'au
    1er du mois, et aucune PR ne pourrait plus être livrée.
  - Alléger la CI de GitHub (tri par fichiers touchés, un seul parcours, Dependabot mensuel) la ramenait à 7–15 minutes
    par PR, sans garantir de tenir dans le forfait un mois chargé. L'auteur a demandé une vraie solution.
  - Tous les contrôles tournent déjà sur le Mac, pour les essais locaux : Python 3.11 dans Docker, pile e2e jetable,
    export statique dans une copie.

## Décision

1. **La CI tourne sur le Mac** : `make verifier` (`tools/ci/verifier.sh`, `PR=N` ou `REF=…`). Elle reprend les
   contrôles de GitHub, un par un :
   - gitleaks ;
   - côté Python : ruff, pip-audit, pytest avec couverture (80 % sur le moteur, 70 % sur les outils) et le catalogue
     des layouts ;
   - côté site : pnpm audit, lint, types et export statique ;
   - les parcours de bout en bout et l'accessibilité, sur l'export.
2. **Elle vérifie ce qui sera livré** : le commit de la PR, fusionné avec `origin/main`. Elle travaille dans une copie
   propre (git worktree temporaire) et sur une pile Docker jetable (PostgreSQL, Mailpit, API), sur des ports à part
   (5090, 3090, 8090). Elle ne touche ni au dossier de travail, ni aux serveurs de l'auteur.
3. **Elle s'affiche sur la PR** comme un contrôle, « ci-locale » (statut du commit) : en cours, vert ou rouge, avec
   l'étape en échec. Le journal est gardé dans `.ci-locale/` (ignoré par git).
4. **Elle trie comme le faisait GitHub** : les tests Python ne tournent que si la PR touche `backend/`, `tools/`,
   `data/`, `.github/` ou les fichiers du site qu'ils lisent ; le site et ses parcours, que si elle touche `frontend/`,
   `backend/` ou `.github/`. `TOUT=1` force tout.
5. **`make livrer` la lance d'office** quand le commit de la PR n'a pas encore son contrôle vert, puis fusionne et
   déploie comme avant. Le geste de l'auteur ne change pas : il dit « validé ».
6. **GitHub Actions ne sert plus qu'en secours**, lancé à la main (`gh workflow run ci.yml --ref <branche>`) quand le
   Mac n'est pas disponible. Le workflow vérifie alors tout, en ~15 minutes.
7. **Dependabot** passe au mois, avec une PR groupée par écosystème. Ses PR se vérifient comme les autres, par
   `make verifier PR=N`.

## Conséquences

- ✅ Plus aucune minute d'Actions en temps normal : le forfait ne sert plus qu'au secours.
- ✅ Les contrôles sont les mêmes, sur le commit qui sera livré, et leur résultat reste visible sur la PR.
- ⚠️ **La CI dépend du Mac** :
  - elle tourne quand Claude ou l'auteur la lance (à chaque PR prête, et d'office par `make livrer`), pas à chaque
    push ;
  - elle prend de la mémoire à la VM Docker (3,8 Go), d'où des étapes en série et des conteneurs plafonnés ;
  - elle demande quelques minutes de Mac (5 à 15 selon ce que la PR touche), le plus souvent en tâche de fond.
- ⚠️ Un statut « ci-locale » se publie avec le jeton de `gh` : la confiance repose sur le Mac de l'auteur. Pour un
  projet tenu par une seule personne, c'est le même niveau de confiance que le déploiement (ADR 0019).
- ⚠️ Les parcours tournent sous le Chrome du Mac et Node 26, et non plus sous le Chromium de Playwright et Node 22.
  Un écart de version peut un jour faire passer en local ce qui casserait en CI : le secours GitHub reste là pour
  trancher.
- La règle « CI verte avant la fusion » (CONTRIBUTING.md) devient « contrôle ci-locale vert ».
