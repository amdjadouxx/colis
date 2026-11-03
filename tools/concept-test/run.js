/**
 * Test du concept sur des paniers realistes.
 *
 * Ce n'est pas un test unitaire : c'est une tentative de REFUTATION. La
 * question n'est pas "le code tourne-t-il" mais "l'outil apporte-t-il quelque
 * chose qu'on ne fait pas de tete".
 *
 * Les seuils sont poses ici, dans le fichier, avant d'avoir vu les resultats.
 * Le script sort en code 1 si le concept echoue : c'est le but, pas un bug.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { partition } from "../../packages/partition/src/index.js";
import { estimate } from "../../packages/rules/src/index.js";
import { resolveText } from "../../packages/catalog/src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Seuils de reussite, poses avant execution.
 *
 * Correction par rapport a la premiere version : la compression etait mesuree
 * contre le nombre d'articles DISTINCTS du catalogue, ce qui est nul par
 * construction puisque chaque article porte des codes quasi disjoints. On
 * mesure maintenant contre le nombre de LIGNES, c'est-a-dire ce que
 * l'utilisateur voit dans son panier.
 *
 * Et on ajoute le seul critere qui separe l'outil de la regle deja publique
 * "groupe les articles identiques" : les fusions ENTRE articles differents.
 * Si elles sont rares, l'outil ne fait que mecaniser une regle connue.
 */
const THRESHOLDS = {
  coverage: 0.8, //              lignes reconnues sur lignes totales
  compressionLines: 0.2, //      1 - categories/lignes, en mediane
  rangeWidth: 0.25, //           (max-min)/max, en mediane
  usefulAdviceShare: 1 / 3, //   part des paniers ou grouper fait gagner >= 5 EUR
  usefulAdviceEuros: 5,
  crossItemShare: 1 / 3, //      part des paniers avec au moins une fusion
  //                             entre deux articles DIFFERENTS du catalogue
};

const pct = (v) => `${(v * 100).toFixed(0)}%`;
const eur = (v) => `${v.toFixed(2).replace(".", ",")} EUR`;
const median = (xs) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

function analyseCart(cart) {
  const resolved = [];
  const unmatched = [];
  for (const line of cart.lines) {
    const r = resolveText(line);
    if (r.matches.length === 0) {
      unmatched.push(line);
      continue;
    }
    // Un titre peut mentionner plusieurs articles du catalogue ; on garde le
    // match le plus specifique, c'est-a-dire celui reconnu par la phrase la
    // plus longue.
    const best = r.matches.sort((a, b) => b.via.length - a.via.length)[0];
    resolved.push({ line, id: best.id, label: best.label, codes: best.codes });
  }

  // La quantite ne change rien au nombre de categories : on deduplique.
  const uniqueIds = [...new Set(resolved.map((r) => r.id))];
  const articles = uniqueIds.map((id) => {
    const hit = resolved.find((r) => r.id === id);
    return { id, codes: hit.codes };
  });

  const p = partition(articles);
  const q = estimate({ categories: p, goodsValue: cart.goodsValue });
  const separately = uniqueIds.length * q.perCategory;

  return {
    cart,
    lines: cart.lines.length,
    recognised: resolved.length,
    unmatched,
    uniqueArticles: uniqueIds.length,
    categories: p,
    perCategory: q.perCategory,
    costMin: q.total.min,
    costMax: q.total.max,
    separately,
    saves: separately - q.total.min,
    coverage: cart.lines.length ? resolved.length / cart.lines.length : 0,
    // Ce que l'utilisateur voit : ses lignes de panier contre les categories
    // reellement facturees.
    compressionLines: resolved.length ? 1 - p.min / resolved.length : 0,
    rangeWidth: p.max ? (p.max - p.min) / p.max : 0,
    // Le seul apport non trivial : deux articles DIFFERENTS du catalogue qui
    // tombent, ou peuvent tomber, sur le meme code. Le reste ("deux t-shirts
    // comptent pour un") est la regle deja publique.
    crossItemMerges: p.collisions.length,
    // Economie contre la commande ligne par ligne, qui est le vrai
    // contrefactuel : une commande par article du panier.
    savesVsLineByLine: resolved.length * q.perCategory - q.total.min,
  };
}

const data = JSON.parse(await readFile(join(HERE, "carts.json"), "utf8"));
const results = data.carts.map(analyseCart);

console.log("=".repeat(78));
console.log("TEST DU CONCEPT  |  " + results.length + " paniers realistes");
console.log("=".repeat(78));

