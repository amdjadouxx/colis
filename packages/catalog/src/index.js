/**
 * Catalogue d'articles et resolution texte -> codes candidats.
 *
 * La resolution est DETERMINISTE et locale : un lexique, pas un modele. C'est
 * un choix, pas une limitation de moyens. La page promet de dire quand elle ne
 * sait pas ; une reponse qui change d'un chargement a l'autre detruirait cette
 * promesse. Un modele ou une recherche web servent a enrichir le catalogue
 * hors ligne (voir tools/), jamais a repondre en direct.
 */

import catalog from "../data/catalog.json" with { type: "json" };
import extra from "../data/catalog-extra.json" with { type: "json" };
import aliasesEn from "../data/aliases-en.json" with { type: "json" };

export const CATALOG_VERSION = catalog.version;
export const WARNING = catalog.warning;

/**
 * Catalogue effectif : base, familles ajoutees, synonymes anglais fusionnes.
 *
 * Decoupe en trois fichiers parce qu'ils ont trois raisons de changer : la
 * base suit la nomenclature, les familles s'ajoutent quand une sonde de
 * couverture trouve un trou, les synonymes anglais quand les titres changent
 * de langue. Les melanger rendrait chaque relecture penible.
 */
export const ITEMS = [...catalog.items, ...extra.items].map((it) => {
  const en = aliasesEn.aliases[it.id] ?? [];
  return en.length ? { ...it, synonyms: [...(it.synonyms ?? []), ...en] } : it;
});

/** @returns {string[]} Les rayons, dans l'ordre du catalogue. */
export function rayons() {
  const seen = [];
  for (const it of ITEMS) if (!seen.includes(it.rayon)) seen.push(it.rayon);
  return seen;
}

/** @param {string} id */
export function itemById(id) {
  return ITEMS.find((it) => it.id === id);
}

/**
 * Normalise pour comparaison : minuscules, accents retires, ponctuation en
 * espaces, pluriels rabattus. Les titres produits des places de marche sont
 * bruites ("Lot de 3 t-shirts coton femme"), donc on compare sur une forme
 * pauvre. Le meme traitement s'applique a l'index et a la requete, donc la
 * singularisation n'a pas besoin d'etre linguistiquement juste, seulement
 * d'etre stable.
 * @param {string} s
 */
export function normalize(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join(" ");
}

/**
 * Mots outils ignores dans les comparaisons. Le catalogue ecrit "Support de
 * telephone" la ou un titre reel ecrit "Support telephone voiture" : exiger le
 * "de" fait rater le match pour une raison qui n'a aucun rapport avec le
 * produit.
 */
const STOPWORDS = new Set(["de", "du", "des", "la", "le", "les", "un", "une", "et", "a", "au", "aux", "en", "d", "l"]);

const contentWords = (phrase) => phrase.split(" ").filter((w) => w && !STOPWORDS.has(w));

/**
 * Index inverse terme -> items, construit une fois.
 *
 * Les libelles sont des listes d'alternatives ("T-shirt, debardeur"), donc on
 * indexe chaque fragment separement : sinon seul le libelle complet matcherait,
 * ce qui n'arrive jamais dans un vrai titre produit.
 */
const INDEX = (() => {
  /** @type {Map<string, Set<string>>} */
  const map = new Map();
  for (const it of ITEMS) {
    const phrases = [
      ...it.label.split(",").map((part) => part.trim()),
      ...(it.synonyms ?? []),
    ];
    for (const phrase of phrases) {
      const key = normalize(phrase);
      if (!key) continue;
      const bucket = map.get(key);
      if (bucket) bucket.add(it.id);
      else map.set(key, new Set([it.id]));
    }
  }
  return map;
})();

/**
 * Cherche dans un titre produit libre les articles du catalogue qu'il mentionne.
 *
 * On ne retourne JAMAIS un code unique devine : on retourne les items du
 * catalogue reconnus, chacun avec ses codes candidats. Ce qui n'est pas reconnu
 * est rendu explicitement dans `unmatched`, pour que l'appelant puisse le
 * montrer a l'utilisateur au lieu de le perdre en silence.
 *
 * @param {string} text
 * @returns {{matches: {id: string, label: string, codes: string[], via: string}[], unmatched: boolean}}
 */
export function resolveText(text) {
  const hay = normalize(text);
  if (!hay) return { matches: [], unmatched: true };

  const words = new Set(hay.split(" "));

  /** @type {Map<string, {id: string, label: string, codes: string[], via: string}>} */
  const found = new Map();
  for (const [phrase, ids] of INDEX) {
    // Tous les mots de la phrase doivent etre presents, pas forcement
    // contigus : un titre reel ecrit "Support telephone voiture grille
    // aeration" la ou le catalogue dit "Support de telephone". Exiger la
    // phrase contiguë faisait rater ce cas. La comparaison reste sur des mots
    // entiers normalises, donc "bague" ne matche pas dans "baguette".
    const tokens = contentWords(phrase);
    if (tokens.length === 0 || !tokens.every((t) => words.has(t))) continue;
    for (const id of ids) {
      const existing = found.get(id);
      if (existing && existing.via.length >= phrase.length) continue;
      const it = itemById(id);
      // L identifiant vient de l index, donc l article existe. Le test garde
      // la fonction honnete si l index et le catalogue divergeaient un jour.
      if (!it) continue;
      found.set(id, { id: it.id, label: it.label, codes: it.codes, via: phrase });
    }
  }
  return { matches: [...found.values()], unmatched: found.size === 0 };
}

/**
 * Transforme des identifiants de catalogue en articles pour le moteur de
 * partition.
 * @param {string[]} ids
 * @returns {{id: string, codes: string[]}[]}
 */
export function toArticles(ids) {
  return ids.map((id) => {
    const it = itemById(id);
    if (!it) throw new Error(`Article inconnu dans le catalogue : ${id}.`);
    return { id: it.id, codes: it.codes };
  });
}
