// 07/10/2026 — preço ao vivo: o ERP manda o preço das peças com saldo junto da disponibilidade (campo opcional
// `prices`), o servidor converte para o id curto e o navegador põe por cima do catálogo das 7h/13h.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { aplicarDisponibilidade, montarCatalogo, precoAoVivo } from "../lib/catalogo-site.ts";

await build({ entryPoints: ["server/disponibilidade.ts"], outfile: "outputs/test-0710-disponibilidade.mjs", bundle: true, platform: "node", format: "esm", packages: "external", target: "node22", logLevel: "silent" });
const disp = await import(new URL("../outputs/test-0710-disponibilidade.mjs", import.meta.url).href);

const CHAVES_ENV = ["COMMERCE_ERP_TOKEN", "COMMERCE_ERP_ORIGIN"];
const envOriginal = new Map(CHAVES_ENV.map((k) => [k, process.env[k]]));
after(() => { for (const [k, v] of envOriginal) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
function comErp() {
  process.env.COMMERCE_ERP_TOKEN = "c3".repeat(32);
  process.env.COMMERCE_ERP_ORIGIN = "https://api.octopool.com.br";
  disp.esquecerDisponibilidade();
}
const pedir = () => new Request("https://nova-leoes.example/api/public/disponibilidade");
const respostaErp = (corpo) => Response.json({ contract: "octopool.availability.v1", generatedAt: "2026-10-07T17:00:00.000Z", ...corpo });

test("servidor: preço do ERP vira mapa por id curto, só das peças com saldo, sem id do ERP", async () => {
  comErp();
  const transport = async () => respostaErp({ available: ["erp-a", "erp-b"], prices: { "erp-a": 9500, "erp-b": 22700, "erp-sem-saldo": 100 } });
  const corpo = await (await disp.disponibilidade(pedir(), { transport, agora: () => 1_000 })).json();
  assert.deepEqual(Object.keys(corpo).sort(), ["geradoEm", "ids", "precos"]);
  assert.deepEqual(corpo.precos, { [disp.idCurto("erp-a")]: 9500, [disp.idCurto("erp-b")]: 22700 });
  assert.ok(!JSON.stringify(corpo).includes("erp-"), "id do ERP não sai para o navegador");
});

test("servidor: ERP antigo (sem prices) segue igual; preço fora do contrato derruba para 'indisponível'", async () => {
  comErp();
  const semPreco = await (await disp.disponibilidade(pedir(), { transport: async () => respostaErp({ available: ["erp-a"] }), agora: () => 1_000 })).json();
  assert.deepEqual(Object.keys(semPreco).sort(), ["geradoEm", "ids"]);
  comErp();
  const ruim = await (await disp.disponibilidade(pedir(), { transport: async () => respostaErp({ available: ["erp-a"], prices: { "erp-a": "95,00" } }), agora: () => 1_000 })).json();
  assert.deepEqual(ruim, { indisponivel: true });
});

test("régua do preço ao vivo: segue o ERP, mas não acredita em preço de mentira nem em 10x de diferença", () => {
  assert.equal(precoAoVivo(9500, 9900), 9900, "aumento normal entra");
  assert.equal(precoAoVivo(9500, 8000), 8000, "desconto normal entra");
  assert.equal(precoAoVivo(9500, undefined), 9500);
  assert.equal(precoAoVivo(0, 9900), 0, "'consultar preço' do catálogo continua consultar");
  assert.equal(precoAoVivo(9500, 50), 9500, "R$ 0,50 é preço de mentira do legado");
  assert.equal(precoAoVivo(9500, 99), 9500);
  assert.equal(precoAoVivo(9500, 95000_00), 9500, "100x: vírgula trocada");
  assert.equal(precoAoVivo(9500, 900), 9500, "menos de um décimo");
  assert.equal(precoAoVivo(9500, 9.5), 9500, "centavo quebrado não é centavo");
});

test("navegador: preço ao vivo entra no catálogo (cartão, carrinho e WhatsApp usam o mesmo precoCents)", () => {
  const meta = {
    versao: 1, exportadoEm: "2026-10-07T16:00:00.000Z", geradoEm: "", empresa: "", total: 3, comEstoque: 2, comFoto: 0, fotoBase: "", buckets: 1,
    departamentos: [{ id: "freios", nome: "Freios", resumo: "", n: 3, grupos: [0], capa: "" }], grupos: [["Pastilha Freio", 0, 3]], marcas: [["SYL", 3]],
    montadoras: [], modelos: [], unidades: [""],
  };
  const linha = (id, preco, disponivel) => [id, "Pastilha Freio Dianteiro", 0, 0, preco, disponivel, "", [], 0, 0, 1, 0, ""];
  const linhas = [linha("aaaa1111", 9500, 1), linha("bbbb2222", 22700, 1), linha("cccc3333", 0, 0)];
  aplicarDisponibilidade(meta, linhas, { geradoEm: "2026-10-07T17:00:00.000Z", ids: ["aaaa1111", "bbbb2222", "cccc3333"], precos: { aaaa1111: 9900, bbbb2222: 22700, cccc3333: 5000 } });
  assert.deepEqual(linhas.map((l) => l[4]), [9900, 22700, 0]);
  assert.equal(meta.precosAoVivo, 1);
  assert.equal(montarCatalogo(meta, linhas).porId.get("aaaa1111").precoCents, 9900);
  // Lista ao vivo suspeita (queda de estoque): nem estoque nem preço mudam.
  const meta2 = { ...meta, comEstoque: 100 };
  const outras = [linha("aaaa1111", 9500, 1)];
  aplicarDisponibilidade(meta2, outras, { geradoEm: "2026-10-07T17:00:00.000Z", ids: ["aaaa1111"], precos: { aaaa1111: 9900 } });
  assert.equal(outras[0][4], 9500);
});
