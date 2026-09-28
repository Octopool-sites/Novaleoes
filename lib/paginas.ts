// Páginas institucionais da loja: abertas pelo rodapé e pelo topo, uma por vez (?pagina=), fora da página inicial.
import { BASE_URL } from "./base";

export type Pagina = "quem-somos" | "onde-estamos" | "como-comprar" | "entrega" | "trocas-e-garantia" | "duvidas";

export const PAGINAS: { id: Pagina; titulo: string; resumo: string }[] = [
  { id: "quem-somos", titulo: "Quem somos", resumo: "A história da loja e como ela atende" },
  { id: "onde-estamos", titulo: "Onde estamos", resumo: "Endereço, telefone e horário" },
  { id: "como-comprar", titulo: "Como comprar", resumo: "Do pedido no site à retirada" },
  { id: "entrega", titulo: "Entrega e frete", resumo: "Motoboy da loja e tabela de frete" },
  { id: "trocas-e-garantia", titulo: "Trocas e garantia", resumo: "Garantia, trocas e seus dados" },
  { id: "duvidas", titulo: "Dúvidas frequentes", resumo: "O que saber antes de pedir" },
];

export function paginaDaUrl(search: string): Pagina | null {
  const id = new URLSearchParams(search).get("pagina");
  return PAGINAS.some((p) => p.id === id) ? (id as Pagina) : null;
}

export const hrefPagina = (p: Pagina) => `${BASE_URL}?pagina=${p}`;
