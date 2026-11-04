# À traiter avant tout déploiement

## Méthode de travail (règle posée le 3 novembre 2026)

Valider chaque hypothèse par un petit test **avant** de développer dessus. Pas l'inverse. Un module construit sur une supposition non vérifiée est du travail à refaire.

Contrôle : pour chaque brique, écrire la sonde qui la réfuterait, la lancer, puis seulement coder. Le but est un truc solide et fiable — déployé une fois, plus jamais à toucher.

## Juridique

Traite en detail dans [juridique.md](juridique.md), qui liste ce qui est verifie, ce qui est raisonne et ce qui reste ouvert.

Trois actions bloquantes avant toute mise en ligne : mentions legales (LCEN art. 1-1), relecture de la clause de non-responsabilite par un juriste, lecture des CGU des trois plateformes.


## Produit, dans l'ordre

1. Fiabiliser le parseur de panier collé — formats réels, cas ambigus (lignes sans prix mêlées à des lignes avec prix).
2. Trous de catalogue : petit électroménager, animalerie, machines.
3. Interface collage, puis design.
4. Seuil d'arrêt chiffré, écrit avant tout déploiement.
