/**
 * Remplit un panier invite sur une place de marche, puis fait tourner le
 * lecteur de l'extension sur la page panier reelle.
 *
 * But : eprouver le lecteur sur du markup reel, que je ne peux pas ecrire
 * moi-meme. Mes six pages de test sont des imitations.
 *
 * Limites posees : aucune authentification, aucun paiement, aucune commande.
 * On ajoute des articles a un panier invite, on lit la page, on s'arrete.
 * Le navigateur reste ouvert pour que l'utilisateur voie ce qui s'est passe.
 *
 * Usage : node tools/live-cart/drive.js
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 9334;
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PROFILE = join(tmpdir(), "colis-live-profil");
const OUT = join(tmpdir(), "colis-live-pages");

/** Sites essayes, avec leur page panier. */
const SITES = [
  {
    nom: "AliExpress",
    produit: "https://fr.aliexpress.com/w/wholesale-phone-case.html",
    panier: "https://fr.aliexpress.com/p/trade/index.html",
  },
  {
    nom: "Temu",
    produit: "https://www.temu.com/fr/search_result.html?search_key=phone%20case",
    panier: "https://www.temu.com/fr/cart.html",
  },
  {
    nom: "Shein",
    produit: "https://fr.shein.com/search?keyword=t-shirt",
    panier: "https://fr.shein.com/cart",
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function devtoolsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return (await res.json()).webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error("DevTools injoignable.");
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  let id = 0;
  /** @type {Promise<void>} */
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", () => reject(new Error("WebSocket en echec")));
  });
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    const slot = pending.get(msg.id);
    if (!slot) return;
    pending.delete(msg.id);
    msg.error ? slot.reject(new Error(msg.error.message)) : slot.resolve(msg.result);
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params, sessionId }));
    });
  return { ready, send, close: () => ws.close() };
}

/** Cherche un bouton d'ajout au panier par son libelle, et le clique. */
const CLICK_ADD = `(() => {
  const mots = ["ajouter au panier", "add to cart", "ajouter", "add to bag"];
  const noeuds = [...document.querySelectorAll('button, a, div[role="button"], span')];
  for (const n of noeuds) {
    const t = (n.innerText || n.textContent || "").trim().toLowerCase();
    if (t.length > 60) continue;
    if (mots.some((m) => t === m || t.startsWith(m))) {
      n.click();
      return "clique: " + t.slice(0, 40);
    }
  }
  return "aucun bouton d'ajout trouve";
})()`;

await mkdir(PROFILE, { recursive: true });
await mkdir(OUT, { recursive: true });

const chrome = spawn(
  CHROME,
  [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1400,1000",
    "about:blank",
  ],
  { detached: true, stdio: "ignore" }
);
chrome.unref();

const cdp = connect(await devtoolsUrl());
await cdp.ready;

const injected = await readFile(join(ROOT, "apps/extension/src/injected.js"), "utf8");
const bundle = (await readFile(join(ROOT, "apps/web/engine.bundle.js"), "utf8")).replace(
  /^export \{[^}]*\};\s*$/m,
  ""
);

const LIRE = `(() => {
  ${bundle}
  const picked = ${injected}
  const parsed = parseCart(picked.text);
  const ids = [];
  for (const it of parsed.items) {
    const r = resolveText(it.title);
    if (r.matches.length) ids.push(r.matches.sort((a,b)=>b.via.length-a.via.length)[0].id);
  }
  return JSON.stringify({ how: picked.how, len: picked.length, lignes: parsed.items.length,
    valeur: parsed.totalValue, devises: parsed.currencies,
    ids: [...new Set(ids)], extrait: picked.text.slice(0, 400) });
})()`;

async function ouvrir(url) {
  const { targetId } = await cdp.send("Target.createTarget", { url });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  return { targetId, sessionId };
}

const evaluer = async (sessionId, expression) =>
  cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: false }, sessionId);

for (const site of SITES) {
  console.log(`\n=== ${site.nom}`);
  let onglet;
  try {
    onglet = await ouvrir(site.produit);
    await sleep(8000);

    const titre = await evaluer(onglet.sessionId, "document.title");
    console.log(`  page produit : ${titre.result.value || "(vide)"}`);

    const clic = await evaluer(onglet.sessionId, CLICK_ADD);
    console.log(`  ajout : ${clic.result.value}`);
    await sleep(5000);

    await cdp.send("Page.navigate", { url: site.panier }, onglet.sessionId);
    await sleep(9000);

    const titrePanier = await evaluer(onglet.sessionId, "document.title");
    console.log(`  page panier : ${titrePanier.result.value || "(vide)"}`);

    const lu = await evaluer(onglet.sessionId, LIRE);
    if (lu.exceptionDetails) {
      console.log(`  lecteur : ERREUR ${lu.exceptionDetails.text}`);
    } else {
      const r = JSON.parse(lu.result.value);
      console.log(`  zone lue : ${r.how}, ${r.len} caracteres, ${r.lignes} lignes`);
      console.log(`  valeur : ${r.valeur} ${r.devises.join(",")}`);
      console.log(`  articles reconnus : ${r.ids.join(", ") || "AUCUN"}`);
      console.log(`  extrait : ${r.extrait.replace(/\n/g, " | ").slice(0, 260)}`);
    }

    const html = await evaluer(onglet.sessionId, "document.documentElement.outerHTML");
    const fichier = join(OUT, site.nom.toLowerCase() + "-panier.html");
    await writeFile(fichier, html.result.value || "", "utf8");
    console.log(`  DOM enregistre : ${fichier}`);
  } catch (err) {
    console.log(`  ECHEC : ${err.message}`);
  }
}

cdp.close();
console.log("\nTermine. Aucune commande passee. Le navigateur reste ouvert.");
