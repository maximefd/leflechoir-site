# 0024 — Source des définitions proposées

- Statut : proposée
- Date : 2026-10-03
- Complète l'[ADR 0023](0023-cap-sur-la-premiere-place.md), point 5 : lot C2 de la [roadmap](../ROADMAP.md), issue #212
- Révisée le 2026-10-03 après les retours de l'auteur : mention « proposée par une IA » refusée, notation réglée au lancement (« on verra »), voie « partir d'une base trouvée sur Internet, légalement » ajoutée
- **Ce document n'est pas un avis juridique.** Les points marqués **[avocat]** sont à faire confirmer par un avocat avant tout choix risqué. Étiquettes : [vérifié] relevé à la source, [estimation] calcul de cette ADR, [secondaire] source non officielle, [opinion].

> **En bref**
> - On écarte la **copie des sites de solutions** (risque élevé) et le **Wiktionnaire** (décision #83).
> - **Voie recommandée** : partir de **matière libre** (JeuxDeMots en CC0, TAXREF et code géographique en Licence Ouverte), des **exemples de l'auteur** et d'une **IA, hors ligne**, qui en tire plusieurs définitions courtes et malignes par mot sur le lexique validé (≈ 34 000 mots) ; l'auteur trie dans le curateur. Environ 65 à 90 $ une seule fois, pilote compris (plafond de 100 $), aucun coût récurrent, aucune donnée personnelle chez le fournisseur.
> - **En parallèle**, l'auteur demande lui-même une **licence non exclusive** à des auteurs et à des sites qui tiennent des bases de définitions (courriel type ici, liste dans un document privé). Les grilles anciennes du domaine public ne serviront que d'exemples de style.
> - Les **noms propres** viennent de **Wikidata** (CC0, lot C7). Une **banque communautaire** s'ajoute avec les grilles publiées (lot C6), avec l'accord des auteurs.
> - **Porte de qualité** : une tranche de mots ne sort que si l'auteur juge au moins 90 % de 400 définitions tirées au hasard publiables (valeurs de départ, réglées au lancement).
> - Toujours des **propositions** : l'origine (`ia`, `communauté`, `wikidata`, `licence`, `auteur`) est enregistrée pour chaque définition mais pas affichée (pas de mention « IA », décision de l'auteur), et rien n'est imposé.

## Contexte

