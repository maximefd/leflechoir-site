# ADR 0034 — Se connecter avec Google ou Microsoft

- **Statut** : proposée (14/11/2026)
- **Contexte** :
  - Étape 3 du [cap du 26/10/2026](../ROADMAP.md#étape-3--connexions-google-et-microsoft) : Google et Microsoft seulement (l'auteur, 27/10/2026). En réserve : les clés d'accès (« passkeys »), Facebook, GitHub et Apple. **Pas de lien magique par e-mail**.
  - Jusqu'ici, un compte, c'est une adresse e-mail et un mot de passe (`user.password` NOT NULL), avec une session en cookies httpOnly et un jeton CSRF ([ADR 0015](0015-session-en-cookies.md)).
  - Le site est un export statique sur `leflechoir.fr`, et l'API tourne sur `api.leflechoir.fr`. Leur CSP n'autorise que leurs propres scripts (`form-action 'self'`), et aucun script tiers n'est chargé ([ADR 0016](0016-mesure-d-usage-sans-cookie.md)).
  - Les comptes sont séparés par site ([ADR 0031](0031-reprise-de-l-international.md)) : chaque site a sa base.

## Décision

1. **OpenID Connect, flux « code » avec PKCE, côté API, sans SDK** (`backend/oidc.py`).
   - Le bouton du site **quitte la page** pour `GET /api/auth/oidc/<fournisseur>/start`.
   - L'API tire `state`, `nonce` et le secret PKCE, puis les garde **dix minutes** dans un cookie signé et httpOnly (`oidc_flow`, chemin `/api/auth/oidc/`, SameSite=Lax).
   - Elle renvoie ensuite chez le fournisseur, avec le seul périmètre `openid email`.
   - Au retour (`…/callback`), l'API vérifie `state` en temps constant. Elle échange le code contre les jetons, avec la clé du client et le secret PKCE.
   - Elle vérifie le jeton d'identité : signature RS256 par le jeu de clés publié du fournisseur, `aud`, `exp` et `iss`. Pour Microsoft, `iss` porte le tenant de la personne. Elle vérifie enfin le `nonce`.
   - Elle ouvre alors la session dans les cookies habituels, puis renvoie vers le site, vers `next`, un chemin interne seulement.
   - Aucun script du fournisseur n'est chargé et la CSP ne change pas. Le site n'envoie aucun formulaire à l'API : c'est une navigation.
2. **Un identifiant, rien d'autre.** La table additive `identite` (migration 0021) garde `provider`, `subject` (le `sub`, propre à notre client), `created_at` et `last_used_at`, avec l'unicité `(provider, subject)`. Elle ne garde ni nom, ni photo, ni jeton du fournisseur : l'adresse e-mail est celle du compte.
3. **Le rattachement par e-mail n'a lieu que si le fournisseur certifie l'adresse.**
   - Google : `email_verified`.
   - Microsoft : seulement pour un compte personnel (tenant `9188040d-…` : Microsoft y possède l'adresse) ou avec `xms_edov`, quand le domaine de l'adresse appartient à l'organisation. Ailleurs, une organisation peut écrire n'importe quelle adresse dans le profil d'un de ses comptes.
   - Une adresse certifiée ouvre le compte qui la porte, relie le fournisseur et marque l'adresse confirmée. Sinon, elle crée le compte.
   - Une adresse non certifiée **n'ouvre jamais** un compte existant (`email_unverified_taken`). Libre, elle crée un compte non confirmé, et l'e-mail de confirmation part, comme à l'inscription.
4. **Un compte créé par un fournisseur n'a pas de mot de passe.**
   - `user.password` reçoit une valeur qui n'est l'empreinte d'aucun mot de passe : elle commence par `!`, et bcrypt refuse de la lire. La colonne reste NOT NULL, et l'ancien code la refuse comme un mauvais mot de passe.
   - « Mot de passe oublié » permet d'en choisir un.
   - `GET /api/users/me` dit `has_password` et liste les `identities`.
5. **Relier et reconfirmer passent par un ticket.**
   - `POST /api/auth/oidc/<f>/ticket` (`intent` : `link` ou `reauth`) est appelé par `apiFetch`, donc avec le jeton CSRF. Il rend une adresse de départ signée, valable deux minutes, liée au compte et au fournisseur.
   - Une page d'un autre site ne peut donc pas déclencher ces parcours par un simple lien.
   - Le ticket ne sert que dans le navigateur qui l'a demandé : un cookie httpOnly de deux minutes (`oidc_ticket`) le lie à ce navigateur. Une adresse de départ qui fuirait (historique, journal) ne permettrait pas, ailleurs, de relier un autre compte Google au compte de la personne.
   - Un compte d'un fournisseur ne se relie qu'à un seul compte du site (`identity_taken`), et un compte du site n'a qu'un compte par fournisseur.
6. **La suppression d'un compte sans mot de passe se reconfirme chez le fournisseur.**
   - Le ticket `reauth` demande au fournisseur de reconnecter vraiment la personne (`prompt=login`, `max_age=0`).
   - Au retour, si c'est bien le compte relié (sinon `identity_mismatch`), un cookie signé de cinq minutes (`oidc_reauth`, chemin `/api/users/me`) permet `DELETE /api/users/me` sans mot de passe.
   - La suppression efface aussi les identités, par la cascade de la base.
7. **Délier** (`DELETE /api/auth/identities/<f>`) n'est possible que s'il reste une autre façon d'entrer : un mot de passe ou un autre fournisseur (sinon `last_login_method`).
8. **Les erreurs ont un code `reason` stable**, rendu au site dans `?erreur=` : `provider_unavailable`, `oidc_cancelled`, `oidc_state`, `oidc_failed`, `email_missing`, `email_unverified_taken`, `session_required`, `identity_taken`, `provider_already_linked`, `identity_mismatch`, plus `identity_missing`, `last_login_method` et `reauth_required` en JSON.
9. **La configuration.**
   - Les variables sont `OIDC_GOOGLE_CLIENT_ID` et `…_SECRET`, `OIDC_MICROSOFT_CLIENT_ID` et `…_SECRET`, et `OIDC_REDIRECT_BASE`, l'adresse publique de l'API : derrière le tunnel, elle se voit en http.
   - Un fournisseur sans identifiant ni clé n'a pas de bouton (`GET /api/auth/providers`).
   - Chaque site a ses adresses de retour, déclarées dans les deux consoles.
10. **La mesure.** Les étapes d'un compte portent `method` (`google` ou `microsoft`) pour une connexion ou une inscription par un fournisseur, et pour un lien (`link`). Le champ est déclaré dans la page de confidentialité et le registre (traitement 18). Les limites de débit sont celles de la connexion.

## Ce qui est écarté

- **Les SDK et les boutons des fournisseurs** (Google Identity Services, MSAL.js) : il faudrait des scripts tiers et une CSP élargie, et ils montreraient à Google les visites de la page de connexion.
- **Le flux implicite** et le jeton d'identité reçu dans le navigateur : le code n'est échangé que par l'API, avec sa clé.
- **La découverte dynamique** (`.well-known/openid-configuration`) : les adresses sont écrites en dur. Elles ne bougent pas, et c'est un appel réseau de moins à chaque connexion.
- **Garder les jetons du fournisseur** : on ne lit rien de plus chez lui, ils ne servent à rien après la connexion.
- **Rattacher par une adresse non certifiée**, même « pour simplifier » : ce serait une prise de compte offerte à quiconque contrôle un tenant Microsoft.

## Conséquences

- L'auteur doit faire les gestes de [PRODUCTION.md](../PRODUCTION.md#connexions-google-et-microsoft) : créer les clients dans Google Cloud et dans Microsoft Entra, déclarer les adresses de retour, puis mettre les clés dans le `.env.production` de chaque site. Sans eux, rien ne change : aucun bouton n'apparaît.
- L'écran de consentement de Google doit être publié (nom, logo, liens vers la confidentialité et les conditions). Avec le seul périmètre `openid email`, Google ne demande pas de vérification approfondie.
- Les clés d'accès (« passkeys ») restent la suite naturelle : elles se brancheront sur la même table `identite` (`provider = "passkey"`).
