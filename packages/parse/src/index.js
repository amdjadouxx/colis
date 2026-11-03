/**
 * Lecture d'un panier colle en texte brut.
 *
 * Aucune place de marche chinoise n'offre d'export de panier ni d'API publique.
 * Ce qui existe vraiment entre les mains de l'acheteur :
 *   - l'email de confirmation de commande,
 *   - la page panier ou la page commande, selectionnee et copiee,
 *   - un tableur, pour les gros acheteurs.
 * Donc l'entree est du texte colle, pas un formulaire. C'est le seul geste a
 * un seul mouvement qui marche aussi sur telephone.
 *
 * Les formats reels sont heterogenes. On ne tente pas de reconnaitre la
 * plateforme : on balaye les lignes et on agrege titre, quantite et prix,
 * parce qu'un parseur par plateforme casse a chaque refonte de leur HTML.
 */

/**
 * Prix : "12,99 €", "€12.99", "EUR 12.99".
 *
 * `EUR` exige des frontieres de mot : sans elles, "secteur 20W" fournit un
 * faux prix de 20, parce que "sect-EUR-" contient le motif. Bug trouve par
 * sonde, pas par relecture.
 */
const PRICE = /(?:€|\bEUR\b)\s{0,2}(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s?(?:€|\bEUR\b)/gi;

/**
 * Lignes d'attribut : elles decrivent l'article precedent, elles n'en ouvrent
 * pas un nouveau. Tout le reste qui ressemble a un libelle est un article a
 * part entiere, meme sans prix.
 */
const ATTRIBUTE =
  /^(?:taille|size|couleur|color|colour|mod[eè]le|model|variante|variant|style|ref|r[eé]f[eé]rence|sku|vendu\s+par|sold\s+by|exp[eé]di[eé]|livr|garantie|stock|en\s+stock)\b/i;

/** Quantite : "x2", "2x", "Qte : 2", "Quantity: 2", "Qty 2". */
const QTY = [
  /(?:^|\s)x\s*(\d{1,3})(?:\s|$)/i,
  /(?:^|\s)(\d{1,3})\s*x(?:\s|$)/i,
  /(?:qt[eé]|quantit[eé]|qty|quantity|menge|cantidad)\s*[:=]?\s*(\d{1,3})/i,
];

/** Lignes a ignorer : totaux, livraison, promos, en-tetes. */
const NOISE =
  /^(?:total|sous[- ]total|subtotal|livraison|shipping|exp[eé]dition|frais|remise|discount|promo|coupon|tva|vat|taxe|order|commande\s+n|num[eé]ro|date|adresse|address|paiement|payment|merci|thank|voir|view|suivre|track|retour|return|panier|cart|r[eé]sum[eé]|summary)\b/i;

const num = (s) => Number(s.replace(",", "."));

/**
 * @param {string} line
 * @returns {{price: number|null, qty: number|null, text: string}}
 */
function readLine(line) {
  let text = line.trim();
  let price = null;
  let qty = null;

  // On prend le DERNIER montant de la ligne, pas le premier. Dans toutes les
  // mises en page observees le prix ferme la ligne, tandis que le titre porte
  // volontiers des chiffres ("lot de 3", "2 metres", "taille 38"). Prendre le
  // match le plus a gauche faisait lire 3 comme prix sur
  // "Montre lot de 3   12,99 EUR". Trouve par fuzz, 54 paniers sur 400.
  PRICE.lastIndex = 0;
  const matches = [...text.matchAll(PRICE)];
  if (matches.length > 0) {
    const pm = matches[matches.length - 1];
    price = num(pm[1] ?? pm[2]);
    text = text.slice(0, pm.index) + " " + text.slice(pm.index + pm[0].length);
  }
  for (const re of QTY) {
    const qm = text.match(re);
    if (qm) {
      qty = Number(qm[1]);
      text = text.replace(qm[0], " ");
      break;
    }
  }
  return { price, qty, text: text.replace(/\s+/g, " ").trim() };
}

/**
 * Decoupe un panier colle en lignes d'articles.
 *
 * Un article peut tenir sur une ligne ("2 x Coque silicone  4,99 EUR") ou sur
 * plusieurs ("Coque silicone" / "Qte : 2" / "4,99 EUR"). On accumule donc du
 * texte jusqu'a rencontrer un prix, qui ferme l'article. Le texte restant sans
 * prix en fin de collage forme quand meme un article : une page panier ne
 * montre pas toujours les prix, et perdre la ligne serait pire que l'ignorer.
 *
 * @param {string} blob
 * @returns {{items: {title: string, qty: number, unitPrice: number|null}[], ignored: string[], totalValue: number|null}}
 */
export function parseCart(blob) {
  const raw = String(blob ?? "")
    .split(/\r?\n|\t{2,}/)
    .map((l) => l.trim())
    .filter(Boolean);

  const items = [];
  const ignored = [];
  /** @type {string[]} */
  let buffer = [];
  let pendingQty = null;

  const flush = (price) => {
    const title = buffer.join(" ").replace(/\s+/g, " ").trim();
    buffer = [];
    const qty = pendingQty ?? 1;
    pendingQty = null;
    // Seuil bas : des titres courts et legitimes existent ("Mug", "Jean"). Les
    // fragments de mise en page sont ecartes par ATTRIBUTE et NOISE, pas par
    // la longueur. Un seuil de 6 lettres jetait de vrais produits.
    if (title.replace(/[^a-zA-Z]/g, "").length < 3) {
      if (title) ignored.push(title);
      return;
    }
    items.push({ title, qty, unitPrice: price });
  };

  for (const line of raw) {
    if (NOISE.test(line)) {
      ignored.push(line);
      continue;
    }
    const { price, qty, text } = readLine(line);

    // Une ligne qui n'est ni un attribut, ni une quantite, ni un prix seul,
    // ouvre un nouvel article. Si un titre attend deja sans prix, il se ferme
    // ici : sinon deux produits dont le premier n'affiche pas de prix se
    // retrouvent concatenes en un seul, ce qui fausse le compte de categories
    // et tous les taux de surcout.
    const opensNewItem =
      text.length > 0 && qty === null && !ATTRIBUTE.test(line) && buffer.length > 0;
    if (opensNewItem) flush(null);

    if (qty !== null) pendingQty = qty;
    if (text) buffer.push(text);
    if (price !== null) flush(price);
  }
  if (buffer.length) flush(null);

  const priced = items.filter((i) => i.unitPrice !== null);
  const totalValue = priced.length
    ? Math.round(priced.reduce((s, i) => s + i.unitPrice * i.qty, 0) * 100) / 100
    : null;

  return { items, ignored, totalValue };
}
