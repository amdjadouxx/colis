/**
 * Garde-fou de mise en ligne.
 *
 * Separe de `npm test` a dessein : ces points ne sont pas des defauts de
 * code, ce sont des decisions et des demarches qui n ont pas encore ete
 * faites. Les melanger a la suite rendrait celle-ci rouge en permanence et
 * on finirait par l ignorer.
 *
 * Usage : node tools/deploy-gate/check.js
 */

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const lire = async (rel) => {
  try {
    return await readFile(join(ROOT, rel), "utf8");
  } catch {
    return null;
  }
};

const points = [];
const ajouter = (ok, nom, detail) => points.push({ ok, nom, detail });

const legal = await lire("apps/web/legal.html");
if (legal === null) {
  ajouter(false, "Mentions legales generees", "apps/web/legal.html absent : lancer npm run build:local");
} else {
  const champs = legal.match(/__[A-Z_]+__/g) || [];
  ajouter(
    champs.length === 0,
    "Mentions legales completes",
    champs.length ? `${champs.length} champ(s) a remplir : ${[...new Set(champs)].join(", ")}` : "aucun champ vide"
  );
}

const page = await lire("apps/web/index.html");
ajouter(
  page !== null && page.includes("legal.html"),
  "Lien vers les mentions legales",
  page === null ? "page non generee" : page.includes("legal.html") ? "present dans le pied de page" : "absent"
);

const manifest = await lire("apps/extension/manifest.json");
if (manifest) {
  const m = JSON.parse(manifest);
  ajouter(Boolean(m.icons), "Icones de l extension", m.icons ? "declarees" : "aucune : requis pour une publication sur le store, pas pour un chargement local");
  ajouter(!m.host_permissions, "Aucune permission d hote", m.host_permissions ? "host_permissions declare" : "activeTab seul");
}

const backlog = (await lire("LEGAL.md")) ?? "";
ajouter(false, "CGU des trois plateformes lues", "non fait, voir LEGAL.md section 4");
ajouter(false, "Clause de non-responsabilite relue par un juriste", "non fait, question de fond non tranchee");
ajouter(
  backlog.includes("Cloudflare Web Analytics"),
  "Decision mesure d audience",
  "le script de Cloudflare charge une balise distante et ferait tomber la propriete zero reseau"
);

console.log("GARDE-FOU DE MISE EN LIGNE\n");
let bloquants = 0;
for (const p of points) {
  if (!p.ok) bloquants++;
  console.log(`${p.ok ? "OK      " : "A FAIRE "} ${p.nom}`);
  console.log(`         ${p.detail}`);
}
console.log(`\n${points.length - bloquants}/${points.length} points prets.`);
if (bloquants) {
  console.log("Mise en ligne prematuree tant que ces points restent ouverts.");
  process.exit(1);
}
