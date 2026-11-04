/**
 * Choix de la zone panier dans une page de place de marche.
 *
 * Pas de selecteurs par site. Shein, Temu et AliExpress refondent leur HTML
 * sans prevenir, et une extension qui dependrait de leurs classes casserait a
 * chaque deploiement. On cherche donc la zone par ses PROPRIETES : un panier
 * est le plus petit bloc qui concentre des prix ET des quantites.
 *
 * Le texte extrait part ensuite dans le parseur deja valide (94 % de
 * couverture sur 10 000 titres reels), qui fait le reste.
 *
 * Danger principal : les blocs de recommandation ("vous aimerez aussi") sont
 * pleins de prix et ressemblent a un panier. D'ou le poids donne aux marqueurs
 * de quantite, absents des recommandations, et la preference pour le bloc le
 * plus PETIT a score egal.
 */

const PRICE_RE = /(?:€|\bEUR\b|\bUSD\b|\$|£)\s?\d|\d\s?(?:€|\bEUR\b)/gi;
const QTY_RE =
  /(?:^|\s)(?:x\s?\d{1,3}|\d{1,3}\s?x|qt[eé]\s*:?\s*\d|quantit[eé]\s*:?\s*\d|quantity\s*:?\s*\d|qty\s*:?\s*\d)(?:\s|$)/gi;

/**
 * Texte d'un element, un element par ligne.
 *
 * On n'utilise PAS innerText : des elements en ligne colles sans espace
 * ("<span>…antichoc</span><span>Qte : 2</span>") y ressortent concatenes,
 * "antichocQte : 24,99 EUR", et le marqueur de quantite disparait avec la
 * frontiere de mot. Les vrais sites ecrivent leur HTML comme ca. On insere
 * donc une coupure a chaque frontiere d'element, ce qui donne aussi au
 * parseur la forme qu'il attend : un libelle, une quantite, un prix.
 *
 * @param {Node} node
 * @returns {string}
 */
export function textOf(node) {
  if (node.nodeType === 3) return node.nodeValue || "";
  if (node.nodeType !== 1) return "";
  if (EXCLUDED_TAGS.has(node.tagName)) return "";
  const parts = [];
  for (const child of node.childNodes) {
    const t = textOf(child).trim();
    if (t) parts.push(t);
  }
  return parts.join("\n");
}

/** Zones qui ne sont jamais le panier, quelle que soit leur densite de prix. */
const EXCLUDED_TAGS = new Set(["NAV", "HEADER", "FOOTER", "ASIDE", "SCRIPT", "STYLE", "NOSCRIPT"]);

/**
 * Indices textuels de recommandation. Utilises en malus, pas en exclusion :
 * un panier peut contenir le mot "recommande" dans un libelle produit.
 */
const RECO_RE =
  /\b(?:vous aimerez|aimerez aussi|recommand|suggestions?|you may also like|similar items|frequently bought|best ?sellers?|tendances?|trending now|sponsoris)/i;

/**
 * Phrases qui signalent un panier vide. Elles valent mieux que n'importe
 * quelle heuristique : la page le dit elle-meme.
 */
const EMPTY_CART_RE =
  /\b(?:votre panier est vide|panier vide|your (?:cart|bag) is empty|cart is empty|no items in your cart|total estim[eé]\s*0[.,]00)/i;

/**
 * L'element est-il DANS une section de recommandation ?
 *
 * Tester le texte du seul bloc retenu ne suffit pas : sur un vrai panier
 * AliExpress, le bloc choisi etait une carte produit a l'interieur de la
 * section "Vous aimerez aussi", et seul son ancetre portait ce titre. Le
 * panier etait vide, et l'outil annoncait pourtant une categorie a payer.
 *
 * On regarde donc le DEBUT du texte de chaque ancetre : une section commence
 * par son titre.
 *
 * @param {Element} el
 */
