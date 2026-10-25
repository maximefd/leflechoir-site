# ADR 0029 — Le tableau de bord du poste de pilotage, et les chiffres de Google et Bing

- **Statut** : acceptée (21/10/2026)
- **Contexte** : l'auteur veut suivre ses indicateurs (visiteurs, sources, usage, référencement) dans une interface
  agréable, et voir la position du site sur les recherches clés et sur les questions que les gens posent aux moteurs.
  Le poste de pilotage (ADR 0016, point 6) n'avait que des tableaux, et ne savait du référencement que les visites
  qui en arrivent : ni impressions, ni positions, ni requêtes, ni pages indexées.

## Décision

1. **Un tableau de bord en tête de `/admin`** : des cartes (audience, venus des moteurs, venus des assistants IA,
   usage), l'écart avec la période d'avant (7, 30 ou 90 jours) et une courbe ; la répartition des sources ; le SEO
   (impressions, clics, position moyenne, pages indexées) ; les requêtes qui montent ; les **recherches clés**
   (« générateur de mots fléchés », « créer une grille de mots fléchés »…) ; les **questions posées** (les requêtes
   en forme de question qui ont montré le site) ; les questions de la FAQ de l'accueil. Le détail d'avant reste
   dessous, replié. Route : `GET /api/admin/tableau?jours=`.
2. **Les chiffres viennent des moteurs, par leurs API**, relevés par le serveur une fois par jour (le minuteur de
   l'ADR 0022) et gardés chez nous (`seo_daily`, `seo_query_daily`, `seo_url_check`), avec leur site et leur langue :
   l'historique ne dépend plus des 16 mois de la Search Console. Google : Search Analytics (clics, impressions,
   positions par jour et par requête) et l'inspection d'URL (les pages du sitemap une à une, chacune revue chaque
   semaine, sous le quota de 2 000 par jour). Bing : trafic, requêtes et pages dans l'index. Les moteurs publient
   avec quelques jours de retard : chaque période se cale sur le dernier jour publié.
3. **Les accès** : un compte de service Google, lecteur restreint de la propriété, dont la clé est un fichier sur le
   serveur (`/opt/leflechoir/secrets`, monté en lecture seule) ; une clé d'API Bing dans `.env.production`. Rien dans
   le dépôt. Le compte de service signe sa demande de jeton (RS256) : la dépendance `cryptography` entre au backend.
4. **Rien de personnel** : des totaux que les moteurs calculent eux-mêmes ; aucun visiteur, aucune adresse. La page
   confidentialité le dit.
5. **Les assistants IA** (ChatGPT, Claude, Perplexity) : pas de relevé automatique pour l'instant (choix de
   l'auteur). Ils n'ont pas de statistiques publiques ; la seule mesure serait de leur poser nous-mêmes les questions
   par leurs API. Le relevé mensuel à la main de `docs/VISIBILITE-IA.md` reste la règle.

## Conséquences

- L'auteur pose une fois les accès (docs/PRODUCTION.md, « Les chiffres de Google et Bing »). Sans eux, le tableau
  de bord montre l'audience et l'usage, et dit que le SEO n'est pas branché.
- `make seed-demo` remplit aussi des chiffres SEO fictifs : le tableau de bord se développe sans accès aux moteurs.
- Une liste de recherches clés et de questions vit dans `backend/seo.py` ; elle suit la FAQ de l'accueil et les
  requêtes visées, et se complète à la main.
