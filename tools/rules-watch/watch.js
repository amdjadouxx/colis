/**
 * Veille reglementaire via LinkUp (provider du Cloudflare Web Search API).
 *
 * POURQUOI ICI ET PAS DANS L'API : une recherche web coute environ 5 USD pour
 * mille requetes et ne rend pas deux fois la meme reponse. Dans le chemin de
 * requete, elle mettrait un cout marginal sur chaque visiteur et rendrait les
 * montants affiches instables, ce qui ruinerait la seule promesse de la page.
 * Ici, en cron quotidien, c'est une poignee de requetes par jour : le palier
 * gratuit suffit, et le resultat ne touche l'utilisateur qu'apres relecture.
 *
 * Ce script NE MODIFIE RIEN tout seul. Il signale un ecart entre ce que dit
 * packages/rules et ce qu'il trouve, et sort en code 1 pour faire echouer le
 * job. Le bareme reste change a la main, parce qu'une erreur de montant est
 * pire qu'un retard d'un jour.
 *
 * Usage :
 *   LINKUP_API_KEY=... node tools/rules-watch/watch.js
 *   CF_ACCOUNT_ID=... CF_API_TOKEN=... node tools/rules-watch/watch.js  (via AI Gateway)
 */

import { REGIMES, regimeFor } from "../../packages/rules/src/index.js";

const QUERIES = [
  "droit de douane forfaitaire petits colis montant par categorie France",
  "frais de traitement colis importes union europeenne montant",
  "reforme union douaniere europeenne 2028 petits colis calendrier",
];

/** Montants que le bareme en vigueur affirme. Un ecart doit alerter. */
function claimedAmounts() {
  const current = regimeFor();
  return current.levies.map((l) => ({ id: l.id, label: l.label, amount: l.amount }));
}

async function searchViaLinkup(query, key) {
  const res = await fetch("https://api.linkup.so/v1/search", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ q: query, depth: "standard", outputType: "searchResults" }),
  });
  if (!res.ok) throw new Error(`LinkUp a repondu ${res.status} : ${await res.text()}`);
  return res.json();
}

async function searchViaGateway(query, accountId, token) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai-gateway/web-search`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ query, provider: "linkup" }),
    }
  );
  if (!res.ok) throw new Error(`AI Gateway a repondu ${res.status} : ${await res.text()}`);
  return res.json();
}

/**
 * Extrait les montants en euros cites dans les extraits, pour les comparer a
 * ce que le bareme affirme. Volontairement grossier : on cherche un signal de
 * divergence, pas a lire le droit automatiquement.
 * @param {unknown} payload
 */
function amountsIn(payload) {
  const text = JSON.stringify(payload);
  const found = new Set();
  for (const m of text.matchAll(/(\d{1,3})(?:[.,](\d{1,2}))?\s*(?:EUR|euros?|€)/gi)) {
    const value = Number(`${m[1]}.${m[2] ?? 0}`);
    if (value > 0 && value <= 200) found.add(value);
  }
  return [...found].sort((a, b) => a - b);
}

async function main() {
  const linkupKey = process.env.LINKUP_API_KEY;
  const accountId = process.env.CF_ACCOUNT_ID;
  const cfToken = process.env.CF_API_TOKEN;

  if (!linkupKey && !(accountId && cfToken)) {
    console.error(
      "Aucune cle. Fournir LINKUP_API_KEY, ou CF_ACCOUNT_ID et CF_API_TOKEN pour passer par AI Gateway."
    );
    process.exit(2);
  }

  const claimed = claimedAmounts();
  const claimedValues = claimed.map((c) => c.amount);
  console.log(`Bareme en vigueur : ${regimeFor().id}`);
  for (const c of claimed) console.log(`  ${c.label} : ${c.amount} EUR par categorie`);

  const seen = new Set();
  for (const query of QUERIES) {
    const payload = linkupKey
      ? await searchViaLinkup(query, linkupKey)
      : await searchViaGateway(query, accountId, cfToken);
    for (const v of amountsIn(payload)) seen.add(v);
  }

  const observed = [...seen].sort((a, b) => a - b);
  console.log(`Montants rencontres dans les resultats : ${observed.join(", ") || "aucun"}`);

  const missing = claimedValues.filter((v) => !seen.has(v));
  if (missing.length) {
    console.error(
      `\nALERTE : le bareme affirme ${missing.join(" et ")} EUR, introuvable dans les resultats.` +
        `\nVerifier douane.gouv.fr avant de toucher a packages/rules.`
    );
    for (const r of REGIMES) console.error(`  connu : ${r.id} (${r.from} -> ${r.until ?? "en cours"})`);
    process.exit(1);
  }

  console.log("\nAucun ecart detecte. Le bareme reste coherent avec les sources publiques.");
}

main().catch((err) => {
  console.error(`Echec de la veille : ${err.message}`);
  process.exit(2);
});
