# 0016 — Mesure d'usage côté serveur, sans cookie ni script tiers

- Statut : acceptée
- Date : 2026-09-24

## Contexte

- Une fois le site en ligne, l'auteur veut le piloter. Il veut savoir :
  - combien de personnes l'utilisent ;
  - combien de grilles sont générées, dans quels formats et avec quels mots imposés ;
  - combien de temps les visiteurs y passent ;
  - quelles erreurs ils rencontrent ;
  - ce que consomme l'API, et combien de demandes le générateur refuse.
- **Rien de tout cela n'est mesuré aujourd'hui.**
  - Il n'y a ni table d'événements ni rôle d'administrateur.
  - La génération ne journalise ni sa durée, ni le format, ni les mots imposés, ni son issue.
  - Un refus « générateur occupé » (429) ne se distingue de celui du rate limiting que par le corps de la réponse.
  - Sentry ne reçoit que les erreurs 500.
- **Il n'y a pas de file d'attente.** Au-delà de deux générations simultanées, l'API refuse aussitôt ([ADR 0013](0013-cible-hebergement-production.md)). Un « temps d'attente » n'existe donc pas : on ne peut compter que les refus.
- **Aucun script tiers ne peut s'exécuter.** Le frontend est un site statique à CSP stricte par empreinte (#99). Un script tiers serait bloqué, y compris la balise que Cloudflare injecte pour Web Analytics.
- **La promesse actuelle et le cadre légal :**
  - la page confidentialité promet « pas de mesure d'audience, aucun cookie en dehors de ceux de votre session » ;
  - la CNIL n'exempte de consentement la mesure d'audience que sous conditions : finalité limitée, statistiques anonymes, pas de recoupement, information et droit d'opposition, durées limitées.
- **Moyens :** aucun budget supplémentaire. Le VPS de 4 Go porte déjà l'API et PostgreSQL.

## Décision

1. **Tout reste en première partie.**
   - Les mesures sont écrites dans la base de l'API.
   - Aucun script tiers, aucun cookie ni stockage dans le navigateur pour mesurer : pas de bandeau de consentement.
   - Les seuls cookies restent ceux de la session ([ADR 0015](0015-session-en-cookies.md)).
2. **Dès l'ouverture, l'API écrit des événements** :
   - **génération** : format, layout, nombre et longueurs des mots imposés et souhaités, dictionnaires choisis, durée, **temps CPU**, tentatives, et issue :
     - une grille ;
     - un `422`, avec sa raison ;
     - un délai dépassé ;
     - un `429`, en disant lequel : visiteur occupé, serveur occupé ou rate limiting ;
   - **recherche** : longueur du motif, nombre de `?`, nombre de résultats, durée ;
   - **compte** : inscription, confirmation, connexion, suppression ;
   - **grille** conservée ;
   - **erreurs** : un compteur par route et par statut. Le détail reste dans Sentry, retrouvable par l'identifiant de requête.

   Chaque événement porte aussi :
   - la **langue** et le **site** ([ADR 0017](0017-un-site-par-langue.md)) ;
   - le pays (`CF-IPCountry`) ;
   - le visiteur (point 4).

   Ces événements se lisent avec une commande `flask stats` sur le serveur : pas de page web à l'ouverture.
3. **Après l'ouverture (Phase 8 de la [roadmap](../ROADMAP.md))** s'ajoutent trois choses :
   - l'espace d'administration (point 6) ;
   - des échantillons système, chaque minute : RAM, CPU, places de génération occupées, taille de la base ;
   - une **balise de pages vues et de temps passé**, que le frontend envoie à l'API.

   La balise est la seule partie qui touche au navigateur. Elle respecte les conditions d'exemption de la CNIL :
   - information dans la page confidentialité ;
   - opposition par un lien et par `Global Privacy Control` ;
   - statistiques anonymes ;
   - rien d'écrit dans le navigateur ;
   - durées du point 5.
4. **Un visiteur est une empreinte du jour.**
   - C'est un hachage de l'adresse IP et du navigateur avec un sel secret, renouvelé et détruit chaque jour.
   - Elle compte les visiteurs uniques d'une journée sans suivre personne d'un jour à l'autre.
   - **L'adresse IP n'est jamais enregistrée.**
   - L'identifiant du compte n'est gardé que là où un parcours en a besoin.
5. **Durées de conservation :**
   - **mots imposés en clair : 90 jours**, car un nom propre dans une grille d'anniversaire est une donnée personnelle. Ensuite, il ne reste que leur longueur, et leur présence ou leur absence dans le lexique. Ceux qui manquent au lexique alimentent la curation ;
   - **événements : 13 mois**, puis des agrégats quotidiens ;
   - **échantillons système : 30 jours** ;
   - **à la suppression d'un compte**, les événements qui lui sont liés disparaissent avec lui.
6. **L'espace d'administration (Phase 8) est fermé à tout autre compte.**
   - Une colonne `is_admin` est posée uniquement en ligne de commande, et seulement sur une adresse confirmée.
   - Les routes `/api/admin/*` répondent 404 à tout autre compte.
   - Elles ne donnent que des agrégats, en lecture seule.
   - Chaque accès est journalisé, et couvert par des tests d'autorisation.
   - La page `/admin` n'est liée nulle part. Elle est en `noindex` par `X-Robots-Tag`, et n'est jamais citée dans `robots.txt`.
   - Un renfort reste possible : Cloudflare Access devant `/api/admin`, ou un second facteur.