function inRecoSection(el) {
  let p = el.parentElement;
  let montees = 0;
  while (p && p.tagName !== "BODY" && montees < 12) {
    const debut = (p.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (RECO_RE.test(debut)) return true;
    p = p.parentElement;
    montees++;
  }
  return false;
}

/**
 * Recolle les montants que la page a eclates caractere par caractere.
 *
 * AliExpress rend "89,46€" en six elements distincts, un par caractere, ce
 * qui donne six lignes apres extraction et detruit le prix. Constate sur un
 * vrai panier : aucune de mes pages de test n'aurait produit ca.
 *
 * On ne recolle que des suites d'au moins trois lignes tres courtes composees
 * uniquement de chiffres, de separateurs decimaux ou d'un symbole monetaire.
 * Le seuil de trois evite d'agglomerer des lignes courtes legitimes.
 *
 * @param {string} text
 */
function recomposeMontants(text) {
  const lignes = text.split("\n");
  const sortie = [];
  let i = 0;
  const morceau = (l) => l.length <= 2 && /^[\d.,  ]*[\d.,]$|^[€$£]$/.test(l.trim());
  while (i < lignes.length) {
    let j = i;
    while (j < lignes.length && morceau(lignes[j])) j++;
    if (j - i >= 3) {
      sortie.push(lignes.slice(i, j).map((l) => l.trim()).join(""));
      i = j;
    } else {
      sortie.push(lignes[i]);
      i++;
    }
  }
  return sortie.join("\n");
}

const count = (text, re) => {
  re.lastIndex = 0;
  return (text.match(re) || []).length;
};

/**
 * Mesure d'un element candidat. Aucune ponderation ici : on ne fait que
 * compter. Le choix se fait plus bas, par une regle explicite.
 *
 * @param {Element} el
 */
function measure(el) {
  // Les montants sont recolles AVANT de compter les prix : sinon un bloc dont
  // la page eclate les chiffres paraitrait n'en contenir aucun, et ne serait
  // meme pas retenu comme candidat.
  const text = recomposeMontants(textOf(el));
  if (text.length < 20 || text.length > 20000) return null;

  const prices = count(text, PRICE_RE);
  if (prices < 2) return null;

  return {
    el,
    text,
    prices,
    qtys: count(text, QTY_RE),
    reco: RECO_RE.test(text) || inRecoSection(el),
    length: text.length,
  };
}

/**
 * @param {Document} doc
 * @returns {{text: string, prices: number, qtys: number, length: number, how: string}}
 */
export function extractCartText(doc) {
  // Quand la page annonce elle-meme un panier vide, on s'arrete la. Sans
  // cela, le bloc de recommandations prenait sa place et l'outil affichait
  // des frais pour un panier inexistant : constate sur un vrai panier vide
  // d'AliExpress, qui annonce pourtant "Votre panier est vide".
  // textOf et non textContent : textContent inclut le texte des balises
  // script et style. Une page qui embarque du code dans son body ferait
  // alors matcher n'importe quelle phrase presente dans ce code.
  const pageText = doc.body ? textOf(doc.body).replace(/\s+/g, " ") : "";
  if (EMPTY_CART_RE.test(pageText)) {
    return {
      text: "",
      prices: 0,
      qtys: 0,
      length: 0,
      how: "la page annonce un panier vide",
      fallback: true,
    };
  }

  /** @type {ReturnType<typeof score>[]} */
  const candidates = [];

  for (const el of doc.querySelectorAll("div, section, main, ul, ol, table, form")) {
    if (EXCLUDED_TAGS.has(el.tagName)) continue;
    if (el.closest("nav, header, footer, aside")) continue;
    const s = measure(el);
    if (s) candidates.push(s);
  }

  if (candidates.length === 0) {
    // Aucun bloc ne porte deux montants : cette page n'est pas un panier.
    // On le DIT, au lieu de rendre la page entiere. Sur une page 404 ou un
    // ecran de verification, le texte de navigation suffisait a faire
    // reconnaitre un article inexistant.
    const text = doc.body ? textOf(doc.body) : "";
    return {
      text,
      prices: count(text, PRICE_RE),
      qtys: count(text, QTY_RE),
      length: text.length,
      how: "aucun bloc de panier trouve",
      fallback: true,
    };
  }

  // Regle de choix, en trois etapes ordonnees. Pas de score pondere : des
  // coefficients arbitraires se reequilibrent a chaque site et rendent le
  // resultat imprevisible. Ici, chaque etape est une question fermee, et on
  // peut dire pour quelle raison un bloc a ete retenu.
  //
  // 1. Ecarter les blocs de recommandation, s'il reste des blocs sans eux.
  //    Un encart "vous aimerez aussi" est plein de prix et ressemble a un
  //    panier ; c'est le piege principal.
  const clean = candidates.filter((c) => !c.reco);
  const pool = clean.length > 0 ? clean : candidates;

  // 2. Garder ceux qui portent le plus de marqueurs de quantite. Une quantite
  //    separe un panier d'une grille de produits : une vitrine n'en a pas.
  const maxQtys = Math.max(...pool.map((c) => c.qtys));
  let kept = pool.filter((c) => c.qtys === maxQtys);

  // 3. A defaut de quantites nulle part, se rabattre sur le nombre de prix.
  if (maxQtys === 0) {
    const maxPrices = Math.max(...pool.map((c) => c.prices));
    kept = pool.filter((c) => c.prices === maxPrices);
  }

  // Parmi les finalistes, le plus COURT : c'est le bloc qui contient tout le
  // panier et rien d'autre. Les ancetres portent le meme signal avec du bruit
  // en plus, donc ils perdent ici.
  kept.sort((a, b) => a.length - b.length);
  const chosen = kept[0];
  const inner = chosen !== candidates[0];
  return {
    text: chosen.text,
    prices: chosen.prices,
    qtys: chosen.qtys,
    length: chosen.length,
    how: chosen.prices + " prix, " + chosen.qtys + " qte" + (inner ? ", bloc affine" : ""),
    /** Les meilleurs candidats, pour pouvoir diagnostiquer un mauvais choix. */
    top: candidates.slice(0, 5).map((c) => ({
      tag: c.el.tagName + (c.el.id ? "#" + c.el.id : "") + (c.el.className ? "." + String(c.el.className).split(" ")[0] : ""),
      len: c.length,
      p: c.prices,
      q: c.qtys,
      reco: c.reco,
    })),
  };
}
