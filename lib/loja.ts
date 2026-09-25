// Dados institucionais da Nova Leões usados no site (quem somos, contato, rodapé, WhatsApp).
// Fonte: cadastro da empresa no ERP e Receita Federal (CNPJ), conferidos em 2026-09-25.
// Campos marcados "confirmar" ainda dependem da loja; o site mostra um texto neutro enquanto estiverem vazios.
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
  telefone: "(11) 2452-8939",
  // Número usado nos links wa.me (DDI + DDD + número, só dígitos). Confirmar com a loja qual linha tem WhatsApp.
  whatsapp: "551124528939",
  // E-mail público de atendimento. Vazio = não exibir (o e-mail do ERP não é um canal público).
  email: "",
  instagram: "",
  // Horário de atendimento. Vazio = o site pede para confirmar por telefone.
  horario: [] as { dias: string; horas: string }[],
} as const;

export const enderecoLinha = `${LOJA.endereco.logradouro}, ${LOJA.endereco.numero} · ${LOJA.endereco.bairro} · ${LOJA.endereco.cidade}/${LOJA.endereco.uf} · CEP ${LOJA.endereco.cep}`;

export const mapaUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${LOJA.endereco.logradouro}, ${LOJA.endereco.numero} - ${LOJA.endereco.bairro}, ${LOJA.endereco.cidade} - ${LOJA.endereco.uf}, ${LOJA.endereco.cep}`)}`;

export const telefoneHref = `tel:+${LOJA.whatsapp}`;

export function whatsappUrl(mensagem: string) {
  return `https://wa.me/${LOJA.whatsapp}?text=${encodeURIComponent(mensagem)}`;
}
