// Verificação na tela da busca por placa, contra o preview LOCAL (vite preview/dev), que responde o stub simulado
// de server/placa.ts. Não serve para produção (lá a consulta é paga). Não envia pedido nem abre WhatsApp.
// Uso: npm run build && npx vite preview --port 5315 --strictPort   e depois
//      node scripts/e2e/placa.mjs http://127.0.0.1:5315/ [pasta-dos-prints]
// Placas do stub: NAO.... não encontrada, FOR.... fora do catálogo, LIM.... 429, ERR.... indisponível; as outras
// viram um carro do catálogo (NLA2B34 = Renault Sandero com alternativa Stepway, ABC1D23 = Ford Ka).
// Cada cenário espera virar o minuto: o limite local é o mesmo de produção (5 consultas por minuto por IP).
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const BASE = (process.argv[2] || "http://127.0.0.1:5315/").replace(/\/?$/, "/");
const OUT = process.argv[3] || "outputs/shots-placa";
fs.mkdirSync(OUT, { recursive: true });
// Só na máquina local: em produção cada consulta é paga.
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(BASE).hostname)) throw new Error("Rode só contra o preview local (127.0.0.1/localhost): em produção a consulta é paga.");
const CHROME = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => fs.existsSync(p));
if (!CHROME) throw new Error("Chrome/Edge não encontrado: defina CHROME_PATH.");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PLACAS = ["NLA2B34", "ABC1D23", "FOR1A23", "NAO1234", "LIM1234", "ERR1234", "ABC1234", "GUA1R23"];
const resultados = [];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars", "--no-first-run", "--lang=pt-BR"], defaultViewport: null });

async function pagina(largura, altura, celular) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: largura, height: altura, isMobile: celular, hasTouch: celular, deviceScaleFactor: 1 });
  if (celular) await page.setUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36");
  const log = { urls: [], corpos: [], console: [], abertos: [] };
  page.on("request", (r) => { log.urls.push(r.url()); if (r.method() === "POST") log.corpos.push(`${r.url()} ${r.postData() || ""}`); });
  page.on("console", (m) => { if (m.type() === "error") log.console.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => log.console.push(`pageerror: ${e.message}`.slice(0, 200)));
  await page.exposeFunction("__aberto", (u) => log.abertos.push(u));
  await page.evaluateOnNewDocument(() => { window.open = (u) => { window.__aberto(String(u)); return null; }; });
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => /\d+ peças?/.test(document.querySelector(".nl-catalog-tools .subtle")?.textContent || ""), { timeout: 60000 });
  return { page, ctx, log };
}
const texto = (page, sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, " ").trim()).catch(() => "");
async function digitar(page, raiz, placa) {
  const campo = `${raiz} .nl-placa-campo input`;
  await page.$eval(campo, (el) => { el.focus(); el.select(); });
  await page.keyboard.press("Backspace");
  await page.type(campo, placa.toLowerCase(), { delay: 15 });
}
async function consultar(page, raiz, placa) {
  await digitar(page, raiz, placa);
  await page.click(`${raiz} .nl-placa-linha button[type=submit]`);
  await page.waitForFunction((r) => { const t = document.querySelector(`${r} .nl-placa-resultado`)?.textContent || ""; return t && !/Consultando/.test(t); }, { timeout: 10000 }, raiz);
  await sleep(150);
  return texto(page, `${raiz} .nl-placa-resultado`);
}
async function rolarAte(page, sel) {
  await page.evaluate((s) => { const el = document.querySelector(s); const y = el.getBoundingClientRect().top + window.scrollY - 90; window.scrollTo(0, y); }, sel);
  await sleep(400);
}
const shot = (page, nome) => page.screenshot({ path: path.join(OUT, `${nome}.png`) });
const shotEl = async (page, sel, nome) => { const el = await page.$(sel); await el.screenshot({ path: path.join(OUT, `${nome}.png`) }); };

