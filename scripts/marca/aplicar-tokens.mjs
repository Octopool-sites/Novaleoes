// Troca as cores escritas direto no CSS da vitrine (oliva, verde, dourado) pelos tokens da marca (components/nl-marca.css).
// Uso: node scripts/marca/aplicar-tokens.mjs [--seco]   (--seco só lista o que mudaria)
// Depois de integrar CSS novo de outro branch, rode de novo: a regra é por luminosidade, matiz e propriedade, então
// uma cor oliva nova cai no token equivalente. Cinza puro, branco e preto ficam. tests/marca.test.mjs reprova o que sobrar.
// Não mexe em app/commerce.css (painel /gestao) nem em components/carro-interativo.css (carro 3D, fora desta frente).
import fs from "node:fs";

export const ARQUIVOS_VITRINE = [
  "app/globals.css",
  "components/storefront-redesign.css",
  "components/storefront-polish.css",
  "components/storefront-loja.css",
  "components/catalogo-loja.css",
  "components/storefront-institucional.css",
  "components/pagina-loja.css",
  "components/storefront-editorial.css",
  "components/storefront-editorial-variant.css",
  "components/commerce-login.css",
  "components/storefront-entrega.css",
];

// Regras de globals.css que o painel /gestao também usa: ficam como estão (a vitrine as sobrescreve com .nl-store).
const COMPARTILHADAS = /(^|,)\s*(:root|body|\.empty-state[^,]*|\.eyebrow|\.preview-note[^,]*|button:focus-visible.*)\s*$/;

const hsl = (hex) => {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, c = max - min;
  let h = 0;
  if (c) h = max === r ? ((g - b) / c) % 6 : max === g ? (b - r) / c + 2 : (r - g) / c + 4;
  return { h: (h * 60 + 360) % 360, l, c };
};
// Cor com matiz (não é cinza puro): 4/255 de croma já aparece como "puxado pro verde" ao lado do chumbo.
export const temMatiz = (hex) => hsl(hex).c >= 4 / 255;

// Fundo chumbo em volta: rodapé, faixa do carro, botão com carro escolhido (e chip ativo, para o texto dele).
const FUNDO_ESCURO = /\.nl-footer|\.nl-vitrine-veiculo|\.nl-vv-|\.com-carro|\.nl-skip-link/;
const TEXTO_EM_ESCURO = /\.nl-footer|\.nl-vitrine-veiculo|\.nl-vv-|\.com-carro|\.nl-skip-link|\.active|\.ativo|\.nl-serve/;
// Botão do painel /gestao que mora em commerce-login.css: fica com as cores do painel.
const IGNORAR = /\.management-signout/;
const tipo = (prop) => /^(color|fill|stroke|caret-color|-webkit-text-fill-color)$/.test(prop) ? "texto"
  : /^background/.test(prop) ? "fundo"
  : /shadow/.test(prop) ? "sombra"
  : /^accent-color$/.test(prop) ? "texto"
  : "borda";

// Token para uma cor com matiz, conforme o papel dela (texto, fundo, borda) e o fundo em volta (claro ou chumbo).
export function tokenPara(hex, prop, sel) {
  const { h, l, c } = hsl(hex);
  const t = tipo(prop);
  const hover = /:hover|:not\(:disabled\):hover/.test(sel);
  const ouro = h >= 20 && h < 62 && c >= (t === "texto" ? 0.22 : 0.2); // dourado, ocre, amarelo
  const vermelho = (h < 20 || h >= 340) && c >= 0.25; // erro
  if (vermelho) return t === "fundo" ? "nl-erro-fundo" : "nl-erro";
  if (t === "texto") {
    if (ouro) return l >= 0.6 ? "nl-laranja" : l >= 0.3 ? "nl-laranja-texto" : l >= 0.2 ? "nl-laranja-texto-forte" : "nl-chumbo";
    if (l >= 0.85) return "nl-creme";
    if (l >= 0.62) return TEXTO_EM_ESCURO.test(sel) ? "nl-creme-suave" : "nl-muted";
    if (l >= 0.45) return "nl-muted";
    if (l >= 0.36) return "nl-chumbo-3";
    if (l >= 0.26) return "nl-chumbo-2";
    return "nl-chumbo";
  }
  if (t === "fundo") {
    if (ouro && l < 0.88) return hover ? "nl-laranja-forte" : "nl-laranja";
    if (l >= 0.985) return "nl-branco";
    if (h >= 25 && h < 62 && l >= 0.9 && c >= 0.035) return l >= 0.965 ? "nl-creme-claro" : hover ? "nl-laranja-claro" : "nl-laranja-tinta";
    if (l >= 0.955) return "nl-papel";
    if (l >= 0.9) return c >= 0.04 ? (hover ? "nl-laranja-claro" : "nl-laranja-tinta") : "nl-papel";
    if (l >= 0.8) return hover ? "nl-laranja-claro" : "nl-linha";
    if (l >= 0.45) return "nl-linha-forte";
    if (l >= 0.3) return "nl-chumbo-2";
    return hover ? "nl-chumbo-2" : "nl-chumbo";
  }
  // borda, contorno e sombra sem transparência
  const escuro = FUNDO_ESCURO.test(sel);
  if (ouro) return escuro || l >= 0.62 ? "nl-laranja" : "nl-laranja-texto";
  if (escuro && l >= 0.25 && l < 0.62) return "nl-linha-escura";
  if (l < 0.55) return "nl-chumbo";
  if (l < 0.8) return "nl-linha-forte";
  return "nl-linha";
}

