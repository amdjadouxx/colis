/**
 * Chaine complete : texte colle -> analyse.
 *
 * Un seul point d'entree, parce que c'est le seul geste de l'utilisateur :
 * il colle, il lit. Tout le reste est interne.
 */

import { parseCart } from "@colis/parse";
import { resolveText } from "@colis/catalog";
import { analyse } from "./index.js";

/**
 * Une ligne de panier reconnue, rattachee a un article du catalogue.
 *
 * @typedef {Object} LigneReconnue
 * @property {string} id
 * @property {string} label
 * @property {string[]} codes       Sous-positions candidates.
 * @property {number} qty
 * @property {number} value         Prix unitaire multiplie par la quantite, 0 si inconnu.
 * @property {string|null} undetermined
 * @property {string} source        Libelle brut, tel que lu sur la page.
 * @property {boolean} exempt       Declare expédié depuis l'Union par la page.
 */

/**
 * Refus motive. Il y en a quatre, et ils disent des choses differentes :
 * rien de reconnu, pas de prix donc pas un panier, ou tout est exonere.
 *
 * @typedef {Object} AnalyseRefusee
 * @property {false} ok
 * @property {string} reason
 * @property {ReturnType<typeof parseCart>} parsed
 * @property {{title: string, qty: number, unitPrice: number|null}[]} unrecognised
 * @property {LigneReconnue[]} [lines]
 * @property {LigneReconnue[]} [exoneres]
 */

/**
 * @typedef {ReturnType<typeof analyse> & {
 *   ok: true,
 *   lines: LigneReconnue[],
 *   exoneres: LigneReconnue[],
 *   unrecognised: {title: string, qty: number, unitPrice: number|null}[],
 *   foreignCurrency: boolean,
 *   currencies: string[],
 *   coverage: {recognised: number, parsed: number, ratio: number, missingPrices: number},
 * }} AnalyseReussie
 */

/**
 * Le type de retour est une union discriminee par `ok`. C'est deliberé :
 * quatre refus distincts cohabitent avec le cas nominal, et sans
 * discriminant l'appelant lit des champs absents sans que rien ne l'arrete.
 *
 * @param {string} blob
 * @param {{includeVat?: boolean, onDate?: string, goodsValue?: number}} [options]
 * @returns {AnalyseRefusee | AnalyseReussie}
 */
export function analyseCart(blob, options = {}) {
  const parsed = parseCart(blob);

  const lines = [];
  const unrecognised = [];

  for (const item of parsed.items) {
    const r = resolveText(item.title);
    if (r.matches.length === 0) {
      unrecognised.push(item);
      continue;
    }
    // Le match le plus specifique : celui reconnu par la phrase la plus longue.
    const best = r.matches.sort((a, b) => b.via.length - a.via.length)[0];
    lines.push({
      id: best.id,
      label: best.label,
      codes: best.codes,
      qty: item.qty,
      value: item.unitPrice === null ? 0 : Math.round(item.unitPrice * item.qty * 100) / 100,
      undetermined: best.codes.length > 1 ? "code non déterminé par la fiche produit" : null,
      source: item.title,
      exempt: item.exempt === true,
    });
  }

  if (lines.length === 0) {
    return {
      ok: false,
      reason:
        "Aucun article reconnu. Coller l'email de confirmation de commande, ou la page panier selectionnee entierement.",
      parsed,
      unrecognised,
    };
  }

  // Un panier porte des prix. Sans un seul prix parmi les lignes reconnues,
  // ce qu'on tient vient du texte de navigation, pas d'un panier : sur une
  // page 404 d'AliExpress le mot "chaussettes" suffisait a faire apparaitre
  // un article, et sur un écran de verification Temu le mot "jouet". Mieux
  // vaut ne rien annoncer que d'annoncer un panier qui n'existe pas.
  if (!lines.some((l) => l.value > 0)) {
    return {
      ok: false,
      reason:
        "Aucun panier détecté sur cette page : des libelles ont ete reconnus, mais aucun prix. Ouvrir la page du panier ou de la commande.",
      parsed,
      unrecognised,
      lines,
    };
  }

  // Les articles que la page declare exoneres sortent du calcul : ils partent
  // d'un entrepot situe dans l'Union, donc aucun frais d'importation n'est du.
  // Les compter reviendrait a annoncer une somme a payer qui ne l'est pas.
  const exoneres = lines.filter((l) => l.exempt);
  const taxables = lines.filter((l) => !l.exempt);

  if (taxables.length === 0) {
    return {
      ok: false,
      reason:
        "Aucun frais d'importation : tous les articles reconnus sont déclarés expédiés depuis l'Union européenne par la page elle-meme.",
      parsed,
      unrecognised,
      lines,
      exoneres,
    };
  }

  const result = analyse({
    lines: taxables,
    // Valeur des seules lignes RECONNUES, et non le total brut du parseur.
    // Une page de panier porte des montants qui ne sont pas des articles :
    // economies, sous-total, coupons. Sur un vrai panier AliExpress, le total
    // brut annoncait 429 EUR de marchandise pour 141 EUR reels, ce qui
    // divisait par trois les taux de surcout affiches.
    goodsValue:
      options.goodsValue ??
      (taxables.some((l) => l.value > 0)
        ? Math.round(taxables.reduce((s, l) => s + l.value, 0) * 100) / 100
        : undefined),
    includeVat: options.includeVat,
    onDate: options.onDate,
  });

  return {
    ok: true,
    ...result,
    lines,
    exoneres,
    unrecognised,
    // Vrai si un montant lu n'est pas en euros. Le seuil de 150 EUR et les
    // taux de surcout ne peuvent pas etre affirmes sans conversion, donc on
    // le signale au lieu de confondre dollars et euros.
    foreignCurrency: parsed.foreignCurrency,
    currencies: parsed.currencies,
    // Une valeur manquante biaise les taux de surcout : il faut le dire plutot
    // que de presenter un pourcentage calcule sur un panier incomplet.
    coverage: {
      recognised: lines.length,
      parsed: parsed.items.length,
      ratio: parsed.items.length ? lines.length / parsed.items.length : 0,
      missingPrices: parsed.items.filter((i) => i.unitPrice === null).length,
    },
  };
}