for (const r of results) {
  console.log(`\n${r.cart.label}`);
  console.log(`  panier de ${r.cart.goodsValue} EUR, ${r.lines} lignes`);
  console.log(
    `  reconnu ${r.recognised}/${r.lines} (${pct(r.coverage)})` +
      (r.unmatched.length ? `  NON RECONNU : ${r.unmatched.length}` : "")
  );
  for (const u of r.unmatched) console.log(`      hors catalogue : ${u}`);
  console.log(
    `  ${r.uniqueArticles} articles distincts  ->  ` +
      (r.categories.certain
        ? `${r.categories.min} categories`
        : `${r.categories.min} a ${r.categories.max} categories`)
  );
  console.log(
    `  cout ${r.categories.certain ? eur(r.costMin) : eur(r.costMin) + " a " + eur(r.costMax)}` +
      `   |  ligne par ligne ${eur(r.recognised * r.perCategory)}` +
      `  |  grouper gagne ${eur(r.savesVsLineByLine)}`
  );
  console.log(
    `  compression ${pct(r.compressionLines)}   fourchette ${pct(r.rangeWidth)}` +
      `   fusions inter-articles ${r.crossItemMerges}`
  );
  const certaines = r.categories.collisions.filter((c) => c.certain);
  const possibles = r.categories.collisions.filter((c) => !c.certain);
  if (certaines.length) {
    console.log(
      `  fusions acquises : ` + certaines.map((c) => `${c.a}+${c.b} [${c.codes[0]}]`).join(", ")
    );
  }
  if (possibles.length) {
    console.log(
      `  fusions possibles : ` + possibles.map((c) => `${c.a}?${c.b} [${c.codes.join("/")}]`).join(", ")
    );
  }
}

const totalLines = results.reduce((s, r) => s + r.lines, 0);
const totalRecognised = results.reduce((s, r) => s + r.recognised, 0);
const coverage = totalRecognised / totalLines;
const compressions = results.map((r) => r.compressionLines);
const ranges = results.map((r) => r.rangeWidth);
const useful = results.filter((r) => r.savesVsLineByLine >= THRESHOLDS.usefulAdviceEuros);
const crossItem = results.filter((r) => r.crossItemMerges > 0);
const trivial = results.filter(
  (r) => r.compressionLines === 0 && r.rangeWidth === 0 && r.crossItemMerges === 0
);

console.log("\n" + "=".repeat(78));
console.log("VERDICT");
console.log("=".repeat(78));

const checks = [
  {
    name: "Couverture du catalogue",
    value: coverage,
    threshold: THRESHOLDS.coverage,
    format: pct,
    detail: `${totalRecognised}/${totalLines} lignes reconnues`,
  },
  {
    name: "Compression mediane (lignes)",
    value: median(compressions),
    threshold: THRESHOLDS.compressionLines,
    format: pct,
    detail: "en dessous, l'outil est une multiplication par le tarif",
  },
  {
    name: "Paniers a fusion inter-articles",
    value: crossItem.length / results.length,
    threshold: THRESHOLDS.crossItemShare,
    format: pct,
    detail:
      `${crossItem.length}/${results.length} paniers. C'EST LE CRITERE DECISIF : sans fusion ` +
      `entre articles differents, l'outil ne fait que mecaniser "deux articles identiques\\n        ` +
      `comptent pour un", qui est deja dans tous les journaux.`,
  },
  {
    name: "Largeur de fourchette mediane",
    value: median(ranges),
    threshold: THRESHOLDS.rangeWidth,
    format: pct,
    detail: "au dessus, la reponse est trop vague",
    lowerIsBetter: true,
  },
  {
    name: "Paniers ou grouper rapporte",
    value: useful.length / results.length,
    threshold: THRESHOLDS.usefulAdviceShare,
    format: pct,
    detail: `${useful.length}/${results.length} paniers gagnent >= ${THRESHOLDS.usefulAdviceEuros} EUR`,
  },
];

let failed = 0;
for (const c of checks) {
  const ok = c.lowerIsBetter ? c.value <= c.threshold : c.value >= c.threshold;
  if (!ok) failed++;
  console.log(
    `${ok ? "PASS" : "ECHEC"}  ${c.name.padEnd(32)} ${c.format(c.value).padStart(6)} ` +
      `(seuil ${c.lowerIsBetter ? "<=" : ">="} ${c.format(c.threshold)})`
  );
  console.log(`        ${c.detail}`);
}

console.log(
  `\nPaniers ou l'outil n'apprend rien (compression nulle et aucune incertitude) : ` +
    `${trivial.length}/${results.length}`
);
for (const t of trivial) console.log(`        ${t.cart.label}`);

console.log(
  `\nSur ces paniers, l'outil se reduit a "${"nombre d'articles"} x tarif". ` +
    `C'est le mode d'echec qui compte le plus : il ne se voit pas, il ennuie.`
);

if (failed > 0) {
  console.log(`\n${failed} critere(s) en echec. Le concept ne tient pas en l'etat.`);
  process.exit(1);
}
console.log("\nTous les criteres passent.");
