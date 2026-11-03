import test from "node:test";
import assert from "node:assert/strict";
import { parseCart } from "../../parse/src/index.js";
import { analyseCart } from "../src/pipeline.js";

test("parse : article sur plusieurs lignes", () => {
  const r = parseCart("Coque de telephone silicone\nQte : 2\n4,99 EUR");
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].qty, 2);
  assert.equal(r.items[0].unitPrice, 4.99);
  assert.equal(r.totalValue, 9.98);
});

test("parse : article sur une seule ligne, quantite prefixee", () => {
  const r = parseCart("3 x Cable USB C tresse 2m   2,30 EUR");
  assert.equal(r.items[0].qty, 3);
  assert.equal(r.items[0].unitPrice, 2.3);
});

test("parse : prix avant le montant et notation anglaise", () => {
  const r = parseCart("Chargeur secteur 20W\n€8.90");
  assert.equal(r.items[0].unitPrice, 8.9);
});

test("parse : totaux et livraison ignores, pas comptes comme articles", () => {
  const r = parseCart(
    "T-shirt coton col rond  5,99 EUR\nSous-total  5,99 EUR\nLivraison  gratuite\nTotal  5,99 EUR"
  );
  assert.equal(r.items.length, 1);
  assert.equal(r.totalValue, 5.99);
  assert.ok(r.ignored.length >= 3);
});

test("parse : fragments de mise en page ecartes", () => {
  const r = parseCart("Jean mom taille haute\nTaille M\nCouleur Noir\n19,99 EUR");
  assert.equal(r.items.length, 1);
  // Les fragments sont absorbes dans le titre, pas transformes en articles.
  assert.ok(r.items[0].title.includes("Jean mom"));
});

test("parse : un panier sans aucun prix rend quand meme les articles", () => {
  const r = parseCart("Coque de telephone transparente\nCable USB C tresse");
  assert.equal(r.totalValue, null);
  assert.ok(r.items.length >= 1);
});

test("pipeline : le surcout par ligne est inversement proportionnel au prix", () => {
  const r = analyseCart(
    "Bijou fantaisie collier pendentif  1,20 EUR\nJean mom taille haute delave  19,99 EUR"
  );
  assert.equal(r.ok, true);
  assert.equal(r.categories.min, 2);
  // Meme forfait sur les deux lignes, donc taux tres differents.
  const [worst, best] = r.rows;
  assert.ok(worst.surcharge > 3, `attendu > 300 %, obtenu ${worst.surcharge}`);
  assert.ok(best.surcharge < 0.3, `attendu < 30 %, obtenu ${best.surcharge}`);
  assert.equal(worst.fee, best.fee);
});

test("pipeline : la quantite ne cree pas de categorie", () => {
  const r = analyseCart(
    "T-shirt blanc coton  5,99 EUR\nT-shirt noir coton  5,99 EUR\nTee shirt gris basique  5,99 EUR"
  );
  assert.equal(r.categories.min, 1);
  assert.equal(r.fees.min, 5);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].value, 17.97);
});

test("pipeline : ne recommande de retirer que si les frais depassent le prix", () => {
  const r = analyseCart(
    "Bijou fantaisie collier  1,20 EUR\nChargeur secteur double port  8,90 EUR"
  );
  const labels = r.removable.map((x) => x.label);
  assert.ok(labels.includes("Bijou fantaisie"));
  assert.ok(!labels.includes("Chargeur secteur"), "8,90 EUR > 5 EUR de frais : rien a signaler");
});

test("pipeline : lignes partageant une categorie signalees comme telles", () => {
  const r = analyseCart("Peluche lapin 30cm  6,00 EUR\nPuzzle 1000 pieces paysage  9,00 EUR");
  // Peluche et puzzle sont le meme article de catalogue : une seule categorie.
  assert.equal(r.categories.min, 1);
  assert.equal(r.fees.min, 5);
});

test("pipeline : collage illisible le dit au lieu de rendre zero", () => {
  const r = analyseCart("Humidificateur ultrasonique\nAspirateur de bureau sans fil");
  assert.equal(r.ok, false);
  assert.match(r.reason, /Aucun article reconnu/);
});

test("pipeline : couverture rapportee, prix manquants comptes", () => {
  const r = analyseCart("Coque de telephone transparente\nJean mom delave  19,99 EUR");
  assert.equal(r.ok, true);
  assert.equal(r.coverage.recognised, 2);
  assert.equal(r.coverage.missingPrices, 1);
});

test("pipeline : au-dessus de 150 EUR seuls les frais de traitement restent", () => {
  const r = analyseCart("Smartphone 128 Go ecran AMOLED  180,00 EUR");
  assert.equal(r.perCategory, 2);
  assert.equal(r.notApplied.length, 1);
});
