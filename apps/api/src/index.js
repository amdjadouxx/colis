/**
 * API Cloudflare Worker.
 *
 * Tout le calcul est local et synchrone : pas de base, pas d'appel sortant,
 * pas de cle. Une estimation coute un CPU-tick, ce qui tient dans le palier
 * gratuit meme si la page decolle, et reste identique a chaque appel.
 *
 * Endpoints :
 *   GET  /v1/catalog              le catalogue et sa version
 *   GET  /v1/rules                les baremes connus, celui en vigueur en tete
 *   POST /v1/estimate             { items: string[], goodsValue?, includeVat?, onDate? }
 *   POST /v1/resolve              { text: string }
 */

import { partition } from "@colis/partition";
import { estimate, REGIMES, regimeFor } from "@colis/rules";
import {
  ITEMS,
  CATALOG_VERSION,
  WARNING,
  rayons,
  toArticles,
  itemById,
  resolveText,
} from "@colis/catalog";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": status === 200 ? "public, max-age=3600" : "no-store",
      ...CORS,
      ...extra,
    },
  });

const fail = (message, status = 400) => json({ error: message }, status);

/**
 * @param {Request} request
 */
async function readJson(request) {
  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) throw new Error("Corps attendu en application/json.");
  try {
    return await request.json();
  } catch {
    throw new Error("Corps JSON illisible.");
  }
}

function handleEstimate(payload) {
  const ids = payload?.items;
  if (!Array.isArray(ids)) return fail("`items` doit etre un tableau d'identifiants du catalogue.");
  if (ids.length > 200) return fail("200 articles au maximum par estimation.");

  const unknown = ids.filter((id) => !itemById(id));
  if (unknown.length) return fail(`Articles inconnus : ${unknown.join(", ")}.`);

  // La quantite ne change rien au nombre de categories : on deduplique avant
  // de calculer, sinon les doublons alourdissent la recherche pour rien.
  const unique = [...new Set(ids)];
  const articles = toArticles(unique);
  const categories = partition(articles);

  const goodsValue = typeof payload.goodsValue === "number" ? payload.goodsValue : 100;
  if (goodsValue < 0) return fail("`goodsValue` doit etre positif.");

  const quote = estimate({
    categories,
    goodsValue,
    includeVat: payload.includeVat === true,
    onDate: typeof payload.onDate === "string" ? payload.onDate : undefined,
  });

  // Contrefactuel : chaque article commande seul porte sa propre categorie.
  // C'est le chiffre qui dit si grouper sert a quelque chose, ou non.
  const separately = Math.round(unique.length * quote.perCategory * 100) / 100;

  return json({
    catalogVersion: CATALOG_VERSION,
    articles: unique.map((id) => {
      // Les identifiants inconnus ont deja ete rejetes en 400 plus haut.
      const it = /** @type {NonNullable<ReturnType<typeof itemById>>} */ (itemById(id));
      return {
        id: it.id,
        label: it.label,
        codes: it.codes,
        undetermined: it.undetermined ?? null,
      };
    }),
    categories: {
      min: categories.min,
      max: categories.max,
      certain: categories.certain,
      codesAtMinimum: categories.minCodes,
    },
    collisions: categories.collisions,
    cost: {
      perCategory: quote.perCategory,
      lines: quote.lines,
      notApplied: quote.notApplied,
      min: quote.total.min,
      max: quote.total.max,
      ifOrderedSeparately: separately,
      groupingSaves: Math.round((separately - quote.total.min) * 100) / 100,
    },
    regime: quote.regime,
    warning: WARNING,
  });
}

export default {
  /**
   * @param {Request} request
   */
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === "/v1/catalog" && request.method === "GET") {
      return json({ version: CATALOG_VERSION, rayons: rayons(), items: ITEMS, warning: WARNING });
    }

    if (url.pathname === "/v1/rules" && request.method === "GET") {
      return json({ current: regimeFor().id, regimes: REGIMES });
    }

    if (url.pathname === "/v1/estimate" && request.method === "POST") {
      try {
        return handleEstimate(await readJson(request));
      } catch (err) {
        return fail(err.message);
      }
    }

    if (url.pathname === "/v1/resolve" && request.method === "POST") {
      try {
        const payload = await readJson(request);
        if (typeof payload?.text !== "string") return fail("`text` doit etre une chaine.");
        if (payload.text.length > 2000) return fail("2000 caracteres au maximum.");
        return json(resolveText(payload.text));
      } catch (err) {
        return fail(err.message);
      }
    }

    return fail("Route inconnue.", 404);
  },
};
