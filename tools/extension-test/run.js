/**
 * Eprouve le selecteur de zone panier dans un vrai navigateur.
 *
 * On ne peut pas tester ca en Node : la selection repose sur innerText et sur
 * la mise en page, donc elle n'a de sens que dans un moteur de rendu. On
 * charge chaque page synthetique dans Chrome headless, on y injecte le
 * selecteur et le parseur, et on verifie que les articles trouves sont ceux
 * du panier, sans les blocs de recommandation voisins.
 *
 * Les pages de test portent volontairement beaucoup de bruit : navigation,
 * "vous aimerez aussi", bandeau de livraison, pied de page. C'est la que le
 * piege se trouve, pas dans un panier propre.
 *
 * Usage : node tools/extension-test/run.js
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];

/** Ce que chaque page doit produire, et ce qu'elle ne doit surtout pas. */
const CASES = [
  {
    page: "cart-a.html",
    expect: ["coque", "cable", "tshirt"],
    reject: ["robe", "sandales", "sac", "lunettes"],
    why: "le bloc de recommandation voisin ne doit pas entrer dans le panier",
  },
  {
    page: "cart-b.html",
    expect: ["ecouteurs", "coque", "planteartificielle", "panierrangement"],
    reject: ["batterie", "protection", "led"],
    why: "page anglaise, encart 'frequently bought together' a ecarter",
  },
  {
    page: "order-c.html",
    expect: ["bougie", "mug", "couverture"],
    reject: [],
    why: "page de confirmation, tableau d'articles",
  },
  {
    page: "temu-fr.html",
    expect: ["coque", "accessoirecheveux", "led"],
    reject: ["bougie", "mug", "tapis", "planteartificielle", "serviette"],
    why: "bloc 'Recommande pour vous' a ecarter, bandeau promotionnel en tete",
  },
  {
    page: "aliexpress-en.html",
    expect: ["ecouteurs", "cable", "panierrangement"],
    reject: ["batterie", "protection", "support", "led"],
    why: "titres anglais, prix en dollars, prix barre avant le prix courant",
  },
  {
    page: "stepper-hard.html",
    expect: ["pantalon", "pull", "bijoufantaisie"],
    reject: [],
    why: "quantite rendue par un selecteur -/2/+ et non par un marqueur textuel",
  },
];

async function findChrome() {
  for (const p of CHROME) {
    try {
      await readFile(p);
      return p;
    } catch {}
  }
  throw new Error("Aucun navigateur trouve.");
}

const chrome = await findChrome();
const work = join(tmpdir(), "colis-exttest");
await mkdir(work, { recursive: true });

// On eprouve le fichier REELLEMENT injecte par l'extension, pas le module
// source : c'est lui qui part chez l'utilisateur, et la generation pourrait
// le casser sans toucher a extract.js.
const injected = await readFile(join(ROOT, "apps/extension/src/injected.js"), "utf8");
const bundle = await readFile(join(ROOT, "apps/web/engine.bundle.js"), "utf8");

let failures = 0;

for (const c of CASES) {
  const page = await readFile(join(HERE, "pages", c.page), "utf8");
  const harness =
    page +
    `\n<script id="injected" type="text/plain">` +
    injected.replace(/<\/script>/gi, "<\\/script>") +
    `</script>\n<script type="module">\n` +
    bundle.replace(/^export \{[^}]*\};\s*$/m, "") +
    `
window.addEventListener("load", () => setTimeout(() => {
  try {
    // Meme chemin que chrome.scripting.executeScript : la valeur rendue est
    // celle de la derniere expression du fichier injecte.
    const picked = (0, eval)(document.getElementById("injected").textContent);
    const parsed = parseCart(picked.text);
    const ids = [];
    for (const it of parsed.items) {
      const r = resolveText(it.title);
      if (r.matches.length) ids.push(r.matches.sort((a,b)=>b.via.length-a.via.length)[0].id);
    }
    document.title = JSON.stringify({ how: picked.how, len: picked.length, ids: [...new Set(ids)], top: picked.top });
  } catch (e) { document.title = JSON.stringify({ error: String(e && e.message || e) }); }
}, 250));
<\/script>`;

  const file = join(work, c.page);
  await writeFile(file, harness, "utf8");

  const { stdout } = await run(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--virtual-time-budget=4000",
      "--dump-dom",
      "file:///" + file.replace(/\\/g, "/"),
    ],
    { maxBuffer: 40 * 1024 * 1024, windowsHide: true }
  );

  const m = stdout.match(/<title>([\s\S]*?)<\/title>/);
  let result;
  try {
    result = JSON.parse(
      (m ? m[1] : "{}").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    );
  } catch {
    result = { error: "titre illisible : " + (m ? m[1].slice(0, 120) : "absent") };
  }

  if (result.error) {
    console.log(`ECHEC  ${c.page} : ${result.error}`);
    failures++;
    continue;
  }

  const found = result.ids || [];
  const missing = c.expect.filter((id) => !found.includes(id));
  const intruders = c.reject.filter((id) => found.includes(id));

  if (missing.length === 0 && intruders.length === 0) {
    console.log(`OK     ${c.page}  [${result.how}, ${result.len} car.]  ${found.join(", ")}`);
  } else {
    console.log(`ECHEC  ${c.page}  [${result.how}, ${result.len} car.]`);
    if (missing.length) console.log(`         manquants : ${missing.join(", ")}`);
    if (intruders.length) console.log(`         intrus    : ${intruders.join(", ")}  (${c.why})`);
    console.log(`         trouves   : ${found.join(", ") || "aucun"}`);
    console.log("         candidats : " + (result.top||[]).map(t=>`${t.tag} len=${t.len} p=${t.p} q=${t.q} v=${t.v}`).join(" ; "));
    failures++;
  }
}

console.log(`\n${CASES.length - failures}/${CASES.length} pages extraites correctement.`);
if (failures) process.exit(1);
