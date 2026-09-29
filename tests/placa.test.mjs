// Busca por placa: formato, tradução ERP -> catálogo do site, servidor (stub, validação da resposta do ERP,
// repasse de erros, status) e privacidade (placa fora de log e do localStorage).
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { build } from "esbuild";
import { chaveModelo as chaveConstruir, nomeModelo } from "../scripts/catalogo/construir.mjs";
import { PLACA_RE, chaveModelo, limparPlaca, mascararPlaca, normalizarPlaca, resolverDoErp, carrosDaPlaca, descreverVeiculo, rotuloCombustivel } from "../lib/placa-site.ts";

const meta = JSON.parse(readFileSync(new URL("../public/catalogo/meta.json", import.meta.url), "utf8"));
const catalogo = { meta };
const EXPORTACAO_ERP = "C:/dev/novaleoes-site-estoque/outputs/catalogo-erp.json";

// server/placa.ts, api/commerce.ts e lib/garagem.ts usam imports sem extensão/.js: empacota como nos outros testes.
async function empacotar(entrada, saida) {
  await build({ entryPoints: [entrada], outfile: saida, bundle: true, platform: "node", format: "esm", packages: "external", target: "node22", logLevel: "silent" });
  return import(new URL(`../${saida}`, import.meta.url).href);
}
const placa = await empacotar("server/placa.ts", "outputs/test-placa-server.mjs");
const commerce = await empacotar("api/commerce.ts", "outputs/test-placa-commerce.mjs");
const garagem = await empacotar("lib/garagem.ts", "outputs/test-placa-garagem.mjs");

const ORIGEM = "https://nova-leoes.example";
const SAL = "sal-de-teste-".repeat(4);
const TOKEN = "a1".repeat(32);
const CHAVES_ENV = ["VERCEL_ENV", "COMMERCE_ERP_TOKEN", "COMMERCE_ERP_ORIGIN", "RATE_LIMIT_SALT"];
const envOriginal = new Map(CHAVES_ENV.map((k) => [k, process.env[k]]));
const livre = { async limit() { return { success: true }; } };
// Todo aviso do servidor fica aqui (e fora da saída do teste); o último teste confere que nenhum tem placa.
const avisos = [];
const warnOriginal = console.warn;
console.warn = (...a) => avisos.push(a.map(String).join(" "));

function pedido(corpo, { origin = ORIGEM, ip = "203.0.113.7", tipo = "application/json" } = {}) {
  const headers = { "content-type": tipo, "cf-connecting-ip": ip };
  if (origin) headers.origin = origin;
  return new Request(`${ORIGEM}/api/public/placa`, { method: "POST", headers, body: typeof corpo === "string" ? corpo : JSON.stringify(corpo) });
}
function producao(extra = {}) {
  Object.assign(process.env, { VERCEL_ENV: "production", COMMERCE_ERP_TOKEN: TOKEN, COMMERCE_ERP_ORIGIN: "https://api.octopool.com.br", RATE_LIMIT_SALT: SAL, ...extra });
}
// ERP de mentira: guarda as chamadas e responde o que o teste mandar.
function erpFalso(responder) {
  const chamadas = [];
  const transport = async (url, init = {}) => { chamadas.push({ url: String(url), init }); return responder(String(url), init); };
  return { chamadas, transport };
}
const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
const ERP_GOL = {
  encontrado: true, simulado: false,
  veiculo: { marca: "VW", modelo: "GOL 1.0", ano: 2012, anoFabricacao: 2011, combustivel: "FLEX", cilindrada: "999",
    // Campos de registro que nunca podem chegar ao navegador:
    placa: "ABC1D23", municipio: "GUARULHOS", uf: "SP", situacao: "SEM RESTRICAO", chassi: "9BWZZZ377VT004251", motor: "CCP123456", cor: "PRATA" },
  catalogo: { identificado: true, montadora: "Volkswagen", modelo: "GOL", motorSugerido: "1.0", alternativas: [{ montadora: "Volkswagen", modelo: "GOLF", extra: 1 }], interno: "x" },
  empresaId: "cmr9m6jgi001lx34fzpaeyrzn",
};

beforeEach(() => {
  for (const k of CHAVES_ENV) delete process.env[k];
  placa.reiniciarStatusPlaca();
});
after(() => {
  console.warn = warnOriginal;
  for (const [k, v] of envOriginal) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});

