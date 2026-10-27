# ADR 0033 — Un site de plus : la réplication prévue dès maintenant

- **Statut** : proposée (27/10/2026)
- **Contexte** :
  - Un site par langue, sur des domaines distincts, avec un seul moteur ([ADR 0017](0017-un-site-par-langue.md)). L'allemand vient d'abord ([ADR 0031](0031-reprise-de-l-international.md)).
  - L'auteur demande que la réplication du site soit prévue **avant** la traduction (27/10/2026). Le jour où les textes seront traduits, ouvrir un site doit se réduire à le configurer et à le déployer, sans réécrire le code ni les scripts.
  - Au 27/10/2026, le site était écrit pour un seul exemplaire :
    - les scripts de déploiement, du serveur, du minuteur et des sauvegardes portaient `leflechoir` en dur (dossier `/opt/leflechoir`, projet Compose, conteneurs `leflechoir-*`, image, adresses) ;
    - le build fixait `NEXT_PUBLIC_SITE=fr` ;
    - deux textes du site et le relevé SEO de l'API écrivaient le nom du site en dur ;
    - le moteur ne connaissait que le français (traité par le socle « moteur et API », même ADR 0031).

## Décision

1. **Ce qui distingue un site est rangé à un seul endroit par couche :**
   - le **site** : `frontend/src/config/site.ts` (nom, adresse, langue, contacts), choisi au build par `NEXT_PUBLIC_SITE` ;
   - le **déploiement** : un profil versionné et sans secret, `deploy/sites/<site>.env` (`SITE`, `SITE_LANG`, `NEXT_PUBLIC_SITE`, `PROJET`, `DEPLOY_SITE_URL`, `DEPLOY_API_URL`, `PAGES_PROJECT`, `LEXIQUE_DIR`) ;
   - l'**API** : sa configuration (`SITE`, `SITE_LANG`, `SITE_NAME`, `FRONTEND_URL`… dans le `.env.production` du site) ;
   - les **secrets** restent hors du dépôt : `.env` sur le Mac (communs : `DEPLOY_HOST`), et un `.env.production` par site sur le serveur.
2. **Un site = un projet Compose sur le serveur** : `/opt/<projet>`, conteneurs `<projet>-api-1` et `<projet>-db-1`, image `<projet>-api`, sa base, son tunnel et son nom d'hôte. Rien n'est partagé entre deux sites (comptes séparés, ADR 0031), et chaque site a son minuteur et sa sauvegarde (cron avec `PROJET=<projet>`).
3. **Les commandes prennent le site en paramètre**, le français par défaut : `make deploy SITE=de`, `make livrer PR=N SITE=de`, `make deploy-config SITE=de` (ce que le déploiement visera, sans rien envoyer). Le français ne change pas : son profil reprend les valeurs d'avant.
4. **Le nom public n'est écrit qu'une fois** : un test (`backend/tests/test_un_site_de_plus.py`) refuse le nom du site dans le code du site hors de sa configuration, hors des contenus rédigés pour lui (articles, grilles), et vérifie que chaque profil de déploiement est complet et sans secret.
5. **Les textes restent l'étape 6 du cap du 26/10/2026** (catalogue `messages/<langue>.json`). Le guide `docs/NOUVEAU-SITE.md` liste, dans l'ordre, tout ce qu'il faut pour ouvrir un site, textes compris.

## Conséquences

- ✅ Ouvrir un site = un profil, une entrée dans `site.ts`, un `.env.production`, la zone et le projet Pages, le lexique de la langue, puis `make deploy SITE=<site>`.
- ✅ Les scripts et le moteur sont prêts avant la traduction, qui peut avancer en parallèle.
- ⚠️ Chaque site charge son lexique dans sa propre API : la mémoire du VPS est à mesurer avant le deuxième site (ADR 0031 ; VPS-2 au-delà de 75 %).
- ⚠️ La clé de stockage local des réussites (`leflechoir.reussites`) reste telle quelle : le stockage est propre à chaque domaine, et la changer ferait perdre leur progression aux joueurs du site français.
