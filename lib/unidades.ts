// Unidade de venda do ERP em linguagem de loja. Espelha scripts/catalogo/nomes.mjs (unidadeLegivel).
export function unidadeLegivel(unidade: string, quantidadeMinima: number) {
  const u = String(unidade || "").toUpperCase();
  const q = Number(quantidadeMinima) || 1;
  if (u === "JG") return q > 1 ? `Jogo com ${q}` : "Jogo";
  if (u === "KT" || u === "KI") return "Kit";
  if (u === "CJ") return "Conjunto";
  if (u === "LT") return "Litro";
  if (u === "ML") return "Mililitro";
  if (u === "KG") return "Quilo";
  if (u === "MT" || u === "M") return "Metro";
  if (u === "CX") return "Caixa";
  if (u === "GL") return "Galão";
  if (u === "PA" || u === "PR") return "Par";
  return q > 1 ? `Vendido em ${q} unidades` : "";
}
