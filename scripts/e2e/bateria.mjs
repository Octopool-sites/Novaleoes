// Bateria de testes de ponta a ponta da vitrine (versão A), num Chrome/Edge sem janela.
// Uso: npm run e2e -- [url] [pasta-de-saída]   (padrão: http://localhost:5190/ e outputs/e2e)
// Percorre os fluxos do cliente: abertura e carro 3D, busca, carro, filtros, detalhe da peça, carrinho,
// frete por CEP, checkout pelo WhatsApp, páginas da loja, rolagem lateral de 320 a 1920 px, SEO e teclado.
// Não envia pedido: window.open é interceptado e o link do WhatsApp só é conferido.
// O frete consulta a AwesomeAPI/ViaCEP de verdade: numa rede lenta esses dois cenários podem falhar sozinhos.
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const BASE = (process.argv[2] || "http://localhost:5190/").replace(/\/?$/, "/");
const OUT = process.argv[3] || path.join("outputs", "e2e");
fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => fs.existsSync(p));
if (!CHROME) throw new Error("Chrome/Edge não encontrado: defina CHROME_PATH.");

const resultados = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars", "--no-first-run", "--lang=pt-BR"],
  defaultViewport: null,
});

async function novaPagina({ largura = 1440, altura = 900, celular = false, limpar = true } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: largura, height: altura, isMobile: celular, hasTouch: celular, deviceScaleFactor: 1 });
  if (celular) await page.setUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36");
  const log = { console: [], falhas: [], http: [], abertos: [] };
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log.console.push(`${m.type()}: ${m.text()}`.slice(0, 300)); });
  page.on("pageerror", (e) => log.console.push(`pageerror: ${e.message}`.slice(0, 300)));
  const inicio = new Map();
  page.on("request", (r) => inicio.set(r, Date.now()));
  page.on("requestfailed", (r) => { const u = r.url(); if (!u.startsWith("data:")) log.falhas.push(`${r.failure()?.errorText} após ${Date.now() - (inicio.get(r) || Date.now())}ms ${u}`.slice(0, 250)); });
  page.on("response", (r) => { if (r.status() >= 400) log.http.push(`${r.status()} ${r.url()}`.slice(0, 250)); });
  await page.exposeFunction("__registrarAberto", (u) => log.abertos.push(u));
  await page.evaluateOnNewDocument(() => {
    window.open = (u) => { window.__registrarAberto(String(u)); return null; };
    try { if (!sessionStorage.getItem("__limpo")) { localStorage.clear(); sessionStorage.setItem("__limpo", "1"); } } catch {}
  });
  return { page, ctx, log };
}

async function teste(nome, fn, opcoes) {
  const t0 = Date.now();
  const { page, ctx, log } = await novaPagina(opcoes);
  const r = { nome, ok: true, detalhes: [], erros: [] };
  const verificar = (cond, msg) => { if (!cond) { r.ok = false; r.erros.push(msg); } };
  const anotar = (msg) => r.detalhes.push(msg);
  try {
    await fn({ page, verificar, anotar, log });
  } catch (e) {
    r.ok = false;
    r.erros.push(`exceção: ${e.message.split("\n")[0]}`);
    try { await page.screenshot({ path: path.join(OUT, `falha-${nome.replace(/[^a-z0-9]+/gi, "-")}.png`) }); } catch {}
  }
  r.console = [...new Set(log.console)];
  r.falhasRede = [...new Set(log.falhas)];
  r.http = [...new Set(log.http)];
  r.ms = Date.now() - t0;
  resultados.push(r);
  console.log(`${r.ok ? "OK  " : "FALHA"} ${nome} (${r.ms} ms)${r.erros.length ? "\n      - " + r.erros.join("\n      - ") : ""}`);
  await ctx.close();
}

