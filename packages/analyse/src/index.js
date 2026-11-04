/**
 * Analyse d'un panier : ou part l'argent, ligne par ligne.
 *
 * Le test du concept a montre que le TOTAL n'apprend presque rien : hors cinq
 * paires du catalogue, categories = nombre de types d'articles distincts, donc
 * le total vaut "n x tarif", un calcul de tete.
 *
 * Ce qui n'est PAS calculable de tete, c'est la repartition. Les frais sont
 * forfaitaires par categorie, donc ils frappent en proportion inverse du prix :
 * une babiole a 1,20 EUR seule dans sa categorie porte 5 EUR de frais, soit
 * +417 %, pendant qu'un manteau a 40 EUR porte les memes 5 EUR, soit +12 %.
 * L'acheteur ne voit jamais ca, et c'est la seule chose qui change sa decision.
 *
 * D'ou la sortie de ce module : un classement par taux de surcout effectif, et
 * la liste des lignes a retirer pour gagner le plus.
 */

import { partition } from "@colis/partition";
import { estimate } from "@colis/rules";

/**
 * Affecte une categorie a chaque ligne, au minimum de categories.
 *
 * On reutilise l'affectation qui atteint `min` : c'est la lecture la plus
 * favorable a l'acheteur, et annoncer le pire cas comme s'il etait certain
 * serait trompeur. L'incertitude reste signalee par ligne.
 *
 * @param {{id: string, codes: string[]}[]} articles
 * @param {string[]} minCodes
 */
function assign(articles, minCodes) {
  /** @type {Map<string, string>} */
  const byArticle = new Map();
  for (const a of articles) {
    const hit = minCodes.find((c) => a.codes.includes(c)) ?? a.codes[0];
    byArticle.set(a.id, hit);
  }
  return byArticle;
}

/**
 * @param {Object} input
 * @param {{id: string, label: string, codes: string[], qty: number, value: number, undetermined?: string|null}[]} input.lines
 *   Une ligne par article reconnu. `value` est la valeur totale de la ligne
 *   (prix unitaire x quantite), ou 0 si le prix est inconnu.
 * @param {number} [input.goodsValue] Valeur de l'envoi. Deduite des lignes si omise.
 * @param {boolean} [input.includeVat]
 * @param {string} [input.onDate]
 */
export function analyse({ lines, goodsValue, includeVat = false, onDate }) {
  // La quantite ne change pas le nombre de categories : on regroupe par article
  // de catalogue avant de partitionner.
  /** @type {Map<string, {id: string, label: string, codes: string[], qty: number, value: number, undetermined: string|null}>} */
  const byId = new Map();
  for (const l of lines) {
    const existing = byId.get(l.id);
    if (existing) {
      existing.qty += l.qty;
      existing.value += l.value;
    } else {
      byId.set(l.id, { ...l, undetermined: l.undetermined ?? null });
    }
  }
  const grouped = [...byId.values()];
  const articles = grouped.map((g) => ({ id: g.id, codes: g.codes }));

  const categories = partition(articles);
  const declaredValue =
    goodsValue ?? Math.round(grouped.reduce((s, g) => s + g.value, 0) * 100) / 100;
  const quote = estimate({ categories, goodsValue: declaredValue, includeVat, onDate });

  const codeOf = assign(articles, categories.minCodes);

  // Un forfait par categorie, partage entre les lignes de cette categorie au
  // prorata de leur valeur. A valeur inconnue, partage a parts egales.
  /** @type {Map<string, typeof grouped>} */
  const buckets = new Map();
  for (const g of grouped) {
    // assign() a affecte un code a chaque article, donc la cle existe
    // toujours. On la materialise plutot que de supposer : un article sans
    // code serait une erreur de programmation, pas une donnee invalide.
    const code = codeOf.get(g.id) ?? g.codes[0];
    const bucket = buckets.get(code);
    if (bucket) bucket.push(g);
    else buckets.set(code, [g]);
  }

  const rows = [];
  for (const [code, members] of buckets) {
    const sum = members.reduce((s, m) => s + m.value, 0);
    for (const m of members) {
      const share = sum > 0 ? m.value / sum : 1 / members.length;
      const fee = Math.round(quote.perCategory * share * 100) / 100;
      rows.push({
        id: m.id,
        label: m.label,
        qty: m.qty,
        value: Math.round(m.value * 100) / 100,
        code,
        sharedWith: members.filter((x) => x.id !== m.id).map((x) => x.label),
        fee,
        // Taux de surcout effectif : ce que les frais ajoutent au prix paye.
        surcharge: m.value > 0 ? fee / m.value : null,
        undetermined: m.undetermined,
      });
    }
  }
  rows.sort((a, b) => (b.surcharge ?? -1) - (a.surcharge ?? -1));

  // Lignes seules dans leur categorie : les seules dont le retrait supprime
  // vraiment un forfait. Retirer une ligne qui partage sa categorie ne fait
  // rien gagner.
  const removable = rows
    .filter((r) => r.sharedWith.length === 0 && r.value > 0)
    .map((r) => ({
      label: r.label,
      value: r.value,
      saves: quote.perCategory,
      ratio: quote.perCategory / r.value,
    }))
    // Seuil a 100 % : on ne signale une ligne que si les frais coutent PLUS
    // que l'article lui-meme. En dessous, c'est cher mais discutable, et une
    // liste de recommandations trop longue ne se lit pas.
    .filter((r) => r.ratio >= 1)
    .sort((a, b) => b.ratio - a.ratio);

  return {
    categories: {
      min: categories.min,
      max: categories.max,
      certain: categories.certain,
    },
    collisions: categories.collisions,
    goodsValue: declaredValue,
    perCategory: quote.perCategory,
    fees: { min: quote.total.min, max: quote.total.max },
    /** Part des frais dans le prix total de la marchandise. */
    overallSurcharge: declaredValue > 0 ? quote.total.min / declaredValue : null,
    rows,
    removable,
    regime: quote.regime,
    notApplied: quote.notApplied,
  };
}
