// Texto do pedido enviado ao WhatsApp da loja: itens, valores, frete, entrega, pagamento e cliente.
import { LOJA, whatsappUrl } from "./loja";
import type { OpcaoFrete } from "./frete";

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
export type ItemPedido = { nome: string; marca: string; quantity: number; priceCents: number; link: string };
export type DadosPedido = { nome: string; telefone: string; veiculo: string; entrega: "retirada" | "entrega" | "combinar"; cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; pagamento: string; obs: string };
// "link": endereço da peça em cada item (a loja abre com um toque). "ref": só a referência pública curta, para caber no link.
export type FormatoItens = "link" | "ref";

// Acima disso o endereço wa.me corta ou falha em alguns Android e navegadores embutidos (Instagram, Facebook).
export const LIMITE_URL_WHATSAPP = 1800;

// Telefone como a loja lê: (11) 98888-7777 ou (11) 2452-8939. Número fora do padrão segue como foi digitado.
export function formatarTelefone(bruto: string) {
  const texto = String(bruto || "").trim();
  let d = texto.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 12 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return texto;
}

// Referência pública da peça (o id de 8 caracteres do site, nunca o código interno do ERP).
function refDoLink(link: string) {
  return /[?&]peca=([a-z0-9]+)/i.exec(link)?.[1] || "";
}

function linhaDoItem(l: ItemPedido, i: number, formato: FormatoItens) {
  const nome = `${l.quantity}x ${l.nome}${l.marca ? ` (${l.marca})` : ""}`;
  const preco = l.priceCents > 0 ? `${money(l.priceCents * l.quantity)}${l.quantity > 1 ? ` (${money(l.priceCents)} cada)` : ""}` : "preço a consultar";
  const ref = formato === "ref" ? refDoLink(l.link) : "";
  return `${i + 1}) ${nome} · ${preco}${ref ? ` · ref. ${ref}` : ""}${formato === "link" && l.link ? `\n   ${l.link}` : ""}`;
}

export function mensagemPedido(linhas: ItemPedido[], dados: Partial<DadosPedido>, frete: OpcaoFrete | null, distanciaKm: number | null = null, formato: FormatoItens = "link") {
  const subtotal = linhas.reduce((s, l) => s + l.priceCents * l.quantity, 0);
  const consultar = linhas.some((l) => l.priceCents <= 0);
  const itens = linhas.map((l, i) => linhaDoItem(l, i, formato)).join("\n");
  const valorFrete = frete?.tipo === "entrega" ? frete.valorCents : 0;
  const entrega = !dados.entrega ? "" : dados.entrega === "retirada" ? "Retirar na loja" : dados.entrega === "entrega"
    ? `Entrega pelo motoboy${valorFrete ? ` (${money(valorFrete)}${distanciaKm !== null ? `, ~${distanciaKm.toFixed(1).replace(".", ",")} km` : ""})` : ""}` : "Entrega a combinar";
  const endereco = dados.entrega && dados.entrega !== "retirada"
    ? [dados.logradouro && `${dados.logradouro}, ${dados.numero || "s/n"}`, dados.complemento, dados.bairro, dados.cidade, dados.cep && `CEP ${dados.cep}`].filter(Boolean).join(" - ") : "";
  // Blocos separados por uma linha em branco; campo vazio não deixa linha sobrando.
  const blocos = [
    [`*Pedido pelo site - ${LOJA.nome}*`],
    [itens],
    [`Subtotal: ${money(subtotal)}${consultar ? " + itens a consultar" : ""}`, entrega && `Entrega: ${entrega}`, valorFrete ? `Total estimado: ${money(subtotal + valorFrete)}` : ""],
    [
      dados.nome && `Nome: ${dados.nome}`,
      dados.telefone && `Telefone: ${formatarTelefone(dados.telefone)}`,
      dados.veiculo && `Veículo: ${dados.veiculo}`,
      endereco && `Endereço: ${endereco}`,
      dados.pagamento && `Pagamento: ${dados.pagamento}`,
      dados.obs && `Observação: ${dados.obs}`,
    ],
    ["Podem confirmar disponibilidade, aplicação e valor?"],
  ];
  return blocos.map((b) => b.filter(Boolean).join("\n")).filter(Boolean).join("\n\n").trim();
}

// "direto": o pedido inteiro vai no link do WhatsApp.
// "colar": grande demais para o link; o site copia o texto e o WhatsApp abre com um aviso curto para colar.
export type EnvioPedido = { modo: "direto" | "colar"; texto: string; link: string };

export function montarEnvio(linhas: ItemPedido[], dados: Partial<DadosPedido>, frete: OpcaoFrete | null, distanciaKm: number | null = null, limite = LIMITE_URL_WHATSAPP): EnvioPedido {
  const completo = mensagemPedido(linhas, dados, frete, distanciaKm, "link");
  const link = whatsappUrl(completo);
  if (link.length <= limite) return { modo: "direto", texto: completo, link };
  const curto = mensagemPedido(linhas, dados, frete, distanciaKm, "ref");
  const linkCurto = whatsappUrl(curto);
  if (linkCurto.length <= limite) return { modo: "direto", texto: curto, link: linkCurto };
  const pecas = linhas.reduce((s, l) => s + l.quantity, 0);
  const subtotal = linhas.reduce((s, l) => s + l.priceCents * l.quantity, 0);
  const aviso = [
    `*Pedido pelo site - ${LOJA.nome}*`,
    `${linhas.length} ${linhas.length === 1 ? "item" : "itens"} (${pecas} ${pecas === 1 ? "peça" : "peças"})${subtotal > 0 ? ` · subtotal ${money(subtotal)}` : ""}`,
    ...(dados.nome ? [`Nome: ${dados.nome}`] : []),
    "",
    "O pedido completo vai colado logo abaixo:",
    "",
  ].join("\n");
  return { modo: "colar", texto: completo, link: whatsappUrl(aviso) };
}

// Disponibilidade da linha do carrinho. O site só sabe se tem ou não tem (a quantidade em estoque não é pública):
// acima da venda mínima, avisa que a loja confirma a quantidade em vez de prometer.
export function observacaoDoItem(l: { stock: number; quantity: number; minimo: number }) {
  const partes = [l.stock > 0 ? "Em estoque na loja" : "Sem estoque agora · a loja confirma disponibilidade e prazo"];
  if (l.minimo > 1) partes.push(`venda mínima de ${l.minimo}`);
  // Na venda mínima (jogo, kit, 4 velas) a loja já vende assim; acima dela, confirma se tem tudo.
  if (l.stock > 0 && l.quantity > Math.max(1, l.minimo)) partes.push(`a loja confirma as ${l.quantity} un.`);
  return partes.join(" · ");
}

// "Não achou?": pedido de procura com a busca e o carro já escritos.
export function mensagemProcura(busca: string, carro = "") {
  // Placa na busca não vai para a mensagem (dado pessoal); o carro, se escolhido, já vai na linha "Carro:".
  const texto = String(busca || "").trim();
  const peca = /^[A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2}$/i.test(texto) ? "" : texto.slice(0, 120);
  return [
    `Olá! Não achei no site da ${LOJA.nome} a peça que procuro.`,
    `Peça: ${peca || "(vou descrever)"}`,
    carro ? `Carro: ${carro}` : "",
    "Vocês conseguem verificar para mim?",
  ].filter(Boolean).join("\n");
}