async function cenario(nome, largura, altura, celular, fn) {
  const { page, ctx, log } = await pagina(largura, altura, celular);
  // O limite local é o mesmo de produção (5 consultas por minuto por IP): cada cenário começa num minuto novo.
  await sleep(60_000 - (Date.now() % 60_000) + 300);
  const r = { nome, ok: true, notas: [], erros: [] };
  const conferir = (c, m) => { if (!c) { r.ok = false; r.erros.push(m); } };
  try { await fn({ page, log, conferir, anotar: (m) => r.notas.push(m) }); }
  catch (e) { r.ok = false; r.erros.push(`exceção: ${e.message.split("\n")[0]}`); await shot(page, `falha-${nome}`).catch(() => {}); }
  // Privacidade: placa só no corpo dos POST para /api/public/placa, nunca numa URL, nunca no localStorage.
  const urlsComPlaca = log.urls.filter((u) => PLACAS.some((p) => u.toUpperCase().includes(p)));
  conferir(!urlsComPlaca.length, `placa em URL: ${urlsComPlaca.join(", ")}`);
  const outrosPosts = log.corpos.filter((c) => !c.includes("/api/public/placa") && PLACAS.some((p) => c.toUpperCase().includes(p)));
  conferir(!outrosPosts.length, `placa em outro POST: ${outrosPosts.join(", ")}`);
  const armazenado = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + location.href).catch(() => "");
  conferir(!PLACAS.some((p) => armazenado.toUpperCase().includes(p) || armazenado.toUpperCase().includes(`${p.slice(0, 3)}-${p.slice(3)}`)), "placa no armazenamento ou na URL da página");
  conferir(!log.abertos.some((u) => PLACAS.some((p) => decodeURIComponent(u).toUpperCase().includes(p))), "placa em link aberto");
  const inesperados = log.console.filter((m) => !/status of (429|503)/.test(m));
  conferir(!inesperados.length, `erros no console: ${inesperados.join(" | ")}`);
  const larguraDoc = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  conferir(larguraDoc <= 1, `rolagem lateral de ${larguraDoc}px`);
  resultados.push(r);
  console.log(`${r.ok ? "OK   " : "FALHA"} ${nome}${r.notas.length ? "\n      · " + r.notas.join("\n      · ") : ""}${r.erros.length ? "\n      - " + r.erros.join("\n      - ") : ""}`);
  await ctx.close();
}

