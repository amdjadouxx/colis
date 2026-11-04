# Contribuer

## Démarrer

```bash
npm install
npm run check        # toute la batterie, environ une minute
```

`npm run check` enchaîne : lint, tests, vérification des types, contrôles négatifs, équivalence du bundle, et extraction en navigateur. Si une seule étape échoue, la contribution n'est pas prête.

Les tests d'extraction demandent Chrome ou Edge installé localement. Ils sont volontairement hors CI pour ne pas dépendre d'un binaire fourni par le runner.

## Ce que le projet attend d'un changement

**Une hypothèse se vérifie avant de construire dessus.** Pour chaque brique : écrire la sonde qui la réfuterait, la lancer, puis seulement coder. Plusieurs modules de ce dépôt ont dû être repris parce que cette règle n'avait pas été suivie.

**Un bug corrigé reçoit un test qui porte son nom.** Un commentaire explique *pourquoi* le bug existait, pas ce que fait le code. La plupart des commentaires de ce dépôt sont des constats de terrain, pas des paraphrases.

**Un bug connu doit faire rougir la suite.** `tools/negative-control` réintroduit douze bugs sur une copie du dépôt et vérifie que les tests échouent à chaque fois. Un correctif significatif s'accompagne d'une mutation correspondante.

**Les identifiants restent en ASCII.** Seul le texte destiné à l'utilisateur porte des accents. Un renommage automatique a déjà transformé une propriété d'API en identifiant accentué.

## Ajouter un article au catalogue

Les articles vivent dans `packages/catalog/data/` :

- `catalog.json` — base
- `catalog-extra.json` — familles ajoutées après une sonde de couverture
- `aliases-en.json` — synonymes anglais

Un article déclare ses sous-positions candidates. **S'il en a plusieurs, il doit dire pourquoi** dans `undetermined` : un test vérifie cette correspondance dans les deux sens.

Éviter les synonymes d'un seul mot courant. `mirror` classait les autoradios à fonction *Mirror Link* en miroirs, et `store` classait les noms de boutiques en rideaux. Un test de garde liste les chaînes de navigation qui ne doivent résoudre vers rien.

Mesurer l'effet sur des titres réels :

```bash
npm run probe:coverage chemin/vers/titres.csv
```

## Modifier un barème

`packages/rules` contient les barèmes datés et sourcés. Le barème est de la **donnée**, pas du code : un nouveau régime est un objet de plus, le moteur ne change pas.

Tout montant ajouté cite sa source officielle. Les exemples publiés par la douane servent de tests de conformité.

## Style

Commentaires et documentation en français, identifiants en anglais ou en français sans accent. Le `.editorconfig` et le lint font le reste. Aucune dépendance de production : le moteur doit tourner tel quel dans un navigateur comme dans Node.