const abrir = async (page, q = "") => {
  await page.goto(BASE + q, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => /\d+ peças? · estoque de|\d+ peças?$/.test(document.querySelector(".nl-catalog-tools .subtle")?.textContent || "") || !!document.querySelector(".nl-pagina"), { timeout: 60000 });
};
const contagem = (page) => page.$eval(".nl-catalog-tools .subtle", (el) => Number((el.textContent.match(/^([\d.]+)/) || [0, "0"])[1].replace(/\./g, "")));
const cartoes = (page) => page.$$eval(".product-grid .nl-product-card", (els) => els.length);
async function clicarTexto(page, seletor, texto) {
  const ok = await page.evaluate((s, t) => {
    const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().toLowerCase().includes(t.toLowerCase()) && e.offsetParent !== null);
    if (!el) return false;
    el.scrollIntoView({ block: "center" });
    el.click();
    return true;
  }, seletor, texto);
  if (!ok) throw new Error(`não achei "${texto}" em ${seletor}`);
}
async function selecionarPorTexto(page, rotulo, texto) {
  const valor = await page.evaluate((r, t) => {
    const s = document.querySelector(`select[aria-label="${r}"]`);
    const o = s && [...s.options].find((op) => op.textContent.trim().toLowerCase() === t.toLowerCase());
    return o ? o.value : null;
  }, rotulo, texto);
  if (valor === null) throw new Error(`opção "${texto}" não existe em ${rotulo}`);
  await page.select(`select[aria-label="${rotulo}"]`, valor);
  await sleep(400);
}
const transborda = (page) => page.evaluate(() => {
  const w = document.documentElement.clientWidth;
  const culpados = [];
  if (document.documentElement.scrollWidth > w + 1) {
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.right > w + 1 && r.width > 0 && getComputedStyle(el).position !== "fixed") {
        culpados.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} (${Math.round(r.right)}px)`);
        if (culpados.length > 5) break;
      }
    }
  }
  return { scrollWidth: document.documentElement.scrollWidth, largura: w, culpados };
});

// ─────────────────────────── testes ───────────────────────────

await teste("abertura carrega sem erro, com 3D e catálogo", async ({ page, verificar, anotar, log }) => {
  const t0 = Date.now();
  await abrir(page);
  anotar(`catálogo pronto em ${Date.now() - t0} ms`);
  await page.waitForFunction(() => !document.querySelector(".nl-carro-carregando"), { timeout: 60000 }).catch(() => {});
  anotar(`3D pronto em ${Date.now() - t0} ms`);
  const info = await page.evaluate(() => ({
    titulo: document.title, h1: document.querySelectorAll("h1").length, canvas: !!document.querySelector(".nl-carro-palco canvas"),
    carregando: !!document.querySelector(".nl-carro-carregando"), total: document.querySelector(".nl-catalog-tools .subtle")?.textContent,
    imgsQuebradas: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.getBoundingClientRect().width > 0).map((i) => i.src).slice(0, 5),
  }));
  anotar(JSON.stringify(info));
  verificar(info.h1 === 1, `esperado 1 h1, achei ${info.h1}`);
  verificar(info.canvas, "canvas do 3D não apareceu");
  verificar(!info.carregando, "3D não terminou de carregar em 60 s");
  verificar(info.imgsQuebradas.length === 0, `imagens quebradas: ${info.imgsQuebradas.join(", ")}`);
  await page.screenshot({ path: path.join(OUT, "01-abertura.png") });
  verificar(log.console.filter((c) => !/Download the React DevTools/.test(c)).length === 0, `console: ${log.console.join(" | ")}`);
});

await teste("carro 3D: rolar abre, pino abre painel, adicionar do painel", async ({ page, verificar, anotar }) => {
  await abrir(page);
  await page.waitForFunction(() => !document.querySelector(".nl-carro-carregando"), { timeout: 60000 });
  await clicarTexto(page, ".nl-carro-abrir", "Abrir o carro");
  await page.waitForFunction(() => document.querySelectorAll('.nl-pino[data-visivel="1"]').length >= 5, { timeout: 10000 }).catch(() => {});
  await sleep(500);
  const visiveis = await page.$$eval('.nl-pino[data-visivel="1"]', (els) => els.map((e) => e.textContent));
  anotar(`pinos visíveis: ${visiveis.join(", ")}`);
  verificar(visiveis.length >= 5, `poucos pinos visíveis (${visiveis.length})`);
  await page.evaluate(() => document.querySelector('.nl-pino[data-visivel="1"]')?.click());
  await page.waitForSelector(".nl-carro-painel", { timeout: 5000 });
  await page.waitForFunction(() => document.querySelectorAll(".nl-carro-pecas .nl-carro-peca").length > 0, { timeout: 10000 });
  const painel = await page.evaluate(() => ({ titulo: document.querySelector(".nl-carro-painel .nl-kicker")?.textContent, itens: document.querySelectorAll(".nl-carro-pecas .nl-carro-peca").length, verTodas: document.querySelector(".nl-carro-ver-todas")?.textContent }));
  anotar(JSON.stringify(painel));
  verificar(painel.itens > 0, "painel sem peças");
  await page.screenshot({ path: path.join(OUT, "02-painel-carro.png") });
  // girar
  await page.click('button[aria-label="Girar o carro para a direita"]');
  await sleep(800);
  await page.click(".nl-carro-add");
  await page.waitForSelector(".cart-line", { timeout: 5000 });
  const linhas = await page.$$eval(".cart-line", (e) => e.length);
  verificar(linhas === 1, `carrinho deveria ter 1 linha, tem ${linhas}`);
  await page.keyboard.press("Escape");
  await sleep(400);
  await page.evaluate(() => document.querySelector(".nl-carro-ver-todas")?.click());
  await sleep(1200);
  const dep = await page.evaluate(() => ({ ativo: document.querySelector(".nl-departamentos button.active")?.textContent, topo: Math.round(document.getElementById("catalogo").getBoundingClientRect().top) }));
  anotar(`ver todas → ${JSON.stringify(dep)}`);
  verificar(Math.abs(dep.topo) < 150, `"Ver todas" não levou ao catálogo (top=${dep.topo})`);
});

await teste("busca: acha, não acha, limpa", async ({ page, verificar, anotar }) => {
  await abrir(page);
  const total = await contagem(page);
  const input = 'input[aria-label="Buscar peça por nome, marca, grupo ou veículo"]';
  for (const [q, esperaAlgo] of [["pastilha gol", true], ["amort ts", true], ["bomba dagua", true], ["vela ngk", true], ["óleo 5w30", true], ["pastilhas", true], ["amortecedores", true], ["bomba d'agua", true], ["oleo 5w-30", true], ["xyzqwk", false]]) {
    await page.$eval(input, (el) => { el.scrollIntoView({ block: "center" }); el.focus(); el.select(); });
    await page.keyboard.type(q);
    await sleep(900);
    const n = await contagem(page);
    const primeiros = await page.$$eval(".product-grid .nl-product-card h3", (els) => els.slice(0, 3).map((e) => e.textContent));
    anotar(`"${q}": ${n} → ${primeiros.join(" | ")}`);
    verificar(esperaAlgo ? n > 0 : n === 0, `busca "${q}" deu ${n}`);
  }
  const vazio = await page.$(".catalog-section .empty-state");
  verificar(!!vazio, "sem estado vazio para busca sem resultado");
  await page.click('button[aria-label="Limpar busca"]');
  await sleep(600);
  verificar((await contagem(page)) === total, "limpar busca não voltou ao total");
  // busca do topo
  await page.click('input[aria-label="Buscar peça"]');
  await page.type('input[aria-label="Buscar peça"]', "filtro de oleo");
  await page.keyboard.press("Enter");
  await sleep(1200);
  const topo = await page.evaluate(() => Math.round(document.getElementById("catalogo").getBoundingClientRect().top));
  anotar(`busca do topo: catálogo em ${topo}px, ${await contagem(page)} peças`);
  verificar(topo < 200, "busca do topo não rolou até o catálogo");
});

await teste("carro por dropdown: Fiat Uno 2010, selo, lembrado ao recarregar", async ({ page, verificar, anotar }) => {
  await abrir(page);
  const total = await contagem(page);
  await selecionarPorTexto(page, "Montadora", "Fiat");
  const nMont = await contagem(page);
  await selecionarPorTexto(page, "Modelo", "Uno");
  const nMod = await contagem(page);
  await selecionarPorTexto(page, "Ano", "2010");
  await sleep(600);
  const nAno = await contagem(page);
  anotar(`total ${total} → Fiat ${nMont} → Uno ${nMod} → 2010 ${nAno}`);
  verificar(total > nMont && nMont > nMod && nMod >= nAno && nAno > 0, "contagens não diminuem como deveriam");
  const selos = await page.$$eval(".product-grid .nl-serve", (e) => e.length);
  const cards = await cartoes(page);
  anotar(`selos "serve" ${selos}/${cards}`);
  verificar(selos === cards, "nem todo cartão filtrado tem o selo 'Serve no seu'");
  const cabecalho = await page.$eval(".nl-header-carro span", (e) => e.textContent);
  anotar(`botão do topo: ${cabecalho}`);
  verificar(/uno/i.test(cabecalho), "botão 'Meu carro' do topo não mostra o carro");
  const url = page.url();
  anotar(`URL: ${url}`);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => /\d/.test(document.querySelector(".nl-catalog-tools .subtle")?.textContent || ""), { timeout: 60000 });
  await sleep(800);
  const depois = await contagem(page);
  verificar(depois === nAno, `ao recarregar: ${depois} (esperado ${nAno})`);
  await clicarTexto(page, ".nl-carro-limpar", "Limpar");
  await sleep(600);
  verificar((await contagem(page)) === total, "Limpar carro não voltou ao total");
});

await teste("seletor 'Meu carro' do topo (modal)", async ({ page, verificar, anotar }) => {
  await abrir(page);
  await page.click(".nl-header-carro");
  await page.waitForSelector(".nl-seletor", { timeout: 5000 });
  const passos = await page.$eval(".nl-seletor", (e) => e.innerText.slice(0, 200).replace(/\n+/g, " / "));
  anotar(passos);
  await clicarTexto(page, ".nl-seletor button", "Volkswagen");
  await sleep(400);
  await clicarTexto(page, ".nl-seletor button", "Gol");
  await sleep(400);
  const anos = await page.$$eval(".nl-seletor-anos button", (e) => e.map((b) => b.textContent.trim()).slice(0, 6));
  anotar(`anos: ${anos.join(", ")}`);
  if (anos.length) await clicarTexto(page, ".nl-seletor-anos button", anos.find((a) => /2012/.test(a)) || anos[0]);
  await sleep(1000);
  const aberto = await page.$(".nl-seletor");
  const rotulo = await page.$eval(".nl-header-carro span", (e) => e.textContent);
  anotar(`depois: modal ${aberto ? "aberto" : "fechado"}, topo "${rotulo}", ${await contagem(page)} peças`);
  verificar(/gol/i.test(rotulo), "carro não ficou salvo no topo");
});

await teste("departamentos, grupos, filtros, ordenação e 'ver mais'", async ({ page, verificar, anotar }) => {
  await abrir(page);
  await clicarTexto(page, ".nl-departamentos button", "Freios");
  await sleep(700);
  const nFreios = await contagem(page);
  const grupos = await page.$$eval(".nl-grupos-lista button", (e) => e.map((b) => b.textContent).slice(0, 5));
  anotar(`Freios ${nFreios}; grupos: ${grupos.join(" | ")}`);
  verificar(nFreios > 0 && grupos.length > 1, "Freios sem peças ou sem grupos");
  await page.evaluate(() => document.querySelectorAll(".nl-grupos-lista button")[1]?.click());
  await sleep(600);
  const nGrupo = await contagem(page);
  verificar(nGrupo > 0 && nGrupo < nFreios, `grupo não filtrou (${nGrupo})`);
  await page.click(".nl-filtros-toggle");
  await page.evaluate(() => { const c = document.querySelector('#nl-filtros input[type="checkbox"]'); c.click(); });
  await sleep(600);
  const nEstoque = await contagem(page);
  const semEstoque = await page.$$eval(".product-grid .nl-disp-consulta", (e) => e.length);
  anotar(`só estoque: ${nEstoque}, cartões 'sob encomenda' visíveis: ${semEstoque}`);
  verificar(semEstoque === 0, "'Só em estoque' ainda mostra sob encomenda");
  const sel = await page.$$("#nl-filtros select");
  await sel[1].select("menor-preco");
  await sleep(700);
  const precos = await page.$$eval(".product-grid .product-bottom strong", (e) => e.map((x) => x.textContent));
  const nums = precos.map((p) => Number(p.replace(/[^\d,]/g, "").replace(",", "."))).filter((n) => n > 0);
  anotar(`menor preço, primeiros: ${precos.slice(0, 5).join(", ")}`);
  verificar(nums.every((n, i) => i === 0 || n >= nums[i - 1]), "ordenação por menor preço fora de ordem");
  await sel[1].select("maior-preco");
  await sleep(700);
  const precos2 = (await page.$$eval(".product-grid .product-bottom strong", (e) => e.map((x) => x.textContent))).map((p) => Number(p.replace(/[^\d,]/g, "").replace(",", "."))).filter((n) => n > 0);
  verificar(precos2.every((n, i) => i === 0 || n <= precos2[i - 1]), "ordenação por maior preço fora de ordem");
  // ver mais
  await clicarTexto(page, ".nl-departamentos button", "Todas as peças");
  await sleep(600);
  const antes = await cartoes(page);
  await clicarTexto(page, ".nl-carregar-mais button", "Ver mais");
  await sleep(700);
  const depois = await cartoes(page);
  anotar(`ver mais: ${antes} → ${depois}`);
  verificar(depois > antes, "'Ver mais peças' não carregou mais");
  const urlFinal = page.url();
  anotar(`URL com filtros: ${urlFinal}`);
});

await teste("detalhe da peça: abre, aplicações, WhatsApp, link compartilhado, fechar", async ({ page, verificar, anotar }) => {
  await abrir(page, "?q=pastilha");
  await sleep(1000);
  await page.click(".product-grid .nl-product-card .photo-button");
  await page.waitForSelector(".nl-product-dialog .detail-title", { timeout: 8000 });
  await sleep(1500);
  const d = await page.evaluate(() => ({
    titulo: document.querySelector(".nl-product-dialog .detail-title")?.textContent,
    preco: document.querySelector(".nl-product-dialog .detail-price")?.textContent,
    aplic: document.querySelectorAll(".nl-detail-aplicacoes tr").length,
    whats: document.querySelector(".nl-product-dialog a.nl-whats-button")?.getAttribute("href") || "",
    url: location.search,
    foco: document.activeElement?.closest("[role=dialog]") ? "dentro" : "fora",
  }));
  anotar(JSON.stringify({ ...d, whats: d.whats.slice(0, 80) }));
  verificar(!!d.titulo && !!d.preco, "detalhe sem título ou preço");
  verificar(/peca=/.test(d.url), "URL não ganhou ?peca=");
  verificar(/wa\.me\/\d+\?text=/.test(d.whats), "botão de WhatsApp sem link wa.me");
  verificar(d.foco === "dentro", "foco não foi para dentro do modal");
  await page.screenshot({ path: path.join(OUT, "03-detalhe.png") });
  const link = page.url();
  await page.keyboard.press("Escape");
  await sleep(500);
  verificar(!/peca=/.test(page.url()), "fechar não limpou ?peca= da URL");
  // link compartilhado em outra aba
  const { page: p2, ctx } = await novaPagina();
  await p2.goto(link, { waitUntil: "domcontentloaded" });
  await p2.waitForSelector(".nl-product-dialog .detail-title", { timeout: 60000 });
  const t2 = await p2.$eval(".nl-product-dialog .detail-title", (e) => e.textContent);
  verificar(t2 === d.titulo, `link compartilhado abriu outra peça (${t2})`);
  await ctx.close();
  // voltar do navegador com peça aberta (o cliente chega pela inicial e abre a peça)
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.goto(BASE + "?q=pastilha", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll(".product-grid .nl-product-card").length > 0, { timeout: 60000 });
  await page.evaluate(() => document.querySelector(".product-grid .nl-product-card .photo-button").click());
  await page.waitForSelector(".nl-product-dialog .detail-title");
  const antesVoltar = page.url();
  await page.goBack({ timeout: 5000 }).catch(() => null);
  await sleep(800);
  const depoisVoltar = page.url();
  anotar(`voltar com peça aberta: ${antesVoltar} → ${depoisVoltar} (modal ${await page.$(".nl-product-dialog") ? "aberto" : "fechado"})`);
  verificar(depoisVoltar.includes("q=pastilha"), `voltar do navegador com a peça aberta saiu da busca (${depoisVoltar})`);
});

await teste("carrinho: adicionar, quantidade, venda mínima, remover, persistência", async ({ page, verificar, anotar }) => {
  await abrir(page, "?q=vela");
  await sleep(1000);
  const alvo = await page.$$eval(".product-grid .nl-product-card", (els) => els.map((e, i) => ({ i, t: e.querySelector("h3")?.textContent, min: /mín\. (\d+)/.exec(e.textContent)?.[1] || "1", dis: e.querySelector(".add-button")?.disabled })).filter((x) => !x.dis).slice(0, 2));
  anotar(`peças: ${JSON.stringify(alvo)}`);
  await page.evaluate((i) => document.querySelectorAll(".product-grid .nl-product-card .add-button")[i].click(), alvo[0].i);
  await page.waitForSelector(".cart-line", { timeout: 5000 });
  const q1 = await page.$eval(".cart-line .quantity span", (e) => Number(e.textContent));
  verificar(q1 === Number(alvo[0].min), `quantidade inicial ${q1}, venda mínima ${alvo[0].min}`);
  const menosDesab = await page.$eval(".cart-line .quantity button", (b) => b.disabled);
  verificar(menosDesab, "botão − habilitado na venda mínima");
  await page.evaluate(() => document.querySelector('.cart-line .quantity button[aria-label^="Aumentar"]').click());
  await sleep(200);
  const q2 = await page.$eval(".cart-line .quantity span", (e) => Number(e.textContent));
  verificar(q2 === q1 + 1, "botão + não somou");
  const badge = await page.$eval(".cart-trigger b", (e) => Number(e.textContent));
  verificar(badge === q2, `contador do topo ${badge} ≠ ${q2}`);
  const totais = await page.$eval(".nl-totais", (e) => e.innerText.replace(/\n/g, " | "));
  anotar(`totais: ${totais}`);
  await page.keyboard.press("Escape");
  await sleep(300);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Number(document.querySelector(".cart-trigger b")?.textContent) > 0, { timeout: 30000 }).catch(() => {});
  const badge2 = await page.$eval(".cart-trigger b", (e) => Number(e.textContent));
  verificar(badge2 === q2, `carrinho não persistiu (${badge2})`);
  await page.evaluate(() => document.querySelector(".cart-trigger").click());
  await page.waitForSelector(".cart-line");
  await page.evaluate(() => document.querySelector(".cart-line .remove-line").click());
  await sleep(300);
  verificar(!!(await page.$(".nl-cart-sheet .empty-state")), "remover não esvaziou o pedido");
});

await teste("frete por CEP no carrinho (entrega, retirada, fora do raio, inválido)", async ({ page, verificar, anotar }) => {
  await abrir(page, "?q=filtro de oleo");
  await sleep(1000);
  await page.evaluate(() => [...document.querySelectorAll(".product-grid .add-button")].find((b) => !b.disabled)?.click());
  await page.waitForSelector(".nl-cart-sheet .nl-frete input");
  const cep = ".nl-cart-sheet .nl-frete input";
  for (const [valor, espera] of [["07110-000", "entrega"], ["01310-100", "?"], ["20040-020", "combinar"], ["99999-999", "erro"], ["123", "erro"]]) {
    await page.$eval(cep, (el) => { el.focus(); el.select(); });
    await page.keyboard.press("Backspace");
    await page.keyboard.type(valor);
    if (valor.length < 9) await page.evaluate(() => document.querySelector(".nl-cart-sheet .nl-frete-form button").click());
    await page.waitForFunction(() => document.querySelector(".nl-cart-sheet .nl-frete-resultado li, .nl-cart-sheet .nl-frete-erro"), { timeout: 20000 }).catch(() => {});
    await sleep(300);
    const r = await page.evaluate(() => ({
      end: document.querySelector(".nl-cart-sheet .nl-frete-endereco")?.textContent,
      opcoes: [...document.querySelectorAll(".nl-cart-sheet .nl-frete-resultado li")].map((l) => l.innerText.replace(/\n/g, " ")),
      erro: document.querySelector(".nl-cart-sheet .nl-frete-erro")?.textContent,
      totais: document.querySelector(".nl-totais")?.innerText.replace(/\n/g, " "),
    }));
    anotar(`CEP ${valor}: ${JSON.stringify(r)}`);
    if (espera === "erro") verificar(!!r.erro, `CEP ${valor} deveria dar erro`);
    else verificar(r.opcoes.length > 0, `CEP ${valor} sem opções de frete`);
    if (espera === "entrega") verificar(r.opcoes.some((o) => /R\$/.test(o)), "CEP perto da loja sem valor de entrega");
  }
});

await teste("checkout completo pelo WhatsApp (retirada e entrega)", async ({ page, verificar, anotar, log }) => {
  await abrir(page, "?q=pastilha");
  await sleep(1000);
  await page.evaluate(() => [...document.querySelectorAll(".product-grid .add-button")].find((b) => !b.disabled)?.click());
  await page.waitForSelector(".cart-line");
  await page.keyboard.press("Escape");
  await sleep(300);
  await sleep(500);
  await page.$eval('input[aria-label="Buscar peça por nome, marca, grupo ou veículo"]', (el) => { el.scrollIntoView(); el.focus(); el.select(); });
  await page.keyboard.type("amortecedor");
  await sleep(900);
  await page.evaluate(() => [...document.querySelectorAll(".product-grid .add-button")].find((b) => !b.disabled)?.click());
  await page.waitForFunction(() => document.querySelectorAll(".cart-line").length === 2, { timeout: 5000 });
  await clicarTexto(page, ".nl-cart-sheet button", "Finalizar pedido");
  await page.waitForSelector("#checkout-form");
  // envio sem dados deve ser barrado pelo navegador
  await page.evaluate(() => document.querySelector(".nl-botao-whats").click());
  await sleep(500);
  verificar(log.abertos.length === 0, "enviou sem nome/telefone");
  for (const [sel, txt] of [['#checkout-form input[autocomplete="name"]', "Cliente Teste"], ['#checkout-form input[type="tel"]', "(11) 98888-7777"], ['#checkout-form input[placeholder^="Ex.: Uno"]', "Gol 2012 1.6"]]) { await page.$eval(sel, (el) => el.focus()); await page.keyboard.type(txt); }
  await page.evaluate(() => document.querySelector(".nl-botao-whats").click());
  await sleep(800);
  verificar(log.abertos.length === 1, `WhatsApp aberto ${log.abertos.length}x (retirada)`);
  const texto1 = decodeURIComponent((log.abertos[0] || "").split("text=")[1] || "");
  anotar(`retirada, ${texto1.length} caracteres, URL ${log.abertos[0]?.length}:\n${texto1}`);
  verificar(/Retirar na loja/.test(texto1) && /Cliente Teste/.test(texto1) && /Subtotal/.test(texto1), "mensagem de retirada incompleta");
  verificar(/wa\.me\/551124528939/.test(log.abertos[0] || ""), "número do WhatsApp diferente do esperado");
  const passo = await page.$eval(".nl-cart-sheet", (e) => e.innerText.slice(0, 160));
  verificar(/Pedido pronto no WhatsApp/.test(passo), "tela de pedido enviado não apareceu");
  const badge = await page.$eval(".cart-trigger b", (e) => Number(e.textContent));
  verificar(badge > 0, "o pedido não pode sumir só porque o WhatsApp abriu (e se não abriu?)");
  verificar(!!(await page.$(".nl-copiar")), "sem botão para copiar o pedido");
  await page.screenshot({ path: path.join(OUT, "04-enviado.png") });
  await clicarTexto(page, ".nl-cart-sheet button", "Pronto, já enviei");
  await sleep(600);
  const badge2 = await page.$eval(".cart-trigger b", (e) => Number(e.textContent));
  verificar(badge2 === 0, "'Pronto, já enviei' não esvaziou o pedido");

  // entrega
  await sleep(300);
  await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll(".product-grid .add-button")].find((b) => !b.disabled)?.click());
  await page.waitForSelector(".cart-line");
  const cep = ".nl-cart-sheet .nl-frete input";
  await page.$eval(cep, (el) => { el.focus(); el.select(); });
  await page.keyboard.press("Backspace");
  await page.keyboard.type("07110-000");
  await page.waitForFunction(() => document.querySelector(".nl-cart-sheet .nl-frete-resultado li"), { timeout: 20000 }).catch(() => {});
  await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll(".nl-cart-sheet .nl-frete-resultado label")].find((l) => /motoboy|entrega/i.test(l.textContent))?.click());
  await sleep(300);
  await clicarTexto(page, ".nl-cart-sheet button", "Finalizar pedido");
  await page.waitForSelector("#checkout-form");
  const campos = await page.evaluate(() => ({ nome: document.querySelector('#checkout-form input[autocomplete="name"]').value, rua: document.querySelector('#checkout-form input[autocomplete="address-line1"]')?.value, bairro: [...document.querySelectorAll("#checkout-form label")].find((l) => /^Bairro/.test(l.textContent))?.querySelector("input")?.value }));
  anotar(`dados lembrados: ${JSON.stringify(campos)}`);
  verificar(campos.nome === "Cliente Teste", "nome não foi lembrado");
  verificar(!!campos.rua, "rua não veio do CEP");
  await page.evaluate(() => [...document.querySelectorAll("#checkout-form label")].find((l) => /^Número/.test(l.textContent))?.querySelector("input")?.focus());
  await page.keyboard.type("120");
  await page.evaluate(() => document.querySelector(".nl-botao-whats").click());
  await sleep(800);
  const texto2 = decodeURIComponent((log.abertos[1] || "").split("text=")[1] || "");
  anotar(`entrega:\n${texto2}`);
  verificar(/Entrega pelo motoboy/.test(texto2) && /Endereço:/.test(texto2) && /Total estimado/.test(texto2), "mensagem de entrega incompleta");
});

await teste("páginas da loja, navegação do topo/rodapé e voltar do navegador", async ({ page, verificar, anotar }) => {
  await abrir(page);
  for (const [rotulo, id] of [["Entrega", "entrega"], ["Quem somos", "quem-somos"], ["Contato", "onde-estamos"]]) {
    await clicarTexto(page, ".nl-header-nav a", rotulo);
    await page.waitForSelector(".nl-pagina", { timeout: 5000 });
    const info = await page.evaluate(() => ({ url: location.search, h: document.querySelector(".nl-pagina h1, .nl-pagina h2")?.textContent, len: document.querySelector(".nl-pagina")?.innerText.length, topo: scrollY }));
    anotar(`${rotulo}: ${JSON.stringify(info)}`);
    verificar(info.url.includes(`pagina=${id}`) && info.len > 200, `página ${id} vazia ou URL errada`);
  }
  await page.goBack(); await sleep(600);
  verificar(page.url().includes("pagina=quem-somos"), `voltar deveria ir para quem-somos (${page.url()})`);
  await page.goBack(); await sleep(600);
  await page.goBack(); await sleep(800);
  verificar(!page.url().includes("pagina="), `voltar 3x deveria chegar na inicial (${page.url()})`);
  // rodapé
  const links = await page.$$eval(".nl-footer a", (as) => as.map((a) => ({ t: a.textContent.trim(), h: a.getAttribute("href"), alvo: a.target })));
  anotar(`rodapé: ${links.map((l) => `${l.t} → ${l.h}`).join(" ; ")}`);
  for (const l of links.filter((l) => /pagina=/.test(l.h || ""))) {
    await page.goto(new URL(l.h, BASE).href, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".nl-pagina", { timeout: 20000 }).catch(() => {});
    const len = await page.$eval(".nl-pagina", (e) => e.innerText.length).catch(() => 0);
    verificar(len > 200, `rodapé "${l.t}" abriu página vazia`);
  }
  for (const p of ["como-comprar", "trocas-e-garantia", "duvidas", "onde-estamos"]) {
    await page.goto(`${BASE}?pagina=${p}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".nl-pagina", { timeout: 20000 });
    await page.screenshot({ path: path.join(OUT, `05-pagina-${p}.png`), fullPage: true });
    const txt = await page.$eval(".nl-pagina", (e) => e.innerText);
    anotar(`--- ${p} (${txt.length} chars):\n${txt.slice(0, 1500)}`);
  }
});

