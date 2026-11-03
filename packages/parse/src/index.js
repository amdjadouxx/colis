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
/**
 * Montants en euros, dollars ou livres.
 *
 * Les devises etrangeres sont lues mais SIGNALEES, jamais confondues avec des
 * euros : le seuil de 150 EUR et les taux de surcout seraient faux. Un
 * acheteur francais voit souvent AliExpress en dollars.
 */
const PRICE =
  /(?:(€|\bEUR\b|\$|\bUSD\b|£|\bGBP\b))\s{0,2}(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s?(?:(€|\bEUR\b|\$|\bUSD\b|£|\bGBP\b))/gi;

const CURRENCY = { "€": "EUR", EUR: "EUR", $: "USD", USD: "USD", "£": "GBP", GBP: "GBP" };

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

/**
 * Bruit franc : ces mots en tete de ligne ne designent jamais un produit.
 */
const NOISE =
  /^(?:total|sous[- ]total|subtotal|livraison|shipping|exp[eé]dition|remise|discount|promo|coupon|tva|vat|taxe|commande\s+n|num[eé]ro\s|adresse|address|paiement|payment|merci|thank|suivre|track|retour|return|voir|view|order|date)\b/i;

/**
 * Bruit ambigu : ces mots sont aussi des noms de produits vendus par les
 * places de marche ("Panier de rangement en osier", "Sac cadeau"). On ne les
 * ecarte donc que si la ligne est courte, c'est-a-dire un intitule de section
 * et non un libelle de produit. Sans cette distinction, un panier en osier
 * disparaissait du calcul comme s'il etait l'en-tete du panier d'achat.
 */
const WEAK_NOISE = /^(?:panier|cart|frais|r[eé]sum[eé]|summary)\b/i;

/**
 * Ligne de reference de commande, ou qu'elle commence.
 *
 * Le filtre ancre en debut de ligne attendait "Commande n...", donc
 * "Votre commande AB-2291" passait pour un produit et faisait sous-estimer le
 * total. On exige deux signaux conjoints, le mot et un identifiant, pour ne
 * pas ecarter un produit qui contiendrait l'un des deux par hasard.
 */
const ORDER_REF =
  /\b(?:commande|order|facture|invoice|bestellung|pedido)\b/i;
const HAS_ID = /#\s*\w|\b[A-Z]{2,}[-\s]?\d{3,}\b|\b\d{6,}\b/;
/** Deux mots au plus : "Panier", "Mon panier", "Panier (3)". */
const SHORT_LINE = /^\W*\w+(?:\W+\w+)?\W*$/;

const num = (s) => Number(s.replace(",", "."));

/**
 * Un texte est un libelle de produit, pas un fragment de mise en page, s'il
 * porte au moins trois lettres. Seuil unique, partage par l'ouverture d'un
 * article et par sa fermeture, pour que les deux regles ne se contredisent
 * pas.
 * @param {string} s
 */
const looksLikeTitle = (s) => s.replace(/[^a-zA-Z]/g, "").length >= 3;

const MINUS = /^[-−–—]$/;
const PLUS = /^[+＋]$/;

/**
 * Remplace un selecteur de quantite par un marqueur lisible, sur place.
 *
 * Les paniers reels affichent la quantite avec deux boutons et un nombre
 * entre eux. Une fois le texte extrait, cela donne trois lignes : "-", "2",
 * "+". Sans traitement, chacune coupe l'accumulation du libelle et les prix
 * se rattachent a des fragments jetes : sur ce type de page, TOUS les prix
 * etaient perdus, et donc tous les taux de surcout.
 *
 * Les trois lignes deviennent "x2", que le reste du parseur sait deja lire.
 *
 * @param {string[]} lines Modifie en place.
 */
function collapseSteppers(lines) {
  for (let i = 0; i + 2 < lines.length; i++) {
    if (MINUS.test(lines[i]) && /^\d{1,3}$/.test(lines[i + 1]) && PLUS.test(lines[i + 2])) {
      lines.splice(i, 3, `x${lines[i + 1]}`);
    }
  }
  // Variante sur une seule ligne : "- 2 +".
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^[-−–—]\s*(\d{1,3})\s*[+＋]$/);
    if (m) lines[i] = `x${m[1]}`;
  }
}

/**
 * La ligne suivante porte-t-elle un prix ou une quantite ? Si oui, la ligne
 * courante est un libelle de produit, meme si son premier mot ressemble a un
 * intitule de section.
 * @param {string[]} lines
 * @param {number} index
 */
function followsWithPriceOrQty(lines, index) {
  const next = lines[index + 1];
  if (!next) return false;
  PRICE.lastIndex = 0;
  if (PRICE.test(next)) return true;
  PRICE.lastIndex = 0;
  return QTY.some((re) => re.test(next));
}

/**
 * @param {string} line
 * @returns {{price: number|null, qty: number|null, text: string}}
 */
