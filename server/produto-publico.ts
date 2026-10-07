// Peça integrada como sai para o público em GET /api/public/catalog.
// O cadastro do piloto (Firestore) guarda nome e marca como vieram do ERP ("FILTRO AR / 4150", "TECFIL F AR"): o nome
// passa pela mesma limpeza do catálogo do site (código de fabricante e abreviação do balcão saem) e a marca vira só o
// fabricante. A gestão continua vendo o cadastro como está. A foto já vem sem código (lib/fotos-integradas.ts).
import type { Product } from "../lib/catalog.js";
import type { Order } from "../lib/commerce-contracts.js";
import { fotoIntegrada } from "../lib/fotos-integradas.js";
import { limparMarca, limparNome, removerCodigosDePeca, temCodigoDePeca, VAZAMENTO_CODIGO } from "../scripts/catalogo/nomes.mjs";

const vaza = (texto: string) => VAZAMENTO_CODIGO.test(texto) || temCodigoDePeca(texto);

// Nome que vira só código ou sobra cai para a categoria, como no catálogo (construir.mjs).
export function nomeDaPecaPublica(nome: string, reserva: string) {
  const limpo = removerCodigosDePeca(limparNome(nome));
  return /[A-Za-zÀ-ú]{3}/.test(limpo) && !vaza(limpo) ? limpo : reserva;
}

export function produtoPublico(p: Product): Product {
  return {
    ...p,
    // O código interno do ERP (sku) não sai para o site (AGENTS.md); o público vê só se tem ou não tem.
    sku: "",
    stock: p.stock > 0 ? 1 : 0,
    name: nomeDaPecaPublica(p.name, p.category),
    brand: limparMarca(p.brand),
    description: vaza(p.description) ? "" : p.description,
  };
}

// Resposta do POST /api/public/orders ao navegador do cliente: os itens gravados no pedido levam sku e nome do ERP
// (a gestão precisa deles); para o público saem como no catálogo. Hoje os pedidos online estão desligados.
export function pedidoPublico(order: Order): Order {
  return {
    ...order,
    items: order.items.map((i) => ({ ...i, sku: "", name: nomeDaPecaPublica(i.name, "Peça"), image: fotoIntegrada(i.productId, i.image) })),
  };
}