7. **Les seuils de l'[ADR 0013](0013-cible-hebergement-production.md) sont affichés comme indicateurs** : RAM au-delà de 75 %, refus « occupé » fréquents, p95 au-delà de 15 s. Ce sont eux qui déclenchent le passage au VPS-2, puis la Phase 7.
8. **La « puissance » consommée se mesure en temps CPU** :
   - par génération et au total, rapporté à la capacité du serveur ;
   - une consommation électrique n'apparaîtrait que comme estimation, signalée comme telle.

## Conséquences

- ✅ Pas de bandeau de consentement, pas de données chez un tiers.
- ✅ La CSP ne change pas : l'API figure déjà dans `connect-src`.
- ✅ Les questions de l'auteur ont leur réponse dès le premier jour. Seul le temps passé attend la balise (Phase 8). D'ici là, les statistiques de trafic de Cloudflare, sans script, donnent un ordre de grandeur des visites.
- Les visiteurs uniques sont exacts sur une journée, seulement approchés sur une semaine ou un mois. Un visiteur anonyme n'est pas suivi d'un jour à l'autre.
- L'API ne voit pas l'export PDF, qui se fait dans le navigateur. Il se comptera avec la balise.
- **La promesse « pas de mesure d'audience » tombe.** La page confidentialité est réécrite avant l'ouverture : ce qui est mesuré, pourquoi, combien de temps, comment s'y opposer. Le registre des traitements inscrit cette mesure.
- Chaque requête ajoute quelques écritures en base, ce qui est négligeable à ce volume. Des compteurs en mémoire, eux, seraient faux avec trois workers : tout passe donc par la base.
- **Options écartées :**
  - **Google Analytics** : consentement obligatoire, données hors de l'Union européenne.
  - **Cloudflare Web Analytics** : sa balise est bloquée par la CSP, et il ne voit ni les générations ni les erreurs de l'API.
  - **Plausible** : payant.
  - **Umami auto-hébergé** : un service de plus sur 4 Go, qui ne voit pas non plus les événements serveur.
  - **Grafana et Prometheus** : trop lourds pour le VPS.

## Mise à jour du 01/10/2026 : la balise (#130)

La balise du point 3 est faite (`backend/audience.py`, `frontend/src/lib/audience.ts`). Trois précisions :

- **L'opposition est retenue dans le navigateur.** La page confidentialité disait « rien n'est écrit dans ton navigateur » ; un refus exprimé par un lien doit pourtant survivre au rechargement. Le refus (`localStorage`, clé `mesure` = `non`) est donc la seule chose notée, et la page le dit : « Le site ne dépose rien dans ton navigateur pour te mesurer. Si tu refuses, ton refus y est noté pour ne pas te le redemander, et rien d'autre. » Global Privacy Control vaut refus, sans rien à écrire.
- **L'opposition ne coupe que la balise** (pages vues, temps passé, exports PDF), pas la mesure côté serveur des recherches, des générations et des erreurs : couper celle-ci fausserait les seuils de l'ADR 0013. La page le dit clairement.
- **Le référent n'est gardé que par son nom d'hôte** : l'adresse complète d'un référent peut contenir une recherche ou un identifiant. La langue du navigateur n'est gardée que par sa langue principale (« fr »).

Un événement `page` de plus dans `usage_event`, avec les mêmes durées de conservation (13 mois). La balise ne part qu'à la sortie de la page (une ligne par page vue), sans cookie (`credentials: "omit"`), et n'est jamais rattachée à un compte. Le poste de pilotage la montre dans sa rubrique « Audience », à part des chiffres de l'API.

## Mise à jour du 01/10/2026 : la boîte de réception (#131)

Le point 6 dit que les routes `/api/admin/*` « ne donnent que des agrégats, en lecture seule ». Le formulaire de contact y apporte **une exception**, la boîte de réception :

> Elles ne donnent que des agrégats, en lecture seule. **Exception : la boîte de réception des messages de contact (#131).** Elle montre des messages, donc des données personnelles, que leur auteur a choisi d'envoyer à l'éditeur ; ses seules écritures sont « marquer comme lu » et « supprimer ». Chaque lecture et chaque écriture est journalisée, et couverte par les mêmes tests d'autorisation.

Conséquences dans le code : les routes restent dans le blueprint d'administration, derrière son contrôle unique (404 pour tout autre compte, y compris sur les écritures). Le test `test_writing_is_possible_only_in_the_inbox` énumère toutes les routes d'écriture du blueprint et exige qu'il n'y en ait que deux. Les messages sont gardés 12 mois et disparaissent avec le compte qui les a écrits. L'e-mail de notification ne recopie pas le message : seul « un message t'attend » part chez le prestataire d'envoi, et la notification est plafonnée (cinq par 24 heures, puis un résumé, sous le plafond quotidien d'alertes).
