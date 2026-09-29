// Limpeza dos nomes e descrições do catálogo legado (ERP) para exibição pública.
// Regras: expandir abreviações do balcão, restaurar acentos, capitalizar como título,
// remover códigos internos/fabricante do fim do nome. Nunca inventa dado: só reescreve.

const ABREVIACOES = {
  AMORT: "Amortecedor", AMORTEC: "Amortecedor", DT: "Dianteiro", DIANT: "Dianteiro", TS: "Traseiro", TRAS: "Traseiro",
  LD: "Lado Direito", LE: "Lado Esquerdo", ESQ: "Esquerdo", DIR: "Direção", MANG: "Mangueira", VALV: "Válvula",
  PAST: "Pastilha", ROL: "Rolamento", ROLAM: "Rolamento", TERM: "Terminal", INF: "Inferior", SUP: "Superior",
  CPL: "Completo", CIL: "Cilindro", RET: "Retentor", COMB: "Combustível", SUSP: "Suspensão", DENT: "Dentada",
  HOMO: "Homocinética", HOMOC: "Homocinética", RAD: "Radiador", EMBR: "Embreagem", BAND: "Bandeja", ESTAB: "Estabilizadora",
  BRONZ: "Bronzina", RESERV: "Reservatório", STD: "Standard", VENT: "Ventoinha", VENTUINHA: "Ventoinha", ALT: "Alternador",
  ADM: "Admissão", VIRA: "Virabrequim", EXT: "Externo", HIDR: "Hidráulica", JG: "Jogo", "JG.": "Jogo", "JG.DE": "Jogo de",
  BBA: "Bomba", INT: "Interno", CX: "Caixa", ELETR: "Elétrica", INJ: "Injeção", ACD: "Ar-condicionado", PARAF: "Parafuso",
  MAC: "Maçaneta", ESCAP: "Escapamento", TRAMB: "Trambulador", TEMP: "Temperatura", MEC: "Mecânica", VID: "Vidro",
  ACEL: "Acelerador", PTA: "Porta", TERMO: "Termostática", CAPO: "Capô", FECH: "Fechadura", LAMP: "Lâmpada", REG: "Regulador",
  REFRIG: "Refrigeração", DISTR: "Distribuidor", ABERT: "Abertura", MOT: "Motor", ESC: "Escapamento", DESL: "Deslizante",
  VELOC: "Velocímetro", CARB: "Carburador", ARREF: "Arrefecimento", PRES: "Pressão", REGUL: "Regulador", "M.LENTA": "Marcha Lenta",
  AUX: "Auxiliar", PROT: "Protetor", ELET: "Elétrica", HALOG: "Halógena", INTERR: "Interruptor", CONJ: "Conjunto", CEB: "Cebolinha",
  RESP: "Respiro", ORIG: "Original", AQUEC: "Aquecedor", GDE: "Grande", PEQ: "Pequeno", MED: "Médio", RECOND: "Recondicionado", ALUM: "Alumínio",
  "4F": "4 furos", "5F": "5 furos", "3P": "3 pinos", "2P": "2 pinos", "4P": "4 pinos",
  C: "com", "C/": "com", S: "sem", "S/": "sem", P: "para", "P/": "para", D: "Direito", E: "e",
};

