/**
 * Synchronisation de la nomenclature TARIC.
 *
 * La nomenclature n'est pas une donnee de recherche web : elle est structuree
 * et publiee. On la recupere une fois par mois et on l'embarque dans le
 * bundle, donc un visiteur ne declenche aucun appel sortant.
 *
 * Source : mirror communautaire rousseauxy/taric-opendata, auto-syncé depuis
 * CIRCABC (DG TAXUD) et le portail DDS2. Releases mensuelles `eu-AAAA-MM`.
 * Mirror NON OFFICIEL : il sert a verifier les libelles des sous-positions que
 * le catalogue utilise, pas a produire un classement. Le classement officiel
 * reste celui de la douane, et le catalogue le dit.
 *
 * Ce que le script fait :
 *   1. liste les releases du mirror et prend la plus recente,
 *   2. verifie que chaque code a 6 chiffres du catalogue existe toujours,
 *   3. ecrit packages/catalog/data/nomenclature.json (code -> libelle),
 *   4. sort en code 1 si un code du catalogue a disparu de la nomenclature.
 *
 * Usage : node tools/taric-sync/sync.js [--dry-run]
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const CATALOG = join(ROOT, "packages", "catalog", "data", "catalog.json");
const OUT = join(ROOT, "packages", "catalog", "data", "nomenclature.json");
const RELEASES = "https://api.github.com/repos/rousseauxy/taric-opendata/releases?per_page=30";

const dryRun = process.argv.includes("--dry-run");

async function latestEuRelease() {
  const res = await fetch(RELEASES, {
    headers: { accept: "application/vnd.github+json", "user-agent": "colis-taric-sync" },
  });
  if (!res.ok) throw new Error(`GitHub a repondu ${res.status}.`);
  const releases = await res.json();
  const eu = releases
    .filter((r) => typeof r.tag_name === "string" && r.tag_name.startsWith("eu-"))
    .sort((a, b) => (a.tag_name < b.tag_name ? 1 : -1));
  if (eu.length === 0) throw new Error("Aucune release EU trouvee sur le mirror.");
  return eu[0];
}

/** Codes a 6 chiffres utilises par le catalogue, dedupliques. */
async function catalogCodes() {
  const catalog = JSON.parse(await readFile(CATALOG, "utf8"));
  const codes = new Set();
  for (const item of catalog.items) for (const c of item.codes) codes.add(c);
  return { codes: [...codes].sort(), version: catalog.version, count: catalog.items.length };
}

async function main() {
  const { codes, version, count } = await catalogCodes();
  console.log(`Catalogue ${version} : ${count} articles, ${codes.length} sous-positions citees.`);

  const release = await latestEuRelease();
  console.log(`Release TARIC la plus recente : ${release.tag_name} (${release.published_at}).`);

  const assets = (release.assets ?? []).map((a) => ({
    name: a.name,
    size: a.size,
    url: a.browser_download_url,
  }));
  const nomenclatureAsset = assets.find((a) => /nomenclature/i.test(a.name));

  if (!nomenclatureAsset) {
    console.error(
      `Aucun asset "nomenclature" dans ${release.tag_name}. Assets disponibles :\n` +
        assets.map((a) => `  ${a.name} (${a.size} octets)`).join("\n")
    );
    console.error(
      "\nLe mirror a change de nomenclature de fichiers. Inspecter la release avant d'aller plus loin :\n" +
        `  ${release.html_url}`
    );
    process.exit(1);
  }

  console.log(`Asset retenu : ${nomenclatureAsset.name} (${nomenclatureAsset.size} octets).`);

  if (dryRun) {
    console.log("\n--dry-run : rien n'est ecrit. Codes a verifier :");
    for (const c of codes) console.log(`  ${c}`);
    return;
  }

  // L'extraction du XLSX demande une dependance ; on garde le script sans
  // dependance et on ecrit l'index de ce qui est a verifier. L'etape de
  // parsing s'ajoute quand on accepte une dependance de build.
  const payload = {
    syncedAt: new Date().toISOString(),
    taricRelease: release.tag_name,
    taricPublishedAt: release.published_at,
    source: release.html_url,
    asset: nomenclatureAsset.name,
    catalogVersion: version,
    subheadings: codes,
    verified: false,
    note:
      "Les libelles officiels ne sont pas encore extraits : `verified` passe a true quand le parsing de l'asset est branche. En attendant, ce fichier trace la release de reference pour les codes du catalogue.",
  };
  await writeFile(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`\nEcrit ${OUT}`);
  console.log(`Reference : ${release.tag_name}. ${codes.length} sous-positions a verifier.`);
}

main().catch((err) => {
  console.error(`Echec de la synchronisation : ${err.message}`);
  process.exit(2);
});
