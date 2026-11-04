import test from "node:test";
import assert from "node:assert/strict";
import { ITEMS, resolveText, toArticles, itemById, normalize } from "../src/index.js";
import { partition } from "../../partition/src/index.js";
import { estimate, regimeFor, REGIMES } from "../../rules/src/index.js";

test("le catalogue est bien forme", () => {
  const ids = new Set();
  for (const it of ITEMS) {
    assert.ok(it.id && !ids.has(it.id), `identifiant manquant ou duplique : ${it.id}`);
    ids.add(it.id);
    assert.ok(it.label && it.rayon, `libelle ou rayon manquant pour ${it.id}`);
    assert.ok(Array.isArray(it.codes) && it.codes.length > 0, `aucun code pour ${it.id}`);
    for (const c of it.codes) {
      assert.match(c, /^\d{4}\.\d{2}$/, `code mal forme pour ${it.id} : ${c}`);
    }
    // Un article a plusieurs codes si et seulement s'il declare pourquoi.
    assert.equal(
      it.codes.length > 1,
      Boolean(it.undetermined),
      `${it.id} : plusieurs codes sans raison declaree, ou raison sans plusieurs codes`
    );
  }
});

test("la normalisation rabat les pluriels et les accents", () => {
  assert.equal(normalize("T-Shirts"), "t shirt");
  assert.equal(normalize("Écouteurs"), "ecouteur");
  assert.equal(normalize("robe d'été"), "robe d ete");
});

test("resolution d'un titre produit bruite", () => {
  const r = resolveText("Lot de 3 t-shirts coton femme + coque de telephone transparente");
  const labels = r.matches.map((m) => m.id).sort();
  assert.deepEqual(labels, ["coque", "tshirt"]);
  assert.equal(r.unmatched, false);
});

test("un titre non reconnu le dit au lieu de deviner", () => {
  const r = resolveText("objet non identifiable zzzz");
  assert.equal(r.matches.length, 0);
  assert.equal(r.unmatched, true);
});

test("la recherche exige le mot entier", () => {
  // "bague" est un synonyme de bijou fantaisie ; "baguette" ne doit pas matcher.
  const r = resolveText("baguette de pain");
  assert.equal(r.matches.length, 0);
});

test("chaque article du catalogue traverse le moteur", () => {
  for (const it of ITEMS) {
    const p = partition(toArticles([it.id]));
    assert.equal(p.min, 1, `${it.id} devrait compter pour une categorie`);
    assert.equal(p.max, 1, `${it.id} seul ne peut pas depasser une categorie`);
  }
});

test("bonnet et casquette sont un seul article, jouet et jeu deux categories", () => {
  assert.ok(itemById("bonnet").label.includes("casquette"));
  const p = partition(toArticles(["jouet", "jeu"]));
  assert.equal(p.min, 2);
});

test("le bareme du jour est celui de novembre 2026", () => {
  const r = regimeFor("2026-11-03");
  assert.equal(r.id, "eu-2026-11");
  assert.equal(r.levies.length, 2);
});

test("au-dessus de 150 EUR le forfait tombe, les frais restent", () => {
  const categories = { min: 3, max: 3 };
  const sous = estimate({ categories, goodsValue: 60 });
  const dessus = estimate({ categories, goodsValue: 300 });
  assert.equal(sous.perCategory, 5);
  assert.equal(dessus.perCategory, 2);
  assert.equal(dessus.notApplied.length, 1);
  assert.equal(dessus.notApplied[0].id, "droit-forfaitaire");
});

test("la TVA s'applique aux prelevements", () => {
  const q = estimate({ categories: { min: 1, max: 1 }, goodsValue: 60, includeVat: true });
  // 3 EUR majores de la TVA font le 3,60 EUR que Temu a affiche en juillet.
  assert.equal(q.lines.find((l) => l.id === "droit-forfaitaire").perCategory, 3.6);
  assert.equal(q.perCategory, 6);
});

test("les baremes ne se chevauchent pas et portent leurs sources", () => {
  const sorted = [...REGIMES].sort((a, b) => (a.from < b.from ? -1 : 1));
  for (let i = 0; i < sorted.length; i++) {
    assert.ok(sorted[i].sources.length > 0, `${sorted[i].id} sans source`);
    if (i > 0) {
      assert.ok(
        sorted[i - 1].until !== null && sorted[i - 1].until < sorted[i].from,
        `chevauchement entre ${sorted[i - 1].id} et ${sorted[i].id}`
      );
    }
  }
  assert.equal(sorted.filter((r) => r.until === null).length, 1, "un seul bareme en cours");
});

test("une date sans bareme connu est une erreur", () => {
  assert.throws(() => regimeFor("2019-01-01"), /Aucun bareme connu/);
});

