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
 * @param {string} blob
 * @param {{includeVat?: boolean, onDate?: string, goodsValue?: number}} [options]
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
      undetermined: best.codes.length > 1 ? "code non determine par la fiche produit" : null,
      source: item.title,
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

  const result = analyse({
    lines,
    goodsValue: options.goodsValue ?? (parsed.totalValue ?? undefined),
    includeVat: options.includeVat,
    onDate: options.onDate,
  });

  return {
    ok: true,
    ...result,
    lines,
    unrecognised,
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