for (const [largura, altura, celular] of [[320, 640, true], [375, 812, true], [390, 844, true], [768, 1024, true], [1024, 768, false], [1280, 800, false], [1440, 900, false], [1920, 1080, false]]) {
  await teste(`sem rolagem lateral em ${largura}px`, async ({ page, verificar, anotar }) => {
    await abrir(page);
    await page.waitForFunction(() => !document.querySelector(".nl-carro-carregando"), { timeout: 60000 }).catch(() => {});
    const checar = async (onde) => { const t = await transborda(page); if (t.scrollWidth > t.largura + 1) { verificar(false, `${onde}: scrollWidth ${t.scrollWidth} > ${t.largura} · ${t.culpados.join(", ")}`); } };
    await checar("inicial");
    for (const y of [0.3, 0.6, 1]) { await page.evaluate((f) => scrollTo(0, document.body.scrollHeight * f), y); await sleep(500); await checar(`rolado ${y * 100}%`); }
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(OUT, `06-inicio-${largura}.png`) });
    await page.evaluate(() => document.querySelector(".product-grid .nl-product-card .photo-button")?.click());
    await page.waitForSelector(".nl-product-dialog .detail-title", { timeout: 8000 });
    await sleep(800);
    const dlg = await page.$eval(".nl-product-dialog", (e) => ({ w: e.getBoundingClientRect().width, sw: e.scrollWidth, cw: e.clientWidth, vw: innerWidth }));
    verificar(dlg.w <= dlg.vw && dlg.sw <= dlg.cw + 1, `modal da peça transborda: ${JSON.stringify(dlg)}`);
    const cortado = await page.evaluate(() => { const d = document.querySelector(".nl-product-dialog"); const lim = d.getBoundingClientRect().right; return [...d.querySelectorAll(".detail-title, .detail-price, .nl-detail-acoes button")].filter((e) => e.getBoundingClientRect().right > lim + 1).length; });
    verificar(cortado === 0, `modal da peça: ${cortado} elementos cortados à direita`);
    if (celular) await page.screenshot({ path: path.join(OUT, `07-detalhe-${largura}.png`) });
    await page.evaluate(() => [...document.querySelectorAll(".nl-product-dialog button")].find((b) => /Adicionar ao pedido/.test(b.textContent))?.click());
    await page.waitForSelector(".nl-cart-sheet .cart-line", { timeout: 5000 });
    await sleep(600);
    const sheet = await page.$eval(".nl-cart-sheet", (e) => ({ w: e.getBoundingClientRect().width, sw: e.scrollWidth, cw: e.clientWidth, vw: innerWidth }));
    verificar(sheet.w <= sheet.vw + 1 && sheet.sw <= sheet.cw + 1, `carrinho transborda: ${JSON.stringify(sheet)}`);
    if (celular) await page.screenshot({ path: path.join(OUT, `08-carrinho-${largura}.png`) });
    const header = await page.evaluate(() => [...document.querySelectorAll(".store-header > *")].map((e) => { const r = e.getBoundingClientRect(); return `${e.className.split(" ")[0]}:${Math.round(r.left)}-${Math.round(r.right)}${getComputedStyle(e).display === "none" ? "(oculto)" : ""}`; }));
    anotar(`topo: ${header.join(" ")}`);
  }, { largura, altura, celular });
}

