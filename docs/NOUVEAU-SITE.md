# Ouvrir un nouveau site (une langue de plus)

Le guide de l'[ADR 0033](adr/0033-un-site-de-plus.md) : tout ce qu'il faut, dans l'ordre, pour ouvrir le site d'une nouvelle langue ([ADR 0017](adr/0017-un-site-par-langue.md), [ADR 0031](adr/0031-reprise-de-l-international.md)). Les exemples prennent l'allemand (`de`) ; `<projet>` est le nom court du site (comme `leflechoir`).

👤 : un geste de l'auteur (compte, achat, clic dans une console). Le reste se fait dans le dépôt.

## 1. Le nom et le domaine
1. 👤 Choisir le nom avec l'auteur, avec les critères de l'[ADR 0018](adr/0018-nom-du-site-francais.md) : descriptif, qui dit *créer*, court. Le vérifier contre `docs/CONCURRENCE.md` (§4), les marques (registre national et EUIPO) et le web.
2. 👤 Acheter le domaine, et le confier à Cloudflare (zone, e-mail : `contact@`, `securite@`).
3. Une ADR « nom et domaine du site <langue> », comme l'ADR 0018.

## 2. La langue dans le moteur et le lexique
1. La langue dans `backend/engine/langues.py` (alphabet, valeur des lettres, lettres rares) et dans `backend/normalization.py` (lettres spéciales, lettres propres), recopiée dans `tools/lexicon/normalize.py` (un test les tient identiques).
2. Le lexique de la langue : sources et licences (qualité avant taille, `docs/ETUDE-INTERNATIONAL.md`), pipeline, curation par un locuteur natif ; le lexique curé dans le `LEXIQUE_DIR` du profil.
3. Remesurer pour cette langue : valeur des lettres, lettres rares, tables de difficulté (`difficulty.py`, puis `difficulte_mesuree=True`), géométries du pays ; benchmark à 95 % ou plus.

## 3. Le site
1. Une entrée dans `frontend/src/config/site.ts` : nom (et ses formes après « de » et « à » si la langue en a), accroche, description, adresse, langue, locale, contacts.
2. Les textes dans le catalogue de la langue (étape 6 du cap du 26/10/2026) ; les pages légales du pays (un *Impressum* en Allemagne), la page confidentialité, les articles et les grilles du jour propres au site.
3. Vérifier : `NEXT_PUBLIC_SITE=de pnpm build` dans une copie du dépôt, puis les parcours sur l'export.

## 4. Le déploiement
1. Le profil `deploy/sites/de.env` : copier `fr.env` et changer chaque valeur (`PROJET`, adresses, projet Pages, `LEXIQUE_DIR`). `make deploy-config SITE=de` affiche ce qui sera visé.
2. 👤 Cloudflare : le projet Pages (`pages project create <projet> --production-branch main`, commandes de `docs/PRODUCTION.md`), le nom d'hôte de l'API dans un tunnel (un tunnel par site, son jeton dans le `.env.production` du site).
3. Sur le serveur : `/opt/<projet>` et son `.env.production` (modèle : `.env.production.example`, avec `SITE=de`, `SITE_LANG=de`, `SITE_NAME`, `FRONTEND_URL`, `CORS_ORIGINS`, `COOKIE_DOMAIN`, des secrets neufs) ; le lexique dans `/opt/<projet>/lexicon`.
4. 👤 Les services du site : l'expéditeur des e-mails (domaine authentifié chez Brevo), un projet Sentry, la Search Console et Bing (sitemap), la surveillance (UptimeRobot).
5. Mesurer la mémoire du serveur avec deux lexiques chargés (seuil de 75 % de l'ADR 0013).
6. `make deploy SITE=de`, puis 👤 les deux lignes de cron du site, avec `PROJET=<projet>` (minuteur `tools/monitor/tick.sh`, sauvegarde `tools/db/backup-offsite.sh`).

## 5. Après l'ouverture
- `make livrer PR=N SITE=de` pour les livraisons propres à ce site ; `make deploy SITE=fr` reste le défaut.
- Le poste de pilotage, la mesure et les alertes portent `site` et `lang` : chaque site a les siens.