- L'[ADR 0023](0023-cap-sur-la-premiere-place.md) (point 5) décide de proposer des définitions automatiquement et renvoie ici le choix de la **source**. Trois contraintes sont acquises :
  - le Wiktionnaire reste hors du site (#83, fermée « non planifiée ») ;
  - recopier des sites de solutions pose un risque juridique ;
  - une banque générée par une IA est chiffrée à moins de 100 $ ([étude, §4.5](../ETUDE-GRILLES-THEME-IA.md)).
- Un concurrent annonce environ douze définitions par mot pour 271 000 mots, « tirées d'un corpus de grilles » selon ses propres termes. Nous ne savons pas d'où elles viennent et ne préjugeons de rien : ce n'est pas une voie pour nous.
- **Notre angle** ([ADR 0023](0023-cap-sur-la-premiere-place.md), point 10) : la définition de verbicruciste, courte et maligne, proposée et jamais imposée : l'auteur de la grille garde le dernier mot. Le nom de la fonction reste à choisir avec l'auteur.
- Ce qui existe déjà :
  - l'éditeur propose les définitions des dictionnaires de l'utilisateur (#91, `dictionary_definitions`) ;
  - `wrapDefinition` et `backend/benchmarks/clue_fit.py` calculent ce qui tient dans une case (demi-case : 26 à 37 caractères ; case entière : 48 à 81).
- Ce qu'il faut : un texte court, au style mots fléchés, pour chaque mot du **lexique validé**, c'est-à-dire gardé à la main (21 408 au 02/10/2026) ou d'office (zipf ≥ 3,5 : 12 963), soit ≈ 34 000 mots, ou ≈ 66 000 en descendant à zipf ≥ 2,5.
- **Couverture, le point dur.** Le moteur puise aujourd'hui dans tout le lexique en ligne (692 516 mots). Au benchmark (7 layouts, 20 seeds, mode par défaut), 33,4 % des mots placés sont absents des corpus, et 15,4 % avec le tri par fréquence ([mesures](../../backend/benchmarks/README.md)) [vérifié]. Tant que la curation n'est pas finie, une banque limitée au lexique validé laissera donc sans proposition jusqu'à un mot sur trois d'une grille générée par défaut. Le critère de fin de la curation (roadmap 1d, `unvouched_share` ≤ 5 %) est celui qui fait tendre la couverture vers 95 %.
- Budget : minimal. Pas de nouveau coût récurrent ; une dépense unique modeste est acceptable si elle se justifie.
- Critères de comparaison (issue #212) : qualité, coût, licence, délai, effet sur la curation.

## Les cinq sources

### 1. Une banque générée par une IA, hors ligne

**Principe.** Un script envoie à l'API de lots d'Anthropic les mots du lexique validé, 25 par requête, avec un guide de style. Chaque mot revient avec 6 à 10 définitions candidates ; des contrôles automatiques, le second avis d'un autre modèle et un échantillon noté par l'auteur départagent ; ce qui passe est chargé en base. **Rien n'est appelé pendant l'usage** : pas de latence, pas de coût par visiteur. Seuls des mots du dictionnaire partent chez le fournisseur : aucune donnée personnelle, et jamais un mot saisi par un utilisateur. La variante recommandée y ajoute de la matière libre et les exemples de l'auteur (voie d, plus bas).

**Prix** (page officielle d'Anthropic, relevés le 02/10/2026, par million de jetons) [vérifié] :

| Modèle | Entrée | Sortie | En lot (−50 %), entrée / sortie |
|--------|--------|--------|---------------------------------|
| Claude Haiku 4.5 | 1 $ | 5 $ | 0,50 $ / 2,50 $ |
| Claude Sonnet 5.5 | 2 $ | 10 $ | 1 $ / 5 $ |
| Claude Opus 5.5 | 4 $ | 20 $ | 2 $ / 10 $ |

L'API de lots donne 50 % de remise sur l'entrée comme sur la sortie, accepte jusqu'à 100 000 requêtes ou 256 Mo par lot, termine la plupart des lots en moins d'une heure et garde les résultats 29 jours (à rapatrier aussitôt). Le cache de prompt se cumule avec le lot, mais « au mieux » : 30 à 98 % de succès.

**Coût d'une banque** [estimation] :

| Banque | Haiku 4.5 | Sonnet 5.5 | Opus 5.5 |
|--------|-----------|------------|----------|
| 34 000 mots (lexique validé) | 19 à 27 $ | 33 à 46 $ | 60 à 84 $ |
| 66 000 mots (zipf ≥ 2,5) | 38 à 53 $ | 64 à 89 $ | 117 à 162 $ |
| Pilote : 2 000 mots, 8 propositions | 1,4 $ | 2,3 $ | 4,2 $ |

- Hypothèses : 6 à 10 propositions par mot ; 13 jetons par proposition (français, nouveau tokenizer) ; 25 mots par requête ; guide de style de 3 000 jetons relu sans cache (cas pessimiste) ; 20 % des mots régénérés une fois ; second avis par Haiku 4.5 ; pas de raisonnement. Haiku 4.5 garde l'ancien tokenizer, qui compte environ 23 % de jetons de moins : son estimation est pessimiste.
- Un raisonnement de 150 jetons par mot ajoute 50 à 100 %.
- L'étude (§4.5) annonçait 30 à 60 $ pour 100 000 mots : le « moins de 100 $ » tient pour Haiku et Sonnet sans raisonnement, pas pour Opus sur 66 000 mots.
- Un mot ajouté plus tard au lexique validé coûte de l'ordre de 0,001 à 0,002 $.
- Ces chiffres sont ceux d'une chaîne simple. Avec la matière libre, les exemples de style et 8 à 12 propositions, les totaux montent (52 à 72 $ pour 34 000 mots avec Sonnet) : voir la voie d, plus bas.

**Qualité attendue.**
- Bonne sur les mots courants (définitions directes), plus lisse sur le jeu de mots.
- Modes d'échec ([étude, §4.2](../ETUDE-GRILLES-THEME-IA.md)) : définition inventée d'un mot rare (d'où le lexique validé et la consigne de répondre « inconnu »), réponse ou famille du mot dans la définition, définition trop longue pour la case.
- Un jalon académique de 2024 (modèle de 13 milliards de paramètres, anglais, 1 800 définitions) : environ 72 % jugées valides et 81 % valides ou acceptables, la fuite de la réponse étant un mode d'échec majeur [vérifié]. Les modèles actuels font mieux ; sur nos mots, c'est le pilote et la porte de qualité qui le diront.

**Licence des sorties.**
- Les conditions commerciales d'Anthropic (version du 17/06/2025) disent que le client « possède ses sorties » (section B), qu'Anthropic n'entraîne pas ses modèles sur ces contenus, et prévoient une défense contre les réclamations de propriété intellectuelle visant l'usage autorisé du service et des sorties (section K.1), sous conditions [vérifié].
- En revanche, un texte produit sans intervention créatrice humaine n'a probablement pas d'auteur au sens du droit d'auteur français : la banque ne se protège pas par ce droit. Elle peut se protéger comme base de données (investissement de vérification et de présentation) et surtout en restant privée ([ADR 0021](0021-moteur-prive-site-public.md)), servie mot par mot **[avocat]**.
- Risque de reprise d'une définition existante : faible pour 25 à 45 caractères, non nul pour une définition célèbre. Parades : aucune définition de tiers dans l'invite (ni exemple, ni « inspire-toi de »), consigne d'originalité, un « déjà vu » repéré pendant la notation, un bouton « Signaler ».

**AI Act** (règlement (UE) 2024/1689, art. 50) : pas d'obligation probable pour ces suggestions. Le marquage des sorties pèse sur le **fournisseur** d'un système génératif (art. 50(2)) ; notre banque est produite hors ligne avec le modèle d'un tiers puis servie comme des données, et l'information sur les textes d'intérêt public (art. 50(4)) vise un autre cas **[avocat]**. La mention « proposée par une IA » est donc **refusée** par l'auteur (03/10/2026) : la provenance reste enregistrée (`source`) sans être affichée, et l'afficher plus tard serait un réglage, si l'analyse changeait ou si la génération devenait « à la demande » ([étude, §8.1](../ETUDE-GRILLES-THEME-IA.md)).

**Délai.** 1 à 2 semaines de travail (chaîne, pilote, tranches), plus environ 3 à 5 heures de notation par l'auteur : la notation est le facteur limitant.

**Effet sur la curation.** Un mot que le modèle ne sait pas définir (réponse « inconnu »), ou que le second avis juge incohérent, est un indice de mot douteux : il alimente le curateur (#126, « avis de l'IA », une suggestion et jamais une décision, [ADR 0005](0005-pipeline-du-lexique-et-decisions.md)). Chaque mot validé de plus reçoit sa banque par un lot incrémental.

### 2. Une banque de la communauté (lot C6)

**Principe.** Les définitions écrites par les utilisateurs dans leurs grilles **publiées** (galerie, lot C6) alimentent les propositions des autres, avec leur accord.

**Droits.**
- Une définition originale (jeu de mots, image) peut être protégée : il faut une licence de son auteur (voir la source 5 pour ce qui est protégé).
- En droit français, les CGU doivent nommer chaque droit concédé et délimiter son étendue, sa destination, le lieu et la durée (CPI L.131-3), et ne peuvent viser « globalement » les œuvres futures (L.131-1) : la clause ne vise que les définitions publiées.
- Clause étroite, sinon elle risque d'être jugée abusive pour un consommateur : licence non exclusive, gratuite, limitée au service (proposer aux autres), qui prend fin avec la suppression de la grille ou du compte **[avocat]**.

**Règles d'entrée.**
- Seul entre ce que l'auteur a **écrit ou retouché** : jamais une proposition reprise telle quelle, ce qui évite la boucle « IA → communauté ».
- Mêmes contrôles automatiques que la banque IA, plus le refus de tout nom propre ou nombre absent du lexique : « Chien de Josette » reste personnel.
- Sept jours sans signalement ; bouton « Signaler » et file dans `/admin`.
- Chaque ligne garde son compte d'origine (suppression en cascade) : elle part avec le compte ou la grille.
- Le cadre de modération et la clause exacte sont repris dans l'ADR « grilles publiques et liens de partage » ([ADR 0023](0023-cap-sur-la-premiere-place.md), conséquences).

**Risques.**
- Un utilisateur peut coller des définitions copiées ailleurs (sites de solutions, dictionnaires) : les CGU lui en font porter la responsabilité et le signalement les retire, mais la banque ne peut pas le détecter seule.
- Démarrage à froid : la galerie d'un concurrent comptait environ 400 grilles trois mois après son ouverture. À une quarantaine de définitions par grille, cela fait environ 16 000 définitions, surtout des mots de thème : moins de 15 % du lexique validé [estimation]. Nous partirons plus bas. La banque communautaire ne peut donc pas être la source de départ ; elle enrichit (variété, esprit) et mesure le goût (celles qui sont choisies).

**Coût et délai.** Aucun coût en argent, mais de la modération (quelques signalements par mois, [étude, §8.4](../ETUDE-GRILLES-THEME-IA.md)) et une relecture des CGU par un avocat. Après le lot C6 : plusieurs mois.

**Effet sur la curation.** Les mots que les gens définissent à la main sont un signal d'usage, comme les suggestions implicites de l'[ADR 0020](0020-suggestions-et-ajouts-au-lexique.md).

### 3. Des données ouvertes

| Ressource | Licence | Contient | Verdict |
|-----------|---------|----------|---------|
| **Wikidata** | CC0 : toutes les données structurées (espace principal, propriétés, lexèmes) sont versées au domaine public [vérifié] | pour chaque entité, un libellé, une courte description française et des propriétés (nature, pays, profession…) | **Retenu pour les noms propres (lot C7)** |
| **JeuxDeMots** (RezoJDM) | CC0 selon le README de l'export actuel et Wikipédia ; CC BY-SA 2.0 en 2008 : relire le README au téléchargement [vérifié] | réseau lexical : synonymes, hyperonymes, associations ; pas de définitions rédigées | Appui possible pour l'IA, pas une source de texte |
| **WOLF** | CeCILL-C | synonymes et hyperonymes, construits à partir de WordNet | idem, plus bruité |
| **Lexique 3.83** | CC BY-SA 4.0 | fréquences, lemmes, catégories : **aucune définition** | déjà utilisé (zipf, lemmes) |
| **DELA** | LGPLLR | formes fléchies : **aucune définition** | déjà utilisé |
| **Wiktionnaire** (kaikki) | CC BY-SA 4.0 et GFDL | définitions de dictionnaire | **Exclu**, voir plus bas |
| Définitions de mots fléchés sous licence libre | | | **Aucun jeu trouvé** (recherches du 02/10/2026) |

**Wikidata, pour les noms propres.**
- Descriptions courtes, exactes, sans obligation ni partage à l'identique : on peut les adapter librement, par une IA aussi. Exemples relevés le 02/10/2026 par l'API publique de recherche : « Molière » → « dramaturge et acteur français (1622–1673) » ; « Quimper » → « ville et commune française (chef-lieu du département du Finistère) » ; « Loire » → « fleuve en France ».
- Limites : style encyclopédique et non mots fléchés (dates, précisions qui trahissent) ; homonymes (pour « Zola », les trois premiers résultats sont un genre d'insectes, un rappeur et un générateur de site statique, l'écrivain étant « Émile Zola ») : il faut choisir l'entité par notoriété et par nom complet.
- Chaîne prévue pour le lot C7 : le mot vient de l'extrait kaikki (sans sa définition) → l'entité Wikidata, classée par notoriété → description et propriétés → reformulation en définition par la **même chaîne** que la banque IA, avec la même porte (tranche « noms propres »). Ni texte de Wikipédia (CC BY-SA), ni définition du Wiktionnaire.
- Coût : 0 $ de données, quelques dollars de reformulation ; 1 à 2 semaines dans le lot C7. Mesure préalable d'une demi-journée : sur 500 noms propres, la part qui a une description française utilisable.

**JeuxDeMots et WOLF** sont des relations entre mots, pas des définitions : ils ne sont pas une source de texte, mais ils fournissent la matière que l'IA transforme en définitions courtes (voie b, plus bas), avec TAXREF, le code géographique et FranceTerme.

**Pourquoi le Wiktionnaire reste exclu.**
- Décision de l'auteur (#83, fermée « non planifiée » le 02/10/2026).
- CC BY-SA : une banque dérivée devrait être publiée sous la même licence, avec attribution, y compris quand une IA reformule (une reformulation proche reste dérivée). Cela contredit l'[ADR 0021](0021-moteur-prive-site-public.md) (lexique et données dérivées privés) et donnerait la banque à tous, concurrents compris.
- Le format ne convient pas : « Qui… », « Action de… », « forme de X » ne tiennent pas dans 26 à 37 caractères.
- Il reste dans le curateur, jamais servi par l'API ([LICENCES.md](../LICENCES.md)).

### 4. Des données sous licence

- **Éditeurs de dictionnaires** (Larousse, Le Robert…) : licences de contenu négociées, sans tarif public (aucun trouvé le 02/10/2026). Seul repère public trouvé, pour un dictionnaire anglais (Oxford Languages) : licence « entreprise » à partir de 5 000 £ par an et par langue, et la mise en cache ou l'usage hors ligne des données n'est permis que sous cette licence [vérifié]. Hors budget, pour des définitions de dictionnaire qui ne sont de toute façon pas des définitions de mots fléchés.
- **API de dictionnaire grand public** (par exemple Dicolink : 10, 59 ou 149 € par mois selon le nombre d'appels par heure ; sources citées « granddico » et « ledico », sans autre détail) : conditions de stockage et de rediffusion non publiées. Bâtir une banque par requêtes répétées reviendrait à extraire une base (source 5). À écarter sans accord écrit.
- **Archives de verbicrucistes et d'éditeurs de grilles** : les seules données au style voulu. Elles existent : une équipe de recherche a réuni plus de 300 000 couples définition-réponse en français et environ 7 000 grilles avec l'aide de deux auteurs prolifiques ; l'article n'indique ni publication du jeu ni licence [vérifié]. Les droits dépendent des contrats entre auteurs et éditeurs. Aucun tarif public.
- **Faisabilité** pour une très petite société : faible à court terme pour un éditeur, coût et délai inconnus. Une piste sans engagement existe auprès des auteurs indépendants et des sites : une licence non exclusive demandée par écrit, étudiée plus bas (voie a), avec un courriel type.

### 5. Copier les sites de solutions

**Ce que ce serait.** Extraire, par script ou à la main et en masse, les couples définition-réponse de sites de solutions de mots fléchés, puis les servir comme propositions. Ces sites sont accessibles à la lecture ; cela ne les rend pas réutilisables.

**Droit d'auteur, définition par définition** (CPI L.111-1, L.112-1, L.122-4).
- Le code protège toutes les œuvres de l'esprit, quels qu'en soient le genre, la forme d'expression, le mérite ou la destination, pourvu qu'elles soient originales ; toute reproduction, même partielle, sans l'accord de l'auteur est illicite.
- Pour un texte court : un extrait de onze mots peut être protégé s'il exprime la création intellectuelle propre de son auteur (CJUE, *Infopaq*, C-5/08). Mais il n'y a pas d'originalité quand l'expression est dictée par la fonction et ne laisse aucune liberté créative (CJUE, *Brompton*, C-833/18).
- Une définition dictée par la réponse (« Petit rongeur ») est probablement libre. Une définition à jeu de mots ou à image originale peut être protégée. Dans un lot de plusieurs centaines de milliers de définitions, la part protégée est inconnue, mais pas nulle.
- Risque : **moyen par définition, non négligeable en masse** **[avocat]**.

**Droit des bases de données, le risque principal** (CPI L.341-1, L.342-1, L.342-2, L.342-5 ; directive 96/9/CE).
- Le producteur qui justifie d'un investissement financier, matériel ou humain substantiel de constitution, de vérification ou de présentation peut interdire l'extraction et la réutilisation de la totalité ou d'une partie qualitativement ou quantitativement substantielle du contenu. Il peut aussi interdire l'extraction ou la réutilisation **répétée et systématique** de parties non substantielles qui excède l'usage normal (L.342-2) : découper l'extraction en petites requêtes n'y échappe pas. Protection de 15 ans, renouvelée par tout investissement substantiel nouveau.
- Un site qui réunit des dizaines de milliers de définitions, les vérifie, les classe et les tient à jour est un candidat sérieux à cette protection. Les descriptions publiques de tels sites annoncent de l'ordre de 80 000 à 100 000 définitions et plusieurs centaines de milliers de solutions [secondaire].
- Jurisprudence :
  - CA Paris, 2 février 2021, *Leboncoin* c. *Entreparticuliers* : un site d'annonces est une base protégée (investissements de constitution, de vérification et de présentation, y compris techniques) ; reprendre ses annonces immobilières, environ 10 % de l'ensemble, est une extraction d'une partie qualitativement substantielle [secondaire].
  - Cass. 1re civ., 12 novembre 2015, n° 14-14.501 (*Seloger* c. *Yakaz*) : la recherche et le rassemblement d'éléments existants, et la vérification de leur fiabilité pendant la constitution comme pendant l'exploitation de la base, comptent comme investissement [vérifié]. Un site qui collecte des définitions et en contrôle les réponses entre dans ce cadre.
  - Nuances : l'investissement dans la **création** des données ne compte pas (CJUE, *British Horseracing Board*, C-203/02 ; *Fixtures Marketing*, C-444/02), et la CJUE (*CV-Online*, C-762/19, 2021) n'admet l'atteinte que si l'extraction prive le producteur des revenus qui amortissent son investissement. Notre usage (créateurs de grilles) n'est pas le leur (solveurs en panne) : un argument de défense, pas une protection.
- Risque : **élevé** pour une extraction systématique **[avocat]**.

**Contrat** (conditions d'utilisation).
- Même quand une base n'est protégée ni par le droit d'auteur ni par le droit sui generis, son propriétaire peut en limiter l'usage par contrat (CJUE, *Ryanair*, C-30/14, 2015).
- Beaucoup de sites interdisent la reproduction ou l'extraction automatisée. L'opposabilité dépend de l'acceptation, mais le non-respect pèse sur la faute. À vérifier site par site (conditions d'utilisation, `robots.txt`, mesures techniques).
- Risque : **moyen à élevé**.

**Parasitisme** (Code civil, art. 1240).
- Se placer dans le sillage d'un concurrent pour profiter de ses investissements est fautif, sans risque de confusion (CA Paris, pôle 5, ch. 2, 16 décembre 2022, reprise du contenu d'un site) ; la Cour de cassation exige une valeur économique individualisée et des investissements (Cass. com., 26 juin 2024) [secondaire].
- Une banque de dizaines de milliers de définitions réunies et vérifiées remplit ces conditions.
- Risque : **moyen**.

**Sanctions.**
- Civiles : interdiction, retrait de la banque (donc de la fonction), dommages et intérêts.
- Pénales : l'atteinte aux droits du producteur de base de données est punie de 3 ans d'emprisonnement et 300 000 € d'amende, 7 ans et 750 000 € en bande organisée (CPI L.343-4) [vérifié]. La menace pénale est théorique pour une petite société qui s'arrête à la première mise en demeure ; l'injonction et la perte de la fonction sont réelles.

**Conclusion.** Niveau de risque **élevé** pour une extraction systématique, republiée ; **faible** pour un usage humain ponctuel (lire une définition, en écrire une autre).
- Même si chaque définition prise seule risque peu, la banque entière prend le risque de la base de données.
- Impossible, une fois mélangées, de séparer les définitions copiées des autres. Les producteurs de bases sèment parfois des entrées fictives pour prouver une copie [opinion].
- Le gain est mince : on ne récupère que ce que d'autres ont déjà défini, ce qui ne fait pas grandir la banque.
- Cela contredit nos angles (« nos angles, pas leur copie », respect, [ADR 0023](0023-cap-sur-la-premiere-place.md), point 10).
- **Reste permis** : les mots eux-mêmes, les idées de définition, et écrire sa propre définition, même proche (pour un mot courant, les formulations sont peu nombreuses). L'exception de fouille de textes et de données (CPI L.122-5-3 et L.342-3) permet d'analyser un corpus consulté licitement, par exemple pour mesurer des longueurs, sans le conserver ni le servir, sous réserve de l'opposition des titulaires **[avocat]**.
- Si l'auteur retient malgré tout cette voie, même en partie, une consultation d'avocat est un préalable.

### Comparaison

| Source | Qualité | Coût | Droits et risque | Délai | Effet sur la curation | Verdict |
|--------|---------|------|------------------|-------|-----------------------|---------|
| **1. Banque IA seule** | bonne sur les mots courants, plus lisse sur le jeu de mots ; contrôlée par la porte à 90 % | 20 à 90 $ une fois (Haiku ou Sonnet, 34 000 à 66 000 mots) | sorties cédées au client, aucune donnée de tiers ; AI Act : pas d'obligation probable ; **risque faible** | 1 à 2 semaines + notation | repère les mots douteux ; grandit avec les mots validés | variante simple, reprise dans la ligne 6 |
| **2. Communauté** | humaine, variée, inégale | 0 € + modération + relecture des CGU | licence des CGU à rédiger ; copies de tiers et données personnelles à filtrer ; **risque moyen** | après le lot C6 : des mois | signal d'usage | **Retenue plus tard (C6)** |
| **3a. Wikidata** | exacte et courte, encyclopédique ; noms propres seulement | 0 $ + quelques $ de reformulation | CC0 ; **risque nul** | 1 à 2 semaines (lot C7) | tri des noms propres (C7) | **Retenue (C7)** |
| 3b. JeuxDeMots, WOLF | relations, pas de définitions | 0 $ | CC0 (à relire) ; CeCILL-C | — | — | appui facultatif |
| 3c. Wiktionnaire | style dictionnaire | 0 $ | CC BY-SA : banque à partager ; **contraire à l'ADR 0021** | — | — | **Exclu** (#83) |
| **4. Licences** | la plus pro, mais dictionnaire ≠ mots fléchés | de 5 000 £ par an et par langue (repère anglais), sinon sur devis | contrat négocié ; **risque faible** | semaines à mois | — | Écartée (hors budget) |
| **5. Copie des sites de solutions** | authentique, environ 12 par mot | 0 € | droit d'auteur, base de données, contrat, parasitisme, L.343-4 ; **risque élevé** | quelques jours | importe les choix de mots d'un tiers | **Écartée** |
| **6. Matière libre + exemples de l'auteur + IA** (voies b et d) | plus variée et plus maligne que l'IA seule : faits libres, ton de l'auteur, plusieurs registres ; contrôlée par la porte | environ 65 à 90 $ une fois (34 000 mots, pilote compris) | matière en CC0 ou Licence Ouverte, exemples de l'auteur ; AI Act : pas d'obligation probable ; **risque faible** | 2 à 3 semaines [estimation] + tri au fil de l'eau | tri dans le curateur ; repère les mots douteux | **Retenue : la voie de départ** |
| **7. Licences d'auteurs et de sites** (voie a) | la meilleure : définitions écrites par des gens du métier | une enveloppe à fixer (quelques centaines d'euros pour commencer) [opinion] | contrat ; chaîne des droits à garantir ; **risque faible** si titularité écrite | semaines, réponses incertaines | — | **En parallèle**, sans dépendre d'elle |

## Partir d'une base trouvée sur Internet, légalement

L'auteur tient à partir d'une base existante plutôt que de zéro : une définition de mots fléchés n'est pas une définition de dictionnaire, elle est courte et maligne, et un mot en a souvent plusieurs. Les sources 3 et 4 ci-dessus ne donnent pas cela telles quelles. Il reste quatre voies licites, qui se combinent (a à d).

**Pourquoi aspirer un site sans autorisation reste écarté.** Ce serait extraire la base d'un tiers, que le droit des bases de données protège (CPI L.342-1 et L.342-2, jusqu'à 3 ans et 300 000 € au pénal) et que plusieurs de ces sites interdisent expressément d'aspirer. Le gain est mince (des définitions qu'on ne peut ni garantir ni retirer proprement) pour un risque qui peut coûter la fonction entière, alors qu'une demande d'autorisation ne coûte qu'un courriel (voie a).

### a. Une licence ou un accord avec ceux qui tiennent des bases

**Qui tient des bases de définitions.** La liste nominative et les voies de contact sont dans `docs/DEFINITIONS-SOURCES.md`, document privé (relevé du 02 et 03/10/2026, fait de l'extérieur).
- Des **sites de solutions** : 80 000 à plus de 100 000 définitions annoncées, plusieurs centaines de milliers de solutions. Les plus gros sont alimentés par leurs visiteurs : reste à savoir qui détient les droits.
- Des **auteurs indépendants** (verbicrucistes), seuls ou réunis sur des plateformes d'auteurs : ce sont eux qui écrivent les définitions courtes et malignes.
- Des **éditeurs** de magazines de jeux, qui détiennent de gros fonds de grilles, souvent par cession des auteurs.
- Une **association** de verbicrucistes, d'amateurs et d'éditeurs (créée en 2009) et un club fondé en 1956 : la porte d'entrée la plus naturelle.
- La **recherche** : une équipe a réuni plus de 300 000 couples définition-réponse avec l'aide de deux auteurs prolifiques. Le jeu n'est pas publié, mais des auteurs acceptent donc de partager.

**Une licence ne vaut que ce que le donneur détient.**
- Un site qui tient ses définitions de ses visiteurs, ou qui a repris des grilles publiées, ne peut licencier que son droit de producteur de base de données, pas les droits des auteurs des définitions : sa licence ne nous protégerait pas des réclamations de ces derniers.
- Les licences les plus sûres viennent de l'**auteur** lui-même (ses définitions, sa signature) et de l'**éditeur** qui en détient les droits par contrat. Dans tous les cas : une déclaration d'origine par écrit, une garantie de titularité, et la réponse à « avez-vous cédé l'exclusivité à un éditeur ? » **[avocat]**.

**Ce qu'on peut proposer.**
- Une licence **non exclusive**, pour le monde, afin de proposer leurs définitions dans le service (en l'état ou reformulées) et de s'en servir comme exemples de style.
- Une **livraison unique**, chargée dans une base privée : jamais republiée en bloc, jamais cédée.
- Le traitement par un outil d'IA, **sans entraînement** (les conditions du fournisseur l'interdisent, source 1). Des auteurs peuvent se méfier de l'IA : le dire d'emblée, dans le courriel.
- En échange, au choix ou ensemble : une somme forfaitaire, une mention et un lien sur la page des crédits, l'accès gratuit aux futures options pour les professionnels, une part des revenus futurs liés à ces définitions.
- Aucune exclusivité demandée, et pas de concurrence : Le Fléchoir sert ceux qui créent des grilles, pas les joueurs qui cherchent une solution.

**Ordre de prix.** Aucun tarif public n'existe pour des bases de définitions de mots fléchés (recherches du 02/10/2026). Repères :
- un verbicruciste indépendant est payé de 10 à 150 € la grille selon la taille et l'expérience, davantage pour une grille très travaillée [secondaire] ;
- une licence de dictionnaire anglais (Oxford) commence à 5 000 £ par an et par langue [vérifié] ;
- une API de dictionnaire grand public coûte 10 à 149 € par mois, mais n'autorise pas le stockage (source 4).

Pour une licence unique et non exclusive d'une archive déjà vendue à des éditeurs, une enveloppe de quelques centaines d'euros au total est un point de départ réaliste [opinion]. Le montant maximal reste à fixer par l'auteur.

**Courriel type**, que l'auteur envoie lui-même (nous n'envoyons rien) :

```text
Objet : Demande de licence non exclusive sur des définitions de mots fléchés (Le Fléchoir)

Bonjour [Madame, Monsieur / prénom],

Je m'appelle [prénom nom] et je suis l'auteur du Fléchoir (leflechoir.fr), un site gratuit
de création de mots fléchés : recherche de mots par motif, mises en page inspirées des
magazines, lexique trié à la main. [Une phrase sincère sur leur travail : « Je consulte
souvent votre site / vos grilles, et j'admire… ».]

Je voudrais que le site propose, pour chaque mot d'une grille, plusieurs définitions
courtes et un peu malignes, comme dans les grilles de magazine, plutôt que des définitions
de dictionnaire. Pour cela, je cherche des définitions écrites par des gens du métier.

Ma demande : une licence non exclusive pour utiliser [vos définitions / un extrait de vos
définitions] dans le cadre suivant :
- elles seraient chargées dans une base privée du site et proposées aux utilisateurs, en
  l'état ou reformulées ; elles serviraient aussi d'exemples de style ;
- un outil d'intelligence artificielle pourrait les traiter pour en dériver de nouvelles
  définitions ; elles ne serviraient pas à entraîner un modèle (les conditions de mon
  fournisseur l'interdisent) ;
- je ne les republierais pas en bloc, ne les céderais à personne et ne proposerais pas de
  solutions aux joueurs : je ne fais pas concurrence à votre activité ;
- une seule livraison, dans le format qui vous arrange (un fichier CSV, par exemple) ;
  aucune exclusivité : vous restez libre de vos données.

En échange, je peux proposer, au choix ou ensemble : une somme forfaitaire [à discuter] ;
une mention et un lien vers [votre site] sur la page des crédits du Fléchoir ; un accès
gratuit aux futures options pour les professionnels ; une part des revenus que le site
tirera un jour de ces définitions.

Deux questions pour que tout soit clair des deux côtés : détenez-vous seul(e) les droits
sur ces définitions, ou une partie vient-elle de contributions d'internautes, d'auteurs ou
d'éditeurs ? Et avez-vous cédé l'exclusivité à un éditeur ?

Je ne prélèverai rien sur votre site sans votre accord écrit. Je serais ravi d'en parler
par téléphone ou par courriel, et de rédiger un court contrat à votre convenance.

Bien cordialement,
[prénom nom] — [société ou micro-entreprise] — [adresse, téléphone]
```

**Contrat : clauses minimales**, à faire relire **[avocat]** si la somme dépasse le symbolique :
- objet (liste ou volume de définitions) et droits concédés : reproduction, adaptation, représentation dans un service en ligne ;
- non exclusivité, durée, territoire ; rémunération ou mention ;
- garantie de titularité et d'origine ;
- autorisation de confier les données à des prestataires techniques, IA comprise, sans entraînement ;
- sort des définitions déjà reformulées à la fin du contrat (à négocier : elles restent utilisables) ;
- aucune donnée personnelle.

### b. Les données ouvertes : la matière d'une définition courte

Aucun jeu de définitions de mots fléchés n'existe sous licence libre (source 3). Mais plusieurs jeux libres donnent ce qu'une définition courte met en jeu : un synonyme, un genre, une caractéristique, un lieu, une action, une association d'idées.

| Ressource | Licence | Ce qu'elle apporte | Téléchargement |
|-----------|---------|--------------------|----------------|
| **JeuxDeMots** (RezoJDM, LIRMM) | CC0 [vérifié] | pour un mot : synonymes, générique, spécifique, partie, tout, caractéristiques, lieu typique, agent, patient, instrument, domaine, contraire, locutions, idées associées, chacun pondéré | fichiers par relation, ci-dessous |
| **Wikidata** | CC0 [vérifié] | noms propres : description française, nature, pays, profession, dates ; notoriété par le nombre d'articles | API ou export |
| **TAXREF** (MNHN) | Licence Ouverte 2.0 sur data.gouv.fr, CC-BY 4.0 par GBIF [vérifié] | noms vernaculaires français de la faune, de la flore et de la fonge, avec leur classement (groupe, famille) | data.gouv.fr |
| **Code officiel géographique** (INSEE) | données publiques sur data.gouv.fr, licence à relever sur la fiche | communes, départements, régions | data.gouv.fr |
| **FranceTerme** (ministère de la Culture) | Licence Ouverte [vérifié] | environ 7 200 termes techniques avec une définition officielle (2020) | data.gouv.fr |
| **WOLF** | CeCILL-C | synonymes et hyperonymes construits à partir de WordNet : bruité | Inria |
| Lexèmes de Wikidata | CC0 | des sens avec définition, mais 10 520 lexèmes français en 2020 : négligeable | API |

Tout ce qui est en CC BY-SA (Wiktionnaire, Wikipédia, ConceptNet) reste exclu : le partage à l'identique s'appliquerait à la banque.

**JeuxDeMots, en détail** (consulté le 02/10/2026) :
- **Licence** : le README de l'export porte « Licence CreativeCommons Libre de droit - cc0 » et demande une citation (« Données de JeuxDeMots. Mathieu Lafourcade et LIRMM »). Ce README date de 2022 et le réseau était en CC BY-SA 2.0 en 2008 : **relire le README livré avec l'export au moment du téléchargement** [vérifié].
- **Téléchargement** libre sur le site du LIRMM, sans compte, fichiers à jour jusqu'en août 2026 :
  - synonymes (30 à 36 Mo), générique (248 Mo), caractéristiques (14 à 17 Mo), domaine (18 à 27 Mo), lieu (18 Mo), agent (42 à 44 Mo), patient (5 Mo) : environ 0,4 Go en tout ;
  - idées associées (608 Mo), spécifique (147 Mo), tout (116 Mo) ;
  - le réseau complet : 7,3 Go compressés (3 janvier 2026).
  Texte brut, une relation par ligne (identifiant, mot de départ, mot d'arrivée, type, poids). Le téléchargement est fait par l'auteur ou avec son accord explicite (fichier, source, taille), hors dépôt.
- La relation « glose » (type 35) existe : sa provenance n'est pas documentée dans le README, à vérifier avant tout usage (elle pourrait contenir des textes de tiers).
- **Limites** : relations pondérées et bruitées, mots polysémiques (« avocat », le fruit et le juriste), formes fléchies. On ne garde que les relations au-dessus d'un poids, et seulement pour les ≈ 34 000 mots validés.

**Ce qu'on en fait** : une fiche de 150 à 250 jetons par mot, donnée à l'IA (voie d). Elle apporte ce qu'un dictionnaire apporterait, sans en prendre le texte.

### c. Les grilles anciennes du domaine public

**Statut juridique.**
- Une œuvre est libre 70 ans après la mort de son auteur (CPI L.123-1). Pour une œuvre anonyme, pseudonyme ou collective, c'est 70 ans après le 1er janvier qui suit la publication (L.123-3). Les œuvres publiées avant 1948 profitent de prorogations de guerre de 6 ans 152 jours et de 8 ans 120 jours (L.123-8 et L.123-9) [vérifié].
- Les grilles **non signées** de la presse, publiées jusqu'en 1950, sont donc libres aujourd'hui (celles de 1947, grâce à la prorogation, depuis le printemps 2026) [estimation de calcul]. Les grilles **signées** d'un auteur identifié ne le sont que 70 ans après sa mort, prorogations en plus : « 1925-1950 » ne suffit pas, il faut connaître l'auteur. Un auteur mort en 1990 reste protégé jusqu'en 2060. Un quotidien est en principe une œuvre collective, mais une contribution signée peut être traitée à part **[avocat]**.
- Numériser un document libre ne le rend pas de nouveau protégé par le droit d'auteur ; la BnF s'appuie sur ses conditions d'utilisation et sur son droit de producteur de base de données **[avocat]**.

**Conditions de la BnF.**
- **Gallica** : la réutilisation non commerciale est libre et gratuite, avec la mention « Source gallica.bnf.fr / Bibliothèque nationale de France ». La réutilisation **commerciale** est payante et sous licence : revente de contenus en produits élaborés ou en service, ou toute autre réutilisation qui génère directement des revenus. Les chercheurs en sont exonérés pour leurs publications scientifiques. Les licences non exclusives sont délivrées par BnF-Partenariats [secondaire].
- **RetroNews** : téléchargement et impression sous abonnement Premium (12,50 € par mois en 2016, tarif actuel à vérifier), usage commercial sous abonnement Pro ; l'OCR est brut et n'est pas fiable à 100 % [secondaire].
- **Pour nous** : tant que Le Fléchoir est gratuit et sans revenu direct, lire quelques pages et reprendre à la main quelques exemples relève de l'usage non commercial. Dès les options payantes (lot C8), le doute naît ; un téléchargement massif poserait aussi la question du droit du producteur de la BnF **[avocat]**. Donc : quelques centaines d'exemples relevés à la main avec la mention de la source, pas de moisson, et une demande à BnF-Partenariats avant toute reprise de masse.

**Faisabilité.**
- **Matière** : Gallica propose une sélection « Les mots croisés vintage de Gallica » : plus de 120 grilles de 1925 à 1927 avec leurs solutions, parues dans les grands quotidiens ; la presse numérisée en contient bien plus jusqu'en 1950 [secondaire].
- **Technique** : l'OCR d'une **grille** est mauvais (cases, numéros). Les **listes de définitions** sont du texte, plus exploitable, mais l'appariement définition-réponse demande la solution, publiée à part ; erreurs d'OCR, orthographe ancienne, colonnes coupées. Beaucoup de travail manuel pour peu de définitions utilisables [estimation].
- **Style** : court et plein de calembours (les mots croisés français se distinguent des anglo-saxons par le calembour, l'humour et un vrai travail d'auteur [secondaire]), mais **daté** : colonies, métiers et monnaies disparus, mots devenus rares, propos qu'on ne publierait plus.
- **Verdict** : pas une banque en masse, mais une **source d'exemples de style** : quelques centaines de définitions triées à la main (non signées, ou d'un auteur libre de droits), pour apprendre le ton à l'IA. Un sondage de un à deux jours (30 pages, part exploitable) suffit pour trancher. À traiter après les voies a, b et d.

### d. Comment l'IA transforme cette matière en définitions courtes et malignes

**Principe.** L'IA ne recopie rien et n'invente pas à partir de rien : elle reçoit la **matière** (des faits libres sur le mot), le **style** (des exemples écrits par l'auteur) et des **contraintes** (longueur, ni le mot ni sa famille), et propose **plusieurs** définitions de registres différents. L'auteur trie.

1. **Matière** par mot (≈ 200 jetons) : relations JeuxDeMots au-dessus d'un poids ; pour un nom propre, sa description et ses propriétés Wikidata ; TAXREF pour le vivant ; le code géographique pour les lieux.
2. **Style** : 30 à 40 définitions de l'auteur dans la consigne (partagée, donc peu coûteuse), plus 3 à 5 exemples choisis selon la catégorie grammaticale et la longueur. Ce sont les siennes : aucun droit à régler. Les exemples libres des voies a et c s'y ajoutent.
3. **Sortie** : 8 à 12 propositions de registres variés (synonyme direct, définition courte, périphrase, allusion, jeu de mots avec le « ? » des mots fléchés, référence culturelle prudente), chacune avec son registre et sa longueur ; « inconnu » permis.
4. **Contrôles** automatiques puis second avis (voir « Contrôle de la qualité ») ; on garde 3 à 6 propositions par mot.
5. **Tri dans le curateur** : un onglet « Définitions » montre un mot et ses propositions, avec les touches du tri existant (→ garder, ← écarter, ↑ passer, ↓ annuler, une touche pour retoucher). Le tri se fait au fil de l'eau, par ordre d'utilité (les mots que le moteur place le plus), pas sur 34 000 mots. Les décisions sont versées en ajout seul, comme `decisions.csv` ; les définitions gardées passent en tête et rejoignent les exemples de style du lot suivant : le goût de l'auteur se transmet de lot en lot.
6. **En ligne**, « Utiliser » et « Signaler » classent à leur tour.

**Coût** [estimation ; lots, prix du 02/10/2026] : avec la matière, les exemples et 8 à 12 propositions, environ 52 à 72 $ pour les ≈ 34 000 mots validés avec Sonnet 5.5 (31 à 42 $ avec Haiku 4.5), et 101 à 140 $ pour ≈ 66 000 mots avec Sonnet (59 à 81 $ avec Haiku). Le plafond de 100 $ couvre donc le pilote (≈ 15 $) et le lexique validé avec Sonnet ; passer à 66 000 mots demandera un budget de plus, ou Haiku pour la queue de fréquence.

**Limites.** La matière libre est bruitée (polysémie, relations faibles) : le second avis et le tri la corrigent. L'IA lisse le jeu de mots ; les exemples de l'auteur donnent le ton, pas l'esprit. La porte de qualité mesure le résultat ; si elle échoue, on ajoute des exemples (voies a et c) avant de changer de modèle.

### Ce que cela change

- La recommandation devient : **matière libre + exemples de l'auteur + IA** (voies b et d), **avec, en parallèle, une demande de licence** (voie a) dont les réponses s'ajouteraient comme source `licence`. Les grilles anciennes (voie c) restent une source d'exemples, après sondage.
- Les définitions viennent ainsi d'une base (la matière) et du métier (le style de l'auteur), sans copier personne.

## Décision

**Proposition à valider par l'auteur.**

1. **Écarter** la copie des sites de solutions (source 5) et le Wiktionnaire (#83, CC BY-SA). Aucune donnée venue de ces voies, même « pour exemple » dans l'invite d'une IA.
2. **Voie de départ : matière libre + exemples de l'auteur + IA, hors ligne**, sur le lexique validé (≈ 34 000 mots), puis sur zipf ≥ 2,5 (≈ 66 000) tranche par tranche si la porte tient et si le budget suit.
   - **Matière** : JeuxDeMots (CC0) d'abord, puis TAXREF, le code géographique et FranceTerme ; Wikidata pour les noms propres (point 4). Les téléchargements sont faits par l'auteur ou avec son accord explicite (fichier, source, taille), hors dépôt.
   - **Style** : les définitions de l'auteur, 30 à 40 dans la consigne et quelques exemples choisis par mot.
   - **Modèle** choisi au pilote entre Haiku 4.5, Sonnet 5.5 et Opus 5.5 ; par défaut Sonnet 5.5 en lot, avec second avis de Haiku 4.5.
   - **Budget** : **100 $ au plus, une seule fois**, qui couvrent le pilote (≈ 15 $) et le lexique validé (≈ 52 à 72 $ avec Sonnet). Passer à 66 000 mots demandera un budget de plus, ou Haiku pour la queue de fréquence. Aucun coût récurrent, aucun appel à l'IA pendant l'usage.
   - Aucun mot saisi par un utilisateur ne part chez le fournisseur.
3. **Tri dans le curateur** : un onglet « Définitions », au fil de l'eau et par ordre d'utilité. Les définitions gardées passent en tête et rejoignent les exemples de style du lot suivant.
4. **Noms propres : Wikidata** (CC0), dans le lot C7, par la même chaîne et la même porte.
5. **Licence demandée en parallèle (voie a)** : l'auteur envoie lui-même le courriel type à des auteurs et à des sites (liste privée dans `docs/DEFINITIONS-SOURCES.md`). Aucune donnée n'est prélevée avant un accord écrit ; une réponse positive ajoute une source `licence` ; l'enveloppe maximale est fixée par l'auteur (point de départ : quelques centaines d'euros au total). La voie de départ n'en dépend pas.
6. **Grilles anciennes du domaine public (voie c)** : seulement une source d'exemples de style, après un sondage de un à deux jours. Pas de moisson ; une demande à BnF-Partenariats avant toute reprise de masse.
7. **Banque communautaire** dans le lot C6, avec l'accord des auteurs donné dans les CGU et les règles d'entrée de la source 2.
8. **Licences payantes d'éditeurs de dictionnaires** : pas maintenant. À rouvrir avec des revenus (lot C8).
9. **Toujours des propositions** : l'origine est enregistrée dans le champ `source`, sans être affichée, et rien n'est imposé. Valeurs : `ia`, `communauté`, `wikidata`, `licence`, `auteur` (stockées sans accent : `communaute`). `auteur` désigne ce que la personne qui compose la grille a écrit ou retouché elle-même ; il n'existe que dans les grilles, pas dans la banque.

### Contrôle de la qualité (banque IA et noms propres)

1. **Génération** (`tools/definitions/`, Python sans dépendance externe, dans Docker comme `tools/lexicon`) :
   - entrée par mot : forme normalisée, formes affichées, catégorie et lemme (Lexique), longueur, et la **fiche de matière** (relations JeuxDeMots au-dessus d'un poids ; pour un nom propre, Wikidata ; TAXREF ; code géographique) ;
   - invite : style mots fléchés, jamais le mot ni sa famille, pas de nom propre sauf si le mot en est un, cinq registres (`direct`, `court` ≤ 25 caractères, `periphrase`, `allusif`, `jeu_de_mots`), au plus 45 caractères, réponse « inconnu » permise, sortie structurée ;
   - 8 à 12 candidats par mot, lots de 25 mots, un `lot` daté comme les lots de décisions ([ADR 0005](0005-pipeline-du-lexique-et-decisions.md)) ;
   - **exemples de style** : les définitions de l'auteur (30 à 40 dans la consigne partagée, 3 à 5 par mot selon la catégorie et la longueur), plus d'éventuels exemples licenciés (voie a) ou du domaine public (voie c). Aucune autre définition de tiers dans l'invite.
2. **Contrôles automatiques**, sans modèle :
   - longueur par le port de `wrapDefinition` (`clue_fit.py`) ;
   - réponse absente, famille absente (lemme et préfixe commun), pas de doublon ;
   - mots interdits, caractères admis.
3. **Second avis** par un autre modèle (Haiku 4.5, autre invite) : chaque candidat est jugé juste, ambigu, faux ou inapproprié. Les douteux sont écartés ; on garde 3 à 6 propositions par mot. Un mot sans survivant reste « sans proposition » et part dans la file du curateur.
4. **Pilote**, avant la première tranche : 2 000 mots avec leur matière, trois modèles, même invite, 100 définitions par modèle notées à l'aveugle (25 à 40 minutes) ; environ 15 $. Il mesure aussi ce que la matière apporte : la même série sans matière, sur un modèle.
5. **Échantillon et porte**, par tranche de fréquence (zipf ≥ 4,5 ; 3,5 à 4,5 ; 2,5 à 3,5 ; mots gardés à la main sous 2,5 ; puis « noms propres » pour le lot C7). **Les valeurs ci-dessous sont celles de départ ; l'auteur les règle au lancement** (« on verra »), sans changer la logique : un échantillon à l'aveugle, un seuil, un nouveau tirage après correction :
   - **400 définitions tirées au hasard** parmi celles gardées, **à l'aveugle** (modèle caché, ordre mélangé), notées par l'auteur à une touche dans le curateur : publiable, à retoucher, fausse. Compter 35 à 55 minutes par tranche ;
   - **la tranche sort si au moins 90 % sont jugées publiables** (360 sur 400) **et au plus 2 % sont fausses** (8 sur 400) ;
   - 360 sur 400 donne, à 95 %, un taux réel entre 86,7 % et 92,6 % (intervalle de Wilson) [estimation] : une tranche réellement à 85 % passe une fois sur 500, à 88 % une fois sur 8, à 90 % une fois sur 2, à 92 % dans 94 % des cas ;
   - une tranche refusée est corrigée (invite, filtre) puis testée sur un **nouveau** tirage de 400.
6. **En ligne**, par tranche et par source : propositions affichées, utilisées, signalées, en agrégats sans compte, déclarés dans la page confidentialité ([ADR 0016](0016-mesure-d-usage-sans-cookie.md)). Le seuil de retrait d'une tranche sera fixé au vu des premiers volumes ; en attendant, chaque signalement est lu.

### Stockage et provenance

- **Chaîne et fichiers** : `tools/definitions/` et `data/definitions/` sont privés (à ajouter à `tools/public/prive.txt`, où `docs/DEFINITIONS-SOURCES.md` figure déjà). Les fichiers de matière téléchargés (JeuxDeMots, TAXREF…) et les sorties brutes des lots (JSONL) sont gardés hors dépôt ; leurs empreintes dans un fichier de verrou, comme `sources.lock.json` ; les décisions de l'auteur (notes, tri du curateur, rejets) dans un fichier versionné en **ajout seul**, comme `decisions.csv` ([ADR 0005](0005-pipeline-du-lexique-et-decisions.md)).
- **Base** : une table `definition_bank` (migration additive) : `lang`, `word` (forme normalisée), `text` (120 caractères au plus, la limite de l'éditeur), `source` (`ia`, `communaute`, `wikidata` ou `licence`), `style` (`direct`, `court`, `periphrase`, `allusif`, `jeu_de_mots`), `lot`, `model`, `status` (`publiee`, `validee` par l'auteur au tri, `retiree`), `contributor_id` (communauté seulement, suppression en cascade). Unicité sur (`lang`, `word`, `text`), index sur (`lang`, `word`). Chargée au déploiement comme le lexique. Toute nouvelle donnée porte sa langue (ADR 0017).
- **Dans une grille conservée** : un champ `definition_sources` (JSON `{position: source}`, migration additive, défaut `{}`), clé identique à celle de `definitions` ([ADR 0012](0012-grille-modifiable.md)). Une position absente vaut `auteur`, ce qui couvre tout l'existant. Une définition écrite ou retouchée par l'utilisateur passe à `auteur` ; une proposition reprise telle quelle garde sa source. **Seul `auteur` peut entrer plus tard dans la banque communautaire.**
- **API** : les propositions d'un mot sont renvoyées avec celles de #91, dans l'ordre : dictionnaires de l'utilisateur, définitions au statut `validee`, communauté, licence, Wikidata (noms propres), IA. Toute erreur nouvelle porte un code `reason` stable.

### Affichage : toujours des propositions

- **Dans l'éditeur** : jusqu'à 5 propositions par mot, celles qui tiennent dans la case (`wrapDefinition`) d'abord, chacune avec un bouton « Utiliser », comme #91, sans pastille d'origine. Un bouton « Signaler » retire une proposition. Le champ `style` permettra plus tard de régler la difficulté des définitions.
- **À la génération** : la meilleure proposition qui tient est pré-remplie, avec un réglage pour désactiver. Une définition pré-remplie reste marquée « proposée » jusqu'à ce que l'utilisateur la valide ou la retouche ; l'éditeur compte celles qui restent à relire ; l'export PDF avertit, sans bloquer.
- **Pas de mention d'origine** : l'auteur a refusé la mention « proposée par une IA » (03/10/2026), à l'écran comme dans les métadonnées du PDF (analyse AI Act à la source 1). La source est enregistrée, pas affichée. Aucune proposition n'est jamais présentée comme exacte ou vérifiée.

### Ordre de déploiement

1. **Valider cette ADR** (voie, budget). La notation se règle au lancement.
2. **Sans attendre, en parallèle** : l'auteur envoie ses demandes de licence (voie a) ; il télécharge, ou autorise le téléchargement de, JeuxDeMots par relations (≈ 0,4 Go pour commencer).
3. **Pilote** : deux à trois jours de travail (fiches de matière, invite, trois modèles), environ 15 $, 25 à 40 minutes de notation. Il choisit le modèle et l'invite, et mesure ce que la matière apporte.
4. **Tranches du lexique validé**, une par une, chacune derrière sa porte, avec le tri du curateur au fil de l'eau. Le lot C2 est terminé quand toutes les tranches du lexique validé ont passé leur porte et qu'une grille générée sort avec ses définitions, au taux de couverture mesuré (voir Conséquences). En parallèle, l'éditeur : propositions multiples, pré-remplissage, `definition_sources`.
5. **Sondage des grilles anciennes** (voie c) : un à deux jours, quand la chaîne tourne.
6. **Lot C7** : noms propres par Wikidata, avec la même porte.
7. **Lot C6** : banque communautaire, quand les CGU, la modération et un premier volume de grilles publiées existent.
8. **Revue** après trois mois d'usage : taux d'utilisation par source, signalements, style, réponses aux demandes de licence. Les licences d'éditeurs (source 4) se rouvrent à ce moment si la porte de style échoue.

### Ce qui ferait changer la décision

- Une des deux premières tranches (les plus courantes) échoue à la porte, même après deux corrections de l'invite : ajouter des exemples (voies a et c), essayer Opus 5.5 ; sinon se limiter aux 12 963 mots les plus courants et s'appuyer sur la communauté. **Jamais la copie.**
- Un accord écrit, abordable, avec un verbicruciste ou un éditeur : la source `licence` entre dans la banque, et ses définitions passent devant celles de l'IA.
- La matière n'apporte rien au pilote (la série sans matière fait aussi bien) : on garde les exemples de l'auteur et on abandonne les fiches, ce qui réduit le coût.
- Une couverture qui reste sous 70 % des mots placés malgré la curation : une ADR séparée sur la génération à la demande, qui apporte un coût récurrent et rouvre l'AI Act.

## Conséquences

- Aucun partage à l'identique à craindre : sorties de l'IA cédées au client, JeuxDeMots et Wikidata en CC0, TAXREF en Licence Ouverte. Des mentions de source vont à la page des crédits (JeuxDeMots le demande, TAXREF l'impose). La banque ne traite aucune donnée personnelle (des mots du dictionnaire seulement), ce que le registre ([RGPD.md](../RGPD.md)) consignera. La banque communautaire ajoutera un traitement avec le lot C6.
- Le coût est unique et plafonné, et la banque est un fichier : la dépendance au fournisseur ne joue que pour la **regénérer**.
- **Les demandes de licence** coûtent du temps à l'auteur (courriels, réponses) et peuvent n'aboutir à rien : la voie de départ n'en dépend pas.
- **Sans licence, le style vient de l'auteur** : la qualité dépend du nombre et de la variété de ses exemples (question 4).
- La banque grandit avec la curation : chaque mot validé de plus reçoit ses définitions par un lot incrémental. Un mot qu'elle ne sait pas définir sert d'indice au curateur.
- **Couverture partielle tant que la curation n'est pas finie** (jusqu'à un mot sur trois hors banque en mode par défaut). Mesure à ajouter au harnais, à côté de `unknown_share` : `banked_share`, la part des mots placés qui ont au moins 3 propositions ; cible ≥ 95 % à la fin de la curation. Le score de l'orchestrateur du lot C1 peut aussi compter les mots sans proposition. Les mots sans proposition restent vides pour l'utilisateur.
- **Style plus lisse** que celui d'un verbicruciste : l'auteur de la grille et, plus tard, la communauté corrigent. Les propositions ne sont jamais « authentiques » : on ne le prétend pas.
- La banque IA n'est probablement pas protégeable par le droit d'auteur **[avocat]** : elle reste privée, servie mot par mot.
- **Temps de l'auteur** : le protocole de notation est une proposition de départ, réglée au lancement (« on verra ») : taille de l'échantillon, seuil, séances. Avec les valeurs proposées, environ 3 à 5 heures de notation au total, à regrouper (une touche par définition, dans le curateur), plus le tri au fil de l'eau, qui n'a pas de fin fixée.
- À faire :
  - migration additive (`definition_bank`, `definition_sources`) ;
  - un onglet « Définitions » dans le curateur, pour la notation et le tri à une touche ;
  - ajouter `tools/definitions/` et `data/definitions/` à `tools/public/prive.txt` (`docs/DEFINITIONS-SOURCES.md` y est déjà) ;
  - mettre à jour [LICENCES.md](../LICENCES.md) (sorties d'IA, Wikidata, JeuxDeMots, TAXREF), les crédits, la page confidentialité (mesure des propositions), le CHANGELOG et le lot C2 de la roadmap (lien vers cette ADR, critère de fin).
- ADR à venir : « grilles publiques et liens de partage » (licence des CGU et modération de la banque communautaire) ; éventuellement « génération à la demande ».

## Questions ouvertes pour l'auteur

1. Valide-t-il la voie (matière libre, ses exemples, IA ; licences demandées en parallèle ; Wikidata pour les noms propres ; communauté ensuite) et le plafond de 100 $ une fois ?
2. *(Réglée le 03/10/2026 : pas de mention « proposée par une IA ».)*
3. *(Réglée le 03/10/2026 : la notation se règle au lancement, « on verra ».)*
4. Combien de définitions a-t-il écrites (ses dictionnaires), et peut-il en fournir 30 à 40, variées (types de mots, registres), comme exemples de style ? Peut-il en écrire davantage au besoin ?
5. Les demandes de licence : quelle enveloppe maximale (point de départ proposé : quelques centaines d'euros au total), et sous quel nom écrit-il (le sien ou celui de sa société) ?
6. Connaît-il des verbicrucistes ou des sites de solutions ? Sinon l'association citée dans le document privé est la porte d'entrée.
7. Autorise-t-il le téléchargement de JeuxDeMots (≈ 0,4 Go pour commencer, jusqu'à 1,3 Go), sur son Mac et hors dépôt ?
8. Banque communautaire : accord par les CGU seules, ou case à cocher à la publication ? Retrait avec la grille (simple, proposé ici) ou licence irrévocable (déconseillée) ?
9. Les mots sans proposition (jusqu'à un tiers aujourd'hui, en mode par défaut) : les laisser vides, orienter le moteur vers les mots de la banque (lot C1), ou, plus tard, générer à la demande avec un coût récurrent ?
10. *(Réglée le 03/10/2026 : cette ADR reste publique, sans nommer le concurrent ni aucun site ; la liste des sites à contacter est dans `docs/DEFINITIONS-SOURCES.md`, privé.)*
11. Si le contrat de licence engage une somme qui dépasse le symbolique : faire relire le texte par un avocat en propriété intellectuelle ?

## Sources

Consultées les 02 et 03/10/2026.

**IA : prix, conditions, AI Act**
- Anthropic, tarifs : https://platform.claude.com/docs/en/about-claude/pricing
- Anthropic, API de lots (limites, cache, conservation) : https://platform.claude.com/docs/en/build-with-claude/batch-processing
- Anthropic, conditions commerciales (version du 17/06/2025) : https://www.anthropic.com/legal/commercial-terms
- AI Act, règlement (UE) 2024/1689, art. 50 : https://eur-lex.europa.eu/eli/reg/2024/1689/oj
- Commission européenne, lignes directrices sur la transparence : https://digital-strategy.ec.europa.eu/en/policies/guidelines-ai-transparency-obligations
- Report au 02/12/2026 et lignes directrices finales (secondaire) : https://www.faegredrinker.com/en/insights/publications/2026/7/eu-ai-act-commission-confirms-transparency-code-of-practice-as-adequate-and-publishes-final-version-of-its-guidelines-on-transparency-obligations
- Code de bonnes pratiques sur le marquage (secondaire) : https://www.reedsmith.com/our-insights/blogs/viewpoints/102nbz0/transparency-obligations-for-ai-generated-content-the-code-of-practice-adequacy/
- Génération de définitions de mots croisés par un modèle de langage (jalon académique) : https://arxiv.org/html/2404.06186

**Données**
- Wikidata, licence : https://www.wikidata.org/wiki/Wikidata:Licensing
- JeuxDeMots : https://fr.wikipedia.org/wiki/JeuxDeMots ; fichiers : https://www.jeuxdemots.org/JDM-LEXICALNET-FR/ ; README (licence, types de relations, format) : https://www.jeuxdemots.org/JDM-LEXICALNET-FR/JEUXDEMOTS-README.txt ; licence en 2008 : https://linuxfr.org/news/jeuxdemots-un-jeu-en-ligne-pour-produire-des-donnees-lexicales
- TAXREF : https://www.data.gouv.fr/datasets/referentiel-taxonomique-taxref-1 ; code officiel géographique : https://www.data.gouv.fr/datasets/code-officiel-geographique-1 ; FranceTerme : https://www.data.gouv.fr/datasets/base-franceterme-termes-scientifiques-et-techniques-1
- Lexèmes de Wikidata (état en 2020) : https://aclanthology.org/2020.ldl-1.12/
- WOLF : https://almanach.inria.fr/software_and_resources/WOLF-en.html
- Oxford Languages (repère de prix) : https://developer.oxforddictionaries.com/signup-enterprise et https://developer.oxforddictionaries.com/faq
- Dicolink : https://www.dicolink.com/api/tarifs et https://www.dicolink.com/api/documentation
- Jeu de définitions françaises de la recherche (WebCrow) : https://arxiv.org/html/2311.15626v2
- Rémunération indicative d'un verbicruciste (secondaire) : https://entreprises-actualite.com/decouvrez-le-salaire-des-verbicrucistes/ et https://www.passion-entrepreneur.com/5347-verbicruciste-022024.html

**Grilles anciennes**
- Gallica, conditions d'utilisation (réutilisation non commerciale libre, commerciale sous licence) : https://gallica.bnf.fr/accueil/fr/html/conditions-dutilisation-de-gallica ; sélection « Les mots croisés vintage de Gallica » : https://gallica.bnf.fr/accueil/fr/html/les-mots-croises-vintage-de-gallica (ces pages refusent la lecture automatique ; contenus relevés par extraits de recherche, secondaire)
- RetroNews et BnF-Partenariats (secondaire) : https://scinfolex.com/2016/04/03/retronews-ou-la-logique-du-premium-appliquee-au-domaine-public/ et https://www.bnf.fr/en/retronews-bnf-press-website
- Durée de la protection, CPI [L.123-1 à L.123-12](https://www.legifrance.gouv.fr/codes/id/LEGISCTA000006161638), dont [L.123-3](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006278941) (œuvres anonymes, pseudonymes, collectives) et [L.123-9](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006278951) (prorogation de 1939-1948)

**Droit**
- CPI, [L.112-1](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006278873), [L.122-4](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006278911), [L.131-3](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006278958), [L.341-1](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006279245), [L.342-1](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006279247) à [L.342-6](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006069414/LEGISCTA000006161661/), [L.343-4](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032655054)
- CJUE, *Infopaq*, C-5/08 (16/07/2009) : https://eur-lex.europa.eu/legal-content/FR/ALL/?uri=CELEX:62008CJ0005
- CJUE, *Brompton Bicycle*, C-833/18 (11/06/2020) : https://eur-lex.europa.eu/legal-content/FR/ALL/?uri=CELEX:62018CJ0833
- CJUE, *British Horseracing Board*, C-203/02 (09/11/2004) : https://eur-lex.europa.eu/legal-content/FR/ALL/?uri=CELEX:62002CJ0203
- CJUE, *Fixtures Marketing* c. *OPAP*, C-444/02 (09/11/2004) : https://eur-lex.europa.eu/legal-content/FR/ALL/?uri=CELEX:62002CJ0444
- CJUE, *Ryanair*, C-30/14 (15/01/2015) : https://eur-lex.europa.eu/legal-content/FR/ALL/?uri=CELEX:62014CJ0030 ; commentaire : https://www.bomel-avocat.fr/protection-de-la-base-de-donnees-par-contrat-a-defaut-de-droit-de-propriete-intellectuelle-cjue-15-janvier-2015/
- CJUE, *CV-Online Latvia*, C-762/19 (03/06/2021) : https://eur-lex.europa.eu/legal-content/FR/ALL/?uri=CELEX:62019CJ0762 ; commentaire : https://legalblogs.wolterskluwer.com/copyright-blog/access-to-information-and-competition-concerns-enter-the-sui-generis-rights-infringement-test-the-cjeu-redefines-the-database-right/
- Cass. 1re civ., 12/11/2015, n° 14-14.501 : https://www.legifrance.gouv.fr/juri/id/JURITEXT000031478862/
- CA Paris, pôle 5, ch. 1, 02/02/2021, *Leboncoin* c. *Entreparticuliers* (secondaire) : https://www.legalis.net/jurisprudences/cour-dappel-de-paris-pole-5-ch-1-arret-du-2-fevrier-2021/ ; commentaires : https://www.uggc.com/les-annonces-immobilieres-du-site-leboncoin-fr-constituent-une-base-de-donnees-protegee/ et https://bressand-avocat.fr/2021/lextraction-des-annonces-du-site-leboncoin-est-illicite/
- CA Paris, pôle 5, ch. 2, 16/12/2022, parasitisme et copie de site (secondaire) : https://iredic.fr/2023/01/26/cour-dappel-de-paris-pole-5-ch-2-arret-du-16-decembre-2022-parasitisme-copie-de-site-internet/
- Cass. com., 26/06/2024, parasitisme économique (secondaire) : https://taoma-partners.fr/blog/2024/08/20/nettoyage-de-printemps-la-cour-de-cassation-fait-le-menage-dans-le-parasitisme-economique/

**Dans le dépôt**
- [Étude IA](../ETUDE-GRILLES-THEME-IA.md) (§4.2, §4.5, §8), [LICENCES.md](../LICENCES.md), [LEXICON.md](../LEXICON.md), [ADR 0005](0005-pipeline-du-lexique-et-decisions.md), [ADR 0012](0012-grille-modifiable.md), [ADR 0016](0016-mesure-d-usage-sans-cookie.md), [ADR 0020](0020-suggestions-et-ajouts-au-lexique.md), [ADR 0021](0021-moteur-prive-site-public.md), [mesures du moteur](../../backend/benchmarks/README.md)
- Liste des sites, associations et éditeurs à contacter, avec leurs voies de contact : `docs/DEFINITIONS-SOURCES.md` (document privé, absent du dépôt public)
