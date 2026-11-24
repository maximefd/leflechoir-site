> **Dépôt public de [Le Fléchoir](https://leflechoir.fr)** : le site (Next.js) et l'API (Flask), publiés en open source.
> Le moteur de génération des grilles et le lexique curé sont développés dans un dépôt privé et **ne figurent pas ici** :
> l'API, qui les appelle, ne peut donc pas tourner seule depuis ce dépôt. La roadmap et les documents de stratégie
> restent eux aussi privés : les liens qui y mènent ne s'ouvrent pas ici. Il est mis à jour automatiquement à chaque
> mise en ligne du site. Pour signaler un problème : contact@leflechoir.fr.

## Créer des mots fléchés depuis une IA ou un programme

Le moteur se sert sans ce dépôt, gratuitement, avec ou sans clé :

- **Avec ChatGPT, Claude ou Le Chat** : le connecteur MCP `https://mcp.leflechoir.fr/mcp`. L'assistant écrit les
  définitions, le moteur construit la grille et vérifie chaque croisement. Marche à suivre :
  [leflechoir.fr/mots-fleches-ia](https://leflechoir.fr/mots-fleches-ia).
- **Par l'API HTTP** : `https://api.leflechoir.fr/v1`, décrite en OpenAPI
  ([`/v1/openapi.json`](https://api.leflechoir.fr/v1/openapi.json)). Elle construit une grille autour de vos mots,
  vérifie ses définitions et la dessine en SVG, PNG ou PDF. Documentation :
  [leflechoir.fr/developpeurs](https://leflechoir.fr/developpeurs).
- **Sans outil** : un lien vers le générateur, avec vos mots, lance la grille sur le site, par exemple
  `https://leflechoir.fr/grid?taille=moyenne&mots=eric,velo`.
