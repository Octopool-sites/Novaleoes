// Dados institucionais e comerciais da Nova Leões usados no site.
// Fonte: cadastro da empresa no ERP e Receita Federal (CNPJ), conferidos em 2026-09-25.
// Tudo que está marcado "CONFIRMAR COM A LOJA" funciona como está, mas precisa do aval do Berna antes de divulgar.
export const LOJA = {
  nome: "Nova Leões Autopeças",
  razaoSocial: "Nova Leões Autopeças Ltda",
  cnpj: "72.946.510/0001-67",
  fundacao: 1993,
  endereco: {
    logradouro: "Rua Cachoeira",
    numero: "444",
    bairro: "Jardim Rosa de França",
    cidade: "Guarulhos",
    uf: "SP",
    cep: "07080-000",
  },
  // Coordenadas do CEP da loja (AwesomeAPI CEP, 25/09/2026). Base do cálculo de distância do frete.
  coordenadas: { lat: -23.4379981, lng: -46.5476991 },
  telefone: "(11) 2452-8939",
  // CONFIRMAR COM A LOJA: número que tem WhatsApp (DDI + DDD + número, só dígitos).
  whatsapp: "551124528939",
  // Vazio = não exibir. O e-mail do ERP não é canal público.
  email: "",
  instagram: "",
  // CONFIRMAR COM A LOJA. Vazio = o site pede para confirmar por telefone.
  horario: [] as { dias: string; horas: string }[],
  // Formas aceitas na retirada ou na entrega (as mesmas do caixa da loja). CONFIRMAR COM A LOJA.
  pagamentos: ["Pix", "Cartão de débito", "Cartão de crédito", "Dinheiro"],
  frete: {
    // Entrega própria (motoboy) por distância da loja. Valores de referência: CONFIRMAR COM A LOJA.
    // distância de rua ≈ distância em linha reta × fatorRota
    fatorRota: 1.35,
    faixas: [
      { ateKm: 3, valorCents: 800 },
      { ateKm: 6, valorCents: 1200 },
      { ateKm: 10, valorCents: 1800 },
      { ateKm: 15, valorCents: 2500 },
    ],
    prazoEntrega: "Entrega no mesmo dia útil para pedidos confirmados até as 16h",
    prazoRetirada: "Pronto para retirada após a confirmação da loja",
    // Acima da última faixa: entrega combinada pelo WhatsApp.
  },
} as const;

export const enderecoLinha = `${LOJA.endereco.logradouro}, ${LOJA.endereco.numero} · ${LOJA.endereco.bairro} · ${LOJA.endereco.cidade}/${LOJA.endereco.uf} · CEP ${LOJA.endereco.cep}`;

export const mapaUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${LOJA.endereco.logradouro}, ${LOJA.endereco.numero} - ${LOJA.endereco.bairro}, ${LOJA.endereco.cidade} - ${LOJA.endereco.uf}, ${LOJA.endereco.cep}`)}`;

export const telefoneHref = `tel:+55${LOJA.telefone.replace(/\D/g, "")}`;

export function whatsappUrl(mensagem: string) {
  return `https://wa.me/${LOJA.whatsapp}?text=${encodeURIComponent(mensagem)}`;
}
