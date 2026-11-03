/**
 * Regressions : un bug trouve une fois ne doit plus jamais passer.
 *
 * Le fuzz par invariants couvre les inconnues, mais il ne reproduit pas
 * forcement un bug precis : apres correction, les deux controles negatifs ont
 * montre qu'on pouvait reintroduire les deux bugs ci-dessous sans faire rougir
 * le fuzz. D'ou ces cas nommes, verifies par controle negatif.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { parseCart } from "../src/index.js";

test("regression : un mot contenant eur ne fournit pas de prix", () => {
  // "sect-EUR- 20W" : sans frontiere de mot sur EUR, le parseur lisait 20.
  const r = parseCart("Chargeur secteur 20W\n€8.90");
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].unitPrice, 8.9);
  assert.match(r.items[0].title, /20W/);
});

test("regression : autres mots en -eur", () => {
  for (const [line, expected] of [
    ["Aspirateur 120W  15,99 EUR", 15.99],
    ["Humidificateur 300ml  12,50 EUR", 12.5],
    ["Ventilateur 45W  9,90 EUR", 9.9],
  ]) {
    const r = parseCart(line);
    assert.equal(r.items[0].unitPrice, expected, `sur "${line}"`);
  }
});

test("regression : un titre finissant par un chiffre ne vole pas le prix", () => {
  // Le regex prenait le match le plus a gauche : "lot de 3   12,99 EUR"
  // donnait un prix de 3. Trouve par fuzz sur 54 paniers sur 400.
  const cases = [
    ["Montre a quartz lot de 3   12,99 EUR", 12.99, /lot de 3/],
    ["Cable USB C 2 metres 2,30 EUR", 2.3, /2 metres/],
    ["Puzzle 1000 pieces 9,99 EUR", 9.99, /1000 pieces/],
    ["Robe taille 38 24,50 EUR", 24.5, /taille 38/],
    ["Batterie externe 10000mAh  18,90 EUR", 18.9, /10000mAh/],
  ];
  for (const [line, price, titlePattern] of cases) {
    const r = parseCart(line);
    assert.equal(r.items.length, 1, `une seule ligne attendue sur "${line}"`);
    assert.equal(r.items[0].unitPrice, price, `prix sur "${line}"`);
    assert.match(r.items[0].title, titlePattern, `titre sur "${line}"`);
  }
});

test("regression : prix accole au symbole, sans espace", () => {
  assert.equal(parseCart("Mug ceramique 12,99€").items[0].unitPrice, 12.99);
  assert.equal(parseCart("Mug ceramique €12.99").items[0].unitPrice, 12.99);
});

test("regression : deux montants sur une ligne, le dernier est le prix", () => {
  // Mise en page a prix barre : ancien prix puis prix courant.
  const r = parseCart("Baskets sneakers  29,99 EUR  14,99 EUR");
  assert.equal(r.items[0].unitPrice, 14.99);
});

test("regression : lignes sans prix non fusionnees dans la suivante", () => {
  const r = parseCart("Coque de telephone transparente\nJean mom delave  19,99 EUR");
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].unitPrice, null);
  assert.equal(r.items[1].unitPrice, 19.99);
});

test("regression : titre court legitime conserve", () => {
  // Un seuil de 6 lettres jetait "Mug" et "Jean".
  for (const title of ["Mug", "Jean", "Sac"]) {
    const r = parseCart(`${title}  7,99 EUR`);
    assert.equal(r.items.length, 1, `"${title}" doit etre conserve`);
    assert.equal(r.items[0].title, title);
  }
});

test("regression : reference de commande ecartee ou qu'elle commence", () => {
  // "Votre commande AB-2291" passait pour un produit : le filtre etait ancre
  // en debut de ligne et attendait "Commande n". Trouve en executant la page
  // dans un navigateur, pas par les tests.
  for (const line of [
    "Votre commande AB-2291",
    "Your order #PO-211-15381384950391486",
    "Commande n 77213445",
    "Facture INV-20451",
  ]) {
    const r = parseCart(`${line}\nT-shirt coton col rond  5,99 EUR`);
    assert.equal(r.items.length, 1, `"${line}" ne doit pas compter comme un produit`);
    assert.match(r.items[0].title, /T-shirt/);
  }
});

test("regression : un produit contenant un nombre reste un produit", () => {
  // Le filtre exige deux signaux conjoints (mot de commande ET identifiant),
  // sinon un produit a reference chiffree disparaitrait.
  const r = parseCart("Lot de 100 perles rondes 6mm  4,50 EUR");
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].unitPrice, 4.5);
});

test("regression : selecteur de quantite -/N/+ lu comme une quantite", () => {
  // Les paniers reels affichent la quantite avec deux boutons. Une fois le
  // texte extrait cela donne trois lignes, et chacune coupait l accumulation
  // du libelle : TOUS les prix de la page etaient perdus.
  const r = parseCart("Jean mom taille haute\n-\n2\n+\n19,99 EUR");
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].qty, 2);
  assert.equal(r.items[0].unitPrice, 19.99);

  assert.equal(parseCart("Jean mom\n- 3 +\n19,99 EUR").items[0].qty, 3);
  assert.equal(parseCart("Jean mom\n\u2212\n4\n\uFF0B\n19,99 EUR").items[0].qty, 4);
});

test("regression : prix barre sur sa propre ligne, le courant l emporte", () => {
  const r = parseCart("Jean mom taille haute\n29,99 EUR\n19,99 EUR");
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].unitPrice, 19.99, "le prix barre ne doit pas etre retenu");
});

test("regression : montants en dollars lus et signales, pas confondus", () => {
  // "US $19.99" laisse le fragment "US" : il ne doit pas ouvrir un article,
  // sinon le prix se rattache a ce fragment, jete, et disparait.
  const r = parseCart("Wireless Earbuds TWS\nUS $19.99\nx 1\nUSB Cable 2m\nUS $2.30\nx 3");
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].unitPrice, 19.99);
  assert.equal(r.items[1].unitPrice, 2.3);
  assert.deepEqual(r.currencies, ["USD"]);
  assert.equal(r.foreignCurrency, true, "une devise etrangere doit etre signalee");

  const eur = parseCart("T-shirt coton\n5,99 EUR");
  assert.equal(eur.foreignCurrency, false);
});

test("regression : un fragment court n ouvre pas d article, un libelle si", () => {
  // Les deux regles partagent le meme seuil, sinon elles se contredisent.
  assert.equal(parseCart("Earbuds TWS\nUS $19.99").items.length, 1);
  assert.equal(parseCart("Coque transparente\nJean mom delave  19,99 EUR").items.length, 2);
});
