# 0022 — Échantillons système et alertes : un minuteur du serveur, des envois plafonnés

- Statut : proposée
- Date : 2026-10-01

## Contexte

- L'[ADR 0016](0016-mesure-d-usage-sans-cookie.md) prévoit, après l'ouverture, des **échantillons système chaque minute** (RAM, CPU, places de génération occupées, taille de la base), gardés 30 jours. L'issue #132 y ajoute des **alertes par e-mail** et un **bilan hebdomadaire** : l'auteur ne regardera pas le poste de pilotage tous les jours.
- **Le projet n'a pas de planificateur.** La purge de la mesure d'usage se fait à la première requête mesurée du jour ([usage.py](../../backend/usage.py)). La seule tâche planifiée du serveur est la sauvegarde de la nuit, par cron ([PRODUCTION.md](../PRODUCTION.md)).
- **Les workers de gunicorn sont synchrones**, au nombre de trois, et l'application est chargée une fois dans le processus maître ([ADR 0013](0013-cible-hebergement-production.md)). Un fil de fond y serait mal placé : dans le maître, il partagerait avec les workers des connexions à la base ouvertes avant leur création ; dans un worker, il y en aurait trois.
- **Le quota d'e-mails est partagé.** Brevo est gratuit jusqu'à 300 e-mails par jour, et ce sont les mêmes 300 qui portent la confirmation d'adresse et le mot de passe oublié. Une boucle d'alertes priverait les visiteurs de leurs liens.
- **Le serveur est petit** : 2 vCores, 4 Go, dont l'API prend déjà 780 Mo.

**Mesure** du 01/10/2026, sur le poste de développement (WSL, Python 3.12, base SQLite) : lancer une commande `flask` sans charger le lexique prend **1,3 s**, dont 0,9 s de CPU, et **84 Mo** le temps de son exécution. Le VPS étant 2 à 2,5 fois plus lent (ADR 0013), compter 2 à 3 s de CPU par passage.

## Options pour déclencher chaque minute

| Option | Ce que ça coûte | Ce que ça apporte | Ce qui gêne |
|--------|-----------------|-------------------|-------------|
| **A. Un minuteur du serveur** (cron) lance `flask system tick` dans le conteneur de l'API | 2 à 3 s de CPU par minute, soit environ 2 % de la capacité des deux cœurs ; 84 Mo pendant ces secondes ; une ligne de cron à installer | Rien de nouveau à déployer ni à surveiller ; voit les places de génération, la base et la configuration des e-mails ; même mécanisme que la sauvegarde de la nuit | Une installation à la main sur le serveur ; ne voit rien si le conteneur est arrêté |
| **B. Un conteneur dédié**, qui boucle chaque minute | Environ 85 Mo en permanence ; un quatrième service dans `docker-compose.prod.yml` | Aucune installation sur le serveur : il part avec `make deploy` ; presque pas de CPU ; peut signaler l'API arrêtée | Le déploiement doit démarrer, vérifier et annuler un service de plus ([server.sh](../../tools/deploy/server.sh)) ; les verrous des places de génération doivent passer sur un volume partagé |
| **C. À la volée**, pendant une requête : le premier appel de la minute prend l'échantillon | Rien à installer | Suit le modèle de la purge quotidienne | Pas d'échantillon sans trafic, donc des trous la nuit ; un envoi d'e-mail (jusqu'à 10 s) bloquerait un worker synchrone ; l'échantillon manquerait justement quand le serveur est saturé |
| **D. À la lecture** du poste de pilotage | Rien | — | Ni historique ni alerte : ne répond pas au besoin |

## Décision

1. **Option A : un minuteur du serveur lance `flask system tick` chaque minute**, par `tools/monitor/tick.sh`.
   - C'est l'auteur qui l'installe, une fois, comme la sauvegarde de la nuit ([PRODUCTION.md](../PRODUCTION.md)).
   - Le code ne dépend pas du déclencheur : passer plus tard à l'option B ne demande que de lancer la même commande ailleurs.