test("placa: normaliza antiga e Mercosul, recusa o resto; máscara ABC-1234 / ABC1D23", () => {
  assert.equal(normalizarPlaca("abc-1234"), "ABC1234");
  assert.equal(normalizarPlaca(" abc 1d23 "), "ABC1D23");
  assert.equal(normalizarPlaca("ABC.1D23"), "ABC1D23");
  for (const ruim of ["ABC1D234", "AB1234", "ABCD123", "ABC12345", "1BC1234", "ABCA234", "ABC1DD3", "", "ABC1D2", null, 1234567, "ÁBC1234"]) assert.equal(normalizarPlaca(ruim), null, String(ruim));
  assert.equal(limparPlaca("abc-1d2345"), "ABC1D23");
  assert.equal(mascararPlaca("abc1234"), "ABC-1234");
  assert.equal(mascararPlaca("ABC-12"), "ABC-12");
  assert.equal(mascararPlaca("abc1d23"), "ABC1D23");
  assert.equal(mascararPlaca("ABC1"), "ABC1");
  assert.ok(PLACA_RE.test("ABC1234") && PLACA_RE.test("ABC1D23"));
});

test("chaveModelo do site é a mesma de scripts/catalogo/construir.mjs", () => {
  const amostra = ["S-10", "S10", "T-CROSS", "TCROSS", "up!", "UP", "Del Rey", "DELREY", "HR-V", "Citroën C4", "GOL G5", "1.0 16V", "  corsa  classic ", "", null, undefined, "Ônix", "Mégane", "320i", "C4 PICASSO"];
  for (const m of meta.modelos) amostra.push(m[1], m[1].toUpperCase());
  for (const m of meta.montadoras) amostra.push(m);
  for (const t of amostra) assert.equal(chaveModelo(t), chaveConstruir(t), JSON.stringify(t));
  // O meta guarda nomeModelo(mo); a chave do nome exibido é a mesma do texto cru do ERP.
  for (const cru of ["SANTAFE", "VERACRUZ", "UP", "T-CROSS", "CLASSEA", "118I", "GRAND LIVINA"]) assert.equal(chaveModelo(nomeModelo(cru)), chaveModelo(cru), cru);
});

test("resolverDoErp: todo modelo do meta volta para ele mesmo; Citroën acha Citroen; desconhecido = null", () => {
  meta.modelos.forEach(([m, nome], idx) => {
    const r = resolverDoErp(catalogo, { montadora: meta.montadoras[m], modelo: nome.toUpperCase() });
    assert.deepEqual(r, { montadora: m, modelo: idx }, `${meta.montadoras[m]} ${nome}`);
  });
  const citroen = meta.montadoras.indexOf("Citroen");
  assert.ok(citroen >= 0);
  const c3 = resolverDoErp(catalogo, { montadora: "Citroën", modelo: meta.modelos.find((m) => m[0] === citroen)[1] });
  assert.equal(c3?.montadora, citroen);
  assert.equal(resolverDoErp(catalogo, { montadora: "BYD", modelo: "DOLPHIN" }), null);
  assert.equal(resolverDoErp(catalogo, { montadora: "Volkswagen", modelo: "" }), null);
  assert.equal(resolverDoErp(catalogo, { montadora: "", modelo: "GOL" }), null);
  assert.equal(resolverDoErp(catalogo, { montadora: "Fiat", modelo: "GOL" }), null);
});

test("resolverDoErp: todos os pares montadora/modelo da exportação do ERP resolvem no meta.json do site", { skip: !existsSync(EXPORTACAO_ERP) && "exportação do ERP ausente nesta máquina" }, () => {
  const exp = JSON.parse(readFileSync(EXPORTACAO_ERP, "utf8"));
  const pares = new Map();
  for (const a of exp.apl || []) {
    const montadora = String(a.m || "").trim(), modelo = String(a.mo || "").trim();
    if (montadora && modelo) pares.set(`${montadora}|${modelo}`, { montadora, modelo });
  }
  assert.ok(pares.size > 200, `só ${pares.size} pares`);
  const falhas = [...pares.values()].filter((p) => !resolverDoErp(catalogo, p)).map((p) => `${p.montadora}/${p.modelo}`);
  assert.deepEqual(falhas, []);
});