const HEX = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;
const expandir = (h) => (h.length <= 4 ? [...h].map((x) => x + x).join("") : h).toLowerCase();

function trocarValor(valor, prop, sel, log) {
  return valor.replace(HEX, (orig, h) => {
    const x = expandir(h);
    const base = x.slice(0, 6);
    if (!temMatiz(base)) return orig;
    const tok = tokenPara(base, x.length === 8 ? "box-shadow" : prop, sel);
    let novo;
    if (x.length === 8) {
      const a = Math.round((parseInt(x.slice(6), 16) / 255) * 100);
      // sombra ou véu: chumbo (ou o token) com a mesma transparência
      novo = `color-mix(in srgb, var(--${/shadow/.test(prop) ? "nl-chumbo" : tok}) ${a}%, transparent)`;
    } else novo = `var(--${tok})`;
    log.push(`${orig} -> ${novo}  [${prop}] ${sel.trim().slice(-60)}`);
    return novo;
  });
}

// Separa declarações por ";" fora de parênteses e aspas (url("data:...;...") não quebra).
function declaracoes(corpo) {
  const partes = []; let atual = "", prof = 0, aspa = "";
  for (const ch of corpo) {
    if (aspa) { if (ch === aspa) aspa = ""; }
    else if (ch === '"' || ch === "'") aspa = ch;
    else if (ch === "(") prof++;
    else if (ch === ")") prof--;
    else if (ch === ";" && !prof) { partes.push(atual + ch); atual = ""; continue; }
    atual += ch;
  }
  if (atual) partes.push(atual);
  return partes;
}

export function aplicar(css, arquivo, log = []) {
  return css.replace(/([^{}]+)\{([^{}]*)\}/g, (m, sel, corpo) => {
    const selLimpo = sel.replace(/\/\*[\s\S]*?\*\//g, "");
    if (arquivo === "app/globals.css" && COMPARTILHADAS.test(selLimpo.trim())) return m;
    if (/^\s*@/.test(selLimpo) || IGNORAR.test(selLimpo)) return m;
    const novo = declaracoes(corpo).map((d) => {
      const i = d.indexOf(":");
      if (i < 0) return d;
      const prop = d.slice(0, i).trim().toLowerCase();
      if (prop.startsWith("--")) return d; // variável local: tratada à mão
      return d.slice(0, i + 1) + trocarValor(d.slice(i + 1), prop, selLimpo, log);
    }).join("");
    return sel + "{" + novo + "}";
  });
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/marca/aplicar-tokens.mjs")) {
  const seco = process.argv.includes("--seco");
  let total = 0;
  for (const arq of ARQUIVOS_VITRINE) {
    if (!fs.existsSync(arq)) continue;
    const antes = fs.readFileSync(arq, "utf8");
    const log = [];
    const depois = aplicar(antes, arq, log);
    total += log.length;
    if (log.length) console.log(`${arq}: ${log.length} cores\n  ${log.join("\n  ")}`);
    if (!seco && depois !== antes) fs.writeFileSync(arq, depois);
  }
  console.log(`${total} cores ${seco ? "a trocar" : "trocadas"}.`);
}
