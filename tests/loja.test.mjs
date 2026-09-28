import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { mkdirSync } from "node:fs";

// lib/frete.ts, lib/pedido.ts e lib/garagem.ts usam imports sem extensão (padrão do Vite): empacota para testar.
mkdirSync("outputs", { recursive: true });
buildSync({
  stdin: { contents: 'export * from "./lib/frete.ts"; export * from "./lib/pedido.ts"; export * from "./lib/garagem.ts"; export { LOJA } from "./lib/loja.ts";', resolveDir: ".", loader: "ts" },
  bundle: true, platform: "node", format: "esm", outfile: "outputs/test-loja.mjs", logLevel: "silent",
});
const m = await import("../outputs/test-loja.mjs");

test("frete: faixas por distância, retirada sempre disponível, fora do raio a combinar", () => {
  const perto = m.opcoesPorDistancia(2.5, true);
  assert.equal(perto[0].tipo, "entrega");
  assert.equal(perto[0].valorCents, m.LOJA.frete.faixas[0].valorCents);
  assert.equal(perto[1].tipo, "retirada");
  assert.equal(perto[1].valorCents, 0);
  assert.equal(m.opcoesPorDistancia(9.9, true)[0].valorCents, m.LOJA.frete.faixas[2].valorCents);
  assert.equal(m.opcoesPorDistancia(40, false)[0].tipo, "combinar");
  assert.equal(m.opcoesPorDistancia(null, true)[0].tipo, "combinar");
  assert.equal(m.formatarCep("07080000"), "07080-000");
  assert.equal(m.limparCep("07.080-000x"), "07080000");
});

test("frete: distância da loja ao Centro de Guarulhos (~3,6 km em linha reta)", () => {
  const km = m.distanciaKm(m.LOJA.coordenadas, { lat: -23.4673858, lng: -46.5276569 });
  assert.ok(km > 3 && km < 4.2, `distância ${km}`);
});

test("pedido WhatsApp: itens com valor, frete, endereço, pagamento, sem código interno", () => {
  const texto = m.mensagemPedido(
    [
      { nome: "Pastilha Freio Dianteiro", marca: "Cobreq", quantity: 2, priceCents: 8990, link: "https://loja/?peca=abc12345" },
      { nome: "Mangueira", marca: "", quantity: 1, priceCents: 0, link: "" },
    ],
    { nome: "João Silva", telefone: "(11) 99999-0000", veiculo: "Fiat Uno 2010", entrega: "entrega", logradouro: "Rua X", numero: "10", bairro: "Centro", cidade: "Guarulhos/SP", cep: "07110-000", pagamento: "Pix" },
    { tipo: "entrega", titulo: "Motoboy", valorCents: 800, prazo: "" }, 4.2,
  );
  assert.match(texto, /2x Pastilha Freio Dianteiro \(Cobreq\) - R\$\s?89,90 cada = R\$\s?179,80/);
  assert.match(texto, /preço a consultar/);
  assert.match(texto, /Subtotal: R\$\s?179,80 \+ itens a consultar/);
  assert.match(texto, /Entrega: Entrega pelo motoboy \(R\$\s?8,00, ~4,2 km\)/);
  assert.match(texto, /Total estimado: R\$\s?187,80/);
  assert.match(texto, /Endereço: Rua X, 10 - Centro - Guarulhos\/SP - CEP 07110-000/);
  assert.match(texto, /Pagamento: Pix/);
  assert.doesNotMatch(texto, /\n{3,}/);
  const retirada = m.mensagemPedido([{ nome: "Filtro", marca: "", quantity: 1, priceCents: 2200, link: "" }], { entrega: "retirada" }, null);
  assert.match(retirada, /Entrega: Retirar na loja/);
  assert.doesNotMatch(retirada, /Endereço|Total estimado/);
});

test("garagem: veículo salvo pelo nome, resolvido para índices e usado no selo 'serve'", () => {
  const catalogo = { meta: { montadoras: ["Fiat"], modelos: [[0, "Uno", 10], [0, "Palio", 5]] } };
  const v = m.resolverVeiculo(catalogo, { montadora: "Fiat", modelo: "Palio", ano: 2008 });
  assert.deepEqual(v, { montadora: 0, modelo: 1, ano: 2008, rotulo: "Fiat Palio 2008" });
  assert.equal(m.resolverVeiculo(catalogo, { montadora: "Ford", modelo: "Ka", ano: 0 }), null);
  const peca = { aplicacoes: [[1, 2001, 2010]] };
  assert.equal(m.servePara(peca, v), true);
  assert.equal(m.servePara(peca, { ...v, ano: 2015 }), false);
  assert.equal(m.servePara(peca, null), false);
});