await teste("SEO, compartilhamento e arquivos de apoio", async ({ page, verificar, anotar }) => {
  const resp = await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const h = resp.headers();
  anotar(`cabeçalhos: x-robots-tag=${h["x-robots-tag"]} · csp=${(h["content-security-policy"] || "").slice(0, 60)}… · cache=${h["cache-control"]}`);
  const meta = await page.evaluate(() => ({
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.content,
    robots: document.querySelector('meta[name="robots"]')?.content,
    canonical: document.querySelector('link[rel="canonical"]')?.href,
    og: Object.fromEntries([...document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]')].map((m) => [m.getAttribute("property") || m.name, m.content])),
    icon: [...document.querySelectorAll('link[rel*="icon"]')].map((l) => l.href),
    manifest: document.querySelector('link[rel="manifest"]')?.href,
    jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent.slice(0, 200)),
    lang: document.documentElement.lang,
    themeColor: document.querySelector('meta[name="theme-color"]')?.content,
  }));
  anotar(JSON.stringify(meta, null, 1));
  for (const arq of ["robots.txt", "sitemap.xml", "favicon.ico", "assets/logo.png", "assets/car/ATTRIBUTION.txt", "gestao", "rota-que-nao-existe"]) {
    const r = await page.goto(BASE + arq, { waitUntil: "domcontentloaded" }).catch((e) => null);
    anotar(`${arq}: ${r ? r.status() + " " + (r.headers()["content-type"] || "") : "falhou"}`);
  }
});