test("carrosDaPlaca: principal + até 3 alternativas distintas com peças; sem casamento = fora do catálogo", () => {
  const base = { encontrado: true, simulado: false, veiculo: { marca: "RENAULT", modelo: "SANDERO STEPWAY", ano: 2014, anoFabricacao: 2014, combustivel: "FLEX", cilindrada: "1598" } };
  const r = carrosDaPlaca(catalogo, { ...base, catalogo: { identificado: true, montadora: "Renault", modelo: "SANDERO", motorSugerido: "", alternativas: [{ montadora: "Renault", modelo: "STEPWAY" }, { montadora: "Renault", modelo: "SANDERO" }, { montadora: "BYD", modelo: "X" }] } });
  assert.equal(meta.modelos[r.principal.modelo][1], "Sandero");
  assert.deepEqual(r.alternativas.map((a) => meta.modelos[a.modelo][1]), ["Stepway"]);
  const fora = carrosDaPlaca(catalogo, { ...base, catalogo: { identificado: false, montadora: "", modelo: "", motorSugerido: "", alternativas: [] } });
  assert.deepEqual(fora, { principal: null, alternativas: [] });
  const soAlternativa = carrosDaPlaca(catalogo, { ...base, catalogo: { identificado: false, montadora: "", modelo: "", motorSugerido: "", alternativas: [{ montadora: "Renault", modelo: "STEPWAY" }] } });
  assert.equal(meta.modelos[soAlternativa.principal.modelo][1], "Stepway");
  assert.deepEqual(carrosDaPlaca(catalogo, { encontrado: false }), { principal: null, alternativas: [] });
  assert.equal(descreverVeiculo({ marca: "FIAT", modelo: "CRONOS DRIVE 1.3", ano: 2021 }), "Fiat Cronos Drive 1.3 2021");
  assert.equal(rotuloCombustivel("ALCOOL/GASOLINA"), "Flex");
  assert.equal(rotuloCombustivel("GASOLINA"), "Gasolina");
  assert.equal(rotuloCombustivel(null), "");
});

test("stub fora de produção: determinístico, simulado, só campos públicos, e todo carro existe no catálogo", async () => {
  const a = await (await placa.consultarPlaca(pedido({ placa: "ABC1D23" }), { limiter: livre })).json();
  const b = await (await placa.consultarPlaca(pedido({ placa: "abc-1d23" }), { limiter: livre })).json();
  assert.deepEqual(a, b);
  assert.equal(a.simulado, true);
  assert.deepEqual(Object.keys(a).sort(), ["catalogo", "encontrado", "simulado", "veiculo"]);
  assert.deepEqual(Object.keys(a.veiculo).sort(), ["ano", "anoFabricacao", "cilindrada", "combustivel", "marca", "modelo"]);
  const vistos = new Set();
  for (let i = 0; i < 60; i++) {
    const p = `QWE${i % 10}${String.fromCharCode(65 + (i % 26))}${String(i).padStart(2, "0")}`;
    const r = placa.respostaStub(p);
    assert.equal(typeof r, "object", p);
    assert.ok(placa.respostaErpSchema.safeParse(r).success, p);
    const { principal } = carrosDaPlaca(catalogo, r);
    assert.ok(principal, `stub fora do catálogo: ${r.catalogo.montadora} ${r.catalogo.modelo}`);
    vistos.add(r.catalogo.modelo);
  }
  assert.ok(vistos.size >= 4, "o stub varia o carro pela placa");
  assert.deepEqual(await (await placa.consultarPlaca(pedido({ placa: "NAO1234" }), { limiter: livre })).json(), { encontrado: false, simulado: true });
  const fora = await (await placa.consultarPlaca(pedido({ placa: "FOR1A23" }), { limiter: livre })).json();
  assert.equal(fora.catalogo.identificado, false);
  assert.equal(carrosDaPlaca(catalogo, fora).principal, null);
  assert.equal((await placa.consultarPlaca(pedido({ placa: "LIM1234" }), { limiter: livre })).status, 429);
  assert.equal((await placa.consultarPlaca(pedido({ placa: "ERR1234" }), { limiter: livre })).status, 503);
  assert.deepEqual(await (await placa.statusPlaca()).json(), { ativa: true });
});

