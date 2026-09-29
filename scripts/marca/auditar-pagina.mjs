// Auditoria visual da marca na vitrine: contraste WCAG de todo texto visível e cores fora da paleta (verde, oliva, dourado).
// Uso: node scripts/marca/auditar-pagina.mjs [url] [pasta-de-prints]   (padrão: http://127.0.0.1:5312/ e outputs/marca)
// Abre a vitrine em 1366 e 390 px, passa por abertura, catálogo, filtros, ficha, carrinho, checkout, páginas da loja,
// rodapé, menu e seletor de carro, tira um print de cada tela e mede, no que está na tela, o contraste de cada texto
// contra o fundo real (subindo pelos pais até achar cor sólida). Não envia pedido: window.open é interceptado.
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const BASE = (process.argv[2] || "http://127.0.0.1:5312/").replace(/\/?$/, "/");
const OUT = process.argv[3] || path.join("outputs", "marca");
fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => fs.existsSync(p));
if (!CHROME) throw new Error("Chrome/Edge não encontrado: defina CHROME_PATH.");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Paleta permitida: os hexadecimais de components/nl-marca.css. Cinza puro, branco e preto também passam.
const TOKENS = [...fs.readFileSync(new URL("../../components/nl-marca.css", import.meta.url), "utf8").matchAll(/--nl-[a-z0-9-]+:\s*#([0-9a-fA-F]{6})/g)]
  .map((m) => [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new", defaultViewport: null,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars", "--no-first-run", "--lang=pt-BR"],
});

// Roda na página: contraste de cada texto visível na janela e cores com matiz de verde/oliva/dourado.
function medir(TOKENS) {
  const rgb = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const razao = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const misturar = (c, fundo) => ({ r: c.r * c.a + fundo.r * (1 - c.a), g: c.g * c.a + fundo.g * (1 - c.a), b: c.b * c.a + fundo.b * (1 - c.a), a: 1 });
  const hsl = ({ r, g, b }) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn, l = (mx + mn) / 2; let h = 0; if (c) h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4; h = (h * 60 + 360) % 360; const s = c ? c / (1 - Math.abs(2 * l - 1)) : 0; return { h, s, l, c }; };
  // Fora da paleta: cor com matiz que não é um token da marca. Verde/oliva (matiz 65-170) é marcado à parte.
  const eToken = (c) => TOKENS.some(([r, g, b]) => Math.abs(r - c.r) <= 3 && Math.abs(g - c.g) <= 3 && Math.abs(b - c.b) <= 3);
  const foraDaPaleta = (c) => { const { h, c: cr } = hsl(c); if (cr < 0.04 || eToken(c)) return null; return h >= 65 && h <= 170 ? "VERDE/OLIVA" : "outra cor"; };
  function fundoDe(el) {
    let camadas = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== "none" && !/gradient/.test(cs.backgroundImage)) return { img: true };
      const c = rgb(cs.backgroundColor);
      if (c && c.a > 0) { camadas.push(c); if (c.a >= 0.99) break; }
    }
    let f = { r: 255, g: 255, b: 255, a: 1 };
    for (const c of camadas.reverse()) f = misturar(c, f);
    return f;
  }
  const nome = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""}`;
  const falhas = [], fora = new Map();
  const vw = innerWidth, vh = innerHeight;
  const vistos = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || vistos.has(el)) continue;
    vistos.add(el);
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || Number(cs.opacity) < 0.1 || el.closest("[aria-hidden='true'] canvas, .sr-only, [hidden]")) continue;
    if (el.closest(".sr-only") || /(^|\s)sr-only(\s|$)/.test(el.className)) continue;
    const cor = rgb(cs.color); if (!cor) continue;
    const fundo = fundoDe(el);
    if (fundo.img) continue;
    const efetiva = misturar(cor, fundo);
    const tam = parseFloat(cs.fontSize), peso = Number(cs.fontWeight) || 400;
    const grande = tam >= 24 || (tam >= 18.66 && peso >= 700);
    const minimo = grande ? 3 : 4.5;
    const cr = razao(efetiva, fundo);
    const desabilitado = el.closest("button:disabled, [aria-disabled='true']");
    if (cr < minimo && !desabilitado) falhas.push(`${cr.toFixed(2)} < ${minimo} ${nome(el)}${el.closest("[class*=nl-carro]") ? " (carro 3D, fora desta frente)" : ""} "${n.textContent.trim().slice(0, 40)}" (${cs.color} sobre rgb(${Math.round(fundo.r)},${Math.round(fundo.g)},${Math.round(fundo.b)}), ${tam}px/${peso})`);
  }
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > vh) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || el.closest("canvas")) continue;
    for (const prop of ["color", "backgroundColor", "borderTopColor", "borderLeftColor", "outlineColor", "fill", "stroke"]) {
      if (prop.startsWith("border") && parseFloat(cs[prop.replace("Color", "Width")]) === 0) continue;
      if (prop === "outlineColor" && cs.outlineStyle === "none") continue;
      const c = rgb(cs[prop] || ""); if (!c || c.a < 0.15) continue;
      const tipo = foraDaPaleta(c);
      if (tipo) { const k = `${tipo} ${cs[prop]} [${prop}] ${nome(el)}${el.closest("[class*=nl-carro]") ? " (carro 3D, fora desta frente)" : ""}`; fora.set(k, (fora.get(k) || 0) + 1); }
    }
  }
  return { falhas: [...new Set(falhas)], fora: [...fora.entries()].map(([k, v]) => `${k} x${v}`) };
}

const relatorio = [];
async function registrar(page, nome, { clip, fullPage } = {}) {
  await sleep(350);
  const m = await page.evaluate(medir, TOKENS);
  relatorio.push({ nome, ...m });
  const arq = path.join(OUT, `${nome}.png`);
  if (clip) { const el = await page.$(clip); if (el) await el.screenshot({ path: arq }); }
  else await page.screenshot({ path: arq, fullPage: !!fullPage });
  const semCarro = (l) => l.filter((x) => !x.includes("carro 3D")).length;
  console.log(`${semCarro(m.falhas) || semCarro(m.fora) ? "ATENÇÃO" : "ok     "} ${nome}: ${m.falhas.length} texto(s) abaixo do mínimo, ${m.fora.length} cor(es) fora da paleta`);
  for (const f of m.falhas.slice(0, 8)) console.log("    contraste", f);
  for (const f of m.fora.slice(0, 8)) console.log("    paleta   ", f);
}

async function abrir(largura, altura, q = "") {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const celular = largura < 700;
  await page.setViewport({ width: largura, height: altura, isMobile: celular, hasTouch: celular, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => { window.open = () => null; });
  await page.goto(BASE + q, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => /\d/.test(document.querySelector(".nl-catalog-tools .subtle")?.textContent || "") || !!document.querySelector(".nl-pagina, .commerce-login"), { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await sleep(800);
  return { page, ctx };
}
const rolarAte = (page, sel, bloco = "start") => page.evaluate((s, b) => { document.querySelector(s)?.scrollIntoView({ block: b, behavior: "instant" }); }, sel, bloco);

for (const [largura, altura] of [[1366, 800], [390, 844]]) {
  const p = `${largura}-`;
  let { page, ctx } = await abrir(largura, altura);
  await page.waitForFunction(() => !document.querySelector(".nl-carro-carregando"), { timeout: 60000 }).catch(() => {});
  await registrar(page, p + "01-abertura");
  await registrar(page, p + "01b-cabecalho", { clip: ".store-header" });
  await rolarAte(page, "#catalogo");
  await registrar(page, p + "02-catalogo");
  await rolarAte(page, ".product-grid .nl-product-card", "center");
  await registrar(page, p + "02b-catalogo-cartoes");
  if (await page.$(".nl-filtros-toggle")) {
    await page.evaluate(() => document.querySelector(".nl-filtros-toggle").click());
    await sleep(400);
    await rolarAte(page, ".nl-filtros-toggle", "start");
    await registrar(page, p + "02c-filtros");
    await page.evaluate(() => document.querySelector(".nl-filtros-toggle").click());
  }
  await page.evaluate(() => document.querySelector(".product-grid .nl-product-card .product-photo")?.click());
  await page.waitForSelector(".nl-product-dialog", { timeout: 8000 }).catch(() => {});
  await sleep(600);
  await registrar(page, p + "03-ficha");
  await page.keyboard.press("Escape");
  await sleep(400);
  await page.evaluate(() => [...document.querySelectorAll(".product-grid .add-button")].find((b) => !b.disabled)?.click());
  await page.waitForSelector(".cart-line", { timeout: 8000 }).catch(() => {});
  await sleep(600);
  await registrar(page, p + "04-carrinho");
  const finalizar = await page.evaluate(() => { const b = [...document.querySelectorAll(".nl-cart-sheet button")].find((e) => /Finalizar pedido/i.test(e.textContent)); b?.click(); return !!b; });
  if (finalizar) {
    await page.waitForSelector("#checkout-form", { timeout: 8000 }).catch(() => {});
    await sleep(500);
    await registrar(page, p + "05-checkout");
    await page.evaluate(() => document.querySelector(".nl-pagamentos, .nl-totais")?.scrollIntoView({ block: "center" }));
    await registrar(page, p + "05b-checkout-pagamento");
  }
  await page.keyboard.press("Escape");
  await sleep(500);
  // Estado vazio da busca (no celular a busca fica no catálogo)
  await page.evaluate(() => { const i = document.querySelector('input[aria-label="Buscar peça por nome, marca, grupo ou veículo"]'); if (i) { i.scrollIntoView({ block: "center" }); i.focus(); i.select(); } });
  await page.keyboard.type("xyzqwk");
  await sleep(1000);
  await rolarAte(page, ".catalog-section .empty-state", "center");
  await registrar(page, p + "02d-busca-vazia");
  await rolarAte(page, ".nl-value-strip", "center");
  await registrar(page, p + "06-faixa", { clip: ".nl-value-strip" });
  await rolarAte(page, ".nl-footer", "start");
  await registrar(page, p + "07-rodape-topo");
  await registrar(page, p + "07-rodape", { clip: ".nl-footer" });
  if (largura < 700) {
    await page.evaluate(() => scrollTo(0, 0));
    await page.evaluate(() => document.querySelector(".nl-header-menu")?.click());
    await sleep(700);
    await registrar(page, p + "09-menu");
    await page.keyboard.press("Escape");
    await sleep(400);
  }
  await page.evaluate(() => { scrollTo(0, 0); document.querySelector(".nl-header-carro")?.click(); });
  await page.waitForSelector(".nl-seletor", { timeout: 5000 }).catch(() => {});
  await sleep(500);
  await registrar(page, p + "10-seletor-carro");
  await ctx.close();

  for (const pg of ["quem-somos", "onde-estamos", "entrega", "como-comprar"]) {
    ({ page, ctx } = await abrir(largura, altura, `?pagina=${pg}`));
    await registrar(page, p + `08-pagina-${pg}`);
    await ctx.close();
  }
  ({ page, ctx } = await abrir(largura, altura, "gestao"));
  await registrar(page, p + "11-login-commerce");
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(OUT, "relatorio.json"), JSON.stringify(relatorio, null, 1));
// O carro 3D (components/carro-interativo.css) é refeito em outra frente: aparece no relatório, mas não reprova.
const conta = (campo, carro) => relatorio.reduce((n, r) => n + r[campo].filter((x) => x.includes("carro 3D") === carro).length, 0);
const [nFalhas, nFora, nCarro] = [conta("falhas", false), conta("fora", false), conta("falhas", true) + conta("fora", true)];
console.log(`\n${relatorio.length} telas · ${nFalhas} texto(s) abaixo do contraste mínimo · ${nFora} cor(es) fora da paleta · ${nCarro} achado(s) no carro 3D (fora desta frente) · prints em ${OUT}`);
process.exitCode = nFalhas || nFora ? 1 : 0;
