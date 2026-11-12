# Les annuaires du connecteur (lot 4 de l'API ouverte)

> Préparé le 03/11/2026 ; nom de la page, identifiant de la fiche et textes validés par l'auteur le 08/11/2026 ([ADR 0032](adr/0032-api-ouverte.md), lot 4). On soumet **après l'ouverture** : les annuaires testent le connecteur en vrai, à `https://mcp.leflechoir.fr/mcp`.

## Ce qui est prêt dans le dépôt

- **Le connecteur** est mis aux règles des annuaires :
  - chaque outil a un `title` et ses annotations explicites (lecture seule, non destructif, monde fermé) ;
  - aucun horodatage ni identifiant de suivi dans ce que lit le modèle ;
  - l'interface déclare qu'elle ne charge rien d'extérieur (`_meta.ui.csp`) ;
  - le jeton de vérification de domaine d'OpenAI est servi à `/.well-known/openai-apps-challenge` (`OPENAI_APPS_CHALLENGE`).
- **La page publique** [`/mots-fleches-ia`](https://leflechoir.fr/mots-fleches-ia) : la documentation « installation et usage » qu'exigent les annuaires.
- **Le paquet pour ChatGPT** : `mcp/annuaires/chatgpt/` (manifeste, adresse du connecteur). `sh tools/api/paquet-chatgpt.sh` en fait le ZIP, dans `dist/`.
- **La fiche du registre MCP** : `mcp/server.json`. `sh tools/api/registre-mcp.sh` la publie.
- **Les liens communs** :
  - documentation : https://leflechoir.fr/mots-fleches-ia ;
  - confidentialité : https://leflechoir.fr/privacy#api ;
  - conditions : https://leflechoir.fr/terms#api ;
  - assistance : https://leflechoir.fr/contact (contact@leflechoir.fr) ;
  - icône : le logo du site (`frontend/src/app/icon.svg`, ou `apple-icon.png` en 180 px).

## 1. Claude (Anthropic) : claude.ai/directory/manage

**Qui** : un compte Claude payant. **Délai** : un examen automatique, puis une fiche « Community » ; Anthropic décide seul d'un examen « Verified ».

1. **Essayer d'abord**, avec l'adresse de production : désactiver l'ancien connecteur d'essai, ajouter `https://mcp.leflechoir.fr/mcp` comme connecteur personnalisé, et appeler chacun des trois outils (le portail demande de le confirmer).
2. **Les captures du carrousel**, que Claude prépare après l'ouverture :
   - 3 à 5 images PNG, d'au moins 1 000 px de large ;
   - rognées à la réponse de l'app, sans le message qui l'a demandée ;
   - chacune avec son message, fourni à part.
3. Dans le portail, *Submit new* → **MCP connector**, puis étape par étape :

| Étape | Ce qu'on y met |
|---|---|
| Connection | `https://mcp.leflechoir.fr/mcp` ; une seule adresse pour tous |
| Tools | les trois outils se chargent seuls : aucun ne doit être signalé |
| Listing | voir ci-dessous ; catégories : Education, Entertainment (à choisir dans leur liste) ; slug : `le-flechoir` (**définitif**, le même que le paquet ChatGPT et le registre) |
| Use cases | créer une grille de mots fléchés personnelle (cadeau, classe, fête) ; aucun prérequis ; **lit seulement** (aucune donnée de la personne n'est écrite) |
| Company | la société de l'auteur, son site, un contact |
| Authentication | aucune (données publiques, pas de compte) |
| Data handling | notre propre API ; ni données de santé, ni contenu sponsorisé |
| Test & launch | aucun compte : « Add the connector, then ask: *Create a 9×9 easy French arrowword grid with the words SET and LEO, signed Max*. Claude writes the clues; check_clues shows the grid; the button shows the solution. » ; confirmer avoir appelé chaque outil |
| Compliance | les sept engagements (l'auteur) |
| Allowed link URIs | `https://leflechoir.fr` (les boutons « Jouer en ligne » et « Imprimer » s'ouvrent alors sans confirmation) |

**Les textes** (validés le 08/11/2026 ; sans « free » ni prix, que les règles d'OpenAI interdisent)
- **Nom** : Le Fléchoir
- **Accroche** (180 caractères sur 200) : *Build real arrowword puzzles (French mots fléchés) around your own words. Claude writes the clues; Le Fléchoir builds a valid grid, checks every clue and shows the finished puzzle.*
- **Description** : le `longDescription` de `mcp/annuaires/chatgpt/plugin.json`, le même pour les deux annuaires (il dit « the assistant »).

## 2. ChatGPT (OpenAI) : platform.openai.com/plugins

**Qui** : le propriétaire de l'organisation OpenAI. **Avant tout**, vérifier l'identité de la société dans les réglages de l'organisation : c'est le nom affiché dans l'annuaire.

1. `sh tools/api/paquet-chatgpt.sh` → `dist/le-flechoir-chatgpt.zip`.
2. *Upload new or existing plugin*, choisir l'identité vérifiée, puis déposer le ZIP. Corriger ce que signalent *Metadata & Skills* et *MCPs*.
3. *MCPs* → **Connect** : OpenAI donne un jeton de vérification du domaine.
   - Le mettre dans `.env.production`, en `OPENAI_APPS_CHALLENGE=<jeton>`, puis lancer `make deploy-api`.
   - Vérifier que `https://mcp.leflechoir.fr/.well-known/openai-apps-challenge` affiche le jeton, puis **Connect** de nouveau.
4. *Review information* :
   - **cinq cas positifs** : les trois exemples du manifeste, plus « une grille 10×10 moyenne sur le football » et « montre-moi la solution » ;
   - **trois cas négatifs** : une demande de mots croisés à cases noires, un format de 20×20, une recherche de mots par motif. Le connecteur dit poliment qu'il ne le fait pas ;
   - **une vidéo** de démonstration, d'environ une minute : l'auteur la filme dans ChatGPT ;
   - aucun identifiant de connexion.
5. *Submit for review*, puis les attestations. Après approbation : **Publish plugin**.

Règles d'OpenAI déjà respectées :
- pas de prix ni de promotion dans les textes ;
- pas de « MCP » dans le nom ;
- une interface sans iframe extérieure ;
- tout public dès 13 ans.

## 3. Le Chat (Mistral)

Il n'existe pas de soumission publique : le répertoire des connecteurs de Le Chat est tenu par Mistral.

- **Tout de suite** : la page `/mots-fleches-ia` explique comment l'ajouter comme connecteur personnalisé (*Connecteurs* → *+ Ajouter un connecteur* → *Connecteur MCP personnalisé*).
- **Pour entrer dans le répertoire** : écrire aux partenariats de Mistral, une fois le connecteur public et cité par les deux autres annuaires. Mistral ne publie pas ses adresses : ses appels sont comptés avec les quotas d'une clé par adresse (revue de sécurité, mesure `lechat?`).

## 4. Le registre MCP : registry.modelcontextprotocol.io

C'est l'annuaire commun que lisent d'autres clients et d'autres répertoires. L'espace de noms `fr.leflechoir/*` se prouve par le DNS.

1. `brew install openssl@3 mcp-publisher`.
2. `sh tools/api/registre-mcp.sh cle` crée la clé dans `~/.config/leflechoir` (hors du dépôt) et affiche l'enregistrement TXT à poser.
3. Dans Cloudflare : *leflechoir.fr* → *DNS* → *Records* → *Add record*. Type `TXT`, nom `@`, contenu tel qu'affiché (`v=MCPv1; k=ed25519; p=…`).
4. Quelques minutes plus tard : `sh tools/api/registre-mcp.sh publier`. La fiche est `fr.leflechoir/le-flechoir`.

À chaque nouvelle version du connecteur : augmenter `version` dans `mcp/server.json`, puis `publier`.

## Ensuite

- **L'essai de découverte** : une IA trouve-t-elle seule le connecteur ou le lien `/creer`, sans qu'on le lui donne (API-BESOINS, section 9) ? À faire un mois après les fiches.
- **La mesure** : `assistant` (`claude`, `chatgpt`, `lechat?`) et `utm_source` dans le poste de pilotage.
