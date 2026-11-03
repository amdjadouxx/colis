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
