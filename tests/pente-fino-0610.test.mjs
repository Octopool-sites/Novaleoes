// Pente fino de 06/10/2026: estoque ao vivo do ERP, busca Gol x Golf e as 7 peças integradas sem código interno.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { build } from "esbuild";
import { idCurto as idCurtoConstruir } from "../scripts/catalogo/construir.mjs";
import { aplicarDisponibilidade, filtrar, montarCatalogo, FILTRO_VAZIO, ESTOQUE_VELHO_MS } from "../lib/catalogo-site.ts";

// Servidor e lib com imports .js/sem extensão: empacota como nos outros testes.
async function empacotar(entrada, saida) {
  await build({ entryPoints: [entrada], outfile: saida, bundle: true, platform: "node", format: "esm", packages: "external", target: "node22", logLevel: "silent" });
  return import(new URL(`../${saida}`, import.meta.url).href);
}
const disp = await empacotar("server/disponibilidade.ts", "outputs/test-0610-disponibilidade.mjs");
const commerce = await empacotar("api/commerce.ts", "outputs/test-0610-commerce.mjs");
const publico = await empacotar("server/produto-publico.ts", "outputs/test-0610-publico.mjs");
const fotos = await empacotar("lib/fotos-integradas.ts", "outputs/test-0610-fotos.mjs");
const pedido = await empacotar("lib/pedido.ts", "outputs/test-0610-pedido.mjs");

const ORIGEM = "https://nova-leoes.example";
const TOKEN = "b2".repeat(32);
const CHAVES_ENV = ["COMMERCE_ERP_TOKEN", "COMMERCE_ERP_ORIGIN"];
const envOriginal = new Map(CHAVES_ENV.map((k) => [k, process.env[k]]));
const avisos = [];
const warnOriginal = console.warn;
console.warn = (...a) => avisos.push(a.join(" "));
after(() => {
  console.warn = warnOriginal;
  for (const [k, v] of envOriginal) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});
function comErp() {
  process.env.COMMERCE_ERP_TOKEN = TOKEN;
  process.env.COMMERCE_ERP_ORIGIN = "https://api.octopool.com.br";
  disp.esquecerDisponibilidade();
}
const pedir = (caminho = "/api/public/disponibilidade", init) => new Request(`${ORIGEM}${caminho}`, init);
const respostaErp = (available, extra = {}) => Response.json({ contract: "octopool.availability.v1", generatedAt: "2026-10-06T23:50:00.000Z", available, ...extra });

test("id curto do servidor é o mesmo do construtor do catálogo", () => {
  for (const id of ["cmr9m6jgi001lx34fzpaeyrzn", "ckprod1", "x", "cm0000000000000000000000z"]) assert.equal(disp.idCurto(id), idCurtoConstruir(id));
});

test("disponibilidade: consulta o ERP com a credencial e devolve só ids curtos, com cache de CDN", async () => {
  comErp();
  const chamadas = [];
  const transport = async (url, init) => { chamadas.push({ url: String(url), init }); return respostaErp(["erp-b", "erp-a", "erp-a"]); };
  const r = await disp.disponibilidade(pedir(), { transport, agora: () => 1_000 });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), disp.CACHE_CDN);
  const corpo = await r.json();
  assert.deepEqual(Object.keys(corpo).sort(), ["geradoEm", "ids"]);
  assert.equal(corpo.geradoEm, "2026-10-06T23:50:00.000Z");
  assert.deepEqual(corpo.ids, [disp.idCurto("erp-a"), disp.idCurto("erp-b")].sort());
  assert.ok(!JSON.stringify(corpo).includes("erp-"), "id do ERP não sai para o navegador");
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].url, "https://api.octopool.com.br/api/commerce-stock/disponibilidade");
  assert.equal(chamadas[0].init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(chamadas[0].init.redirect, "manual");
});

test("disponibilidade: 60 s de memória por instância e consultas simultâneas viram uma só", async () => {
  comErp();
  let n = 0;
  const transport = async () => { n++; await new Promise((ok) => setTimeout(ok, 20)); return respostaErp(["a"]); };
  await Promise.all([1, 2, 3].map(() => disp.disponibilidade(pedir(), { transport, agora: () => 10_000 })));
  assert.equal(n, 1, "três visitas ao mesmo tempo, uma consulta ao ERP");
  await disp.disponibilidade(pedir(), { transport, agora: () => 69_000 });
  assert.equal(n, 1, "dentro de 60 s não consulta de novo");
  await disp.disponibilidade(pedir(), { transport, agora: () => 71_000 });
  assert.equal(n, 2);
});