test("entrada: placa inválida 400, campo extra 400, sem JSON/Origin recusado, limite por IP 429 sem chamar o ERP", async () => {
  const invalida = await placa.consultarPlaca(pedido({ placa: "ABC12345" }), { limiter: livre });
  assert.equal(invalida.status, 400);
  assert.equal((await invalida.json()).code, "PLACA_INVALIDA");
  assert.equal((await placa.consultarPlaca(pedido({ placa: "ABC1D23" }, { ip: "1.2.3.4" }), { limiter: livre })).status, 200);
  assert.equal((await placa.consultarPlaca(pedido({ placa: "ABC1D23", outra: 1 }), { limiter: livre })).status, 400);
  assert.equal((await placa.consultarPlaca(pedido({ placa: 1234567 }), { limiter: livre })).status, 400);
  await assert.rejects(placa.consultarPlaca(pedido({ placa: "ABC1D23" }, { origin: "" }), { limiter: livre }), { status: 403 });
  await assert.rejects(placa.consultarPlaca(pedido({ placa: "ABC1D23" }, { origin: "https://outro.example" }), { limiter: livre }), { status: 403 });
  await assert.rejects(placa.consultarPlaca(pedido("placa=ABC1D23", { tipo: "application/x-www-form-urlencoded" }), { limiter: livre }), { status: 415 });
  await assert.rejects(placa.consultarPlaca(pedido(JSON.stringify({ placa: "A".repeat(30000) })), { limiter: livre }), { status: 413 });

  producao();
  const erp = erpFalso(() => json(ERP_GOL));
  const chaves = [];
  const cheio = { async limit({ key }) { chaves.push(key); return { success: false }; } };
  const r = await placa.consultarPlaca(pedido({ placa: "ABC1D23" }, { ip: "198.51.100.9" }), { limiter: cheio, transport: erp.transport });
  assert.equal(r.status, 429);
  assert.equal((await r.json()).code, "RATE_LIMIT");
  assert.deepEqual(chaves, ["198.51.100.9"]);
  assert.equal(erp.chamadas.length, 0);
  // Produção sem limitador não faz consulta paga.
  assert.equal((await placa.consultarPlaca(pedido({ placa: "ABC1D23" }), { transport: erp.transport })).status, 503);
  assert.equal(erp.chamadas.length, 0);
});

test("produção: chama o ERP só no host certo, sem seguir redirect, placa só no corpo; resposta por lista fixa", async () => {
  producao();
  const antes = avisos.length;
  {
    const erp = erpFalso(() => json(ERP_GOL));
    const r = await placa.consultarPlaca(pedido({ placa: "abc1d23" }, { ip: "203.0.113.7" }), { limiter: livre, transport: erp.transport });
    assert.equal(r.status, 200);
    const corpo = await r.json();
    assert.deepEqual(corpo, {
      encontrado: true, simulado: false,
      veiculo: { marca: "VW", modelo: "GOL 1.0", ano: 2012, anoFabricacao: 2011, combustivel: "FLEX", cilindrada: "999" },
      catalogo: { identificado: true, montadora: "Volkswagen", modelo: "GOL", motorSugerido: "1.0", alternativas: [{ montadora: "Volkswagen", modelo: "GOLF" }] },
    });
    const texto = JSON.stringify(corpo);
    for (const proibido of ["municipio", "GUARULHOS", "situacao", "chassi", "9BWZZZ", "CCP123456", "\"motor\"", "placa", "ABC1D23", "empresaId", "interno", "PRATA"]) assert.ok(!texto.includes(proibido), proibido);

    assert.equal(erp.chamadas.length, 1);
    const [{ url, init }] = erp.chamadas;
    assert.equal(url, "https://api.octopool.com.br/api/commerce-stock/placa");
    assert.equal(init.method, "POST");
    assert.equal(init.redirect, "manual");
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(init.headers["Content-Type"], "application/json");
    assert.equal(init.headers["X-Octopool-Cliente"], createHash("sha256").update(`${SAL}:203.0.113.7`).digest("hex").slice(0, 32));
    assert.ok(!Object.keys(init.headers).some((h) => h.toLowerCase() === "origin"));
    assert.deepEqual(JSON.parse(init.body), { placa: "ABC1D23" });
    assert.ok(!url.includes("ABC1D23"));

    // Erro do ERP também não loga a placa.
    const falha = erpFalso(() => json({ code: "INDISPONIVEL", error: "x" }, 503));
    await placa.consultarPlaca(pedido({ placa: "ABC1D23" }), { limiter: livre, transport: falha.transport });
    const quebrou = erpFalso(() => { throw new Error("connect ECONNREFUSED ABC1D23"); });
    await placa.consultarPlaca(pedido({ placa: "ABC1D23" }), { limiter: livre, transport: quebrou.transport });
  }
  assert.ok(avisos.length >= antes + 2);
});