function readLine(line) {
  let text = line.trim();
  let price = null;
  let qty = null;
  let currency = null;

  // On prend le DERNIER montant de la ligne, pas le premier. Dans toutes les
  // mises en page observees le prix ferme la ligne, tandis que le titre porte
  // volontiers des chiffres ("lot de 3", "2 metres", "taille 38"). Prendre le
  // match le plus a gauche faisait lire 3 comme prix sur
  // "Montre lot de 3   12,99 EUR". Trouve par fuzz, 54 paniers sur 400.
  PRICE.lastIndex = 0;
  const matches = [...text.matchAll(PRICE)];
  if (matches.length > 0) {
    const pm = matches[matches.length - 1];
    price = num(pm[2] ?? pm[3]);
    const symbol = (pm[1] ?? pm[4] ?? "€").toUpperCase();
    currency = CURRENCY[symbol] ?? CURRENCY[pm[1] ?? pm[4]] ?? "EUR";
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
  return { price, qty, currency, text: text.replace(/\s+/g, " ").trim() };
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

  collapseSteppers(raw);

  const items = [];
  const ignored = [];
  /** @type {string[]} */
  let buffer = [];
  let pendingQty = null;
  let lastCurrency = null;
  const currencies = new Set();

  const flush = (price) => {
    const title = buffer.join(" ").replace(/\s+/g, " ").trim();
    buffer = [];
    const qty = pendingQty ?? 1;
    pendingQty = null;
    // Seuil bas : des titres courts et legitimes existent ("Mug", "Jean"). Les
    // fragments de mise en page sont ecartes par ATTRIBUTE et NOISE, pas par
    // la longueur. Un seuil de 6 lettres jetait de vrais produits.
    if (!looksLikeTitle(title)) {
      if (title) ignored.push(title);
      return;
    }
    items.push({ title, qty, unitPrice: price, currency: lastCurrency });
  };

  for (let index = 0; index < raw.length; index++) {
    const line = raw[index];
    if (NOISE.test(line) || (ORDER_REF.test(line) && HAS_ID.test(line))) {
      ignored.push(line);
      continue;
    }
    const { price, qty, currency, text } = readLine(line);

    // Le bruit ambigu n'est ecarte que si la ligne est courte, sans prix, et
    // qu'aucune ligne de prix ou de quantite ne la suit : une ligne suivie de
    // son prix est un produit, jamais un intitule de section. "Panier osier"
    // puis "EUR 20.06" disparaissait du calcul sans cette lecture en avant.
    const followed = followsWithPriceOrQty(raw, index);
    if (price === null && !followed && WEAK_NOISE.test(line) && SHORT_LINE.test(line)) {
      ignored.push(line);
      continue;
    }

    // Une ligne qui n'est ni un attribut, ni une quantite, ni un prix seul,
    // ouvre un nouvel article. Si un titre attend deja sans prix, il se ferme
    // ici : sinon deux produits dont le premier n'affiche pas de prix se
    // retrouvent concatenes en un seul, ce qui fausse le compte de categories
    // et tous les taux de surcout.
    // Une ligne n'ouvre un nouvel article que si ce qu'elle laisse, une fois
    // le prix et la quantite retires, ressemble a un LIBELLE et non a un
    // fragment de mise en page. Meme seuil que celui du flush, sinon les deux
    // regles se contredisent.
    //
    // "US $19.99" laisse "US" : un fragment, donc le prix ferme l'article en
    // cours. Sans cette distinction, tous les prix d'un panier AliExpress
    // disparaissaient. "Jean mom delave 19,99 EUR" laisse un vrai libelle,
    // donc il ouvre bien un article, sinon deux produits dont le premier n'a
    // pas de prix se retrouvent concatenes.
    const opensNewItem =
      looksLikeTitle(text) && qty === null && !ATTRIBUTE.test(line) && buffer.length > 0;
    if (opensNewItem) flush(null);

    // Prix seul alors qu'aucun libelle n'attend : c'est le second montant
    // d'un article deja ferme, donc un prix barre suivi du prix courant sur
    // deux lignes. On corrige le dernier article au lieu d'ouvrir une ligne
    // fantome. Sans cela, le prix retenu etait le prix barre, le plus eleve.
    if (price !== null && !text && qty === null && buffer.length === 0 && items.length > 0) {
      items[items.length - 1].unitPrice = price;
      continue;
    }

    if (currency) { lastCurrency = currency; currencies.add(currency); }
    if (qty !== null) pendingQty = qty;
    if (text) buffer.push(text);
    if (price !== null) flush(price);
  }
  if (buffer.length) flush(null);

  const priced = items.filter((i) => i.unitPrice !== null);
  const totalValue = priced.length
    ? Math.round(priced.reduce((s, i) => s + i.unitPrice * i.qty, 0) * 100) / 100
    : null;

  return {
    items,
    ignored,
    totalValue,
    currencies: [...currencies],
    // Vrai des qu un montant n est pas en euros : le seuil de 150 EUR et les
    // taux de surcout ne peuvent pas etre affirmes sans conversion.
    foreignCurrency: currencies.size > 0 && !(currencies.size === 1 && currencies.has("EUR")),
  };
}
