/**
 * Petit serveur statique local, pour essayer l extension sur des pages de
 * test servies en http.
 *
 * Chrome refuse d injecter un script dans une page file:// sans autorisation
 * explicite, et c est precisement le chemin que l extension emprunte. Servir
 * les pages en http reproduit donc les conditions reelles.
 *
 * Ecoute sur 127.0.0.1 uniquement : rien n est expose au reseau local.
 *
 * Usage : node tools/serve-test/server.js [port]
 */

import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "extension-test", "pages");
const PORT = Number(process.argv[2] || 8787);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };

const server = createServer(async (req, res) => {
  const name = decodeURIComponent((req.url || "/").split("?")[0].replace(/^\//, ""));
  if (!name) {
    const files = (await readdir(ROOT)).filter((f) => f.endsWith(".html"));
    res.writeHead(200, { "content-type": TYPES[".html"] });
    res.end(
      `<!doctype html><meta charset="utf-8"><title>Pages de test</title>` +
        `<h1>Pages de test</h1><p>Ouvre une page, puis clique sur l'icone de l'extension.</p><ul>` +
        files.map((f) => `<li><a href="/${f}">${f}</a></li>`).join("") +
        `</ul>`
    );
    return;
  }
  // Pas de remontee de repertoire : on ne sert que ce dossier.
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    res.writeHead(403).end("Interdit");
    return;
  }
  try {
    const body = await readFile(join(ROOT, name));
    res.writeHead(200, { "content-type": TYPES[extname(name)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("Introuvable");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Pages de test sur http://127.0.0.1:${PORT}/`);
});
