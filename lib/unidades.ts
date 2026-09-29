// Unidade de venda do ERP em linguagem de loja. Espelha scripts/catalogo/nomes.mjs (unidadeLegivel).
// quantidadeMinimaVenda é a quantidade que o balcão já lança (ex.: 4 velas); o preço é por unidade.
export function unidadeLegivel(unidade: string, quantidadeMinima: number) {
  const u = String(unidade || "").toUpperCase();
  const q = Number(quantidadeMinima) || 1;
  const nomes: Record<string, string> = { JG: "Jogo", KT: "Kit", KI: "Kit", CJ: "Conjunto", LT: "Litro", ML: "Mililitro", KG: "Quilo", MT: "Metro", M: "Metro", CX: "Caixa", GL: "Galão", PA: "Par", PR: "Par" };
  return [nomes[u] || "", q > 1 ? `venda mínima de ${q}` : ""].filter(Boolean).join(" · ");
}

const brl = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

// Quantidade que entra no pedido de uma vez (nunca menos de 1).
export function minimoDeVenda(quantidadeMinima: number) {
  return Math.max(1, Math.round(Number(quantidadeMinima)) || 1);
}

// Venda mínima: o cartão e a ficha mostram o valor da compra mínima ("R$ 248,00 · 4 un. × R$ 62,00"),
// o mesmo que entra no carrinho, em vez do unitário.
export function compraMinima(precoCents: number, quantidadeMinima: number) {
  const quantidade = minimoDeVenda(quantidadeMinima);
  const preco = Math.max(0, Number(precoCents) || 0);
  return {
    quantidade,
    totalCents: preco * quantidade,
    detalhe: quantidade > 1 ? (preco > 0 ? `${quantidade} un. × ${brl(preco)}` : `mín. ${quantidade} un.`) : "",
  };
}
