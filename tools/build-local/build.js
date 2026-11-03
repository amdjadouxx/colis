/**
 * Construit une page locale autonome.
 *
 * But : pouvoir essayer le produit sans serveur, sans dependance et sans rien
 * publier. On concatene les modules du moteur en un seul fichier ESM, avec les
 * donnees JSON inlinees, puis on ecrit une page qui l'importe.
 *
 * Le bundle produit est du JavaScript valide pour Node comme pour le
 * navigateur : aucune API de plateforme n'y est utilisee. C'est deliberé,
 * parce que c'est ce qui permet de VERIFIER le bundle en Node avant de le
 * donner, au lieu de supposer qu'il marche.
 *
 * Usage : node tools/build-local/build.js
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(ROOT, "apps", "web");

/** Modules concatenes, dans l'ordre des dependances. */
const MODULES = [
  "packages/partition/src/index.js",
  "packages/rules/src/index.js",
  "packages/catalog/src/index.js",
  "packages/parse/src/index.js",
  "packages/analyse/src/index.js",
  "packages/analyse/src/pipeline.js",
];

/** Donnees JSON a inliner, sous le nom de variable attendu par le module. */
const DATA = {
  catalog: "packages/catalog/data/catalog.json",
  extra: "packages/catalog/data/catalog-extra.json",
  aliasesEn: "packages/catalog/data/aliases-en.json",
};

const read = (rel) => readFile(join(ROOT, rel), "utf8");

/**
 * Retire les imports et le mot-cle export, qui n'ont pas de sens dans un
 * fichier concatene. Tout devient une declaration de portee module.
 */
function flatten(source) {
  return source
    .split("\n")
    .filter((line) => !/^\s*import\s/.test(line))
    .join("\n")
    .replace(/^export\s+(const|function|class|let)\s/gm, "$1 ");
}

const dataBlock = (
  await Promise.all(
    Object.entries(DATA).map(async ([name, rel]) => `const ${name} = ${(await read(rel)).trim()};`)
  )
).join("\n\n");

const bodies = await Promise.all(
  MODULES.map(async (rel) => `// ===== ${rel} =====\n${flatten(await read(rel))}`)
);

const bundle = `/**
 * GENERE par tools/build-local/build.js. Ne pas modifier a la main.
 * Source de verite : les modules de packages/.
 */

${dataBlock}

${bodies.join("\n\n")}

export { analyseCart, parseCart, partition, estimate, ITEMS, CATALOG_VERSION, WARNING, resolveText };
`;

await mkdir(OUT_DIR, { recursive: true });
await writeFile(join(OUT_DIR, "engine.bundle.js"), bundle, "utf8");

// Le moteur est aussi inline dans la page. Un navigateur refuse d'importer un
// module ESM externe depuis une URL file://, donc une page qui ferait
// `import "./engine.bundle.js"` resterait vide en double-clic. Le fichier
// separe sert a la verification en Node, la page inline sert a l'usage.
const template = await read("tools/build-local/template.html");
const inlined = bundle.replace(/^export \{[^}]*\};\s*$/m, "");
const page = template.replace("/* __ENGINE__ */", () => inlined);
if (!page.includes("function analyseCart")) {
  console.error("Le moteur n'a pas ete injecte dans la page.");
  process.exit(1);
}
await writeFile(join(OUT_DIR, "index.html"), page, "utf8");

// Extension : meme moteur, plus le lecteur de panier transforme en script
// injectable. Un script injecte par `files` rend la valeur de sa derniere
// expression, d'ou l'enveloppe en expression de fonction immediatement
// appelee : pas de module, pas d'import, une valeur en retour.
const EXT_SRC = join(ROOT, "apps", "extension", "src");
const extract = await read("apps/extension/src/extract.js");
const injected = `/**
 * GENERE par tools/build-local/build.js depuis extract.js. Ne pas modifier.
 */
(() => {
${flatten(extract)}
  try {
    return extractCartText(document);
  } catch (err) {
    return { text: "", how: "erreur : " + err.message, length: 0, prices: 0, qtys: 0 };
  }
})();
`;
await writeFile(join(EXT_SRC, "injected.js"), injected, "utf8");
await writeFile(join(EXT_SRC, "engine.bundle.js"), bundle, "utf8");

console.log(`Bundle  : apps/web/engine.bundle.js (${(bundle.length / 1024).toFixed(0)} Ko)`);
console.log(`Extension : apps/extension/src/{injected,engine.bundle}.js`);
console.log(`Page    : apps/web/index.html (${(page.length / 1024).toFixed(0)} Ko, autonome)`);
console.log(`Modules : ${MODULES.length}  |  donnees inlinees : ${Object.keys(DATA).length}`);
