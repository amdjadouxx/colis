/**
 * Fenetre de l'extension.
 *
 * Deroulement : on injecte le lecteur de panier dans l'onglet actif, il rend
 * le texte de la zone panier, et le moteur fait le reste ICI, dans la fenetre
 * de l'extension. Rien ne sort du navigateur : l'extension ne demande aucune
 * permission reseau et n'a aucun hote declare.
 *
 * `activeTab` plutot que des permissions d'hote : l'acces n'existe que pour
 * l'onglet ou l'utilisateur a clique, et seulement a ce moment. C'est le
 * minimum qui permette de lire un panier, et ca evite une extension qui peut
 * lire tous les sites en permanence.
 */

import { analyseCart } from "./engine.bundle.js";

/**
 * Le conteneur de resultat est declare dans popup.html, donc toujours la.
 * @type {HTMLElement}
 */
const out = /** @type {HTMLElement} */ (document.getElementById("out"));

/** API de l extension, fournie par le navigateur. @type {any} */
const navigateur = /** @type {any} */ (globalThis).chrome;
const eur = (v) => v.toFixed(2).replace(".", ",") + " €";
const pct = (v) => (v === null ? "?" : "+" + Math.round(100 * v) + " %");
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const message = (html) => {
  out.innerHTML = `<div class="msg">${html}</div>`;
};

function render(picked) {
  const r = analyseCart(picked.text);
  if (!r.ok) {
    // On montre ce qui a ete lu. Un echec muet n'apprend rien ; un echec qui
    // rend le texte extrait dit tout de suite si le probleme vient du choix
    // de la zone ou de la reconnaissance des libelles.
    message(
      `Aucun article reconnu.<br><br>` +
        `Ouvre la page du panier ou de la commande, puis réessaie.` +
        `<div class="how" style="margin-top:10px;padding:8px 0 0">Zone lue : ${esc(picked.how)}, ` +
        `${picked.length} caractères.</div>` +
        `<pre style="white-space:pre-wrap;font:10px ui-monospace,Consolas,monospace;` +
        `max-height:220px;overflow:auto;margin:6px 0 0">${esc(picked.text.slice(0, 1200))}</pre>`
    );
    return;
  }

  const cats = r.categories.certain
    ? String(r.categories.min)
    : `${r.categories.min} a ${r.categories.max}`;
  const cost = r.categories.certain ? eur(r.fees.min) : `${eur(r.fees.min)} a ${eur(r.fees.max)}`;

  let html =
    `<div class="pad" style="padding-top:0"><div class="big">${cats} ` +
    `<small>${r.categories.max > 1 ? "catégories" : "catégorie"}</small></div>` +
    `<div class="cost">${cost} de frais` +
    (r.overallSurcharge !== null ? ` — ${pct(r.overallSurcharge)} sur ${eur(r.goodsValue)}` : "") +
    `</div></div>`;

  html += `<table><thead><tr><th>Article</th><th class="n">Prix</th><th class="n">Frais</th><th class="n">Surcoût</th></tr></thead><tbody>`;
  for (const row of r.rows) {
    const hot = row.surcharge !== null && row.surcharge >= 1;
    html +=
      `<tr><td>${esc(row.label)}<div class="code">SH ${esc(row.code)}</div></td>` +
      `<td class="n">${row.value > 0 ? eur(row.value) : "?"}</td>` +
      `<td class="n">${eur(row.fee)}</td>` +
      `<td class="n${hot ? " hot" : ""}">${pct(row.surcharge)}</td></tr>`;
  }
  html += `</tbody></table>`;

  if (r.removable.length) {
    html +=
      `<div class="note bad"><b>Les frais dépassent le prix de ces articles.</b> ` +
      r.removable.map((x) => `${esc(x.label)} (${eur(x.value)}, ${pct(x.ratio)})`).join(", ") +
      `. Les retirer supprime ${eur(r.perCategory)} chacun.</div>`;
  }
  if (r.foreignCurrency) {
    html +=
      `<div class="note bad">Montants en ${esc(r.currencies.join(", "))}, pas en euros. ` +
      `Aucune conversion : taux et seuil de 150 EUR non fiables ici.</div>`;
  }
  if (r.unrecognised.length) {
    html +=
      `<div class="note"><b>${r.unrecognised.length} ligne(s) non reconnue(s)</b>, donc non comptee(s). ` +
      `Le total est sous-estimé.</div>`;
  }
  html +=
    `<div class="how">Zone lue : ${esc(picked.how)}, ${picked.length} caractères. ` +
    `Classements usuels, pas un classement douanier officiel.</div>`;

  out.innerHTML = html;
}

async function main() {
  try {
    const [tab] = await navigateur.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      message("Aucun onglet actif.");
      return;
    }
    const [injection] = await navigateur.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["src/injected.js"],
    });
    const picked = injection && injection.result;
    if (!picked || !picked.text || picked.text.trim().length === 0) {
      message("Rien a lire sur cette page. Ouvre la page du panier ou de la commande.");
      return;
    }
    render(picked);
  } catch (err) {
    // Chrome refuse l'injection sur ses propres pages et sur le Web Store.
    message(`Lecture impossible sur cette page.<br><span class="code">${esc(err.message)}</span>`);
  }
}

main();