const ACENTOS = {
  OLEO: "Óleo", CAMBIO: "Câmbio", SUSPENSAO: "Suspensão", DIRECAO: "Direção", IGNICAO: "Ignição", HOMOCINETICA: "Homocinética",
  MECANICA: "Mecânica", VALVULA: "Válvula", VALVULAS: "Válvulas", HIDRAULICA: "Hidráulica", HIDRAULICO: "Hidráulico", CARTER: "Cárter",
  PISTAO: "Pistão", BRACO: "Braço", CARCACA: "Carcaça", LAMPADA: "Lâmpada", ELETRICA: "Elétrica", ELETRICO: "Elétrico",
  TERMOSTATICA: "Termostática", PIVO: "Pivô", SAIDA: "Saída", VACUO: "Vácuo", NIVEL: "Nível", PRESSAO: "Pressão",
  COMBUSTIVEL: "Combustível", ANEIS: "Anéis", CABECOTE: "Cabeçote", INJECAO: "Injeção", ADMISSAO: "Admissão", MAO: "Mão",
  REFRIGERACAO: "Refrigeração", CONEXAO: "Conexão", DAGUA: "d'Água", AGUA: "Água", MACANETA: "Maçaneta", PARABRISA: "Para-brisa",
  CALCO: "Calço", "CALÇO": "Calço", PLASTICO: "Plástico", PROTECAO: "Proteção", VELOCIMETRO: "Velocímetro", DISTRIBUICAO: "Distribuição",
  TORCAO: "Torção", SOLUCAO: "Solução", BUJAO: "Bujão", "BUJÃO": "Bujão", ORING: "O-ring", ANTICHAMA: "Antichama", TAMPAO: "Tampão",
  HELICE: "Hélice", DESCARBONIZANTE: "Descarbonizante", DESCABONIZANTE: "Descarbonizante", INJETOR: "Injetor", ARRANQUE: "Arranque",
  ESTABILIZADORA: "Estabilizadora", TRANSMISSAO: "Transmissão", CATALISADOR: "Catalisador", SILENCIOSO: "Silencioso",
  PARACHOQUE: "Para-choque", "PARA-CHOQUE": "Para-choque", FAROL: "Farol", LANTERNA: "Lanterna", PISCA: "Pisca", BOTAO: "Botão",
  GAXETA: "Gaxeta", TRIZETA: "Trizeta", TRISETA: "Trizeta", TULIPA: "Tulipa", BUCHA: "Bucha", RETENTOR: "Retentor", PRISIONEIRO: "Prisioneiro",
  ABRACADEIRA: "Abraçadeira", MANGUEIRA: "Mangueira", CALOTA: "Calota", PNEU: "Pneu", SENSOR: "Sensor", RELE: "Relé", FUSIVEL: "Fusível",
  CONECTOR: "Conector", CHICOTE: "Chicote", COXIM: "Coxim", BATENTE: "Batente", BIELETA: "Bieleta", BANDEJA: "Bandeja",
  AMORTECEDOR: "Amortecedor", FILTRO: "Filtro", CORREIA: "Correia", POLIA: "Polia", TENSOR: "Tensor", JUNTA: "Junta", FLANGE: "Flange",
  MOLA: "Mola", CUBO: "Cubo", RODA: "Roda", DISCO: "Disco", TAMBOR: "Tambor", SAPATA: "Sapata", LONA: "Lona", FLEXIVEL: "Flexível",
  CEBOLINHA: "Cebolinha", CEBOLAO: "Cebolão", BOIA: "Boia", GICLEUR: "Giclê", TUCHO: "Tucho", BALANCIM: "Balancim", VARETA: "Vareta",
  PESCADOR: "Pescador", PORCA: "Porca", ARRUELA: "Arruela", CUPILHA: "Cupilha", ESTOPA: "Estopa", ALGODAO: "Algodão", QUEROSENE: "Querosene",
  AROMATIZANTE: "Aromatizante", SEMI: "Semi", SINTETICO: "Sintético", SEMISSINTETICO: "Semissintético", MINERAL: "Mineral", LITRO: "Litro",
  UNIVERSAL: "Universal", ORIGINAL: "Original", GENUINO: "Genuíno", GENUINA: "Genuína", PROTETOR: "Protetor", VEDACAO: "Vedação",
  ROTACAO: "Rotação", POSICAO: "Posição", DETONACAO: "Detonação", TEMPERATURA: "Temperatura", VELOCIDADE: "Velocidade", FASE: "Fase",
  BORBOLETA: "Borboleta", CANISTER: "Canister", RESERVATORIO: "Reservatório", VENTILADOR: "Ventilador", CONDENSADOR: "Condensador",
  COMPRESSOR: "Compressor", EVAPORADOR: "Evaporador", ESCOVA: "Escova", ESCOVAS: "Escovas", INDUZIDO: "Induzido", RELACAO: "Relação",
  ALAVANCA: "Alavanca", TRAMBULADOR: "Trambulador", HASTE: "Haste", SUPORTE: "Suporte", ENGRENAGEM: "Engrenagem", PINHAO: "Pinhão",
  CRUZETA: "Cruzeta", CARDAN: "Cardã", DIAFRAGMA: "Diafragma", COIFA: "Coifa", MOTOR: "Motor", FREIO: "Freio", RETIFICACAO: "Retificação",
  EMBREAGEM: "Embreagem", RADIADOR: "Radiador", ESCAPAMENTO: "Escapamento", ARREFECIMENTO: "Arrefecimento", ACESSORIO: "Acessório",
  ACESSORIOS: "Acessórios", LUBRIFICANTES: "Lubrificantes", LUBRIFICANTE: "Lubrificante", ADITIVO: "Aditivo", FLUIDO: "Fluido",
  SINCRONIZADOR: "Sincronizador", MARCHA: "Marcha", LENTA: "Lenta", VELA: "Vela", VELAS: "Velas", BOBINA: "Bobina", SONDA: "Sonda",
  CANETA: "Caneta", PINOS: "Pinos", VEICULO: "Veículo", VEICULOS: "Veículos", GASOLINA: "Gasolina", ALCOOL: "Álcool", FLEX: "Flex",
  DIESEL: "Diesel", AUTOMATICO: "Automático", AUTOMATIVO: "Automático", MANUAL: "Manual", EXCETO: "Exceto", TODOS: "Todos", INCLUSIVE: "Inclusive",
  PARTIR: "Partir", ANO: "Ano", ATE: "Até", ATÉ: "Até", MOTORES: "Motores", TURBO: "Turbo", ASPIRADO: "Aspirado",
};

