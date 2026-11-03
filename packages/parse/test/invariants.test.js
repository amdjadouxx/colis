/**
 * Test par invariants, sous formats aleatoires.
 *
 * Mes cas ecrits a la main valident les formats que J'AI imagines, donc ils
 * ne disent rien sur un vrai email Temu. On ne peut pas lever ce biais en
 * inventant plus de formats : on le leve en cessant de tester des formats.
 *
 * Ici on genere des paniers au hasard, on les rend dans un style de mise en
 * page tire au sort, et on verifie des proprietes qui doivent tenir QUEL QUE
 * SOIT le format : le nombre d'articles, la valeur totale, l'absence de faux
 * prix. Un format reel inconnu peut toujours casser, mais plus pour une
 * raison que ces proprietes couvrent.
 *
 * Generateur a graine fixe : un echec est reproductible.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { parseCart } from "../src/index.js";
import { ITEMS } from "../../catalog/src/index.js";

/** PRNG deterministe (mulberry32). */
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOISE_LINES = [
  "Sous-total  99,99 EUR",
  "Livraison gratuite",
  "Total  99,99 EUR",
  "Commande n AB-77213",
  "Merci pour votre achat",
  "Suivre ma commande",
  "Adresse de livraison",
  "Paiement par carte",
  "TVA incluse",
  "Retour gratuit sous 30 jours",
];

const ATTRIBUTE_LINES = ["Taille M", "Couleur Noir", "Modele A2", "Vendu par TopStore", "Style casual"];

/**
 * Specifications chiffrees, comme toutes les vraies fiches en portent.
 *
 * Ajoutees apres un controle negatif rate : le generateur ne mettait jamais de
 * chiffre juste apres un mot, donc il laissait passer le bug ou "sect-EUR- 20W"
 * fournissait un faux prix de 20. Un fuzz qui ne reproduit pas les bugs deja
 * trouves ne protege de rien.
 */
const SPECS = [
  "20W",
  "128 Go",
  "2 metres",
  "30cm",
  "10000mAh",
  "5V 2A",
  "lot de 3",
  "taille 38",
  "1000 pieces",
  "50ml",
];

/** Styles de rendu du prix. */
const PRICE_STYLES = [
  (p) => `${p.toFixed(2).replace(".", ",")} EUR`,
  (p) => `${p.toFixed(2).replace(".", ",")} €`,
  (p) => `€${p.toFixed(2)}`,
  (p) => `EUR ${p.toFixed(2)}`,
];

/** Styles de rendu de la quantite. */
const QTY_STYLES = [
  (q) => `x${q}`,
  (q) => `${q} x`,
  (q) => `Qte : ${q}`,
  (q) => `Quantity: ${q}`,
  (q) => `Qty ${q}`,
];

/**
 * Rend un panier dans une mise en page tiree au sort.
 * @returns {{blob: string, expected: {title: string, qty: number, price: number}[]}}
 */
function renderCart(rand) {
  const count = 1 + Math.floor(rand() * 7);
  const lines = [];
  const expected = [];

  // En-tete bruite, parfois.
  if (rand() < 0.5) lines.push(NOISE_LINES[Math.floor(rand() * NOISE_LINES.length)]);

  for (let i = 0; i < count; i++) {
    const item = ITEMS[Math.floor(rand() * ITEMS.length)];
    // Le titre doit rester reconnaissable : on prend un fragment du libelle,
    // suffixe de mots-cles comme le font les vraies fiches.
    const spec = rand() < 0.6 ? ` ${SPECS[Math.floor(rand() * SPECS.length)]}` : "";
    const title = `${item.label.split(",")[0].trim()} ${["premium", "unisexe", "tendance", "lot", "confort"][Math.floor(rand() * 5)]}${spec}`;
    const qty = 1 + Math.floor(rand() * 4);
    const price = Math.round((0.8 + rand() * 40) * 100) / 100;
    const renderPrice = PRICE_STYLES[Math.floor(rand() * PRICE_STYLES.length)];
    const renderQty = QTY_STYLES[Math.floor(rand() * QTY_STYLES.length)];

    const style = rand();
    if (style < 0.4) {
      // Tout sur une ligne.
      lines.push(`${renderQty(qty)} ${title}   ${renderPrice(price)}`);
    } else if (style < 0.8) {
      // Titre, puis quantite, puis prix.
      lines.push(title);
      if (rand() < 0.4) lines.push(ATTRIBUTE_LINES[Math.floor(rand() * ATTRIBUTE_LINES.length)]);
      lines.push(renderQty(qty));
      lines.push(renderPrice(price));
    } else {
      // Titre et prix sur la meme ligne, quantite avant.
      lines.push(renderQty(qty));
      lines.push(`${title}  ${renderPrice(price)}`);
    }
    expected.push({ title, qty, price });
  }

  // Pied bruite, parfois.
  if (rand() < 0.6) lines.push(NOISE_LINES[Math.floor(rand() * NOISE_LINES.length)]);

  return { blob: lines.join("\n"), expected };
}

test("invariants du parseur sur 400 paniers de format aleatoire", () => {
  const rand = rng(20261103);
  const failures = [];

  for (let run = 0; run < 400; run++) {
    const { blob, expected } = renderCart(rand);
    const parsed = parseCart(blob);

    const expectedTotal =
      Math.round(expected.reduce((s, e) => s + e.price * e.qty, 0) * 100) / 100;
    const prices = new Set(expected.map((e) => e.price));

    const problems = [];

    // 1. Un article rendu, un article lu.
    if (parsed.items.length !== expected.length) {
      problems.push(`articles : ${parsed.items.length} lus pour ${expected.length} rendus`);
    }
    // 2. La valeur totale se conserve.
    if (parsed.totalValue !== null && Math.abs(parsed.totalValue - expectedTotal) > 0.02) {
      problems.push(`valeur : ${parsed.totalValue} lue pour ${expectedTotal} rendue`);
    }
    // 3. Aucun prix invente : tout prix lu a ete rendu.
    for (const item of parsed.items) {
      if (item.unitPrice !== null && !prices.has(item.unitPrice)) {
        problems.push(`prix absent du rendu : ${item.unitPrice} sur "${item.title}"`);
      }
    }
    // 4. Aucune ligne de bruit promue en article.
    for (const item of parsed.items) {
      if (NOISE_LINES.some((n) => item.title.includes(n.split("  ")[0]))) {
        problems.push(`bruit pris pour un article : "${item.title}"`);
      }
    }
    // 5. Les quantites se conservent.
    const qtySum = parsed.items.reduce((s, i) => s + i.qty, 0);
    const expectedQty = expected.reduce((s, e) => s + e.qty, 0);
    if (parsed.items.length === expected.length && qtySum !== expectedQty) {
      problems.push(`quantites : ${qtySum} lues pour ${expectedQty} rendues`);
    }

    if (problems.length) failures.push({ run, problems, blob });
  }

  if (failures.length) {
    const sample = failures.slice(0, 3);
    const report = sample
      .map((f) => `  run ${f.run} : ${f.problems.join(" ; ")}\n--- collage ---\n${f.blob}\n---`)
      .join("\n");
    assert.fail(
      `${failures.length}/400 paniers violent un invariant.\n${report}`
    );
  }
});
