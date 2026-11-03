import test from "node:test";
import assert from "node:assert/strict";
import { partition, fewestCategories, mostCategories } from "../src/index.js";

const art = (id, ...codes) => ({ id, codes });

test("panier vide", () => {
  const p = partition([]);
  assert.equal(p.min, 0);
  assert.equal(p.max, 0);
  assert.equal(p.certain, true);
});

test("la quantite ne compte pas : dix t-shirts identiques font une categorie", () => {
  const dix = Array.from({ length: 10 }, (_, i) => art(`tshirt-${i}`, "6109.10"));
  const p = partition(dix);
  assert.equal(p.min, 1);
  assert.equal(p.max, 1);
});

test("deux codes determines differents font deux categories", () => {
  // Rouge a levres 3304.10 et mascara 3304.20 : meme position, sous-positions
  // differentes. C'est le cas que la presse rate en parlant de "cosmetiques".
  const p = partition([art("rouge", "3304.10"), art("mascara", "3304.20")]);
  assert.equal(p.min, 2);
  assert.equal(p.max, 2);
  assert.equal(p.certain, true);
});

test("un article indetermine seul reste une categorie", () => {
  // La fibre change le code mais pas le compte : rien d'autre ne peut fusionner.
  const p = partition([art("tshirt", "6109.10", "6109.90")]);
  assert.equal(p.min, 1);
  assert.equal(p.max, 1);
  assert.equal(p.certain, true);
});

test("l'incertitude ne cree une fourchette que s'il y a une collision possible", () => {
  // Coque (3926.90 ou 4202.32) et support (3926.90, 7326.90 ou 8302.50)
  // peuvent tous deux tomber sur 3926.90, ou non.
  const p = partition([
    art("coque", "3926.90", "4202.32"),
    art("support", "3926.90", "7326.90", "8302.50"),
  ]);
  assert.equal(p.min, 1);
  assert.equal(p.max, 2);
  assert.equal(p.certain, false);
  assert.deepEqual(p.minCodes, ["3926.90"]);
});

test("familles disjointes : pas de fourchette malgre l'indetermination", () => {
  const p = partition([
    art("tshirt", "6109.10", "6109.90"),
    art("pull", "6110.20", "6110.30"),
    art("baskets", "6403.99", "6404.11"),
  ]);
  assert.equal(p.min, 3);
  assert.equal(p.max, 3);
  assert.equal(p.certain, true);
});

test("le minimum est exact, pas glouton", () => {
  // Piege classique du glouton : le code "X" couvre 3 articles et parait le
  // meilleur premier choix, mais la solution optimale en 2 codes passe par
  // "A" et "B". Un glouton repondrait 3.
  const articles = [
    art("a1", "X", "A"),
    art("a2", "X", "A"),
    art("a3", "X", "B"),
    art("a4", "A"),
    art("a5", "B"),
  ];
  assert.equal(fewestCategories(articles).count, 2);
});

test("le maximum sature quand les candidats manquent", () => {
  // Trois articles, deux codes possibles en tout : au mieux 2 categories.
  const articles = [
    art("a", "P", "Q"),
    art("b", "P", "Q"),
    art("c", "P", "Q"),
  ];
  assert.equal(mostCategories(articles), 2);
  assert.equal(fewestCategories(articles).count, 1);
});

test("collisions : acquise contre possible", () => {
  const p = partition([
    art("jouet", "9503.00"),
    art("peluche", "9503.00"),
    art("coque", "3926.90", "4202.32"),
    art("support", "3926.90", "7326.90"),
  ]);
  const acquise = p.collisions.find((c) => c.certain);
  const possible = p.collisions.find((c) => !c.certain);
  assert.deepEqual([acquise.a, acquise.b], ["jouet", "peluche"]);
  assert.deepEqual([possible.a, possible.b], ["coque", "support"]);
  assert.equal(p.min, 2); // 9503.00 + 3926.90
  assert.equal(p.max, 3); // 9503.00 + 3926.90 + 4202.32 ou 7326.90
});

test("un article sans code est une erreur, pas un silence", () => {
  assert.throws(() => partition([{ id: "vide", codes: [] }]), /aucun code candidat/);
});

test("tient la charge d'un gros panier sans exploser", () => {
  // 40 articles, candidats qui se recouvrent par paquets de 4.
  const articles = Array.from({ length: 40 }, (_, i) =>
    art(`a${i}`, `C${Math.floor(i / 4)}`, `D${i % 7}`)
  );
  const started = Date.now();
  const p = partition(articles);
  assert.ok(Date.now() - started < 1000, "la resolution doit rester sous la seconde");
  assert.ok(p.min <= p.max);
  assert.ok(p.min >= 1);
});