const MANTER_MAIUSCULO = new Set(["ABS", "TBI", "DH", "STD", "API", "GL4", "GL5", "GL-4", "GL-5", "ATF", "VW", "GM", "TDI", "TSI", "THP",
  "MPI", "GTI", "HDI", "EFI", "TPS", "MAP", "IAC", "EGR", "PCV", "LED", "H1", "H3", "H4", "H7", "H11", "HB3", "HB4", "USB", "XL",
  "MM", "ML", "CC", "KG", "PSI", "CH", "GT", "SW4", "CRV", "HRV", "WRV", "X1", "A3", "A4", "C3", "C4", "C5", "S10", "SUV", "RS", "TSA",
  "CHT", "AP", "EA111", "TDS", "GAS", "ALC", "FIRE", "EVO", "VHC", "SPE", "TBI", "MTE", "NGK", "SKF", "SAE"]);

const PALAVRAS_MINUSCULAS = new Set(["de", "do", "da", "dos", "das", "com", "sem", "para", "e", "em", "a", "o", "à", "ao", "no", "na", "por"]);

// Sufixo " / 766", " / 4150-B" etc.: referência de fabricante colada no nome pelo legado.
const SUFIXO_CODIGO = /\s*\/\s*[A-Z]{0,3}\d[\w.\-]*\s*$/;
// Marcadores decorativos do balcão ("*", "**", "( * )").
const MARCADORES = /\(\s*\*+\s*\)|\*+/g;

function capitalizar(token) {
  const chave = token.toUpperCase();
  if (ACENTOS[chave]) return ACENTOS[chave];
  if (MANTER_MAIUSCULO.has(chave)) return chave;
  if (/\d/.test(token)) return chave; // "1.6", "8V", "12V", "60/55W", "0,50"
  const baixo = token.toLowerCase();
  if (PALAVRAS_MINUSCULAS.has(baixo)) return baixo;
  if (baixo.length <= 2 && !/[aeiouáéíóú]/i.test(baixo)) return chave; // siglas curtas sem vogal (ex.: "GB")
  return baixo.charAt(0).toUpperCase() + baixo.slice(1);
}

