/**
 * Sonde de couverture sur titres produits REELS.
 *
 * Mon corpus de test est ecrit par moi, donc il mesure surtout ma propre
 * imagination. Cette sonde passe le resolveur sur un jeu public de titres
 * reels et rend la couverture par categorie, plus un echantillon de ce qui
 * n'est pas reconnu.
 *
 * Usage : node tools/coverage-probe/probe.js <chemin.csv> [colonneTitre] [colonneCategorie]
 *
 * Le fichier est lu comme de la donnee, jamais execute. Le chemin est passe en
 * argument pour qu'aucun code ne soit charge depuis son dossier.
 */

import { readFile } from "node:fs/promises";
import { resolveText, ITEMS } from "../../packages/catalog/src/index.js";

/** Lecteur CSV minimal : guillemets, doublage des guillemets, sauts de ligne inclus. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const [, , path, titleCol = "title", catCol = "top_category"] = process.argv;
if (!path) {
  console.error("Chemin du CSV manquant.");
  process.exit(2);
}

const rows = parseCsv(await readFile(path, "utf8"));
const header = rows[0];
const ti = header.indexOf(titleCol);
const ci = header.indexOf(catCol);
if (ti === -1) {
  console.error(`Colonne "${titleCol}" absente. Colonnes : ${header.join(", ")}`);
  process.exit(2);
}

const byCat = new Map();
const misses = [];
let total = 0;
let hit = 0;

for (const row of rows.slice(1)) {
  const title = row[ti];
  if (!title || title.length < 3) continue;
  const cat = ci === -1 ? "(toutes)" : row[ci] || "(vide)";
  total++;
  const r = resolveText(title);
  const ok = r.matches.length > 0;
  if (ok) hit++;
  else if (misses.length < 4000) misses.push({ title, cat });
  if (!byCat.has(cat)) byCat.set(cat, { total: 0, hit: 0 });
  const b = byCat.get(cat);
  b.total++;
  if (ok) b.hit++;
}

const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + "%" : "-");

console.log(`Catalogue : ${ITEMS.length} articles`);
console.log(`Titres reels testes : ${total}`);
console.log(`Reconnus : ${hit} (${pct(hit, total)})\n`);

console.log("Par categorie du jeu de donnees :");
const cats = [...byCat.entries()].sort((a, b) => b[1].total - a[1].total);
for (const [cat, b] of cats.slice(0, 20)) {
  const bar = "#".repeat(Math.round((20 * b.hit) / b.total));
  console.log(`  ${pct(b.hit, b.total).padStart(6)}  ${String(b.total).padStart(5)}  ${bar.padEnd(20)}  ${cat}`);
}

// Mots les plus frequents parmi les titres non reconnus : ils pointent les
// familles manquantes du catalogue bien mieux qu'une lecture a l'oeil.
const freq = new Map();
const STOP = new Set(["for","the","and","with","women","men","womens","mens","girls","boys","pcs","pc","set","new","style","fashion","casual","summer","winter","spring","autumn","1pc","2pcs","3pcs","4pcs","5pcs","of","in","a","to","y2k","daily","solid","color","colour","print","printed","cute","simple","elegant","sweet","plus","size","mini","small","large"]);
for (const m of misses) {
  for (const w of m.title.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/)) {
    if (w.length < 4 || STOP.has(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
}
console.log(`\nMots les plus frequents dans les ${misses.length} titres non reconnus :`);
const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
console.log("  " + top.map(([w, n]) => `${w}(${n})`).join("  "));

console.log("\nEchantillon de titres non reconnus :");
for (const m of misses.slice(0, 12)) console.log(`  [${m.cat}] ${m.title.slice(0, 95)}`);
