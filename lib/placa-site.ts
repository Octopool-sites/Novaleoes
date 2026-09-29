// Busca por placa: formato da placa e tradução do carro que o ERP identificou para as posições do catálogo
// público (public/catalogo/meta.json). Usado pelo navegador (components/busca-placa.tsx) e pelo servidor
// do site (server/placa.ts).
//
// Privacidade: a placa serve só para identificar o modelo. Ela não vai para URL, localStorage, log nem
// mensagem do WhatsApp; o carro lembrado (lib/garagem.ts) guarda só montadora, modelo e ano.
// Sem import de lib/catalogo-site: o servidor (e o vite.config, pelo server/placa-local.ts) carrega este arquivo.

// Placa antiga (ABC1234) e Mercosul (ABC1D23): 3 letras, 1 número, 1 letra ou número, 2 números.
export const PLACA_RE = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

// O que o cliente digita, só letras e números em maiúsculas, até 7 caracteres (para a máscara do campo).
export function limparPlaca(texto: string) {
  return String(texto || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

// Como aparece no campo: ABC-1234 no padrão antigo, ABC1D23 no Mercosul (o 5º caractere decide).
export function mascararPlaca(texto: string) {
  const p = limparPlaca(texto);
  return /^[A-Z]{3}[0-9]{2}/.test(p) ? `${p.slice(0, 3)}-${p.slice(3)}` : p;
}

// Placa pronta para consulta (servidor): tira espaço, hífen e ponto; não corta nada. Inválida = null.
export function normalizarPlaca(texto: unknown): string | null {
  if (typeof texto !== "string" || texto.length > 16) return null;
  const p = texto.trim().toUpperCase().replace(/[\s.-]/g, "");
  return PLACA_RE.test(p) ? p : null;
}

// Igual a chaveModelo de scripts/catalogo/construir.mjs (tests/placa.test.mjs confere): junta as grafias
// do mesmo carro (S-10/S10, T-CROSS/TCROSS, UP/up!).
export function chaveModelo(modelo: unknown) {
  return String(modelo || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]/g, "");
}

// Resposta pública de POST /api/public/placa (mesmos campos que o ERP devolve, por lista fixa).
export type VeiculoPlaca = {
  marca: string; modelo: string; ano: number | null; anoFabricacao: number | null; combustivel: string | null; cilindrada: string | null;
};
export type ParCatalogo = { montadora: string; modelo: string };
export type CatalogoPlaca = ParCatalogo & { identificado: boolean; motorSugerido: string; alternativas: ParCatalogo[] };
export type RespostaPlaca =
  | { encontrado: false; simulado?: boolean }
  | { encontrado: true; simulado: boolean; veiculo: VeiculoPlaca; catalogo: CatalogoPlaca };

// Posições no meta do site: montadora = índice em meta.montadoras, modelo = índice em meta.modelos.
export type CarroSite = { montadora: number; modelo: number };
// O pedaço do meta que interessa (mesmo formato de Meta em lib/catalogo-site.ts).
type MetaCarros = { meta: { montadoras: string[]; modelos: [montadoraIdx: number, nome: string, n: number][] } };

// Par montadora/modelo do ERP (AplicacaoVeiculo) -> posições do site. A montadora do catálogo do site é o
// nome exato do ERP; sem acento/pontuação só como reserva ("Citroën" = "Citroen"). O modelo casa pela chave.
export function resolverDoErp(catalogo: MetaCarros, par: ParCatalogo): CarroSite | null {
  const { montadoras, modelos } = catalogo.meta;
  const nome = String(par?.montadora || "").trim();
  const chave = chaveModelo(par?.modelo);
  if (!nome || !chave) return null;
  let montadora = montadoras.indexOf(nome);
  if (montadora < 0) {
    const alvo = chaveModelo(nome);
    montadora = montadoras.findIndex((m) => chaveModelo(m) === alvo);
  }
  if (montadora < 0) return null;
  const modelo = modelos.findIndex(([m, n]) => m === montadora && chaveModelo(n) === chave);
  return modelo < 0 ? null : { montadora, modelo };
}

// O carro principal e até 3 alternativas, só entre os modelos com peças no site. Sem principal, a primeira
// alternativa assume (a tela sempre pergunta "É o seu carro?"). Sem nenhum: fora do catálogo do site.
export function carrosDaPlaca(catalogo: MetaCarros, resposta: RespostaPlaca): { principal: CarroSite | null; alternativas: CarroSite[] } {
  if (!resposta.encontrado) return { principal: null, alternativas: [] };
  const comPecas = (c: CarroSite | null): c is CarroSite => !!c && (catalogo.meta.modelos[c.modelo]?.[2] ?? 0) > 0;
  const vistos = new Set<number>();
  const lista: CarroSite[] = [];
  const pares = [...(resposta.catalogo.identificado ? [resposta.catalogo] : []), ...(resposta.catalogo.alternativas || [])];
  for (const par of pares) {
    const c = resolverDoErp(catalogo, par);
    if (comPecas(c) && !vistos.has(c.modelo)) { vistos.add(c.modelo); lista.push(c); }
  }
  const [principal = null, ...alternativas] = lista;
  return { principal, alternativas: alternativas.slice(0, 3) };
}

// Texto do veículo da placa, para quando o site não tem o modelo: "Fiat Cronos Drive 1.3 2021".
export function descreverVeiculo(v: VeiculoPlaca) {
  const nome = `${v.marca} ${v.modelo}`.trim().split(/\s+/)
    .map((t) => (/\d/.test(t) || t.length <= 2 ? t.toUpperCase() : t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())).join(" ");
  return `${nome}${v.ano ? ` ${v.ano}` : ""}`.trim();
}

// "FLEX", "ALCOOL/GASOLINA" -> "Flex"; "GASOLINA" -> "Gasolina"; vazio -> "".
export function rotuloCombustivel(c: string | null) {
  const t = String(c || "").trim();
  if (!t) return "";
  const n = t.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  // "INDETERMINADO", "NAO INFORMADO": o provedor não sabe; melhor não mostrar nada ("Passat 1979 · Indeterminado").
  if (/INDETERMIN|NAO INFORM|SEM INFORM|NAO IDENT|^-+$/.test(n)) return "";
  if (n.includes("FLEX") || (n.includes("ALCOOL") && n.includes("GASOLINA"))) return "Flex";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}
