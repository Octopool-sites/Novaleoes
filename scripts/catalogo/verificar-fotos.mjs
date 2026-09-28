#!/usr/bin/env node
// Confere cada foto do catálogo (HEAD) e grava outputs/fotos-quebradas.json com as que não respondem 200 image/*.
// O construir.mjs lê esse arquivo e tira a foto dessas peças (ficam com "sem foto" em vez de imagem quebrada).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const FOTO_BASE = "https://octopool-fotos-produtos.s3.sa-east-1.amazonaws.com/";
const exp = JSON.parse(readFileSync("outputs/catalogo-erp.json", "utf8"));
const urls = [...new Set(exp.prods.map((p) => String(p.foto || "").trim()).filter((u) => u.startsWith(FOTO_BASE) || u.startsWith("https://api.octopool.com.br/api/produtos-foto/")))];
const cacheFile = "outputs/fotos-status.json";
const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : {};
const pendentes = urls.filter((u) => !(u in cache) || cache[u] === "erro");
let feitos = 0;
async function checar(u) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(u, { method: "HEAD", signal: AbortSignal.timeout(15000) });
      const tipo = r.headers.get("content-type") || "";
      const tam = Number(r.headers.get("content-length") || 0);
      return r.ok && tipo.startsWith("image/") && (tam === 0 || tam > 500) ? "ok" : `http-${r.status}-${tipo}-${tam}`;
    } catch { await new Promise((s) => setTimeout(s, 500 * (t + 1))); }
  }
  return "erro";
}
const fila = [...pendentes];
await Promise.all(Array.from({ length: 48 }, async () => {
  while (fila.length) { const u = fila.shift(); cache[u] = await checar(u); if (++feitos % 2000 === 0) console.log(feitos, "/", pendentes.length); }
}));
writeFileSync(cacheFile, JSON.stringify(cache));
const quebradas = urls.filter((u) => cache[u] !== "ok");
writeFileSync("outputs/fotos-quebradas.json", JSON.stringify(quebradas));
const motivos = {}; for (const u of quebradas) { const m = cache[u].split("-").slice(0, 2).join("-"); motivos[m] = (motivos[m] || 0) + 1; }
console.log(`URLs: ${urls.length} · ok: ${urls.length - quebradas.length} · quebradas: ${quebradas.length}`, motivos);