test("produção: configuração errada não chama o ERP", async () => {
  const erp = erpFalso(() => json(ERP_GOL));
  for (const extra of [
    { COMMERCE_ERP_ORIGIN: "https://evil.example" }, { COMMERCE_ERP_ORIGIN: "http://api.octopool.com.br" },
    { COMMERCE_ERP_ORIGIN: "https://api.octopool.com.br/outra" }, { COMMERCE_ERP_ORIGIN: "https://api.octopool.com.br:8443" },
    { COMMERCE_ERP_ORIGIN: "https://user@api.octopool.com.br" }, { COMMERCE_ERP_TOKEN: "curto" }, { COMMERCE_ERP_TOKEN: "A1".repeat(32) },
    { COMMERCE_ERP_TOKEN: "" }, { RATE_LIMIT_SALT: "curto" },
  ]) {
    for (const k of CHAVES_ENV) delete process.env[k];
    placa.reiniciarStatusPlaca();
    producao(extra);
    const r = await placa.consultarPlaca(pedido({ placa: "ABC1D23" }), { limiter: livre, transport: erp.transport });
    assert.equal(r.status, 503, JSON.stringify(extra));
    if (!extra.RATE_LIMIT_SALT) assert.equal(await placa.placaAtiva({ transport: erp.transport }), false, JSON.stringify(extra));
  }
  assert.equal(erp.chamadas.length, 0);
});

test("produção: 400 e 429 do ERP repassam; o resto (401, 403, 404, 503, redirect, resposta inválida) vira 503", async () => {
  producao();
  const casos = [
    [json({ code: "PLACA_INVALIDA", error: "Placa inválida." }, 400), 400, "PLACA_INVALIDA"],
    [json({ code: "RATE_LIMIT", error: "Muitas consultas." }, 429), 429, "RATE_LIMIT"],
    [json({ code: "TETO_DIARIO", error: "Indisponível." }, 503), 503, "INDISPONIVEL"],
    [json({ code: "INDISPONIVEL", error: "Indisponível." }, 503), 503, "INDISPONIVEL"],
    [json({ code: "SERVER_ONLY", error: "x" }, 403), 503, "INDISPONIVEL"],
    [json({ error: "x" }, 500), 503, "INDISPONIVEL"],
    [new Response(null, { status: 302, headers: { location: "https://evil.example/" } }), 503, "INDISPONIVEL"],
    [new Response("<html>", { status: 200 }), 503, "INDISPONIVEL"],
    [json({ ...ERP_GOL, veiculo: { ...ERP_GOL.veiculo, ano: "2012" } }), 503, "INDISPONIVEL"],
    [json({ encontrado: true }), 503, "INDISPONIVEL"],
    [json({ ...ERP_GOL, veiculo: { ...ERP_GOL.veiculo, modelo: "X".repeat(200) } }), 503, "INDISPONIVEL"],
    [json({ encontrado: false, veiculo: { municipio: "GUARULHOS" } }), 200, undefined],
  ];
  for (const [resposta, status, code] of casos) {
    placa.reiniciarStatusPlaca();
    const r = await placa.consultarPlaca(pedido({ placa: "ABC1D23" }), { limiter: livre, transport: async () => resposta.clone() });
    assert.equal(r.status, status, `${resposta.status} -> ${r.status}`);
    const corpo = await r.json();
    if (code) { assert.equal(corpo.code, code); assert.equal(typeof corpo.error, "string"); }
    else assert.deepEqual(corpo, { encontrado: false });
  }
  const caiu = await placa.consultarPlaca(pedido({ placa: "ABC1D23" }), { limiter: livre, transport: async () => { throw new TypeError("fetch failed"); } });
  assert.equal(caiu.status, 503);
});

test("produção: DISABLED/401 no POST desliga a busca por 5 min sem nova chamada", async () => {
  producao();
  const erp = erpFalso(() => json({ code: "DISABLED", error: "Indisponível." }, 403));
  assert.equal((await placa.consultarPlaca(pedido({ placa: "ABC1D23" }), { limiter: livre, transport: erp.transport })).status, 503);
  assert.equal(await placa.placaAtiva({ transport: erp.transport }), false);
  assert.equal((await placa.consultarPlaca(pedido({ placa: "ABC1D23" }), { limiter: livre, transport: erp.transport })).status, 503);
  assert.equal(erp.chamadas.length, 1);
});

