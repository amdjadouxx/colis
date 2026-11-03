/**
 * Verifie que le bundle genere est equivalent aux modules sources.
 *
 * Un bundle fabrique par concatenation et suppression d'imports peut casser en
 * silence : un identifiant perdu, un export oublie, une donnee non inlinee. On
 * ne le livre donc pas sans le faire tourner. On compare les sorties du bundle
 * et celles des modules sur les memes entrees : une difference, et on sort en
 * code 1.
 *
 * Usage : node tools/build-local/verify.js
 */

import { analyseCart as fromBundle, ITEMS as bundleItems } from "../../apps/web/engine.bundle.js";
import { analyseCart as fromSource } from "../../packages/analyse/src/pipeline.js";
import { ITEMS as sourceItems } from "../../packages/catalog/src/index.js";

const CARTS = [
  "Coque de telephone transparente\nQte : 2\n4,99 EUR\nBijou fantaisie collier  1,20 EUR",
  "T-shirt blanc coton  5,99 EUR\nT-shirt noir coton  5,99 EUR\nTee shirt gris  5,99 EUR",
  "Sweat a capuche oversize  14,99 EUR\nJean mom delave  19,99 EUR\nBarrette lot de 6  1,80 EUR",
  "Panier de rangement en osier  12,50 EUR\nLampe de chevet  18,00 EUR",
  "Smartphone 128 Go  180,00 EUR",
  "zzqx wwvb\nmmkl ppnr",
  "Humidifier 300ml USB  12,50 EUR\nPet collar adjustable  3,20 EUR\nWall sticker set  2,10 EUR",
];

const FIELDS = ["ok", "categories", "fees", "perCategory", "goodsValue", "overallSurcharge"];

let failures = 0;

if (bundleItems.length !== sourceItems.length) {
  console.error(`ECHEC catalogue : ${bundleItems.length} articles dans le bundle, ${sourceItems.length} dans les sources`);
  failures++;
} else {
  console.log(`OK catalogue : ${bundleItems.length} articles identiques`);
}

for (const [i, cart] of CARTS.entries()) {
  const a = fromBundle(cart);
  const b = fromSource(cart);
  const pick = (r) => JSON.stringify(Object.fromEntries(FIELDS.map((f) => [f, r[f] ?? null])));
  if (pick(a) !== pick(b)) {
    console.error(`ECHEC panier ${i + 1}\n  bundle : ${pick(a)}\n  source : ${pick(b)}`);
    failures++;
    continue;
  }
  // Les lignes doivent aussi coincider, pas seulement les totaux.
  const rows = (r) => (r.rows ?? []).map((x) => `${x.id}:${x.fee}`).join(",");
  if (rows(a) !== rows(b)) {
    console.error(`ECHEC lignes panier ${i + 1}\n  bundle : ${rows(a)}\n  source : ${rows(b)}`);
    failures++;
    continue;
  }
  const summary = a.ok
    ? `${a.categories.min}${a.categories.certain ? "" : "-" + a.categories.max} cat, ${a.fees.min} EUR sur ${a.goodsValue} EUR`
    : "non reconnu";
  console.log(`OK panier ${i + 1} : ${summary}`);
}

if (failures > 0) {
  console.error(`\n${failures} divergence(s). Le bundle n'est pas equivalent aux sources.`);
  process.exit(1);
}
console.log("\nBundle equivalent aux sources sur tous les paniers testes.");
