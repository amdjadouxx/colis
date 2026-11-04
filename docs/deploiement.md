# Cadre de déploiement

Rien n'est publié à ce jour. Ce document dit **ce qui bloque**, **dans quel ordre**, et **comment on saura si ça valait le coup**.

Il ne dit pas « déploie ». Cette décision t'appartient, et deux des portes ci-dessous ne peuvent pas être franchies par moi.

---

## Porte 1 — Technique

Une seule commande, qui doit passer entièrement :

```
npm run check
```

Elle enchaîne : 52 tests unitaires et d'invariants · 9 contrôles négatifs sur copie · équivalence bundle/sources · 3 pages d'extraction en navigateur.

| Contrôle | Ce qu'il garantit | État |
|---|---|---|
| `npm test` | moteur, parseur, barèmes, catalogue, absence de réseau | **52/52** |
| `npm run check:negative` | les bugs connus font bien rougir la suite | **9/9** |
| `npm run verify:local` | la page livrée calcule comme les sources | **OK** |
| `npm run test:extension` | le script réellement injecté lit la bonne zone | **3/3** |

Franchie.

## Porte 2 — Juridique

Détail dans [juridique.md](juridique.md). Trois actions, aucune difficile, **aucune que je puisse faire à ta place**.

1. **Mentions légales.** Modèle en annexe A. Régime d'anonymat possible pour un éditeur non professionnel : identité communiquée à l'hébergeur, coordonnées de l'hébergeur affichées sur le site. Sanction encourue sans elles : 1 an et 75 000 €.
2. **Clause de non-responsabilité relue par un juriste.** Modèle en annexe B. La question de fond reste ouverte : mes recherches n'ont rien donné sur la portée réelle d'une clause limitative pour un outil d'estimation gratuit en droit français.
3. **CGU des trois plateformes lues**, pour savoir si elles interdisent explicitement les extensions. Risque contractuel, porté par l'utilisateur, mais à connaître avant de l'encourager.

**Non franchie.**

## Porte 3 — Produit

Le test du concept est reproductible : `npm run test:concept`. Il passe 4 critères sur 5, et **échoue sur le critère décisif** : 2 paniers sur 12 présentent une fusion entre articles différents. Hors les 5 paires du catalogue sur 2278 possibles, le nombre de catégories égale le nombre de types d'articles, donc le total vaut `n × 5 €`.

Ce que ça veut dire sans détour : **le total n'apprend rien.** Ce qui a de la valeur, et que personne ne calcule de tête, c'est le classement par ligne du surcoût effectif — +417 % sur une babiole à 1,20 €, +25 % sur un jean à 19,99 €.

Déployer revient donc à parier que ce classement intéresse quelqu'un. Ce pari n'a jamais été testé auprès d'un humain.

**Décision ouverte.**

---

## Seuil d'arrêt — à fixer AVANT, sinon ce n'est pas un test

Sans seuil écrit à l'avance, « déployer pour voir » n'est pas une expérience, c'est juste un déploiement qu'on n'ose pas arrêter.

Proposition, à valider ou à remplacer :

- **Fenêtre** : 30 jours à compter de la mise en ligne.
- **Succès** : 200 visiteurs uniques **et** 50 analyses de panier effectivement lancées.
- **Échec** : en dessous, on gèle. Pas de refonte, pas de « encore un mois ».
- **Mesure** : Cloudflare Web Analytics, sans cookie — *à confirmer, pas à supposer*. Si la confirmation échoue, aucune mesure, donc aucun déploiement : un test sans instrument n'est pas un test.

Contexte pour calibrer : entre juin et juillet 2026 les volumes ont chuté de 50 % chez Temu, 43 % chez DHGate, 37 % chez AliExpress, 15 % chez Shein (étude Joko, panel de 1,5 M de consommateurs), pendant que le panier moyen montait de 30 % chez Temu. L'audience se contracte, et elle a déjà appris à grouper seule.

---

## Ce qui se déploie, et ce qui ne se déploie pas

| Composant | Déployer ? |
|---|---|
| `apps/web` — page statique | oui, Pages. Aucun appel réseau. |
| `apps/extension` — extension | local non empaquetée d'abord. Le store vient après, et implique de renoncer à l'anonymat du point 1. |
| `apps/api` — Worker | **non.** Il recevrait les paniers, et tout le raisonnement RGPD de juridique.md tomberait. Il reste utile hors ligne et en test. |

Ordre : page d'abord, extension ensuite, API jamais sans décision explicite et nouvelle analyse juridique.

## Après la mise en ligne

- `tools/rules-watch` n'a **jamais tourné** : sans clé LinkUp, rien ne te préviendra si un montant change. À brancher, ou à remplacer par une relecture manuelle datée tous les mois.
- `tools/taric-sync` écrit `verified: false` : les 179 sous-positions ne sont pas confrontées aux libellés officiels. L'extraction de l'archive n'est pas branchée.
- La réforme de l'union douanière européenne de 2028 remplacera le barème. C'est prévu : un objet de plus dans `packages/rules`, le moteur ne bouge pas.

---

## Annexe A — mentions légales, à compléter

> **Éditeur** — Ce site est édité à titre non professionnel. Conformément à l'article 1-1, II de la LCEN, l'éditeur a communiqué les éléments d'identification à son hébergeur.
>
> **Hébergeur** — `[raison sociale]`, `[adresse postale complète]`, `[téléphone]`.
>
> **Contact** — `[adresse de contact]`.

Afficher les coordonnées de l'hébergeur en clair, pas seulement un lien vers son site : les sources divergent sur ce point, prendre l'option prudente.

## Annexe B — avertissement, à faire relire

> Cet outil fournit une **estimation** des frais douaniers par catégorie tarifaire pour les envois de vente à distance hors Union européenne. Il ne constitue **ni un classement tarifaire officiel, ni un conseil douanier ou fiscal**. Les sous-positions affichées sont les classements usuels de ces articles ; seule l'administration des douanes est compétente pour trancher.
>
> Les montants réellement dus dépendent du classement retenu au dédouanement, de la valeur déclarée et des conditions de vente. Ne sont pas calculés : la TVA à l'importation sur la marchandise, les droits de droit commun au-delà de 150 €, et les frais facturés par les transporteurs, qui sont libres.
>
> Les redevables de ces sommes sont la plateforme, le vendeur ou le transporteur. **L'administration des douanes ne s'adresse jamais aux particuliers** pour leur paiement. Un message réclamant quelques euros pour « libérer un colis » est une tentative d'escroquerie.
>
> Aucune donnée n'est collectée ni transmise : le calcul s'effectue entièrement dans votre navigateur.

Le dernier paragraphe n'est vrai que tant que les tests de `packages/analyse/test/no-network.test.js` passent. Il devient faux le jour où une télémétrie est ajoutée.