test("disponibilidade: ERP fora usa a última resposta boa por até 30 min; depois, 503 sem cache", async () => {
  comErp();
  await disp.disponibilidade(pedir(), { transport: async () => respostaErp(["a"]), agora: () => 0 });
  const falha = async () => new Response("{}", { status: 502 });
  const r1 = await disp.disponibilidade(pedir(), { transport: falha, agora: () => 10 * 60_000 });
  assert.equal(r1.status, 200);
  assert.equal(r1.headers.get("cache-control"), "public, max-age=0, s-maxage=60");
  assert.deepEqual((await r1.json()).ids, [disp.idCurto("a")]);
  const r2 = await disp.disponibilidade(pedir(), { transport: falha, agora: () => 31 * 60_000 });
  assert.equal(r2.status, 503);
  assert.equal(r2.headers.get("cache-control"), "no-store");
});

test("disponibilidade: sem credencial, resposta fora do contrato, query string e POST não consultam ou não passam", async () => {
  delete process.env.COMMERCE_ERP_TOKEN;
  disp.esquecerDisponibilidade();
  let n = 0;
  const transport = async () => { n++; return respostaErp(["a"]); };
  assert.equal((await disp.disponibilidade(pedir(), { transport })).status, 503, "prévia/dev sem credencial");
  assert.equal(n, 0);
  comErp();
  assert.equal((await disp.disponibilidade(pedir("/api/public/disponibilidade?x=1"), { transport })).status, 404, "cada URL nova seria uma consulta ao ERP");
  assert.equal((await disp.disponibilidade(pedir("/api/public/disponibilidade", { method: "POST" }), { transport })).status, 405);
  assert.equal(n, 0);
  const fora = await disp.disponibilidade(pedir(), { transport: async () => respostaErp(["a"], { contract: "outro" }) });
  assert.equal(fora.status, 503);
  const credencialRuim = process.env.COMMERCE_ERP_ORIGIN;
  process.env.COMMERCE_ERP_ORIGIN = "https://outro-host.example";
  disp.esquecerDisponibilidade();
  assert.equal((await disp.disponibilidade(pedir(), { transport })).status, 503, "só fala com api.octopool.com.br");
  process.env.COMMERCE_ERP_ORIGIN = credencialRuim;
  assert.ok(avisos.every((a) => !a.includes(TOKEN)), "token nunca vai para o log");
});

test("rota pública: /api/public/disponibilidade passa pelo roteador da Vercel, direto e reescrita", () => {
  assert.ok(commerce.commerceRequest(pedir()));
  assert.ok(commerce.commerceRequest(new Request(`${ORIGEM}/api/commerce?__commerce_route=public/disponibilidade`)));
  const reescrita = commerce.commerceRequest(new Request(`${ORIGEM}/api/commerce?__commerce_route=public/disponibilidade&x=1`));
  assert.equal(new URL(reescrita.url).search, "?x=1", "query extra continua visível para a rota recusar");
});

// ---- catálogo no navegador ----

const dep = (id, nome) => ({ id, nome, resumo: "", n: 1, grupos: [], capa: "" });
function metaBase(exportadoEm = "2026-10-06T16:00:00.000Z") {
  return {
    versao: 1, exportadoEm, geradoEm: "", empresa: "", total: 3, comEstoque: 1, comFoto: 0, fotoBase: "", buckets: 1,
    departamentos: [dep("freios", "Freios")], grupos: [["Pastilha Freio", 0, 3]], marcas: [["Cobreq", 3]],
    montadoras: ["Volkswagen"], modelos: [[0, "Gol", 1], [0, "Golf", 1]], unidades: [""],
  };
}
const linha = (id, disponivel, foto = "", aplic = []) => [id, "Pastilha Freio Dianteiro", 0, 0, 1000, disponivel, foto, aplic, 0, 0, 1];

test("estoque ao vivo substitui o tem / não tem do catálogo e marca de quando é", () => {
  const meta = metaBase();
  const linhas = [linha("aaaa1111", 1), linha("bbbb2222", 0), linha("cccc3333", 0)];
  aplicarDisponibilidade(meta, linhas, { geradoEm: "2026-10-06T23:50:00.000Z", ids: ["bbbb2222", "cccc3333", "fora0000"] });
  assert.deepEqual(linhas.map((l) => l[5]), [0, 1, 1]);
  assert.equal(meta.comEstoque, 2);
  assert.equal(meta.estoqueEm, "2026-10-06T23:50:00.000Z");
  assert.equal(meta.estoqueAoVivo, true);
  assert.equal(meta.estoqueIncerto, false);
  const c = montarCatalogo(meta, linhas);
  assert.deepEqual(filtrar(c, { ...FILTRO_VAZIO, somenteEstoque: true }).map((p) => p.id).sort(), ["bbbb2222", "cccc3333"]);
});