// Código de fabricante entre parênteses no nome: "( 31 )", "(4213)", "( 680037 )".
// Referências de código escritas no texto pelo balcão: "( Usar GP30120 )", "Atual T-010037", "COD Fabricante: 000330019",
// "Orig 7.086.502", "( REF: 5984837 )", "( COD SKY )". Nunca vão ao site (regra: sem código interno nem de fabricante).
const PALAVRA_CODIGO = String.raw`(?:C[OÓ]D(?:IGO)?|REF(?:ER[EÊ]NCIA)?|ORIG(?:INAL)?|FABRICANTE|ATUAL|USAR|SUBST(?:ITUI)?|SIMILAR|OEM|EAN|SKU)`;
// Código = token com dígito ("GP30120", "03.066.72", "T-010037"), opcionalmente vários separados por / , ;
const TOKEN_CODIGO = String.raw`[A-Za-z0-9./\-]*\d[A-Za-z0-9./\-]*`;
// Até 3 palavras entre a palavra-chave e o código ("COD Fabricante:", "COD GM", "COD SIM Lubrificantes:").
const PONTE = String.raw`\.?\s*[:.\-]?\s*(?:[A-Za-zÀ-ú]+\s*[:.]?\s*){0,3}`;
const PAREN_CODIGO = new RegExp(String.raw`\(\s*\b${PALAVRA_CODIGO}\b[^)]*\)`, "gi");
const TRECHO_CODIGO = new RegExp(String.raw`[>(]*\s*\b${PALAVRA_CODIGO}\b${PONTE}${TOKEN_CODIGO}(?:\s*[/,;]\s*${TOKEN_CODIGO})*\s*[)<]*`, "gi");
export const VAZAMENTO_CODIGO = new RegExp(String.raw`\b(?:C[OÓ]D(?:IGO)?|REF)\b|\bUSAR\s+C\/|\b${PALAVRA_CODIGO}\b${PONTE}${TOKEN_CODIGO}`, "i");
// Em descrição, "COD ...", "REF ..." e "Usar C/ ..." só têm código depois: corta até o fim da linha.
const CORTE_CODIGO = /\(?\s*(?:\bC[OÓ]D(?:IGO)?\b|\bREF\b|\bFABRICANTE\b|\bUSAR\s+C\/)[\s\S]*$/i;
export function cortarCodigos(texto) {
  return removerCodigos(String(texto || "").replace(CORTE_CODIGO, "")).replace(/[\/\-,;:(\s]+$/, "").trim();
}

export function removerCodigos(texto) {
  return String(texto || "").replace(PAREN_CODIGO, " ").replace(TRECHO_CODIGO, " ").replace(/\s+/g, " ").trim();
}

const CODIGO_PARENTESES = /\(\s*[A-Z]{0,2}\d[\w.\-\/]*(?:\s+[A-Z0-9][\w.\-\/]*){0,2}\s*\)/g;
// Em disco de freio, VENT = ventilado e SOL = sólido (fora disso VENT é ventoinha).
const CONTEXTO_DISCO = { VENT: "Ventilado", SOL: "Sólido" };

export function limparNome(nome) {
  let texto = removerCodigos(nome).replace(MARCADORES, " ").replace(CODIGO_PARENTESES, " ").replace(/\s+/g, " ").trim();
  texto = texto.replace(SUFIXO_CODIGO, "").trim();
  if (!texto) return "";
  const disco = /^DISCO\b/i.test(texto);
  const partes = texto.split(/\s+/).map((token) => {
    const chave = token.toUpperCase().replace(/[.,;]+$/, "");
    if (disco && CONTEXTO_DISCO[chave]) return CONTEXTO_DISCO[chave];
    const expandido = ABREVIACOES[chave] ?? ABREVIACOES[token.toUpperCase()];
    if (expandido) return expandido;
    return token.split("/").map((sub) => (sub ? capitalizar(sub) : "")).join("/");
  });
  let resultado = partes.join(" ").replace(/\s+/g, " ").replace(/\s\/\s/g, " / ").trim();
  // Primeira palavra sempre capitalizada, mesmo que seja preposição.
  resultado = resultado.charAt(0).toUpperCase() + resultado.slice(1);
  return concordar(ladoDireito(resultado));
}

// DIR é "Direção" na peça de direção, mas é o lado ("Direito") em lanterna, farol, retrovisor, porta...
const PECA_DE_LADO = /(^|\s)(Lanterna|Farol|Farolete|Retrovisor|Retrov|Porta|Maçaneta|Vidro|Pisca|Paralama|Para-choque|Espelho|Moldura|Friso|Manivela|Fechadura|Máquina|Seta)(?=\s|$)/;
function ladoDireito(nome) {
  return PECA_DE_LADO.test(nome) ? nome.replace(/(^|\s)Direção(?=\s|$)/g, "$1Direito") : nome;
}

// Concordância: "Lanterna Traseiro" → "Lanterna Traseira", "Bandeja Completo Dianteiro" → "Bandeja Completa Dianteira".
// Só os adjetivos logo depois do nome feminino; "Pastilha Freio Dianteiro" (o freio é dianteiro) não muda.
const FEMININOS = /^(Lanterna|Maçaneta|Porta|Moldura|Grade|Tampa|Luz|Lente|Bandeja|Mola|Borracha|Manga|Ponteira|Manivela|Fechadura|Máquina|Palheta|Alavanca)((?: (?:Traseiro|Dianteiro|Interno|Externo|Completo|Direito|Esquerdo|Cromado|Superior|Inferior))+)(?=\s|$)/;
const FEMININO = { Traseiro: "Traseira", Dianteiro: "Dianteira", Interno: "Interna", Externo: "Externa", Completo: "Completa", Direito: "Direita", Esquerdo: "Esquerda", Cromado: "Cromada" };
function concordar(nome) {
  return nome.replace(FEMININOS, (_, substantivo, adjetivos) => substantivo + adjetivos.replace(/\w+/g, (a) => FEMININO[a] ?? a));
}

export function limparGrupo(grupo) {
  const nome = limparNome(grupo);
  return nome || "Outras peças";
}

// Descrição do legado: linhas com veículos, marcadores "> ... <" (observações) e "*".
// Devolve linhas simples e destaques; remove linhas vazias, pontos soltos e códigos isolados.
export function limparDescricao(descricao) {
  const linhas = [];
  const destaques = [];
  const vistos = new Set();
  for (const bruta of String(descricao || "").split(/\r?\n/)) {
    let linha = bruta.replace(/\s+/g, " ").trim();
    if (!linha || /^[.\-–_*]+$/.test(linha)) continue;
    const destaque = linha.match(/^>+\s*(.+?)\s*<+$/);
    if (destaque) linha = destaque[1];
    linha = cortarCodigos(linha).replace(/^[>\s]+|[<\s]+$/g, "").replace(/[\/\-,;:\s]+$/, "");
    // Linha só de códigos ("64151H3STD", "1174-49 / NV-200"): toda palavra tem dígito ou é sigla de até 2 letras.
    if (linha.split(/\s+/).every((t) => /\d/.test(t) || t.replace(/[^A-Za-zÀ-ú]/g, "").length <= 2)) continue;
    linha = linha.replace(MARCADORES, " ").replace(/\s+/g, " ").replace(/^["']+|["']+$/g, "").trim();
    if (!linha) continue;
    // Linha que é só um código/referência (sem letras suficientes): não exibir.
    if (!/[A-Za-zÀ-ú]{3}/.test(linha)) continue;
    linha = titularLinha(linha);
    linha = linha.charAt(0).toUpperCase() + linha.slice(1);
    const chave = linha.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    (destaque ? destaques : linhas).push(linha);
  }
  return { linhas, destaques };
}

function titularLinha(linha) {
  // Descrições vêm em caixa alta. Corrige caixa e acentos conhecidos, sem expandir abreviações
  // (o texto livre é do lojista).
  return linha.split(" ").map((token) => {
    const limpo = token.replace(/[^\wÀ-ú.\-\/,']/g, "");
    if (!limpo) return token;
    const chave = limpo.toUpperCase();
    if (ACENTOS[chave]) return token.replace(limpo, ACENTOS[chave]);
    if (MANTER_MAIUSCULO.has(chave) || /\d/.test(limpo)) return token;
    const baixo = limpo.toLowerCase();
    if (PALAVRAS_MINUSCULAS.has(baixo)) return token.replace(limpo, baixo);
    if (limpo.length <= 3) return token; // siglas de modelo (GOL, UNO, KA) ficam como estão
    return token.replace(limpo, baixo.charAt(0).toUpperCase() + baixo.slice(1));
  }).join(" ");
}

export function unidadeLegivel(unidade, quantidadeMinima) {
  const u = String(unidade || "").toUpperCase();
  const q = Number(quantidadeMinima) || 1;
  const nomes = { JG: "Jogo", KT: "Kit", KI: "Kit", CJ: "Conjunto", LT: "Litro", ML: "Mililitro", KG: "Quilo", MT: "Metro", M: "Metro", CX: "Caixa", GL: "Galão", PA: "Par", PR: "Par" };
  return [nomes[u] || "", q > 1 ? `venda mínima de ${q}` : ""].filter(Boolean).join(" · ");
}