for (const [sufixo, largura, altura, celular] of [["1366", 1366, 900, false], ["390", 390, 844, true]]) {
  await cenario(`barra-${sufixo}`, largura, altura, celular, async ({ page, conferir, anotar }) => {
    await page.waitForSelector(".nl-carro-placa", { timeout: 10000 });
    await rolarAte(page, ".nl-carro-barra");
    await shot(page, `01-barra-botao-${sufixo}`);
    await page.click(".nl-carro-placa");
    await page.waitForSelector(".nl-carro-barra .nl-placa-campo input");
    const foco = await page.evaluate(() => document.activeElement?.closest(".nl-placa-campo") !== null);
    conferir(foco, "campo da placa sem foco ao abrir pela barra");
    const desabilitado = await page.$eval(".nl-carro-barra .nl-placa-linha button", (b) => b.disabled);
    conferir(desabilitado, "botão Buscar habilitado com campo vazio");
    await digitar(page, ".nl-carro-barra", "abc123");
    const mascara = await page.$eval(".nl-carro-barra .nl-placa-campo input", (i) => i.value);
    conferir(mascara === "ABC-123", `máscara parcial: ${mascara}`);
    conferir(await page.$eval(".nl-carro-barra .nl-placa-linha button", (b) => b.disabled), "Buscar habilitado com placa incompleta");
    await page.type(".nl-carro-barra .nl-placa-campo input", "4");
    conferir((await page.$eval(".nl-carro-barra .nl-placa-campo input", (i) => i.value)) === "ABC-1234", "máscara antiga ABC-1234");
    conferir(!(await page.$eval(".nl-carro-barra .nl-placa-linha button", (b) => b.disabled)), "Buscar desabilitado com placa válida");
    const achou = await consultar(page, ".nl-carro-barra", "NLA2B34");
    anotar(achou);
    conferir(/Encontramos: Renault Sandero 2014 · Flex\. É o seu carro\?/.test(achou), "texto de 'Encontramos' da barra");
    conferir(/simulação/i.test(achou), "selo Simulação ausente");
    conferir(/Stepway/.test(achou), "alternativa Stepway ausente");
    await rolarAte(page, ".nl-carro-barra");
    await shot(page, `02-barra-encontrou-${sufixo}`);
    await page.click(".nl-carro-barra .nl-placa-usar");
    await sleep(900);
    const selects = await page.evaluate(() => ["Montadora", "Modelo", "Ano"].map((a) => { const s = document.querySelector(`select[aria-label="${a}"]`); return s.options[s.selectedIndex]?.textContent; }));
    anotar(`barra depois: ${selects.join(" / ")}`);
    conferir(selects[0] === "Renault" && selects[1] === "Sandero" && selects[2] === "2014", `selects: ${selects.join("/")}`);
    const salvo = await page.evaluate(() => localStorage.getItem("nl-garagem-v1"));
    anotar(`localStorage nl-garagem-v1 = ${salvo}`);
    conferir(salvo === JSON.stringify({ montadora: "Renault", modelo: "Sandero", ano: 2014 }), "garagem com campos a mais");
    conferir(!(await page.$(".nl-carro-barra .nl-placa")), "painel da placa continuou aberto");
    await rolarAte(page, ".nl-carro-barra");
    await shot(page, `03-barra-carro-aplicado-${sufixo}`);
    // Estados de erro/fora do catálogo, pela barra.
    await page.click(".nl-carro-placa");
    await page.waitForSelector(".nl-carro-barra .nl-placa-campo input");
    for (const [placa, esperado, arquivo] of [
      ["FOR1A23", /Identificamos um Byd Dolphin GS 2024, mas ainda não temos peças cadastradas para ele no site\. Fale com a loja pelo WhatsApp\./, "04-fora-do-catalogo"],
      ["NAO1234", /Não encontramos essa placa\. Escolha a montadora, o modelo e o ano nos campos acima\./, "05-nao-encontrada"],
      ["LIM1234", /Muitas consultas em pouco tempo\. Aguarde um minuto ou escolha o carro manualmente\./, "06-limite"],
      ["ERR1234", /A busca por placa está indisponível agora\. Escolha o carro manualmente\./, "07-indisponivel"],
    ]) {
      const t = await consultar(page, ".nl-carro-barra", placa);
      conferir(esperado.test(t), `${placa}: ${t}`);
      if (placa.startsWith("FOR")) {
        const whats = await page.$eval(".nl-carro-barra .nl-placa-whats", (a) => a.href);
        anotar(`WhatsApp (fora do catálogo): ${decodeURIComponent(whats)}`);
        conferir(whats.includes("wa.me/551124528939") && !/FOR1A23|FOR-1A23/i.test(decodeURIComponent(whats)), "link do WhatsApp com placa ou número errado");
      }
      await rolarAte(page, ".nl-carro-barra");
      if (sufixo === "390" || arquivo === "04-fora-do-catalogo") await shotEl(page, ".nl-carro-barra", `${arquivo}-${sufixo}`);
    }
    const link = await page.evaluate(() => { const a = document.querySelector(".nl-carro-barra .nl-placa-whats"); return a ? a.href : ""; });
    conferir(!link, "link do WhatsApp continuou depois de outra consulta");
  });

  await cenario(`seletor-${sufixo}`, largura, altura, celular, async ({ page, conferir, anotar }) => {
    if (celular) {
      await page.evaluate(() => window.scrollTo(0, 0));
      const menu = await page.$("[aria-label='Abrir menu'], .nl-menu-botao, .nl-header-menu, button[aria-label*='enu']");
      if (menu) { await menu.click(); await sleep(500); }
      const abriu = await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((e) => /Escolher meu carro|Meu carro/.test(e.textContent || "") && e.offsetParent !== null); if (b) b.click(); return !!b; });
      if (!abriu) await page.click(".nl-header-carro");
    } else await page.click(".nl-header-carro");
    await page.waitForSelector(".nl-seletor .nl-placa", { timeout: 8000 });
    await sleep(300);
    const divisor = await texto(page, ".nl-seletor .nl-placa-divisor");
    conferir(/ou escolha a montadora/i.test(divisor), "divisor ausente");
    const dica = await texto(page, ".nl-seletor .nl-placa-dica");
    conferir(dica === "Usamos a placa só para identificar o modelo; ela não fica salva.", `dica: ${dica}`);
    await shot(page, `08-seletor-placa-${sufixo}`);
    const achou = await consultar(page, ".nl-seletor", "ABC1D23");
    anotar(achou);
    conferir(/Encontramos: Ford Ka 2015 · Flex\. É o seu carro\?/.test(achou), "texto 'Encontramos' do seletor");
    await shot(page, `09-seletor-encontrou-${sufixo}`);
    await page.click(".nl-seletor .nl-placa-nao");
    await sleep(200);
    const manual = await texto(page, ".nl-seletor .nl-placa-resultado");
    conferir(/Escolha a montadora, o modelo e o ano abaixo\./.test(manual), `não é o meu: ${manual}`);
    conferir((await page.$eval(".nl-seletor .nl-placa-campo input", (i) => i.value)) === "", "placa não foi apagada em 'Não é o meu carro'");
    await consultar(page, ".nl-seletor", "ABC1D23");
    await page.click(".nl-seletor .nl-placa-usar");
    // O diálogo fecha com animação (lenta no Chrome sem GPU) e a página rola até o catálogo depois.
    const fechou = await page.waitForFunction(() => !document.querySelector(".nl-seletor"), { timeout: 10000 }).then(() => true, () => false);
    conferir(fechou, "seletor continuou aberto");
    await sleep(1500);
    const topo = await page.evaluate(() => Math.round(document.getElementById("catalogo").getBoundingClientRect().top));
    anotar(`catálogo a ${topo}px do topo`);
    conferir(topo < 300 && topo > -200, "não rolou até o catálogo");
    const rotulo = await texto(page, ".nl-carro-barra-rotulo");
    anotar(`barra: ${rotulo}`);
    conferir(/Ford Ka 2015/.test(rotulo), "carro não aplicado na barra");
    const pedido = await page.evaluate(() => [...document.querySelectorAll("input")].map((i) => i.value).join(" | "));
    conferir(!/ABC1D23|ABC-1D23/i.test(pedido), "placa em algum campo da página");
    await shot(page, `10-seletor-aplicado-${sufixo}`);
  });
}

await browser.close();
fs.writeFileSync(path.join(OUT, "resultado.json"), JSON.stringify(resultados, null, 2));
const falhas = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - falhas}/${resultados.length} cenários OK`);
process.exit(falhas ? 1 : 0);
