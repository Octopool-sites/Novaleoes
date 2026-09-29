// Nome público das fotos do catálogo, sem o código da peça.
//
// No bucket do ERP a foto se chama pelo código interno ({COD_PROD}.jpg, ex.: 9019.580.jpg) ou pelo código do
// fabricante: publicar esse nome no site expõe o código (regra do AGENTS.md). O site publica uma cópia em
// site/<nome>.jpg, onde <nome> = HMAC-SHA256(chave secreta, nome original). O repositório é público, então a
// chave NÃO fica nele: mora num arquivo do PC que atualiza o catálogo (padrão C:\dev\.nl-foto-segredo, ou o
// caminho em NL_FOTO_SEGREDO_ARQ). Sem a chave não dá para refazer o nome a partir do código, nem o contrário.
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

export const FOTO_BASE = "https://octopool-fotos-produtos.s3.sa-east-1.amazonaws.com/";
export const PREFIXO_PUBLICO = "site/";
export const ARQUIVO_SEGREDO = process.env.NL_FOTO_SEGREDO_ARQ || "C:/dev/.nl-foto-segredo";
/** Nome publicado aceito pela trava do construtor. */
export const NOME_PUBLICO = /^site\/[A-Za-z0-9_-]{22}\.(jpg|jpeg|png|webp)$/;

let segredo = null;
export function lerSegredo() {
  if (segredo) return segredo;
  if (!existsSync(ARQUIVO_SEGREDO)) {
    throw new Error(`chave das fotos não encontrada em ${ARQUIVO_SEGREDO}: sem ela o catálogo publicaria o código da peça no nome da foto. Rode no PC que atualiza o catálogo ou defina NL_FOTO_SEGREDO_ARQ.`);
  }
  segredo = readFileSync(ARQUIVO_SEGREDO, "utf8").trim();
  if (!/^[a-f0-9]{64}$/.test(segredo)) throw new Error(`chave das fotos inválida em ${ARQUIVO_SEGREDO}`);
  return segredo;
}

/** Chave do objeto no bucket a partir da URL do cadastro (só fotos do nosso bucket; o resto devolve null). */
export function chaveDoBucket(url) {
  const texto = String(url || "").trim().split("?")[0];
  if (!texto.startsWith(FOTO_BASE)) return null;
  const chave = decodeURIComponent(texto.slice(FOTO_BASE.length));
  return chave && !chave.startsWith(PREFIXO_PUBLICO) ? chave : null;
}

/** "9019.580.jpg" -> "site/Xq3...22.jpg" (determinístico com a mesma chave). */
export function nomePublico(chave) {
  const ext = (/\.(jpe?g|png|webp)$/i.exec(chave)?.[1] || "jpg").toLowerCase().replace("jpeg", "jpg");
  const h = createHmac("sha256", lerSegredo()).update(chave).digest("base64url").slice(0, 22);
  return `${PREFIXO_PUBLICO}${h}.${ext}`;
}