await teste("teclado: pular para o catálogo e foco visível", async ({ page, verificar, anotar }) => {
  await abrir(page);
  await page.keyboard.press("Tab");
  const primeiro = await page.evaluate(() => document.activeElement?.textContent?.trim());
  anotar(`primeiro Tab: ${primeiro}`);
  verificar(/Pular/.test(primeiro || ""), "primeiro Tab não é o link de pular");
  await page.keyboard.press("Enter");
  await sleep(1200);
  const topo = await page.evaluate(() => Math.round(document.getElementById("catalogo").getBoundingClientRect().top));
  verificar(Math.abs(topo) < 150, `pular não levou ao catálogo (${topo})`);
  const semRotulo = await page.$$eval("button, a[href]", (els) => els.filter((e) => e.offsetParent && !(e.textContent.trim() || e.getAttribute("aria-label") || e.querySelector("img[alt]:not([alt=''])"))).map((e) => e.outerHTML.slice(0, 100)).slice(0, 8));
  anotar(`botões/links sem nome: ${semRotulo.length}`);
  verificar(semRotulo.length === 0, `sem nome acessível: ${semRotulo.join(" | ")}`);
});

await browser.close();
fs.writeFileSync(path.join(OUT, "resultado.json"), JSON.stringify(resultados, null, 2));
const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length}/${resultados.length} testes OK. Saída: ${OUT}`);
if (falhas.length) process.exitCode = 1;
