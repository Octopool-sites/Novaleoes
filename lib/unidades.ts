// Unidade de venda do ERP em linguagem de loja. Espelha scripts/catalogo/nomes.mjs (unidadeLegivel).
// quantidadeMinimaVenda é a quantidade que o balcão já lança (ex.: 4 velas); o preço é por unidade.
export function unidadeLegivel(unidade: string, quantidadeMinima: number) {
  const u = String(unidade || "").toUpperCase();
  const q = Number(quantidadeMinima) || 1;
  const nomes: Record<string, string> = { JG: "Jogo", KT: "Kit", KI: "Kit", CJ: "Conjunto", LT: "Litro", ML: "Mililitro", KG: "Quilo", MT: "Metro", M: "Metro", CX: "Caixa", GL: "Galão", PA: "Par", PR: "Par" };
  return [nomes[u] || "", q > 1 ? `venda mínima de ${q}` : ""].filter(Boolean).join(" · ");
}
