/**
 * Garde-fou : le moteur et l'extension ne doivent appeler aucun reseau.
 *
 * Ce n'est pas une preference de style, c'est ce qui fait tenir tout le
 * paragraphe RGPD de docs/juridique.md. Un panier colle peut contenir un nom, une
 * adresse, un numero de commande. Tant que rien ne sort de la machine,
 * l'editeur ne traite aucune donnee personnelle : pas de base legale a
 * fournir, pas de duree de conservation, pas de bandeau.
 *
 * Cette propriete disparait a la premiere ligne de telemetrie, et elle
 * disparaitrait en silence. D'ou ce test.
 *
 * Les outils de tools/ sont exclus : taric-sync et rules-watch appellent le
 * reseau par construction, hors du chemin utilisateur et sans aucune donnee
 * de panier. apps/api est exclu aussi : c'est un serveur, et docs/juridique.md dit
 * explicitement que le deployer ferait tomber ce raisonnement.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Dossiers parcourus : tout ce qui tourne chez l'utilisateur. */
const SCANNED = [
  "packages/partition/src",
  "packages/rules/src",
  "packages/catalog/src",
  "packages/parse/src",
  "packages/analyse/src",
  "packages/extract/src",
  "apps/extension/src",
];

/** Tout ce qui peut faire sortir une donnee du navigateur. */
/** @type {[RegExp, string][]} */
const FORBIDDEN = [
  [/\bfetch\s*\(/, "fetch()"],
  [/XMLHttpRequest/, "XMLHttpRequest"],
  [/\bWebSocket\b/, "WebSocket"],
  [/sendBeacon/, "navigator.sendBeacon"],
  [/\bEventSource\b/, "EventSource"],
  [/\bimport\s*\(/, "import() dynamique"],
  [/navigator\.geolocation/, "geolocalisation"],
  [/\.src\s*=\s*["'`]https?:/, "chargement distant"],
];

/**
 * Stockage navigateur : pas un appel reseau, mais une persistance par
 * visiteur que docs/juridique.md ne couvre pas. Interdit tant que ce n'est pas decide.
 */
/** @type {[RegExp, string][]} */
const STORAGE = [
  [/localStorage/, "localStorage"],
  [/sessionStorage/, "sessionStorage"],
  [/indexedDB/i, "IndexedDB"],
  [/document\.cookie/, "cookie"],
];

async function sourcesIn(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isFile()) continue;
    // Les fichiers generes sont des copies des sources deja parcourues.
    if (e.name === "injected.js" || e.name === "engine.bundle.js") continue;
    if (!/\.(js|html)$/.test(e.name)) continue;
    out.push({ path: `${dir}/${e.name}`, text: await readFile(join(ROOT, dir, e.name), "utf8") });
  }
  return out;
}

const files = (await Promise.all(SCANNED.map(sourcesIn))).flat();

test("le perimetre analyse n'est pas vide", () => {
  assert.ok(files.length >= 6, `seulement ${files.length} fichiers parcourus, chemins a revoir`);
});

test("aucun appel reseau dans le moteur ni dans l'extension", () => {
  const found = [];
  for (const f of files) {
    for (const [re, label] of FORBIDDEN) {
      if (re.test(f.text)) found.push(`${f.path} : ${label}`);
    }
  }
  assert.deepEqual(
    found,
    [],
    `Sortie reseau detectee. Elle fait tomber le raisonnement RGPD de docs/juridique.md :\n  ${found.join("\n  ")}`
  );
});

test("aucun stockage persistant cote navigateur", () => {
  const found = [];
  for (const f of files) {
    for (const [re, label] of STORAGE) {
      if (re.test(f.text)) found.push(`${f.path} : ${label}`);
    }
  }
  assert.deepEqual(found, [], `Stockage navigateur detecte :\n  ${found.join("\n  ")}`);
});

test("l'extension ne declare ni hote ni permission large", () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, "apps/extension/manifest.json"), "utf8"));
  assert.equal(manifest.host_permissions, undefined, "aucun host_permissions ne doit etre declare");
  assert.deepEqual(
    [...(manifest.permissions ?? [])].sort(),
    ["activeTab", "scripting"],
    "les permissions doivent rester au minimum qui permette de lire un panier"
  );
  assert.equal(manifest.content_scripts, undefined, "pas de script injecte en permanence");
});