test("le mobilier de page ne resout vers aucun produit", () => {
  // "Mon panier" resolvait vers "Panier de rangement" parce que le libelle
  // "Panier, corbeille" indexait le fragment "Panier" tout seul. Un libelle
  // dont un fragment est un mot de navigation pollue tous les paniers.
  const furniture = [
    "Mon panier",
    "Panier",
    "Votre commande",
    "Mes commandes",
    "Total",
    "Sous-total",
    "Livraison gratuite",
    "Voir le panier",
    "Shopping cart",
    "Your order",
    "Checkout",
    "Mon compte",
  ];
  for (const s of furniture) {
    const r = resolveText(s);
    assert.equal(r.matches.length, 0, `"${s}" ne doit resoudre vers aucun article, trouve : ${r.matches.map((m) => m.id).join(", ")}`);
  }
});

test("les fichiers de catalogue sont du JSON valide et coherent", () => {
  // Un remplacement automatique a deja casse catalog-extra.json en silence.
  const ids = new Set();
  for (const it of ITEMS) {
    assert.ok(typeof it.id === "string" && it.id.length > 0, `identifiant invalide : ${JSON.stringify(it.id)}`);
    assert.ok(typeof it.label === "string" && it.label.length > 2, `libelle invalide pour ${it.id}`);
    assert.ok(!ids.has(it.id), `identifiant duplique : ${it.id}`);
    ids.add(it.id);
  }
});

test("conformite aux exemples publies par la douane", () => {
  // Exemples repris de douane.gouv.fr. Ce sont les seules verites de
  // reference disponibles : si le moteur ne les reproduit pas, il est faux,
  // quelle que soit la qualite du reste.

  // "Un t-shirt et un jouet constituent deux categories differentes."
  // Envoi de 35 EUR : 6 EUR de droit forfaitaire + 4 EUR de frais = 10 EUR.
  const deux = partition(toArticles(["tshirt", "jouet"]));
  assert.equal(deux.min, 2, "t-shirt et jouet font deux categories");
  const q1 = estimate({ categories: deux, goodsValue: 35 });
  assert.equal(q1.lines.find((l) => l.id === "droit-forfaitaire").perCategory, 3);
  assert.equal(q1.lines.find((l) => l.id === "frais-traitement").perCategory, 2);
  assert.equal(q1.total.min, 10, "6 EUR de droit plus 4 EUR de frais");

  // "Deux t-shirts identiques de couleurs differentes peuvent etre
  // consideres comme une seule categorie d article."
  const identiques = partition(toArticles(["tshirt"]));
  assert.equal(identiques.min, 1);
  assert.equal(estimate({ categories: identiques, goodsValue: 20 }).total.min, 5);

  // "Envoi d une valeur superieure a 150 EUR : application des frais de
  // traitement de 2 EUR uniquement." Exemple du casque a 250 EUR.
  const casque = partition(toArticles(["ecouteurs"]));
  const q2 = estimate({ categories: casque, goodsValue: 250 });
  assert.equal(q2.total.min, 2, "au-dela de 150 EUR, seuls les frais de traitement restent");
  assert.equal(q2.notApplied[0].id, "droit-forfaitaire");

  // Le 3,60 EUR affiche par Temu en juillet : 3 EUR majores de la TVA.
  const tva = estimate({ categories: { min: 1, max: 1 }, goodsValue: 20, includeVat: true });
  assert.equal(tva.lines.find((l) => l.id === "droit-forfaitaire").perCategory, 3.6);
});

test("pas de faux positif sur des mots trop generiques", () => {
  // Trouves sur un vrai panier AliExpress : "Mirror Link" d un autoradio
  // etait classe en miroir, et "Podofo Flagship Store" en rideau, parce que
  // "store" designe un rideau en francais. Un synonyme d un seul mot courant
  // pollue tous les paniers ou ce mot apparait.
  const cas = [
    ["Autoradio 2Din 9,7 pouces Carplay Android Auto Mirror Link GPS USB BT", "miroir"],
    ["Podofo Oversea Flagship Store", "rideau"],
    ["DOCO LAB Store", "rideau"],
  ];
  for (const [titre, interdit] of cas) {
    const ids = resolveText(titre).matches.map((m) => m.id);
    assert.ok(!ids.includes(interdit), `"${titre}" ne doit pas resoudre vers ${interdit}, trouve : ${ids.join(", ")}`);
  }
});

test("la valeur marchandise ne compte que les lignes reconnues", async () => {
  // Sur le vrai panier, le total brut du parseur annoncait 429 EUR pour
  // 141 EUR de marchandise : economies, coupons et sous-total etaient
  // additionnes, ce qui divisait par trois les taux de surcout.
  const { analyseCart } = await import("../../analyse/src/pipeline.js");
  const r = analyseCart(
    "Seche-cheveux haute vitesse\n51,99€\nLivraison gratuite\n1,99€\nSous-total\n51,99€"
  );
  assert.equal(r.ok, true);
  assert.equal(r.goodsValue, 51.99, "seules les lignes reconnues comptent");
});
