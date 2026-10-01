# 🛡️ Registre des traitements — Le Fléchoir

> Registre simplifié (modèle de la CNIL) des données personnelles traitées par le site. Il tient avec la [page de confidentialité](../frontend/src/app/privacy/page.tsx) : chaque traitement ici y figure, et inversement. Tout nouveau champ mesuré s'ajoute aux deux ([ADR 0016](adr/0016-mesure-d-usage-sans-cookie.md)).
> Dernière mise à jour : 1er octobre 2026.

## Responsable du traitement

L'éditeur du site, un particulier, à titre non professionnel. Son identité n'est pas publiée (LCEN, art. 6, III, 2) ; contact : `contact@leflechoir.fr`.

## Traitements

| # | Traitement | Personnes | Données | Finalité | Base légale | Durée | Où |
|---|------------|-----------|---------|----------|-------------|-------|----|
| 1 | Comptes | Titulaires d'un compte | Adresse e-mail, mot de passe haché (bcrypt), dates d'inscription, de confirmation de l'adresse et de dernière connexion | Fournir le service : se connecter, retrouver ses données | Contrat (art. 6.1.b) | Tant que le compte existe ; suppression immédiate à la demande ; compte sans connexion depuis 3 ans supprimé, après un e-mail un mois avant | Base PostgreSQL (OVH, France) |
| 2 | Dictionnaires et grilles | Titulaires d'un compte | Mots, définitions, grilles, notes | Conserver le travail de l'utilisateur | Contrat (art. 6.1.b) | Comme le compte | Base PostgreSQL (OVH, France) |
| 3 | Session | Titulaires d'un compte | Cookies de session (JWT), liste des jetons révoqués | Rester connecté, se déconnecter | Contrat ; cookies strictement nécessaires, sans consentement | 7 jours au plus | Navigateur ; base |
| 4 | E-mails du compte | Titulaires d'un compte | Adresse e-mail, lien signé | Confirmer l'adresse, changer un mot de passe oublié | Contrat (art. 6.1.b) | Selon Brevo (journal d'envoi) | Brevo (France) |
| 5 | Protection contre les abus | Tout visiteur | Adresse IP | Limiter le nombre de requêtes | Intérêt légitime (art. 6.1.f) | En mémoire, une heure au plus | Serveur (OVH) |
| 6 | Journaux techniques | Tout visiteur | Adresse IP, date, méthode, chemin sans paramètres, statut, durée, identifiant de requête | Diagnostiquer une panne ou une attaque | Intérêt légitime (art. 6.1.f) | 14 jours (journald, `MaxRetentionSec=14day`, [PRODUCTION.md](PRODUCTION.md)) | Serveur (OVH) |
| 7 | Rapports d'erreur | Visiteur touché par une erreur | Page ou action en cause, pile d'appel ; ni IP, ni cookie, ni corps de requête | Corriger les pannes | Intérêt légitime (art. 6.1.f) | 90 jours au plus (réglage du projet Sentry) | Sentry (UE) |
| 8 | Sauvegardes | Titulaires d'un compte | Copie chiffrée de la base (traitements 1 à 3) | Restaurer après un incident | Intérêt légitime (art. 6.1.f) | 30 jours (règle de cycle de vie du seau) | Cloudflare R2, seau en juridiction UE |
| 9 | Messages de contact | Qui écrit à `contact@` ou `securite@`, ou par le formulaire du site (#131) | Adresse e-mail, message ; pour le formulaire : le motif, la date, l'adresse de réponse facultative, l'identifiant de la requête d'une erreur (« Signaler ce problème »), le compte s'il y en a un. **Ni adresse IP ni empreinte**. L'e-mail de notification à l'éditeur ne recopie pas le message | Répondre, suivre la demande | Intérêt légitime (art. 6.1.f) | Courriel : un an après le dernier échange. Formulaire : 12 mois, purge faite chaque jour (`usage.py`) ; ceux d'un compte disparaissent avec lui | Cloudflare Email Routing, puis la messagerie de l'éditeur ; formulaire : base PostgreSQL (OVH, France), lu dans `/admin` |
| 10 | Mesure d'usage ([ADR 0016](adr/0016-mesure-d-usage-sans-cookie.md)) | Tout visiteur | Recherches (longueur du motif, jokers, résultats, durée), générations (format, layout, nombre et longueur des mots imposés, texte des mots imposés et souhaités, issue, durée, temps CPU), étapes d'un compte, grilles conservées, erreurs (route, statut) ; pays (`CF-IPCountry`) ; empreinte du jour (hachage de l'IP et du navigateur avec un sel quotidien détruit le lendemain) ; identifiant du compte pour ses étapes et ses grilles. **Jamais l'adresse IP** | Statistiques du site : ce qui sert, ce qui casse, la charge | Intérêt légitime (art. 6.1.f) ; sans cookie ni écriture dans le navigateur (le traitement 12 en dit plus sur la balise) | Texte des mots : 90 jours. Événements : 13 mois. Ceux d'un compte : supprimés avec lui. Sel : un jour. Purge faite chaque jour par la première requête mesurée (`usage.py`) | Base PostgreSQL (OVH, France) |
| 11 | Suggestions de mots (roadmap 1e) | Tout visiteur qui signale ou propose un mot | Le mot, retirer ou ajouter, l'endroit du site, la date ; le compte s'il y en a un, sinon l'empreinte du jour (traitement 10). **Jamais l'adresse IP**. En signaux implicites, sans clic : mots imposés inconnus du lexique, mots remplacés à la main dans une grille conservée, mots rangés dans les dictionnaires personnels, ceux-ci seulement quand au moins deux personnes ont le même, sans dire lesquelles | Relire le dictionnaire commun ; montrer au contributeur ce qu'est devenue sa suggestion | Intérêt légitime (art. 6.1.f) | 13 mois ; celles d'un compte : supprimées avec lui. Purge avec la mesure d'usage (`usage.py`) | Base PostgreSQL (OVH, France) ; l'export agrégé (mots et nombre de personnes) sur le Mac de l'auteur |

Ce qui n'est **pas** traité : le texte des motifs cherchés, les grilles générées sans être conservées, l'adresse IP en base, tout script ou cookie de mesure dans le navigateur, la publicité. La balise de pages vues (Phase 8) ajoutera sa ligne ici et dans la page de confidentialité.

Les échantillons système et le journal des alertes ([ADR 0022](adr/0022-echantillons-systeme-et-alertes.md)) ne sont pas des traitements de données personnelles : ils décrivent la machine (mémoire, CPU, taille de la base, date de la sauvegarde) et des compteurs. Les alertes partent à l'éditeur seul, par Brevo.
| 12 | Pages vues ([ADR 0016](adr/0016-mesure-d-usage-sans-cookie.md), point 3, #130) | Tout visiteur, sauf s'il refuse ou si son navigateur envoie Global Privacy Control | La page vue (chemin sans paramètres), **le nom d'hôte seul** du site d'où l'on vient, la langue principale du navigateur, la durée pendant laquelle la page est restée visible, l'export d'une grille en PDF ; pays (`CF-IPCountry`) et empreinte du jour (traitement 10). **Jamais l'adresse IP ni l'identifiant du compte** : la balise ne porte aucun cookie | Statistiques de fréquentation du site : pages lues, temps passé, sources (dont les moteurs de réponse IA), langues (Phase 10) ; ni publicité, ni profil, ni recoupement | Intérêt légitime (art. 6.1.f) ; exemption de consentement de la CNIL pour la mesure d'audience (statistiques anonymes, information, opposition) ; rien n'est écrit dans le navigateur pour mesurer : **seul le refus du visiteur** y est noté (`localStorage`, clé `mesure`) | 13 mois, comme les autres événements d'usage. Le refus ne coupe que cette balise, pas la mesure des recherches et des générations (traitement 10) | Base PostgreSQL (OVH, France) |

## Sous-traitants (art. 28)

| Sous-traitant | Rôle | Localisation des données | Garanties |
|---------------|------|--------------------------|-----------|
| OVH SAS | Serveur (VPS), base de données | France | Contrat de sous-traitance (DPA) des conditions générales OVH |
| Cloudflare, Inc. | Pages du site, tunnel vers le serveur, DNS, R2 (sauvegardes), Email Routing | UE et États-Unis | DPA Cloudflare ; certifié Data Privacy Framework ; clauses contractuelles types |
| Brevo (Sendinblue SAS) | Envoi des e-mails du compte | France | DPA Brevo |
| Sentry (Functional Software, Inc.) | Rapports d'erreur | UE (région `de`) | DPA Sentry ; certifié Data Privacy Framework |

## Droits des personnes

Par `contact@leflechoir.fr`, depuis l'adresse du compte ; réponse sous un mois. Accès, rectification et effacement se font aussi dans l'application (Mon compte, Dictionnaires, Mes grilles). Portabilité : export des grilles (fichier de travail) ; un export complet du compte reste à faire si la demande arrive.

## Sécurité

Voir [SECURITY.md](SECURITY.md) : mots de passe hachés, cookies httpOnly, CSP, base sans port publié, sauvegardes chiffrées (age), accès au serveur par clé.

## À faire avant l'ouverture

- Rétention de journald à 14 jours sur le serveur ([PRODUCTION.md](PRODUCTION.md)).
- Régler la rétention du projet Sentry à 90 jours au plus.
- Suppression des comptes inactifs depuis 3 ans, avec e-mail de prévenance : la date de dernière connexion est enregistrée depuis #116 ; la commande de purge peut attendre (première suppression possible en 2029).
