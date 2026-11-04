# Aspect juridique

État au 3 novembre 2026. **Je ne suis pas juriste.** Ce document sert à préparer une relecture par quelqu'un qui l'est, pas à la remplacer. Chaque point indique ce qui est vérifié, ce qui est raisonné, et ce qui reste ouvert.

Rien n'est publié à ce jour. Tous les points « bloquants » ci-dessous le sont pour une mise en ligne, pas pour l'usage local.

---

## 1. Nature du service — bloquant

L'outil affiche des montants de droits de douane et des sous-positions tarifaires. Le risque n'est pas d'avoir tort sur un chiffre, c'est que la page **se lise comme un classement douanier officiel**.

Ce qui est déjà en place, vérifié dans le rendu :
- en-tête : « Outil d'essai, pas un classement douanier officiel »
- pied de page : « Les codes sont les classements usuels de ces articles, pas un classement officiel : seule la douane tranche »
- chaque ligne indéterminée affiche *pourquoi* elle l'est
- le compte est rendu en fourchette quand il ne peut pas être tranché

Ce qui manque :
- la mention doit rester visible **sans défilement** sur mobile
- l'extension doit porter la même mention dans sa fenêtre (elle l'a en pied, à remonter)
- ne jamais employer « droits de douane dus » au présent de l'indicatif sans « estimation »

## 2. Responsabilité en cas d'erreur — ouvert

**Question non tranchée, et mes recherches ne l'ont pas résolue.** Aucune source trouvée sur la portée réelle d'une clause limitative pour un outil d'estimation gratuit en droit français.

Ce qui est raisonnablement établi :
- service gratuit et sans contrat → obligation de moyens, pas de résultat
- une clause limitative ne couvre jamais la faute lourde ni le dol
- l'exposition réelle dépend du préjudice démontrable, qui est ici faible : un acheteur qui renonce à un achat sur la foi d'un chiffre faux perd peu

La vraie atténuation n'est pas juridique, elle est technique, et elle est déjà construite :
- les lignes non reconnues sont **affichées**, avec la mention que le total est sous-estimé
- l'incertitude de classement est explicite au lieu d'être masquée par un chiffre unique

**À faire valider par un juriste** avant mise en ligne.

## 3. RGPD — architecture décidée, et vérifiée

Un panier collé peut contenir un nom, une adresse, un numéro de commande. Décision d'architecture : **rien ne sort de la machine.**

