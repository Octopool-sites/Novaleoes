// Copia para site/<nome sem código> as fotos que o catálogo vai publicar (fotos-publicas.mjs).
//
//   node scripts/catalogo/publicar-fotos.mjs [--sem-copiar]
//
// Lê outputs/catalogo-erp.json (exportação do ERP) e scripts/catalogo/fotos-ilustrativas.json, calcula o nome
// público de cada foto do bucket e copia (dentro do próprio bucket, sem baixar) só as que ainda não existem, com
// cache de 1 ano. Só escreve em site/; os originais não são tocados. Credenciais: profile AWS "octopool".
// Roda antes do construir.mjs no atualizar.mjs (7h e 13h) e à mão na primeira vez.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { S3Client, ListObjectsV2Command, CopyObjectCommand } from "@aws-sdk/client-s3";
import { fromIni } from "@aws-sdk/credential-providers";
import { chaveDoBucket, nomePublico, PREFIXO_PUBLICO } from "./fotos-publicas.mjs";

const BUCKET = "octopool-fotos-produtos";
const SEM_COPIAR = process.argv.includes("--sem-copiar");
const s3 = new S3Client({ region: "sa-east-1", credentials: fromIni({ profile: process.env.AWS_PROFILE || "octopool" }) });

const exportacao = JSON.parse(readFileSync("outputs/catalogo-erp.json", "utf8"));
const fixas = existsSync("scripts/catalogo/fotos-ilustrativas.json") ? JSON.parse(readFileSync("scripts/catalogo/fotos-ilustrativas.json", "utf8")) : {};
const urls = new Set();
for (const p of exportacao.prods || []) if (p.foto) urls.add(p.foto);
for (const [k, v] of Object.entries(fixas)) if (!k.startsWith("_") && typeof v === "string") urls.add(v);
const alvo = new Map(); // chave original -> nome público
for (const u of urls) { const c = chaveDoBucket(u); if (c) alvo.set(c, nomePublico(c)); }

// O que já está publicado
const existentes = new Set();
let token;
do {
  const r = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIXO_PUBLICO, ContinuationToken: token }));
  for (const o of r.Contents || []) existentes.add(o.Key);
  token = r.IsTruncated ? r.NextContinuationToken : undefined;
} while (token);

const faltam = [...alvo].filter(([, destino]) => !existentes.has(destino));
console.log(`fotos do catálogo: ${alvo.size} · já publicadas: ${alvo.size - faltam.length} · a copiar: ${faltam.length}`);
// O construtor só publica foto cujo nome está nesta lista (fora do git: tem o nome público, não o código).
const gravarPublicadas = () => { mkdirSync("outputs", { recursive: true }); writeFileSync("outputs/fotos-publicadas.json", JSON.stringify([...existentes].sort())); };
if (SEM_COPIAR || !faltam.length) { gravarPublicadas(); process.exit(0); }

let feitas = 0, falhas = 0;
const fila = faltam.slice();
async function trabalhador() {
  for (let item = fila.shift(); item; item = fila.shift()) {
    const [origem, destino] = item;
    try {
      await s3.send(new CopyObjectCommand({
        Bucket: BUCKET, Key: destino, CopySource: `${BUCKET}/${origem.split("/").map(encodeURIComponent).join("/")}`,
        MetadataDirective: "REPLACE", ContentType: /\.png$/i.test(destino) ? "image/png" : /\.webp$/i.test(destino) ? "image/webp" : "image/jpeg",
        CacheControl: "public, max-age=31536000, immutable",
      }));
      feitas++; existentes.add(destino);
    } catch (e) {
      falhas++;
      if (falhas <= 5) console.warn("falhou", origem, e?.name || e?.message);
    }
    if ((feitas + falhas) % 2000 === 0) console.log(`  ${feitas + falhas}/${faltam.length}`);
  }
}
await Promise.all(Array.from({ length: 24 }, trabalhador));
console.log(`copiadas ${feitas}, falhas ${falhas}`);
gravarPublicadas();
// Foto que não copiou (original sumiu do bucket) fica fora de outputs/fotos-publicadas.json e sai do catálogo.
process.exit(falhas > Math.max(20, faltam.length * 0.01) ? 1 : 0);