test("status: fora de produção ativa; em produção pergunta ao ERP uma vez a cada 5 min; 404/403/erro = desligada", async () => {
  assert.equal(await placa.placaAtiva(), true);
  producao();
  const erp = erpFalso(() => json({ ativa: true, outra: "x" }));
  const [a, b] = await Promise.all([placa.placaAtiva({ transport: erp.transport }), placa.placaAtiva({ transport: erp.transport })]);
  assert.equal(a, true); assert.equal(b, true);
  assert.deepEqual(await (await placa.statusPlaca({ transport: erp.transport })).json(), { ativa: true });
  assert.equal(erp.chamadas.length, 1);
  const [{ url, init }] = erp.chamadas;
  assert.equal(url, "https://api.octopool.com.br/api/commerce-stock/placa/status");
  assert.equal(init.method, "GET");
  assert.equal(init.redirect, "manual");
  assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
  for (const resposta of [json({ ativa: false }), json({ code: "DISABLED" }, 403), json({ code: "INVALID_TOKEN" }, 401), json({ error: "x" }, 404), json({ error: "x" }, 503), json({ ativa: "sim" }), new Response(null, { status: 301 })]) {
    placa.reiniciarStatusPlaca();
    assert.equal(await placa.placaAtiva({ transport: async () => resposta.clone() }), false, String(resposta.status));
  }
  placa.reiniciarStatusPlaca();
  assert.equal(await placa.placaAtiva({ transport: async () => { throw new TypeError("fetch failed"); } }), false);
  delete process.env.COMMERCE_ERP_TOKEN;
  placa.reiniciarStatusPlaca();
  assert.equal(await placa.placaAtiva({ transport: erp.transport }), false);
});

test("roteamento da Vercel: /api/public/placa chega ao handler (URL original e reescrita)", () => {
  const direto = commerce.commerceRequest(new Request("https://loja.example/api/public/placa", { method: "POST" }));
  assert.equal(new URL(direto.url).pathname, "/api/public/placa");
  const reescrito = commerce.commerceRequest(new Request("https://loja.example/api/commerce?__commerce_route=public/placa"));
  assert.equal(new URL(reescrito.url).pathname, "/api/public/placa");
  assert.equal(commerce.commerceRequest(new Request("https://loja.example/api/public/placa/ABC1D23")), null);
});

test("garagem: o carro lembrado guarda só montadora, modelo e ano (nunca a placa)", () => {
  const dados = new Map();
  const antigo = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => dados.set(k, String(v)), removeItem: (k) => dados.delete(k) } });
  try {
    garagem.salvarVeiculo({ montadora: "Volkswagen", modelo: "Gol", ano: 2012, placa: "ABC1D23", veiculo: { chassi: "x" } });
    const salvo = dados.get("nl-garagem-v1");
    assert.deepEqual(JSON.parse(salvo), { montadora: "Volkswagen", modelo: "Gol", ano: 2012 });
    assert.ok(!salvo.includes("ABC1D23"));
    assert.deepEqual(garagem.lerVeiculoSalvo(), { montadora: "Volkswagen", modelo: "Gol", ano: 2012 });
    garagem.salvarVeiculo(null);
    assert.equal(dados.has("nl-garagem-v1"), false);
  } finally {
    if (antigo) Object.defineProperty(globalThis, "localStorage", antigo); else delete globalThis.localStorage;
  }
});

test("logs: nenhum aviso do servidor contém placa", () => {
  assert.ok(avisos.length > 5);
  for (const a of avisos) assert.ok(!/[A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}/i.test(a), a);
});

test("placa: combustível que o provedor não sabe não aparece (29/09, visto em produção)", async () => {
  const { buildSync } = await import("esbuild");
  buildSync({ entryPoints: ["lib/placa-site.ts"], bundle: true, platform: "node", format: "esm", outfile: "outputs/test-placa-combustivel.mjs", logLevel: "silent" });
  const { rotuloCombustivel } = await import("../outputs/test-placa-combustivel.mjs");
  assert.equal(rotuloCombustivel("INDETERMINADO"), "");
  assert.equal(rotuloCombustivel("Não informado"), "");
  assert.equal(rotuloCombustivel("ALCOOL/GASOLINA"), "Flex");
  assert.equal(rotuloCombustivel("GASOLINA"), "Gasolina");
});
