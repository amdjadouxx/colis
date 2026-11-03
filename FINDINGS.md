# Test du concept — résultat

Date : 3 novembre 2026. Reproductible : `node tools/concept-test/run.js` (sort en code 1).

## Verdict : le concept ne passe pas son propre test

Seuils posés **avant** exécution, dans `tools/concept-test/run.js`.

| Critère | Résultat | Seuil | |
|---|---|---|---|
| Couverture du catalogue | 93 % (66/71 lignes) | ≥ 80 % | PASS |
| Compression médiane (lignes → catégories) | 17 % | ≥ 20 % | ÉCHEC |
| **Paniers à fusion inter-articles** | **2/12** | ≥ 33 % | **ÉCHEC** |
| Largeur de fourchette médiane | 0 % | ≤ 25 % | PASS |
| Paniers où grouper rapporte ≥ 5 € | 7/12 | ≥ 33 % | PASS |

## Le chiffre qui tranche

Sur les 2278 paires d'articles possibles du catalogue, **5 peuvent fusionner** — 0,22 % :

```
Portefeuille, porte-cartes ~ Coque de téléphone      [4202.32]
Montre à quartz            ~ Montre connectée        [9102.12]
Coque de téléphone         ~ Support de téléphone    [3926.90]
Drone, engin télécommandé  ~ Jouet, peluche, puzzle  [9503.00]
Mug, tasse, verre          ~ Assiette, plat          [6911.10, 6912.00]
```

Hors ces cinq cas, **catégories = nombre de types d'articles distincts**. Le coût est donc `n × 5 €`, un calcul que n'importe qui fait de tête. Le produit entier se réduit à cinq faits : une liste, pas un logiciel.

## Deux de mes hypothèses sont fausses

**« La fourchette est le différenciateur honnête. »** Fausse en pratique. 44 articles sur 68 portent plusieurs codes candidats, mais un article seul dans sa famille compte pour 1 catégorie quelle que soit sa fibre. La fourchette ne s'ouvre que sur les 5 paires ci-dessus : largeur médiane 0 %.

**« Grouper fait économiser. »** Vrai contre un contrefactuel que personne ne pratique. Le gain de 7/12 paniers est mesuré contre « une commande par ligne de panier ». Les acheteurs groupent déjà spontanément — le panier moyen a monté de 30 % chez Temu en un mois, sans outil.

## Erreur de mesure corrigée en cours de test

La première version mesurait la compression contre le nombre d'articles **distincts du catalogue**, ce qui est nul par construction puisque les articles ont des codes quasi disjoints. Mesure refaite contre le nombre de **lignes de panier**, ce que l'utilisateur voit. Le verdict n'a pas changé.

## Bugs réels trouvés par le corpus

Le test a servi à quelque chose même en échouant — il a trouvé trois défauts que les tests unitaires ne voyaient pas :

1. Pluriels non rabattus : « t-shirt**s** » ne matchait pas. Corrigé dans `normalize`.
2. Libellés indexés en entier : « T-shirt, débardeur » ne matche aucun titre réel. Corrigé en éclatant sur les virgules.
3. Mots outils exigés : « Support **de** téléphone » ratait « Support téléphone voiture ». Corrigé par une liste de mots outils.

Couverture passée de 86 % à 93 % grâce à ces trois correctifs.

## Trous de catalogue identifiés

Non reconnus par le corpus : humidificateur, aspirateur, distributeur de croquettes, machine à coudre. Familles manquantes : petit électroménager, animalerie, machines.

## Ce qui reste valide

- Le moteur de partition est correct et exact (23 tests, dont un cas qui prouve qu'un glouton se trompe).
- Les barèmes versionnés survivent à la réforme 2028.
- Le catalogue couvre 93 % de titres produits réels et bruités.

Ces briques sont bonnes. Le problème n'est pas leur qualité, c'est que **le problème qu'elles résolvent est trop facile pour mériter un outil.**

## Conséquence

Ne pas construire l'export de panier ni le travail de design par-dessus. Ce serait bâtir sur un socle que son propre test rejette.

La compression ne devient réelle que sur des paniers à beaucoup d'articles dans des familles qui se recouvrent — c'est-à-dire des catalogues de vendeurs, pas des paniers de particuliers. C'est la piste B2B, écartée faute de temps pour la prospection.
