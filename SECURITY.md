# Sécurité et confidentialité

## Le modèle, en une phrase

**Rien ne sort de la machine.** Le contenu collé, ou lu par l'extension sur la page ouverte, est traité entièrement dans le navigateur. Aucun serveur, aucun cookie, aucun stockage local.

Ce n'est pas une intention, c'est une propriété vérifiée automatiquement.

## Comment c'est tenu

`test/policy.test.js` échoue si l'une de ces constructions apparaît dans le moteur ou l'extension :

`fetch` · `XMLHttpRequest` · `WebSocket` · `navigator.sendBeacon` · `EventSource` · `import()` dynamique · chargement distant · `localStorage` · `sessionStorage` · `IndexedDB` · `document.cookie`

Le manifeste de l'extension est vérifié au même endroit : aucune permission d'hôte, aucun script injecté en permanence, et seulement `activeTab` et `scripting`.

`tools/negative-control` va plus loin : il **réintroduit** une télémétrie, un stockage navigateur et une permission large sur une copie du dépôt, puis vérifie que la suite rougit. Un garde-fou qui n'a jamais été éprouvé ne protège de rien.

Preuve empirique complémentaire : la page rendue avec tout le DNS redirigé vers `0.0.0.0` produit un résultat identique.

## Permissions de l'extension

`activeTab` plutôt que des permissions d'hôte. L'accès n'existe que pour l'onglet où l'utilisateur a cliqué, et seulement à ce moment. C'est le minimum qui permette de lire un panier, et ça évite une extension capable de lire tous les sites en permanence.

## Pourquoi `apps/api` n'est pas déployé

Le Worker recevrait les paniers, donc potentiellement un nom, une adresse, un numéro de commande. Tout le raisonnement ci-dessus tomberait. Il reste utile hors ligne et pour les tests. Le déployer demande une nouvelle analyse, décrite dans [docs/juridique.md](docs/juridique.md).

## Signaler un problème

Ouvrir une issue publique pour un défaut fonctionnel.

Pour un problème touchant la confidentialité ou l'exécution de code, utiliser l'onglet **Security** du dépôt plutôt qu'une issue publique, afin qu'un correctif existe avant que le détail soit connu.

## Hors périmètre

Les montants affichés sont des **estimations**, pas un classement douanier officiel. Une erreur de classement est un défaut fonctionnel, pas une faille. Voir l'avertissement du [README](README.md).