2. **Un passage fait quatre choses, chacune à l'abri des autres** : un échantillon, le ménage du jour, les alertes, et le bilan s'il est dû. Une étape qui échoue n'empêche pas les suivantes.
3. **L'échantillon se lit dans `/proc`, sans dépendance de plus** :
   - la mémoire de la machine, et celle de l'API (somme des PSS de ses processus, où le lexique partagé ne compte qu'une fois : l'érosion que l'ADR 0013 demande de surveiller) ;
   - le CPU occupé depuis l'échantillon précédent ;
   - les places de génération prises, regardées sans en prendre une ;
   - la taille de la base ;
   - la date de la dernière sauvegarde copiée hors du serveur : le minuteur lit la trace sur l'hôte et la passe à la commande, rien n'est monté dans le conteneur ;
   - si l'API répond sur `/api/status`.
4. **Conservation** ([ADR 0016](0016-mesure-d-usage-sans-cookie.md), point 5) : les échantillons 30 jours, puis un résumé par jour, gardé 13 mois. Le ménage se fait une fois par jour, au premier passage qui trouve la veille sans résumé. Aucun échantillon ne disparaît sans son résumé. Le journal des alertes est gardé 13 mois lui aussi.
5. **Alertes** :
   - mémoire au-delà de 75 % sur cinq échantillons de suite ;
   - refus « occupé » au-delà de 5 % des générations, et p95 au-delà de 15 s, sur 24 heures et à partir de 20 générations ;
   - cinq erreurs 500 en un quart d'heure ;
   - sauvegarde de plus de 26 heures, ou trace absente ;
   - API qui ne répond pas sur trois échantillons de suite.
6. **Bilan hebdomadaire**, le lundi à partir de 6 h UTC : visiteurs, générations, erreurs, nouveaux comptes, face à la semaine précédente, et l'état du serveur.
7. **Les envois sont plafonnés, par construction** :
   - une alerte par type et par 24 heures, que le problème dure ou revienne ;
   - dix envois par 24 heures, tous types confondus, essais et bilan compris (`ALERT_DAILY_CAP`) ;
   - chaque envoi est inscrit au journal **avant** de partir, sous une clé unique (type, période) : un envoi raté n'est pas retenté, et deux passages simultanés ne peuvent pas envoyer deux fois ;
   - sans destinataire (`ALERT_EMAIL`), rien ne part ;
   - l'objet de chaque message est fixe : aucune donnée n'entre dans un en-tête.
8. **Rien de personnel** dans ces tables : la machine, des compteurs, et le résumé chiffré d'une alerte. Le destinataire n'est pas en base.

## Conséquences

- ✅ Le poste de pilotage montre le serveur : mémoire et sauvegarde en indicateurs, 24 heures et 30 jours en graphiques, et le journal des envois.
- ✅ Au pire, dix e-mails par jour : 3 % du quota de Brevo.
- **Une installation sur le serveur**, à la main, que le déploiement ne vérifie pas. Le poste de pilotage le dit quand le minuteur manque ou s'arrête : « aucun échantillon », puis « le minuteur ne tourne plus » au bout de cinq minutes sans échantillon.
- **Environ 2 % de la capacité CPU** part dans le minuteur. Si c'est trop, passer à l'option B, ou échantillonner toutes les cinq minutes.
- **Une alerte dont l'envoi échoue est perdue pour 24 heures** : c'est le prix du plafond. Elle reste au journal, marquée « en échec », visible sur le poste de pilotage.
- **Si le conteneur de l'API est arrêté**, le minuteur ne lance rien : ni échantillon ni alerte. C'est UptimeRobot (ADR 0013) qui prévient ; l'alerte « API injoignable » d'ici couvre l'API qui tourne mais ne répond plus (base injoignable, workers bloqués).
- Trois tables nouvelles (`system_sample`, `system_daily`, `alert_sent`), par une migration additive.
- Les données fictives du développement (`make seed-demo`) remplissent aussi ces tables.
