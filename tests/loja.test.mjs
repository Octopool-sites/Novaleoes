import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { mkdirSync } from "node:fs";

// lib/frete.ts, lib/pedido.ts e lib/garagem.ts usam imports sem extensão (padrão do Vite): empacota para testar.
mkdirSync("outputs", { recursive: true });
buildSync({
  stdin: { contents: 'export * from "./lib/frete.ts"; export * from "./lib/pedido.ts"; export * from "./lib/garagem.ts"; export * from "./lib/unidades.ts"; export { LOJA } from "./lib/loja.ts";', resolveDir: ".", loader: "ts" },
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
    { nome: "João Silva", telefone: "11999990000", veiculo: "Fiat Uno 2010", entrega: "entrega", logradouro: "Rua X", numero: "10", bairro: "Centro", cidade: "Guarulhos/SP", cep: "07110-000", pagamento: "Pix" },
    { tipo: "entrega", titulo: "Motoboy", valorCents: 800, prazo: "" }, 4.2,
  );
  // Linha enxuta: quantidade, nome, marca e total (unitário entre parênteses); o link da peça na linha de baixo.
  assert.match(texto, /1\) 2x Pastilha Freio Dianteiro \(Cobreq\) · R\$\s?179,80 \(R\$\s?89,90 cada\)\n {3}https:\/\/loja\/\?peca=abc12345/);
  assert.match(texto, /2\) 1x Mangueira · preço a consultar/);
  assert.match(texto, /Telefone: \(11\) 99999-0000/);
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

test("frete: CEP inexistente e falha de conexão têm mensagens diferentes", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => (String(url).includes("awesomeapi") ? new Response("{}", { status: 404 }) : new Response(JSON.stringify({ erro: true })));
    await assert.rejects(m.consultarCep("99999-999"), /Não encontramos esse CEP/);
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
    await assert.rejects(m.consultarCep("07110-000"), /Não conseguimos consultar o CEP agora/);
    globalThis.fetch = async () => new Response(JSON.stringify({ city: "Guarulhos", state: "SP", address: "Rua Luiz Faccini", district: "Centro", lat: "-23.4673858", lng: "-46.5276569" }));
    const r = await m.calcularFrete("07110-000");
    assert.equal(r.opcoes[0].tipo, "entrega");
  } finally { globalThis.fetch = original; }
});

test("telefone do cliente formatado na mensagem; fora do padrão segue como foi digitado", () => {
  assert.equal(m.formatarTelefone("11988887777"), "(11) 98888-7777");
  assert.equal(m.formatarTelefone(" +55 (11) 98888-7777 "), "(11) 98888-7777");
  assert.equal(m.formatarTelefone("5511988887777"), "(11) 98888-7777");
  assert.equal(m.formatarTelefone("011 98888 7777"), "(11) 98888-7777");
  assert.equal(m.formatarTelefone("1124528939"), "(11) 2452-8939");
  assert.equal(m.formatarTelefone("98888-7777"), "98888-7777");
  assert.equal(m.formatarTelefone(""), "");
});

test("venda mínima: cartão e ficha mostram o total da compra mínima; o mínimo nunca é menor que 1", () => {
  const c = m.compraMinima(6200, 4);
  assert.equal(c.quantidade, 4);
  assert.equal(c.totalCents, 24800);
  assert.match(c.detalhe, /^4 un\. × R\$\s?62,00$/);
  assert.equal(m.compraMinima(6200, 1).detalhe, "");
  assert.equal(m.compraMinima(6200, 1).totalCents, 6200);
  assert.equal(m.compraMinima(0, 4).detalhe, "mín. 4 un.");
  assert.equal(m.minimoDeVenda(0), 1);
  assert.equal(m.minimoDeVenda(Number.NaN), 1);
  assert.equal(m.minimoDeVenda(2.4), 2);
  assert.equal(m.minimoDeVenda(16), 16);
});

test("carrinho: disponibilidade honesta (sem prometer encomenda) e aviso de quantidade", () => {
  assert.equal(m.observacaoDoItem({ stock: 1, quantity: 1, minimo: 1 }), "Em estoque na loja");
  assert.equal(m.observacaoDoItem({ stock: 1, quantity: 5, minimo: 4 }), "Em estoque na loja · venda mínima de 4 · a loja confirma as 5 un.");
  assert.equal(m.observacaoDoItem({ stock: 1, quantity: 4, minimo: 4 }), "Em estoque na loja · venda mínima de 4");
  assert.equal(m.observacaoDoItem({ stock: 1, quantity: 2, minimo: 1 }), "Em estoque na loja · a loja confirma as 2 un.");
  const sem = m.observacaoDoItem({ stock: 0, quantity: 2, minimo: 1 });
  assert.match(sem, /^Sem estoque agora/);
  assert.doesNotMatch(sem, /encomenda|confirma as/);
});

test("WhatsApp: pedido pequeno vai inteiro no link; médio perde só os links; grande vira copiar e colar", () => {
  const dados = { nome: "Cliente Teste", telefone: "11988887777", entrega: "retirada", pagamento: "Pix" };
  const item = (i) => ({ nome: `Peça de teste número ${i} com nome comprido`, marca: "Marca", quantity: 2, priceCents: 1990 + i, link: `https://nova-leoes-preview.vercel.app/?peca=abc${String(i).padStart(5, "0")}` });
  const pequeno = m.montarEnvio([item(1), item(2)], dados, null);
  assert.equal(pequeno.modo, "direto");
  assert.ok(pequeno.link.length <= m.LIMITE_URL_WHATSAPP);
  assert.match(pequeno.texto, /https:\/\/nova-leoes-preview\.vercel\.app\/\?peca=abc00001/);
  assert.match(pequeno.link, /^https:\/\/wa\.me\/551124528939\?text=/);

  const medio = m.montarEnvio(Array.from({ length: 7 }, (_, i) => item(i + 1)), dados, null);
  assert.equal(medio.modo, "direto");
  assert.ok(medio.link.length <= m.LIMITE_URL_WHATSAPP, `link ${medio.link.length}`);
  assert.doesNotMatch(medio.texto, /https:/);
  assert.match(medio.texto, /· ref\. abc00007/);

  const grande = m.montarEnvio(Array.from({ length: 30 }, (_, i) => item(i + 1)), dados, null);
  assert.equal(grande.modo, "colar");
  assert.ok(grande.link.length < 600, `aviso curto (${grande.link.length})`);
  assert.match(decodeURIComponent(grande.link.split("text=")[1]), /30 itens \(60 peças\).*\nNome: Cliente Teste\n\nO pedido completo vai colado logo abaixo:/s);
  // O texto copiado é o pedido completo, com os links e sem código interno.
  assert.match(grande.texto, /30\) 2x Peça de teste número 30/);
  assert.match(grande.texto, /peca=abc00030/);
  assert.match(grande.texto, /Telefone: \(11\) 98888-7777/);
});

test("'Não achou?': mensagem com a busca e o carro já escritos", () => {
  const t = m.mensagemProcura("  oleo 5w30 ", "Fiat Uno 2010");
  assert.match(t, /Peça: oleo 5w30\n/);
  assert.match(t, /Carro: Fiat Uno 2010/);
  const vazio = m.mensagemProcura("");
  assert.match(vazio, /Peça: \(vou descrever\)/);
  assert.doesNotMatch(vazio, /Carro:/);
});
