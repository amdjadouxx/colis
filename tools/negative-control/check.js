/**
 * Controles negatifs, sur copie.
 *
 * Un test qui passe ne prouve rien s'il passe aussi quand on casse le code.
 * Ce script reintroduit chaque bug connu et verifie que la suite ROUGIT.
 *
 * Il travaille sur une copie du depot dans un dossier temporaire. La premiere
 * version mutait les sources en place et un `cp` de restauration a echoue sans
 * bruit : la source est restee cassee, et seul un test de regression l'a
 * rattrapee. Ne jamais muter les sources pour un controle negatif.
 *
 * Usage : node tools/negative-control/check.js
 */

import { cp, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Chaque mutation doit faire echouer la suite. `file` est relatif a la racine.
 * @type {{name: string, file: string, from: string, to: string}[]}
 */
const MUTATIONS = [
  {
    name: "frontiere de mot sur EUR retiree (bug secteur/20W)",
    file: "packages/parse/src/index.js",
    from: "(€|\\bEUR\\b|\\$|\\bUSD\\b|£|\\bGBP\\b))\\s{0,2}",
    to: "(€|EUR|\\$|USD|£|GBP))\\s{0,2}",
  },
  {
    name: "premier montant de la ligne au lieu du dernier (bug lot de 3)",
    file: "packages/parse/src/index.js",
    from: "matches[matches.length - 1]",
    to: "matches[0]",
  },
  {
    name: "seuil de titre remonte a 6 lettres (bug Mug, Jean)",
    file: "packages/parse/src/index.js",
    from: 'const looksLikeTitle = (s) => s.replace(/[^a-zA-Z]/g, "").length >= 3;',
    to: 'const looksLikeTitle = (s) => s.replace(/[^a-zA-Z]/g, "").length >= 6;',
  },
  {
    name: "selecteur de quantite -/N/+ non replie (tous les prix perdus)",
    file: "packages/parse/src/index.js",
    from: "  collapseSteppers(raw);",
    to: "  // collapseSteppers(raw);",
  },
  {
    name: "prix barre retenu au lieu du prix courant",
    file: "packages/parse/src/index.js",
    from: "      items[items.length - 1].unitPrice = price;",
    to: "      items[items.length - 1].unitPrice = items[items.length - 1].unitPrice ?? price;",
  },
  {
    name: "devise etrangere confondue avec des euros",
    file: "packages/parse/src/index.js",
    from: "    foreignCurrency: currencies.size > 0 && !(currencies.size === 1 && currencies.has(\"EUR\")),",
    to: "    foreignCurrency: false,",
  },
  {
    name: "espaces libres avant le symbole monetaire",
    file: "packages/parse/src/index.js",
    from: "(\\d+(?:[.,]\\d{1,2})?)\\s?(?:(€",
    to: "(\\d+(?:[.,]\\d{1,2})?)\\s*(?:(€",
  },
  {
    name: "glouton au lieu du minimum exact de categories",
    file: "packages/partition/src/index.js",
    from: "if (picked.size >= best) return;",
    to: "if (picked.size >= best && false) return;",
  },
  {
    name: "lignes sans prix refusionnees dans la suivante",
    file: "packages/parse/src/index.js",
    from: "if (opensNewItem) flush(null);",
    to: "if (false) flush(null);",
  },
  {
    name: "telemetrie introduite dans le moteur (fait tomber le RGPD)",
    file: "packages/analyse/src/index.js",
    from: 'import { estimate } from "@colis/rules";',
    to: 'import { estimate } from "@colis/rules";\nfetch("https://example.test/telemetry");',
  },
  {
    name: "stockage navigateur introduit dans l extension",
    file: "apps/extension/src/popup.js",
    from: "const message = (html) =>",
    to: "localStorage.setItem(\"last\", \"1\");\nconst message = (html) =>",
  },
  {
    name: "permission d hote large ajoutee au manifeste",
    file: "apps/extension/manifest.json",
    from: '"permissions": ["activeTab", "scripting"],',
    to: '"permissions": ["activeTab", "scripting"],\n  "host_permissions": ["<all_urls>"],',
  },
];

async function suitePasses(dir) {
  try {
    await run(process.execPath, ["--test", "packages/catalog/test/catalog.test.js", "packages/partition/test/partition.test.js", "packages/parse/test/invariants.test.js", "packages/parse/test/regressions.test.js", "packages/analyse/test/pipeline.test.js", "test/policy.test.js"], {
      cwd: dir,
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

const work = await mkdtemp(join(tmpdir(), "colis-negctl-"));
let undetected = 0;

try {
  for (const m of MUTATIONS) {
    const dir = join(work, m.name.replace(/[^a-z0-9]+/gi, "-").slice(0, 40));
    await cp(ROOT, dir, {
      recursive: true,
      filter: (src) => !src.includes("node_modules") && !src.includes(".git"),
    });

    const target = join(dir, m.file);
    const original = await readFile(target, "utf8");
    if (!original.includes(m.from)) {
      console.log(`SAUTE   ${m.name}`);
      console.log(`        motif absent de ${m.file} : le code a change, mutation a reecrire`);
      undetected++;
      continue;
    }
    await writeFile(target, original.replace(m.from, m.to), "utf8");

    const passed = await suitePasses(dir);
    if (passed) {
      console.log(`NON VU  ${m.name}`);
      console.log(`        la suite reste verte alors que le bug est reintroduit`);
      undetected++;
    } else {
      console.log(`DETECTE ${m.name}`);
    }
  }
} finally {
  await rm(work, { recursive: true, force: true });
}

console.log(
  `\n${MUTATIONS.length - undetected}/${MUTATIONS.length} bugs reintroduits sont detectes par la suite.`
);
if (undetected > 0) {
  console.log("Des bugs connus peuvent revenir sans faire rougir la CI.");
  process.exit(1);
}