Vérifié deux fois sur la page construite :
- audit statique : aucun `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, import dynamique, script ou police externe, `localStorage`, cookie
- preuve empirique : page relancée avec tout le DNS mappé sur `0.0.0.0`, **résultat identique**

Conséquence : l'éditeur ne traite aucune donnée personnelle. Pas de base légale à fournir, pas de durée de conservation, pas de registre, pas de bandeau.

**Cette propriété est la plus fragile du projet.** Elle disparaît à la première ligne de télémétrie. Deux garde-fous à mettre si le projet avance :
- un test automatisé qui échoue si un appel réseau apparaît dans le bundle
- le Worker `apps/api` existe et n'est pas déployé : s'il l'était, il recevrait les paniers et **tout ce paragraphe tomberait**

Si des statistiques de fréquentation deviennent nécessaires : Cloudflare Web Analytics est annoncé sans cookie, donc *a priori* sans bandeau — **à confirmer, pas à supposer.**

## 4. Extension et CGU des plateformes

Configuration retenue, et c'est à peu près la plus prudente possible :
- l'utilisateur lit **son propre** panier, dans **sa propre** session déjà ouverte
- lecture seule, aucune automatisation, aucun accès en masse, aucun serveur
- **aucun contournement de protection technique** — c'est le point qui compte le plus
- permissions `activeTab` + `scripting`, **aucun hôte déclaré** : l'accès n'existe que pour l'onglet où l'utilisateur clique, et seulement à ce moment

Ce que disent les sources consultées :
- le scraping n'est pas illégal en soi en France ; il le devient en violant des CGU, la propriété intellectuelle ou le RGPD
- les CGU sont un contrat d'adhésion opposable à l'utilisateur qui les a acceptées
- contourner une protection technique ou s'authentifier frauduleusement peut basculer au pénal (accès frauduleux à un STAD). **Ce n'est pas notre cas.**

Risque résiduel : **contractuel, et porté par l'utilisateur**, pas par l'éditeur. À vérifier avant publication : les CGU de Shein, Temu et AliExpress interdisent-elles explicitement les extensions ou l'extraction automatisée ? Non vérifié à ce jour.

Argument à garder en tête : lire une page que l'utilisateur a déjà sous les yeux n'est pas de l'extraction de données, c'est de la lecture. La frontière n'a pas été tranchée par un juge en France.

## 5. Marques — bloquant

Shein, Temu, AliExpress sont des marques déposées.

- **jamais** dans le nom du produit, le nom de l'extension, le nom de domaine, l'icône
- usage descriptif seulement : « fonctionne sur les sites de vente à distance », pas « l'outil Shein »
- aucune suggestion d'affiliation, de partenariat ou d'approbation
- ne pas reprendre leurs chartes graphiques ni leurs logos

État actuel : conforme. L'extension s'appelle « Frais par catégorie », aucune marque dans le manifeste ni dans l'interface. **À tenir** : c'est la tentation naturelle au moment de chercher du trafic.

## 6. Mentions légales — bloquant à la publication

Obligation portée par l'**article 1-1 de la LCEN**, modifié par la loi SREN du 21 mai 2024 (l'ancien article 6, III a été déplacé).

Éditeur **non professionnel** : régime d'anonymat possible (article 1-1, II), à deux conditions cumulatives :
1. communiquer son identité à l'hébergeur
2. afficher sur le site les coordonnées de l'hébergeur

Les sources divergent sur un point : un simple lien vers le site de l'hébergeur ne suffirait pas. Prendre l'option prudente, afficher les coordonnées en clair.

Sanction prévue à l'article 1-2 : jusqu'à **un an d'emprisonnement et 75 000 € d'amende** pour la personne physique publiant le site. C'est le point le plus lourd de ce document, et le plus simple à régler.

## 7. Boutique d'extensions

Non applicable tant que l'extension est chargée non empaquetée en local. Si dépôt sur le Chrome Web Store :
- règle du « single purpose » : l'extension en a un seul, c'est conforme
- justification de chaque permission : `activeTab` et `scripting` sont le minimum pour lire un panier, c'est défendable
- déclaration de confidentialité obligatoire, même sans collecte. Elle serait courte et vraie : aucune donnée collectée, aucune transmise
- une politique de confidentialité publique implique de renoncer partiellement à l'anonymat du point 6

## 8. Données tierces

Le jeu de données Shein public (10 000 titres) a servi **uniquement à mesurer** la couverture du catalogue. Rien n'en a été copié dans le dépôt : le lexique anglais a été écrit de connaissance produit. Le fichier n'est plus présent.

**Si un jour des données en sont tirées**, vérifier sa licence d'abord. Non fait, parce que non nécessaire à ce stade.

La nomenclature TARIC vient d'un mirror communautaire non officiel (`rousseauxy/taric-opendata`, auto-syncé depuis CIRCABC/DG TAXUD). Il sert de référence de vérification, pas de source de classement.

---

## Récapitulatif avant toute mise en ligne

| Point | État |
|---|---|
| Mentions légales LCEN art. 1-1 | **à faire** |
| Clause de non-responsabilité relue par un juriste | **à faire** |
| CGU des trois plateformes lues | **à faire** |
| Marques tenues hors du nom et du domaine | conforme, à tenir |
| Aucune sortie réseau | vérifié, à protéger par un test |
| Mention « pas un classement officiel » visible sans défilement | partiel |
| Licence du jeu de données si réemploi | sans objet à ce jour |

Trois choses à faire, aucune n'est difficile. La plus coûteuse est la relecture juridique, et c'est celle qui couvre le risque le plus lourd.