test("sem o ERP: catálogo recente vale; com mais de 30 h o site para de afirmar estoque", () => {
  const agora = Date.parse("2026-10-07T12:00:00.000Z");
  const recente = aplicarDisponibilidade(metaBase("2026-10-07T10:00:00.000Z"), [linha("a", 1)], null, agora);
  assert.equal(recente.estoqueAoVivo, false);
  assert.equal(recente.estoqueIncerto, false);
  const velho = aplicarDisponibilidade(metaBase(new Date(agora - ESTOQUE_VELHO_MS - 1).toISOString()), [linha("a", 1)], null, agora);
  assert.equal(velho.estoqueIncerto, true);
  const c = montarCatalogo(velho, [linha("a", 1)]);
  assert.equal(c.pecas[0].estoqueIncerto, true);
  assert.equal(c.pecas[0].disponivel, 1, "o filtro 'só em estoque' continua usando o último dado");
  assert.equal(pedido.observacaoDoItem({ stock: 1, quantity: 1, minimo: 1, peca: c.pecas[0] }), "Estoque a confirmar com a loja");
  assert.equal(pedido.observacaoDoItem({ stock: 1, quantity: 1, minimo: 1, peca: { estoqueIncerto: false } }), "Em estoque na loja");
  assert.equal(aplicarDisponibilidade(metaBase(null), [], null, agora).estoqueIncerto, true, "sem data não afirma");
});

test("busca 'pastilha gol': Gol vem antes do Golf, e o Golf continua na lista", () => {
  const meta = metaBase();
  // Golf com foto e estoque, Gol sem nenhum dos dois: antes, empatavam e o Golf podia aparecer primeiro.
  const c = montarCatalogo(meta, [linha("golf0001", 1, "site/x.jpg", [[1, 2010, 2014]]), linha("gol00001", 0, "", [[0, 2008, 2014]])]);
  const ids = filtrar(c, { ...FILTRO_VAZIO, q: "pastilha gol" }).map((p) => p.id);
  assert.deepEqual(ids, ["gol00001", "golf0001"]);
  assert.deepEqual(filtrar(c, { ...FILTRO_VAZIO, q: "pastilha golf" }).map((p) => p.id), ["golf0001"]);
});

// ---- peças integradas (piloto de 7 peças no Firestore) ----

test("peça integrada pública: nome e marca limpos, sem sku, só tem / não tem", () => {
  const cru = { id: "filtro-ar", sku: "codigo-interno", name: "FILTRO AR / 4150", brand: "TECFIL F AR", category: "Motor", priceCents: 2200, stock: 7,
    image: "/assets/pecas/filtro-ar.jpg", description: "Confira a aplicação com a equipe antes da aprovação.", published: true };
  const p = publico.produtoPublico(cru);
  assert.equal(p.sku, "");
  assert.equal(p.stock, 1);
  assert.equal(p.name, "Filtro Ar");
  assert.equal(p.brand, "Tecfil");
  assert.equal(p.description, cru.description);
  assert.equal(publico.produtoPublico({ ...cru, stock: 0 }).stock, 0);
  assert.equal(publico.produtoPublico({ ...cru, name: "BOMBA DAGUA / 766", brand: "INDISA BBA DAGUA" }).name, "Bomba d'Água");
  assert.equal(publico.produtoPublico({ ...cru, name: "AMORT TS", brand: "COFAP AMORT" }).name, "Amortecedor Traseiro");
  assert.equal(publico.produtoPublico({ ...cru, name: "CORREIA DENT 129 X 220 / 488" }).name, "Correia Dentada 129 X 220");
  assert.equal(publico.produtoPublico({ ...cru, name: "11098" }).name, "Motor", "nome que vira só código cai para a categoria");
  assert.equal(publico.produtoPublico({ ...cru, description: "COD. FAB. 0986AB1234" }).description, "");
});

test("foto de peça integrada: caminho com código interno vira o arquivo novo, que existe; resto passa", () => {
  for (const [id, caminho] of Object.entries(fotos.FOTOS_INTEGRADAS)) {
    assert.match(caminho, /^\/assets\/pecas\/[a-z-]+\.jpg$/);
    assert.ok(existsSync(new URL(`../public${caminho}`, import.meta.url)), `${caminho} existe`);
    assert.equal(fotos.fotoIntegrada(id, "/assets/1234.567.jpg"), caminho);
  }
  assert.equal(fotos.fotoIntegrada("peca-nova", "/assets/1234.567.jpg"), "", "sem arquivo novo, sem foto (o antigo não existe mais)");
  assert.equal(fotos.fotoIntegrada("bomba", ""), "");
  assert.equal(fotos.fotoIntegrada("bomba", "/assets/pecas/bomba.jpg"), "/assets/pecas/bomba.jpg");
  assert.ok(!existsSync(new URL("../public/assets/9000.398.jpg", import.meta.url)), "arquivo com código interno saiu do site");
});
