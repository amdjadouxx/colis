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
  // Humidificateur et aspirateur etaient inconnus a l'ecriture de ce test ;
  // ils sont au catalogue depuis la sonde de couverture. Il faut donc du texte
  // qui ne designe aucun produit, pas un produit hors catalogue.
  const r = analyseCart("zzqx wwvb\nmmkl ppnr tttz");
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

test("pipeline : une page sans prix n est pas annoncee comme un panier", () => {
  // Trouve en pilotant un vrai navigateur : sur une page 404 d AliExpress le
  // mot "chaussettes" du pied de page suffisait a faire apparaitre un
  // article, et sur un ecran de verification Temu le mot "jouet". Un panier
  // porte des prix.
  const r = analyseCart("Chaussettes homme\nJouets enfants\nAide Service client\nRetour a l accueil");
  assert.equal(r.ok, false);
  assert.match(r.reason, /Aucun panier d[ée]tect[ée]/);
});

test("pipeline : un seul prix suffit a reconnaitre un panier", () => {
  const r = analyseCart("Chaussettes homme  5,99 EUR\nJouets enfants");
  assert.equal(r.ok, true);
  assert.equal(r.categories.min, 2);
});

test("les articles declares expedies depuis l UE ne sont pas factures", () => {
  // Les plateformes marquent elles-memes les lignes concernees. Shein affiche
  // "Entrepot UE" et "Sans droits de douane en plus" ; AliExpress distingue
  // "Sans frais d importation" de "Des frais d importation s appliqueront".
  // Les ignorer faisait annoncer une somme a payer qui n est pas due.
  const r = analyseCart(
    "Autoradio 2Din Carplay ecran\n89,46€\nPrix TVA incluse | Sans frais dimportation\n" +
      "Seche-cheveux haute vitesse ions negatifs\n51,99€\nPrix TTC | Des frais dimportation sappliqueront"
  );
  assert.equal(r.ok, true);
  assert.equal(r.categories.min, 1, "seul l article assujetti compte");
  assert.equal(r.fees.min, 5);
  assert.equal(r.goodsValue, 51.99, "la marchandise exoneree sort du total");
  assert.equal(r.exoneres.length, 1);
  assert.match(r.exoneres[0].label, /Autoradio/);
});

test("mention d exoneration portee par le libelle lui-meme", () => {
  // Shein colle "Entrepot UE" devant le libelle, sans ligne separee.
  const r = analyseCart("Entrepot UE Top en dentelle marron manches longues\n8,37€");
  assert.equal(r.ok, false);
  assert.match(r.reason, /Aucun frais d'importation/);
  assert.equal(r.exoneres.length, 1);
});

test("un panier entierement assujetti reste calcule normalement", () => {
  const r = analyseCart("T-shirt coton col rond\n5,99€\nMug ceramique\n8,50€");
  assert.equal(r.ok, true);
  assert.equal(r.categories.min, 2);
  assert.equal(r.exoneres.length, 0);
});
