// Texto do pedido enviado ao WhatsApp da loja: itens, valores, frete, entrega, pagamento e cliente.
import { LOJA } from "./loja";
import type { OpcaoFrete } from "./frete";

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
export type ItemPedido = { nome: string; marca: string; quantity: number; priceCents: number; link: string };
export type DadosPedido = { nome: string; telefone: string; veiculo: string; entrega: "retirada" | "entrega" | "combinar"; cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; pagamento: string; obs: string };

export function mensagemPedido(linhas: ItemPedido[], dados: Partial<DadosPedido>, frete: OpcaoFrete | null, distanciaKm: number | null = null) {
  const subtotal = linhas.reduce((s, l) => s + l.priceCents * l.quantity, 0);
  const consultar = linhas.some((l) => l.priceCents <= 0);
  const itens = linhas.map((l, i) => {
    const preco = l.priceCents > 0 ? `${money(l.priceCents)}${l.quantity > 1 ? ` cada = ${money(l.priceCents * l.quantity)}` : ""}` : "preço a consultar";
    return `${i + 1}) ${l.quantity}x ${l.nome}${l.marca ? ` (${l.marca})` : ""} - ${preco}${l.link ? `\n   ${l.link}` : ""}`;
  }).join("\n");
  const valorFrete = frete?.tipo === "entrega" ? frete.valorCents : 0;
  const entrega = !dados.entrega ? "" : dados.entrega === "retirada" ? "Retirar na loja" : dados.entrega === "entrega"
    ? `Entrega pelo motoboy${valorFrete ? ` (${money(valorFrete)}${distanciaKm !== null ? `, ~${distanciaKm.toFixed(1).replace(".", ",")} km` : ""})` : ""}` : "Entrega a combinar";
  const endereco = dados.entrega && dados.entrega !== "retirada"
    ? [dados.logradouro && `${dados.logradouro}, ${dados.numero || "s/n"}`, dados.complemento, dados.bairro, dados.cidade, dados.cep && `CEP ${dados.cep}`].filter(Boolean).join(" - ") : "";
  return [
    `*Pedido pelo site - ${LOJA.nome}*`,
    "",
    itens,
    "",
    `Subtotal: ${money(subtotal)}${consultar ? " + itens a consultar" : ""}`,
    entrega && `Entrega: ${entrega}`,
    valorFrete ? `Total estimado: ${money(subtotal + valorFrete)}` : "",
    "",
    dados.nome && `Nome: ${dados.nome}`,
    dados.telefone && `Telefone: ${dados.telefone}`,
    dados.veiculo && `Veículo: ${dados.veiculo}`,
    endereco && `Endereço: ${endereco}`,
    dados.pagamento && `Pagamento: ${dados.pagamento}`,
    dados.obs && `Observação: ${dados.obs}`,
    "",
    "Podem confirmar disponibilidade, aplicação e valor?",
  ].filter((l) => typeof l === "string").join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

