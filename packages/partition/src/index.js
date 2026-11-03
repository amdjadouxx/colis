/**
 * Partition d'un panier en categories tarifaires.
 *
 * Une "categorie" est une sous-position du Systeme harmonise (6 chiffres).
 * Les frais se comptent une fois par categorie presente dans l'envoi, quelle
 * que soit la quantite. Le nombre de categories n'est donc pas le nombre
 * d'articles : il depend de la facon dont les codes se recouvrent.
 *
 * Quand la fiche produit ne permet pas de trancher le code (fibre, maille ou
 * tisse, matiere du dessus d'une chaussure), un article porte plusieurs codes
 * candidats. Le nombre de categories devient alors un intervalle :
 *
 *   - `min` : le minimum de codes distincts atteignable (couverture minimale).
 *   - `max` : le maximum de codes distincts atteignable (couplage maximal).
 *
 * L'incertitude ne change le total que si deux articles PEUVENT partager un
 * code. Un article seul dans sa famille compte pour 1, quelle que soit sa
 * fibre : min === max. C'est la raison pour laquelle les fourchettes restent
 * serrees au lieu de s'additionner.
 *
 * Aucune dependance : ce module tourne tel quel dans Node et dans un Worker.
 */

/**
 * @typedef {Object} Article
 * @property {string} id      Identifiant stable (sert au rendu et aux logs).
 * @property {string[]} codes Sous-positions candidates, au moins une.
 */

/**
 * @typedef {Object} Partition
 * @property {number} min        Nombre minimal de categories distinctes.
 * @property {number} max        Nombre maximal de categories distinctes.
 * @property {boolean} certain   true si min === max.
 * @property {string[]} minCodes Une affectation atteignant `min`.
 * @property {Collision[]} collisions
 */

/**
 * @typedef {Object} Collision
 * @property {string} a
 * @property {string} b
 * @property {string[]} codes Codes que les deux articles ont en commun.
 * @property {boolean} certain true si les deux codes sont determines : la
 *   fusion est alors acquise, pas seulement possible.
 */

/**
 * Minimum exact de codes distincts : une couverture minimale, ou chaque article
 * doit recevoir un de ses codes candidats.
 *
 * C'est un set cover, donc NP-difficile en general. Ici les instances sont
 * minuscules (quelques dizaines d'articles, au plus une poignee de candidats
 * chacun), donc on le resout exactement par separation et evaluation plutot
 * que d'accepter l'approximation d'un glouton. On branche toujours sur
 * l'article le plus contraint, ce qui coupe l'arbre tres vite.
 *
 * @param {Article[]} articles
 * @returns {{count: number, codes: string[]}}
 */
export function fewestCategories(articles) {
  if (articles.length === 0) return { count: 0, codes: [] };

  const sets = articles.map((a) => a.codes);
  let best = Infinity;
  let bestCodes = [];

  /** @param {Set<string>} picked */
  const search = (picked) => {
    if (picked.size >= best) return; // deja plus mauvais que la meilleure solution

    // Premier article non couvert, en prenant le plus contraint d'abord.
    let target = -1;
    let fewestOptions = Infinity;
    for (let i = 0; i < sets.length; i++) {
      if (sets[i].some((c) => picked.has(c))) continue;
      const options = sets[i].filter((c) => !picked.has(c)).length;
      if (options < fewestOptions) {
        fewestOptions = options;
        target = i;
      }
    }

    if (target === -1) {
      // Tout est couvert.
      best = picked.size;
      bestCodes = [...picked];
      return;
    }

    for (const code of sets[target]) {
      picked.add(code);
      search(picked);
      picked.delete(code);
    }
  };

  search(new Set());
  return { count: best, codes: bestCodes.sort() };
}

/**
 * Maximum exact de codes distincts : un couplage maximal entre articles et
 * codes (algorithme de Kuhn par chemins augmentants). Les articles non couples
 * retombent forcement sur un code deja pris, donc la taille du couplage est
 * exactement le nombre de categories distinctes atteignable.
 *
 * @param {Article[]} articles
 * @returns {number}
 */
export function mostCategories(articles) {
  const sets = articles.map((a) => a.codes);
  /** @type {Map<string, number>} */
  const owner = new Map();

  const augment = (i, seen) => {
    for (const code of sets[i]) {
      if (seen.has(code)) continue;
      seen.add(code);
      const held = owner.get(code);
      if (held === undefined || augment(held, seen)) {
        owner.set(code, i);
        return true;
      }
    }
    return false;
  };

  let matched = 0;
  for (let i = 0; i < sets.length; i++) {
    if (augment(i, new Set())) matched++;
  }
  return matched;
}

/**
 * Paires d'articles dont les codes candidats se croisent. Une intersection
 * entre deux articles determines est une fusion acquise ; entre deux articles
 * dont l'un est indetermine, c'est une fusion possible, et c'est exactement
 * d'ou vient l'ecart entre min et max.
 *
 * @param {Article[]} articles
 * @returns {Collision[]}
 */
export function collisions(articles) {
  const out = [];
  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      const shared = articles[i].codes.filter((c) => articles[j].codes.includes(c));
      if (shared.length === 0) continue;
      out.push({
        a: articles[i].id,
        b: articles[j].id,
        codes: shared,
        certain: articles[i].codes.length === 1 && articles[j].codes.length === 1,
      });
    }
  }
  return out;
}

/**
 * @param {Article[]} articles
 * @returns {Partition}
 */
export function partition(articles) {
  for (const a of articles) {
    if (!a.codes || a.codes.length === 0) {
      throw new Error(`L'article ${a.id} n'a aucun code candidat.`);
    }
  }
  const low = fewestCategories(articles);
  const high = articles.length === 0 ? 0 : mostCategories(articles);
  return {
    min: low.count,
    max: high,
    certain: low.count === high,
    minCodes: low.codes,
    collisions: collisions(articles),
  };
}
