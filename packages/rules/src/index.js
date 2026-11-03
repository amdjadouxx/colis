/**
 * Baremes applicables aux envois de vente a distance vers la France.
 *
 * Le bareme est de la DONNEE, pas du code. C'est deliberé : le regime actuel
 * est transitoire et la reforme de l'union douaniere de 2028 doit le remplacer.
 * Quand elle arrivera, on ajoute un objet a REGIMES et le moteur ne bouge pas.
 *
 * Chaque regime porte ses sources officielles pour que tout montant affiche
 * soit tracable.
 */

/**
 * @typedef {Object} Levy
 * @property {string} id
 * @property {string} label
 * @property {number} amount            Montant en euros, par categorie.
 * @property {number|null} maxGoodsValue Valeur de l'envoi au-dela de laquelle
 *   le prelevement ne s'applique plus. null = aucun seuil.
 */

/**
 * @typedef {Object} Regime
 * @property {string} id
 * @property {string} label
 * @property {string} from         Date ISO d'entree en vigueur, incluse.
 * @property {string|null} until   Date ISO de fin, incluse. null = en cours.
 * @property {"category"} basis    Base de calcul. Seul "category" existe a ce jour.
 * @property {Levy[]} levies
 * @property {number} vatRate      TVA standard appliquee aux prelevements.
 * @property {string[]} sources
 * @property {string} [note]
 */

/** @type {Regime[]} */
export const REGIMES = [
  {
    id: "fr-2026-03",
    label: "Taxe nationale francaise de 2 EUR",
    from: "2026-03-01",
    until: "2026-06-30",
    basis: "category",
    levies: [
      { id: "taxe-nationale", label: "Taxe nationale", amount: 2, maxGoodsValue: 150 },
    ],
    vatRate: 0.2,
    sources: [
      "https://www.economie.gouv.fr/particuliers/mes-droits-conso/bien-consommer/tout-savoir-sur-la-taxe-sur-les-petits-colis",
    ],
    note:
      "Suspendue au 1er juillet 2026 au profit du dispositif europeen. Rendement constate d'environ 2,3 M EUR par mois, loin des previsions.",
  },
  {
    id: "eu-2026-07",
    label: "Droit de douane forfaitaire europeen",
    from: "2026-07-01",
    until: "2026-10-31",
    basis: "category",
    levies: [
      {
        id: "droit-forfaitaire",
        label: "Droit de douane forfaitaire",
        amount: 3,
        maxGoodsValue: 150,
      },
    ],
    vatRate: 0.2,
    sources: [
      "https://www.douane.gouv.fr/petits-colis-ce-qui-change-pour-vos-achats-en-ligne",
      "https://presse.economie.gouv.fr/?p=180373",
    ],
  },
  {
    id: "eu-2026-11",
    label: "Droit forfaitaire et frais de traitement",
    from: "2026-11-01",
    until: null,
    basis: "category",
    levies: [
      {
        id: "droit-forfaitaire",
        label: "Droit de douane forfaitaire",
        amount: 3,
        maxGoodsValue: 150,
      },
      {
        id: "frais-traitement",
        label: "Frais de traitement",
        amount: 2,
        maxGoodsValue: null,
      },
    ],
    vatRate: 0.2,
    sources: [
      "https://www.douane.gouv.fr/petits-colis-ce-qui-change-pour-vos-achats-en-ligne",
    ],
    note:
      "Les frais de traitement s'appliquent sans seuil de valeur. Au-dela de 150 EUR, le forfait de 3 EUR tombe et les droits de douane de droit commun s'appliquent a la place : ce moteur ne les calcule pas.",
  },
];

/**
 * @param {string} [onDate] Date ISO. Par defaut, aujourd'hui.
 * @returns {Regime}
 */
export function regimeFor(onDate) {
  const day = (onDate ?? new Date().toISOString()).slice(0, 10);
  const match = REGIMES.find((r) => r.from <= day && (r.until === null || day <= r.until));
  if (!match) throw new Error(`Aucun bareme connu pour la date ${day}.`);
  return match;
}

/**
 * @param {string} id
 * @returns {Regime}
 */
export function regimeById(id) {
  const match = REGIMES.find((r) => r.id === id);
  if (!match) throw new Error(`Bareme inconnu : ${id}.`);
  return match;
}

/**
 * Applique un bareme a un nombre de categories.
 *
 * @param {Object} input
 * @param {{min: number, max: number}} input.categories
 * @param {number} [input.goodsValue] Valeur de l'envoi en euros. Omise, on
 *   suppose un envoi sous le seuil de 150 EUR, qui est le cas courant.
 * @param {boolean} [input.includeVat]
 * @param {string} [input.regimeId]
 * @param {string} [input.onDate]
 */
export function estimate({ categories, goodsValue = 100, includeVat = false, regimeId, onDate }) {
  const regime = regimeId ? regimeById(regimeId) : regimeFor(onDate);
  const applicable = regime.levies.filter(
    (l) => l.maxGoodsValue === null || goodsValue <= l.maxGoodsValue
  );
  const dropped = regime.levies.filter((l) => !applicable.includes(l));

  const perCategoryNet = applicable.reduce((sum, l) => sum + l.amount, 0);
  const multiplier = includeVat ? 1 + regime.vatRate : 1;
  const round = (v) => Math.round(v * 100) / 100;

  return {
    regime: { id: regime.id, label: regime.label, sources: regime.sources, note: regime.note },
    goodsValue,
    includeVat,
    perCategory: round(perCategoryNet * multiplier),
    lines: applicable.map((l) => ({
      id: l.id,
      label: l.label,
      perCategory: round(l.amount * multiplier),
    })),
    notApplied: dropped.map((l) => ({
      id: l.id,
      label: l.label,
      reason: `Ne s'applique qu'aux envois de ${l.maxGoodsValue} EUR ou moins.`,
    })),
    total: {
      min: round(categories.min * perCategoryNet * multiplier),
      max: round(categories.max * perCategoryNet * multiplier),
    },
  };
}
