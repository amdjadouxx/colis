# À traiter avant tout déploiement

## Méthode de travail (règle posée le 3 novembre 2026)

Valider chaque hypothèse par un petit test **avant** de développer dessus. Pas l'inverse. Un module construit sur une supposition non vérifiée est du travail à refaire.

Contrôle : pour chaque brique, écrire la sonde qui la réfuterait, la lancer, puis seulement coder. Le but est un truc solide et fiable — déployé une fois, plus jamais à toucher.

## Juridique — BLOQUANT avant déploiement public

À traiter sérieusement, pas en note de bas de page. Ouvert, non tranché :

- **Statut de l'information.** L'outil annonce des montants de droits de douane. Rien ne doit pouvoir se lire comme un classement tarifaire officiel ou un conseil douanier. Les sous-positions affichées sont des classements usuels, et seule la douane tranche. Formulation à faire valider.
- **Responsabilité en cas d'erreur.** Si un utilisateur prend une décision d'achat sur un chiffre faux, quelle exposition ? Mentions légales, limitation de responsabilité, à rédiger.
- **RGPD.** Un panier collé peut contenir un numéro de commande, un nom, une adresse. Décision d'architecture à prendre et à tenir : **ne rien transmettre ni stocker**, tout calculer côté client. Si un appel serveur reste nécessaire, bannière, finalité, durée de conservation, base légale.
- **Analytics.** Cloudflare Web Analytics est sans cookie, donc a priori sans bandeau — à confirmer, pas à supposer.
- **Marques.** Shein, Temu, AliExpress sont des marques déposées. Usage descriptif seulement, jamais dans un nom de domaine ni en titre de page, aucune suggestion d'affiliation.
- **Mentions obligatoires.** Éditeur, hébergeur, contact.

Aucun déploiement public avant que ces points soient tranchés.

## Produit, dans l'ordre

1. Fiabiliser le parseur de panier collé — formats réels, cas ambigus (lignes sans prix mêlées à des lignes avec prix).
2. Trous de catalogue : petit électroménager, animalerie, machines.
3. Interface collage, puis design.
4. Seuil d'arrêt chiffré, écrit avant tout déploiement.
