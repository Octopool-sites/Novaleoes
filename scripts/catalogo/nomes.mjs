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
  // Abreviações do balcão que sobravam em lote (auditoria de 29/09/2026).
  COMPL: "Completo", MAQ: "Máquina", VD: "Vidro", EL: "Elétrica", ACO: "Aço", PINCA: "Pinça", ALAV: "Alavanca", AUT: "Automático",
  ABRA: "Abraçadeira", PLAST: "Plástico", BORB: "Borboleta", OSC: "Oscilante", LIMP: "Limpador", UNIV: "Universal", LAT: "Lateral",
  VED: "Vedação", CROM: "Cromado", TPA: "Tampa", FIX: "Fixação", VARAO: "Varão", FACAO: "Facão", SEL: "Seletor", ENG: "Engate",
  IG: "Ignição", PRE: "Pré", FEMEA: "Fêmea", PRT: "Preto", CZ: "Cinza", KT: "Kit", CJ: "Conjunto", TRANSM: "Transmissão",
  ACOP: "Acoplamento", HID: "Hidráulica", ACES: "Acessórios", PED: "Pedal", TANQ: "Tanque", RECL: "Reclinável", BCO: "Banco",
  MOLD: "Moldura", DIF: "Diferencial", JT: "Junta", ARV: "Árvore", MANIV: "Manivela", BORR: "Borracha", INTERM: "Intermediário",
  EXTE: "Externo", ESP: "Espelho", RETROV: "Retrovisor", LANT: "Lanterna", PQ: "Pequeno", PC: "Peças", RAP: "Rápido", REB: "Rebite",
  "PRE-FILTRO": "Pré-filtro",
};
// Dentro de "X/Y" só expandem as partes de lado e posição ("LE/LD", "DT/TS", "ESQ/DIR"); o resto pode ser
// apelido de modelo ("UNO/PRE" é Uno/Premio, não "Pré"). Em par com ESQ, DIR é o lado.
const PARTES_BARRA = { LD: "Lado Direito", LE: "Lado Esquerdo", DT: "Dianteiro", TS: "Traseiro", DIANT: "Dianteiro", TRAS: "Traseiro",
  INF: "Inferior", SUP: "Superior", ESQ: "Esquerdo", DIR: "Direito", ELET: "Elétrica", MEC: "Mecânica", INT: "Interno", EXT: "Externo",
  ESCAP: "Escapamento", SUSP: "Suspensão" };

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
  AUTOMATICA: "Automática", MEDIDOR: "Medidor", TERMOSTATICO: "Termostático", ALUMINIO: "Alumínio",
};

const MANTER_MAIUSCULO = new Set(["ABS", "TBI", "DH", "STD", "API", "GL4", "GL5", "GL-4", "GL-5", "ATF", "VW", "GM", "TDI", "TSI", "THP",
  "MPI", "GTI", "HDI", "EFI", "TPS", "MAP", "IAC", "EGR", "PCV", "LED", "H1", "H3", "H4", "H7", "H11", "HB3", "HB4", "USB", "XL",
  "MM", "ML", "CC", "KG", "PSI", "CH", "GT", "SW4", "CRV", "HRV", "WRV", "X1", "A3", "A4", "C3", "C4", "C5", "S10", "SUV", "RS", "TSA",
  "CHT", "AP", "EA111", "TDS", "GAS", "ALC", "FIRE", "EVO", "VHC", "SPE", "TBI", "MTE", "NGK", "SKF", "SAE",
  "TA", "TM", "MLS", "SB", "SL", "SN", "SP", "SQ", "PH", "GP", "II", "III"]);

const PALAVRAS_MINUSCULAS = new Set(["de", "do", "da", "dos", "das", "com", "sem", "para", "e", "em", "a", "o", "à", "ao", "no", "na", "por"]);

// Sufixo " / 766", " / 4150-B" etc.: referência de fabricante colada no nome pelo legado. "P/1MT" é medida e fica.
const SUFIXO_CODIGO = /\s*\/\s*(?![\d.,]+\s*(?:MM|MT|CM|ML|LT|KG|AH|W|V)\s*$|\d{1,2}\s*A\s*$|[\d.,]+\s+(?:M|L|G|A)\s*$)[A-Z]{0,3}\d[\w.\-]*\s*$/i;
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
// "Numero Original 46740344", "Mesmo que 0221587", "Comunizado 11306": equivalência de código escrita pelo balcão.
const PALAVRA_CODIGO = String.raw`(?:N[UÚ]MERO ORIGINAL|C[OÓ]D(?:IGO)?|REF(?:ER[EÊ]NCIA)?|ORIG(?:INAL)?|FABRICANTE|FABR|ATUAL|USAR|SUBST(?:ITUI)?|SIMILARES|SIMILAR|MESMO QUE|COMUNIZAD[OA]|OEM|EAN|SKU|VIGORITO|MERCADOCAR)`;
// Código = token com dígito ("GP30120", "03.066.72", "T-010037"), opcionalmente vários separados por / , ;
const TOKEN_CODIGO = String.raw`[A-Za-z0-9./\-]*\d[A-Za-z0-9./\-]*`;
// Até 3 palavras entre a palavra-chave e o código ("COD Fabricante:", "COD GM", "COD SIM Lubrificantes:").
const PONTE = String.raw`\.?\s*[:.\-]?\s*(?:[A-Za-zÀ-ú]+\s*[:.]?\s*){0,3}`;
const PAREN_CODIGO = new RegExp(String.raw`\(\s*\b${PALAVRA_CODIGO}\b[^)]*\)`, "gi");
const TRECHO_CODIGO = new RegExp(String.raw`[>(]*\s*\b${PALAVRA_CODIGO}\b${PONTE}${TOKEN_CODIGO}(?:\s*[/,;]\s*${TOKEN_CODIGO})*\s*[)<]*`, "gi");
// Código interno do legado ("Leoes 11302", "Leoes TEK04"): o número do produto no sistema antigo da loja.
const CODIGO_LEOES = String.raw`\bLE[OÕ]ES\s*[:#\-]?\s*(?=[A-Za-z0-9.\-]*\d)[A-Za-z0-9][\w.\-]*`;

// Unidade logo depois do número: é medida, não código ("1200MM", "65 MM", "60AH", "1000W").
const UNIDADE_FIM = String.raw`(?:MM|CM|MT|M|ML|L|LT|KM|W|V|A|AH|KG|G|RPM|MAH|BTU|PSI|CV|PC|PCS)`;
const FIM_TOKEN = String.raw`(?<!\d${UNIDADE_FIM})(?![\wÀ-ú])(?!\s*${UNIDADE_FIM}\b)`;
// Código "forte": letras com 3 dígitos seguidos ("VT-25377", "01135BR", "F000AL1032", "SP036"), 5 dígitos ou mais
// ("84115") ou número com ponto de milhar ("022.2230", "0833.0090.0549"). Ano ("2017"), pneu ("175/65R14") e
// família de motor ("EA111") não são código.
// O token não tem barra: "A/B" são dois códigos, e separador obrigatório evita retrocesso exponencial no regex.
const CODIGO_FORTE = String.raw`(?!(?:19|20)\d{2}\b)(?!\d{3}\/\d{2})(?!EA\d{3}\b)(?:(?=[A-Za-z0-9.\-]*[A-Za-z])(?=[A-Za-z0-9.\-]*\d{3})|(?=\d{5})|(?=\d+\.\d{3}))[A-Za-z0-9][A-Za-z0-9.\-]*${FIM_TOKEN}`;
// Número de catálogo depois do nome do distribuidor ou do fabricante, sem dois-pontos ("Dinpar 36036",
// "Metalsystem - M02021", "Skyll 104467", "JR Muniz G.1160", "Bosch F000AL1032", "Monroe SP036"). Basta ter 3 dígitos
// seguidos. Montadora fica de fora: "Peugeot 206" e "Fiat 147" são carros; "Weber 460" é o modelo do carburador.
const FORNECEDORES = String.raw`(?:DINPAR|COP ?BOR|FILLER|JAHU|(?:JR\.? )?MUNIZ|GRANPARTS|RENORTE|(?:MS )?METALSYSTEM|MERCADOCAR|VIGORITO|VILLA FRANCA|SKYLL|AXIOS|TARANTO|FLORIO|VOBER|NOTUS|SYL|DSC|MTE|GAUSS|VISCONDE|W[UÜ]RTH|OSRAM|PHILIPS|TRIKAUTOS|COBRA|DELPHI|COFAP|IKS|SABO|VALCLEI|VALEO|SKF|LUCAS|EXCELITE|MONROE|SACHS|SUPE[CÇ]AS|SWL|SAMPEL|VIBRASIL|BRANIL|JUNTALIMA|SPAAL|NEVESCAR|MML|FANIA|NORFLEX|HELLA|DYNA|RADNAQ|TALIFAMA|BARDAHL|MOBENSANI|SERPA|YMAX|VIPAL|INA|NAKATA|KITCIA|VIEMAR|URBA|MAHLE|METAL LEVE|TECFIL|WEGA|FRAM|MANN|NGK|FRAS-?LE|COBREQ|HIPPER|SCHADEK|AMORTEX|LUK|GATES|DAYCO|BOSCH|(?:MAGNETI )?MARELLI|CONTITECH|REGICAR|FTE)`;
const CODIGO_3 = String.raw`(?!(?:19|20)\d{2}\b)(?!\d{3}\/\d{2})(?=[A-Za-z0-9.\-]*\d{3})[A-Za-z0-9][A-Za-z0-9.\-]*${FIM_TOKEN}`;
// Código em blocos separados por espaço ("Bosch 0250 202 094") sai inteiro.
const FORNECEDOR_CODIGO = String.raw`\b${FORNECEDORES}\s*[:\-–]?\s*${CODIGO_3}(?:\s+\d{3,}${FIM_TOKEN})*(?:(?:\s*[\/,;]\s*|\s+E\s+)${CODIGO_3})*`;
// "Antigo 7019", "Antigo F110731", "Nº Antigo ZA310241": o código anterior da peça. "Astra Antigo", "Modelo Antigo"
// e "Antigo - .../12" ficam (sem 3 dígitos seguidos não é código).
const ANTIGO_CODIGO = String.raw`\bANTIGO\s*[:\-]?\s*${CODIGO_3}(?:\s*[\/,;]\s*${CODIGO_3})*`;
// Código solto entre parênteses na descrição ("( UB630 )", "( 5100073100 )", "( VKM12299H SKF )").
const PAREN_CODIGO_FORTE = String.raw`\(\s*${CODIGO_FORTE}(?:(?:\s*[\/,;]\s*|\s+)${CODIGO_FORTE})*(?:\s+[A-Za-z]{2,})?\s*\)`;
const FORNECEDOR_OU_ANTIGO = String.raw`(?:${FORNECEDOR_CODIGO}|${ANTIGO_CODIGO})`;
const PAREN_FORNECEDOR_RE = new RegExp(String.raw`\(\s*${FORNECEDOR_OU_ANTIGO}\s*\)`, "gi");
const FORNECEDOR_RE = new RegExp(FORNECEDOR_OU_ANTIGO, "gi");
const PAREN_CODIGO_FORTE_RE = new RegExp(PAREN_CODIGO_FORTE, "gi");

// "Rótulo: código" do fornecedor, da montadora ou do distribuidor ("Renault: 7700866518", "Gates: 40859X22XS",
// "Dinpar: 05433", "Antigo: XS6F12A648BA", "Similares: 5312713"). O rótulo é a sequência inteira de palavras antes
// dos dois-pontos; se alguma delas é de medida ou de ficha técnica ("Altura: 45 mm", "B - Espessura da Pista: 23",
// "Diâmetro do Furo Central: 60", "Motor: 1.0", "Garantia: 18 meses"), é dado da peça e fica.
const MEDIDA = String.raw`(?:ALT|DI[AÂ]M|ESPESS|SPESS|LARG|COMPR?|MEDID|DIMENS|DIM\b|EIXO|ALOJ|BASE\b|INT|EXT|ROSCA|FURO|PISTA|ATEN[CÇ]|GARANTIA|MOTOR|BLOCO|ANO\b|ANOS\b|TENS[AÃ]O|POT[EÊ]NCIA|POT\b|PESO|CAPAC|DENTE|ESTRIA|PASSO|CURSO|N[UÚ]MERO\s+D[EO]S?\b|CHEIO|M[EÉ]DIO|VAZIO|VOLUME|QUANT|QTD|TAMANHO|CILINDR|V[AÁ]LVULA|APLICA|OBS|TIPO\b|LADO|POSI[CÇ]|CONTE[UÚ]DO|EMBALAGEM|COR\b|VISCOS|NORMA|ESPECIFICA|API\b|SAE\b|TEMPERAT|PRESS|TORQUE|RAIO|[AÂ]NGULO|AMPER|VOLT|WATT|RPM|KM\b|OHM|RESIST|ABERTURA|VAZ[AÃ]O|LITRO|PE[CÇ]AS?\b|MODELO|VERS[AÃ]O|VE[IÍ]CULO|PINO|FIOS?\b|TERMINA|CONECTOR|SA[IÍ]DA|ENTRADA|BITOLA|CARGA|VELOCIDADE|ASSENTO|ESPIRA|ARO\b|FUROS)`;
const PALAVRA_ROTULO = String.raw`[A-Za-zÀ-ú][\wÀ-ú.&'\/\-]*`;
const ROTULO_CODIGO = String.raw`(?<![\wÀ-ú.&'\/\-])(?<![A-Za-zÀ-ú][\wÀ-ú.&'\/\-]*\s+)(?:(?!${MEDIDA})${PALAVRA_ROTULO}\s+)*(?!${MEDIDA})${PALAVRA_ROTULO}\s*:\s*[A-Za-z0-9][\w.\-\/]*\d`;
// Com código forte depois dos dois-pontos, qualquer rótulo vale, até o de ficha técnica: "Junta da Tampa: 75405",
// "Nº Permatex na Embalagem: 84115", "Motor AP: 01981BRGS", "16V BOSCH:1006209584". A sequência de palavras antes dos
// dois-pontos sai junto; quando ela começa depois de um número ("16V BOSCH:"), sai só a última palavra.
const ROTULO_FORTE = String.raw`(?<![\wÀ-ú.&'\/\-])(?<![A-Za-zÀ-ú][\wÀ-ú.&'\/\-]*\s+)(?:${PALAVRA_ROTULO}\s+)*${PALAVRA_ROTULO}\s*:\s*${CODIGO_FORTE}|(?<![\wÀ-ú.&'\/\-])${PALAVRA_ROTULO}\s*:\s*${CODIGO_FORTE}`;
const ROTULO_CODIGO_RE = new RegExp(String.raw`${ROTULO_CODIGO}|${ROTULO_FORTE}`, "i");

// "REF" colado no número ("05-99REF: 1035J") e "Refs:" também são referência.
const REF = String.raw`(?<![A-Za-zÀ-ú])REFS?\b`;
export const VAZAMENTO_CODIGO = new RegExp(String.raw`\bC[OÓ]D(?:IGO)?\b|${REF}|\bUSAR\s+C\/|\b${PALAVRA_CODIGO}\b${PONTE}${TOKEN_CODIGO}|${CODIGO_LEOES}|${ROTULO_CODIGO}|${ROTULO_FORTE}|${FORNECEDOR_CODIGO}|${ANTIGO_CODIGO}|${PAREN_CODIGO_FORTE}|\bVENDIDO POR\b|\bPROBLEMA NA VENDA\b|\bANTIGO CADASTRO\b`, "i");
// Em descrição, "COD ...", "REF ...", "Usar C/ ...", "Leoes 11302", "Mesmo que ...", "Dinpar 36036", "Antigo 7019" e
// "Rótulo: código" só têm código depois: corta até o fim da linha.
const CORTE_CODIGO = new RegExp(String.raw`\(?\s*(?:\bC[OÓ]D(?:IGO)?\b|${REF}|\bFABRICANTE\b|\bUSAR\s+C\/|\bN[UÚ]MERO ORIGINAL\b|\bMESMO QUE\b|\bCOMUNIZAD[OA]\b|${CODIGO_LEOES}|${FORNECEDOR_OU_ANTIGO}|\bANTIGO CADASTRO\b)[\s\S]*$`, "i");
export function cortarCodigos(texto) {
  const original = String(texto || "").replace(/\s+/g, " ").trim();
  let linha = original.replace(CORTE_CODIGO, "");
  const rotulo = linha.match(ROTULO_CODIGO_RE);
  if (rotulo) linha = linha.slice(0, rotulo.index);
  const cortou = linha.length < original.length;
  linha = removerCodigos(linha).replace(/[\/\-,;:(>\s]+$/, "").trim();
  if (!cortou) return linha;
  // Fim pendurado do corte ("Com Rolamento É o Axios 022.2266" → "Com Rolamento").
  for (let antes = ""; antes !== linha;) { antes = linha; linha = linha.replace(/\s+(?:é|e|o|a|os|as|de|do|da|ou|com|sem|para|que|se|usar|use|pode|tem|ser)$/i, "").replace(/[\/\-,;:(>\s]+$/, ""); }
  // Sobra curta ("FOI Comunizado / Alterado P 11306" → "FOI", "TEM 2 Modelos de Junta da Tampa: 75405" → "TEM 2") não diz nada.
  if ((!/\s/.test(linha) && linha.length <= 3) || linha.split(" ").every((t) => SOBRA_DE_CORTE.test(t))) return "";
  return linha;
}
const SOBRA_DE_CORTE = /^(?:tem|foi|usa|ver|pode|ser|que|é|e|o|a|os|as|de|do|da|no|na|se|ou|obs|\d+)$/i;

export function removerCodigos(texto) {
  return String(texto || "").replace(PAREN_CODIGO, " ").replace(TRECHO_CODIGO, " ").replace(new RegExp(CODIGO_LEOES, "gi"), " ")
    .replace(PAREN_FORNECEDOR_RE, " ").replace(FORNECEDOR_RE, " ").replace(PAREN_CODIGO_FORTE_RE, " ").replace(/\s+/g, " ").trim();
}

const CODIGO_PARENTESES = /\(\s*[A-Z]{0,2}\d[\w.\-\/]*(?:\s+[A-Z0-9][\w.\-\/]*){0,2}\s*\)/g;
// Em disco de freio, VENT = ventilado e SOL = sólido (fora disso VENT é ventoinha).
const CONTEXTO_DISCO = { VENT: "Ventilado", SOL: "Sólido" };

// Instrução de balcão e equivalência interna no nome ("Vender a SBC452", "( Não Vender )", "( Mesmo Que 0221587 )",
// ">> USAR12E <<", "( = 10056 )", "Comunizado P/ 8200575641"): nada disso é nome de peça.
const PAREN_INSTRUCAO = /\((?=[^)]*(?:\bVENDER\b|\bMESMO QUE\b|\bCOMUNIZ|\bSIMILAR\b|\bATEN[CÇ][AÃ]O\b|\bDIF[IÍ]CIL\b)|\s*=)[^)]*\)/gi;
const CAUDA_INSTRUCAO = /\b(?:N[AÃ]O\s+)?(?:VENDER|COMUNIZAD[OA])\b.*$/i;
const SETAS = />>.*?(?:<<|$)/g;
// Prefixo numérico do legado ("250 - Cilindro Mestre Freio") e número de catálogo depois da barra no meio do nome
// ("Pivô Inferior / 96050 ( LD )"). Medida com unidade ("Cabo Freio Mão 1270 / 1285 MM") fica.
const PREFIXO_NUMERO = /^\s*\d{2,6}\s*-\s+/;
const UNIDADE = String.raw`(?:MM|CM|MT|M|ML|L|LT|KM|W|V|A|AH|KG|G|RPM|MAH|BTU|PSI|CV)`;
const BARRA_NUMERO = new RegExp(String.raw`\s\/\s*\d{4,}(?:\s+\d{3,})*(?=\s|\)|$)(?!\s*${UNIDADE}\b)`, "gi");
// Token com 5 dígitos seguidos é código ("Faca Inox 689380", "Kit Amortecedor 04092-A", "Honda - 23160").
const TOKEN_NUMERO_LONGO = new RegExp(String.raw`(?:\s-)?(?:^|\s)[^\s]*\d{5,}[^\s]*(?=\s|$)(?!\s+${UNIDADE}\b)`, "gi");
const COM_UNIDADE = new RegExp(String.raw`\d${UNIDADE}\)?$`, "i");
const tirarNumeroLongo = (texto) => texto.replace(TOKEN_NUMERO_LONGO, (t) => (COM_UNIDADE.test(t) ? t : " "));

// Regras de contexto, antes de separar as palavras (o texto ainda está como o balcão digitou).
const CONTEXTO = [
  [/\bVALV(?:ULA)?\.?\s+TERM\b\.?/gi, "VALVULA TERMOSTATICA"], // VALV TERM = termostática, não "Válvula Terminal"
  [/\bMED\.?\s+(?:DE\s+)?COMB(?:USTIVEL)?\b/gi, "MEDIDOR COMB"],
  [/\bBAT\.?\s+POS\b/gi, "BATERIA POSITIVO"],
  [/\bPOS\.?\s+BORB\b/gi, "POSICAO BORBOLETA"],
  [/\bC\/C\b/gi, "COM CHAVE"], [/\bS\/C\b/gi, "SEM CHAVE"], [/\bC\/M\b/gi, "COM MOTOR"], [/\bS\/M\b/gi, "SEM MOTOR"],
  [/\bL[\/.]\s?E\b/gi, "LADO ESQUERDO"], [/\bL[\/.]\s?D\b/gi, "LADO DIREITO"],
  [/\bD\/E\b/gi, "DIREITO/ESQUERDO"], [/\bE\/D\b/gi, "ESQUERDO/DIREITO"],
  [/\s*-\s*E\s*$/i, " - LADO ESQUERDO"], [/\s*-\s*D\s*$/i, " - LADO DIREITO"], // "Uno-E", "Chevette - D"
  [/\bTRANSM?\.?\s+AUT\b\.?/gi, "TRANSMISSAO AUTOMATICA"],
  [/\bMAN\.?\s+VID\b/gi, "MANIVELA VIDRO"],
  [/\bNEG\b/gi, "NEGATIVO"],
  [/\b0?1\s+PC\b/gi, "1 PEÇA"],
];
// Em peça de porta, "4 PT", "2 PTS", "4 PTA" e "4P" são portas (fora disso "4P" é 4 pinos).
const CONTEXTO_PORTA = /\b(MAC|MACANETA|FECH|FECHADURA|MAQ|MAQUINA|VID|VD|PTA|PORTA|MOLD|CIL|BATENTE|BOTAO|TRINCO)\b/i;

function expandirToken(token, disco) {
  const [, antes, miolo, depois] = token.match(/^([("'«]*)(.*?)([)"'».,;:]*)$/);
  if (!miolo) return token;
  const chave = miolo.toUpperCase();
  if (disco && CONTEXTO_DISCO[chave]) return antes + CONTEXTO_DISCO[chave] + depois.replace(/[.,;]+$/, "");
  const expandido = ABREVIACOES[chave] ?? ABREVIACOES[(miolo + depois).toUpperCase()];
  if (expandido) return antes + expandido + depois.replace(/^[.,;]+|[.,;]+$/g, "");
  const partes = miolo.split("/");
  const expandir = (sub) => (partes.length > 1 && PARTES_BARRA[sub.toUpperCase()]) || capitalizar(sub);
  return antes + partes.map((sub) => (sub ? expandir(sub) : "")).join("/") + depois;
}

// Fim pendurado: preposição sem complemento ("Reb Repuxo Alumínio com") ou pontuação solta. "Anel O" não é preposição.
const FIM_PENDURADO = /\s+(?:com|sem|para|de|do|da|dos|das|e|em|no|na)$|[\s,;:(\-\/]+$/;

export function limparNome(nome) {
  let texto = String(nome || "").trim();
  // Aspas de CSV: "ALICATE PRESSAO 10"" CURVO" → ALICATE PRESSAO 10" CURVO.
  if (/^".*"$/.test(texto)) texto = texto.slice(1, -1).replace(/""/g, '"');
  texto = texto.replace(SETAS, " ").replace(PAREN_INSTRUCAO, " ").replace(CAUDA_INSTRUCAO, "").replace(/\s+ATEN[CÇ][AÃ]O\s*$/i, "");
  texto = removerCodigos(texto).replace(MARCADORES, " ").replace(CODIGO_PARENTESES, " ").replace(/\s+/g, " ").trim();
  texto = texto.replace(PREFIXO_NUMERO, "").replace(BARRA_NUMERO, " ").replace(/\s\d+,\s*$/, "").trim();
  texto = tirarNumeroLongo(texto.replace(SUFIXO_CODIGO, "")).trim();
  if (!texto) return "";
  // Palavras coladas por ponto ("RET.DA ARV.AUX.DA MANIV.E COMANDO"); "M.LENTA" e "1.6" não mudam.
  texto = texto.replace(/([A-Za-zÀ-ú]{2,})\.(?=[A-Za-zÀ-ú(])/g, "$1 ");
  for (const [regra, troca] of CONTEXTO) texto = texto.replace(regra, troca);
  if (CONTEXTO_PORTA.test(texto)) texto = texto.replace(/\b([2-5])\s*P(?:T[AS]?)?\b(?=[\s\/\-]|$)/gi, "$1 PORTAS");
  // "C/BUCHAS", "S/CIL", "P/ESPELHOS": a preposição abreviada colada na palavra seguinte.
  texto = texto.replace(/\b([CSP])\/(?=[A-Za-zÀ-ú]{2}|\d+[A-Za-z])/gi, "$1/ ");
  const disco = /^DISCO\b/i.test(texto);
  const partes = texto.split(/\s+/).map((token) => expandirToken(token, disco));
  let resultado = partes.join(" ").replace(/\s+/g, " ").replace(/\s\/\s/g, " / ").trim();
  // Primeira palavra sempre capitalizada, mesmo que seja preposição.
  resultado = resultado.charAt(0).toUpperCase() + resultado.slice(1);
  resultado = concordar(ladoDireito(resultado));
  // E solto no fim de peça de lado é o lado esquerdo ("Maçaneta Externa sem Chave Gol E"); nas outras, sobra de código.
  if (PECA_DE_LADO.test(resultado)) resultado = resultado.replace(/\se$/, " Lado Esquerdo");
  for (let antes = ""; antes !== resultado;) { antes = resultado; resultado = resultado.replace(FIM_PENDURADO, "").replace(SUFIXO_CODIGO, ""); }
  return fecharParenteses(resultado);
}

// Nome cortado pelo limite do campo no legado ("Bronzina de Mancal (0,25 Ext.e Flange 2,"): o parêntese aberto sai.
function fecharParenteses(nome) {
  let saldo = 0;
  for (const ch of nome) saldo += ch === "(" ? 1 : ch === ")" ? -1 : 0;
  let resultado = nome;
  while (saldo-- > 0) {
    const i = resultado.lastIndexOf("(");
    if (i < 0) break;
    resultado = (resultado.slice(0, i) + resultado.slice(i + 1).replace(/^\s+/, "")).replace(/\s+/g, " ").trim();
  }
  return resultado;
}

// DIR é "Direção" na peça de direção, mas é o lado ("Direito") em lanterna, farol, retrovisor, porta...
const PECA_DE_LADO = /(^|\s)(Lanterna|Farol|Farolete|Retrovisor|Retrov|Porta|Maçaneta|Vidro|Pisca|Paralama|Para-choque|Espelho|Moldura|Friso|Manivela|Fechadura|Máquina|Seta)(?=\s|$)/;
function ladoDireito(nome) {
  return PECA_DE_LADO.test(nome) ? nome.replace(/(^|\s)Direção(?=\s|$)/g, "$1Direito") : nome;
}

// Concordância: "Lanterna Traseiro" → "Lanterna Traseira", "Bandeja Completo Dianteiro" → "Bandeja Completa Dianteira".
// Só os adjetivos logo depois do nome feminino; "Pastilha Freio Dianteiro" (o freio é dianteiro) não muda.
const FEMININOS = /^(Lanterna|Maçaneta|Porta|Moldura|Grade|Tampa|Luz|Lente|Bandeja|Mola|Borracha|Manga|Ponteira|Manivela|Fechadura|Máquina|Palheta|Alavanca|Bomba|Válvula|Junta|Mangueira|Capa|Coifa|Polia|Correia|Barra|Bucha|Pinça)((?: (?:Traseiro|Dianteiro|Interno|Externo|Completo|Direito|Esquerdo|Cromado|Superior|Inferior))+)(?=\s|$)/;
const FEMININO = { Traseiro: "Traseira", Dianteiro: "Dianteira", Interno: "Interna", Externo: "Externa", Completo: "Completa", Direito: "Direita", Esquerdo: "Esquerda", Cromado: "Cromada" };
function concordar(nome) {
  return nome.replace(FEMININOS, (_, substantivo, adjetivos) => substantivo + adjetivos.replace(/\w+/g, (a) => FEMININO[a] ?? a));
}

export function limparGrupo(grupo) {
  const nome = limparNome(grupo);
  return nome || "Outras peças";
}

// Recado para o balcão ("Vender 5312702 OU 5312684", "Nakata com problema de fabricação. Vender Monroe SP036",
// "Vendido por Skyll", "Pode vender FCI1630 ou similares"): conversa interna, quase sempre com código de outra peça.
// A linha inteira sai; fica só o aviso de embalagem ("Não vender separadamente", "Vender sempre o par / kit").
// Código de peça solto que as regras com rótulo não pegam ("/ BB1092", "<< / 05801IOSS", "( GB 70937 )",
// "Radiex R-1922", "Osram 64210"): letras e 3+ dígitos juntos, dígitos seguidos de 2+ letras, ou número de 5+ dígitos.
// Ficam: medida (27MM, 104X170, 1300CC, 34CV, 450AH), motor (EA111, AP1600), carro e moto (L200, F-1000, K2500,
// C180, CG125, TITAN150) e ano com marca (97VW).
const TOKEN_PECA = /(?<![\w.\-])(?:[A-Z]{1,5}-?\d{3,}[A-Z0-9-]*|\d{2,}[A-Z]{2,}[A-Z0-9-]*|\d{3,}[A-Z]\d[A-Z0-9-]*|\d{5,}[A-Z0-9-]*|\d{3,}-[A-Z]{1,2})(?![\w.\-])/gi;
const TOKEN_LEGITIMO = /^(?:\d+(?:MM|CM|CC|CV|HP|AH|MAH|ML|KG|MT|LT|KM|RPM|BAR|PSI|W|V|A|L|G)|\d+X\d+[A-Z]{0,2}|(?:EA|AE|AP|EP|EC|EB|EF)-?\d{3,4}|F-?\d{2,4}|[ABCDGHKLMQRSTWX]\d{2,4}|(?:CG|FAN|TITAN|NXR|YBR|CB|CBX|XRE|XR|NX|BIZ|POP|PCX|TWISTER|FAZER|FACTOR|BROS|CRYPTON|LEAD|GX|BR|ECO)-?\d{2,3}|\d{2,4}VW)$/i;
const NUMERO_LONGO = /(?<![\d,])\d{5,}(?:\/\d{2,})*(?!\d|,\d{1,2}\b|\s*(?:MM|CM|KM|ML|RPM)\b)/gi;
export function temCodigoDePeca(texto) {
  const t = String(texto || "");
  for (const m of t.matchAll(TOKEN_PECA)) if (!TOKEN_LEGITIMO.test(m[0])) return true;
  return new RegExp(NUMERO_LONGO.source, "i").test(t);
}
export function removerCodigosDePeca(texto) {
  // Duas passadas: tirar um código pode deixar outro solto ("NºFORD327/96283/2" → "FORD327" → "").
  let t = String(texto || "");
  for (let i = 0; i < 2; i++) t = t.replace(NUMERO_LONGO, " ").replace(TOKEN_PECA, (x) => (TOKEN_LEGITIMO.test(x) ? x : " "));
  return t
    .replace(/\(\s*(?:[A-Za-z]{1,3}\s*){0,2}[\/\-,;\s]*\)/g, " ") // parênteses vazios ou só com sigla
    .replace(/(?:\s*\/\s*){2,}/g, " / ")
    .replace(/\s+([.,;:])(?=\s|$)/g, "$1")
    .replace(/\.{2}(?!\.)/g, ".")
    .replace(/\bN[º°]\.?\s*(?=$|[\/,;)])/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s\/\-,;:·]+|[\s\/\-,;:·(]+$/g, "")
    .trim();
}
// Recado da equipe para a equipe ("Pedir Foto", "Solicitar Amostra", "Confirma se a bucha é de ferro"): não é do cliente.
const NOTA_INTERNA = /\bPEDIR (?:FOTO|AMOSTRA)\b|\bSOLICI?T?AR AMOSTRA\b|\bCONFIRMAR SEMPRE\b|\bCONFIRMA(?:R)? SE\b|\bA CONFIRMAR\b|\bVERIFICAR\b|\bPERGUNTAR\b|\bCONSULTAR (?:O )?ESTOQUE\b/i;
// Setas do balcão (">> Transmissão Manual", "Farol << Lâmpada", "Parcial --->", "1991>1996"): viram separador.
function trocarSetas(linha) {
  return linha
    .replace(/(\d)\s*>\s*(\d)/g, "$1 a $2")
    .replace(/\s*(?:-+>|<-+|>+|<+)\s*/g, " · ")
    .replace(/(?:\s*·\s*){2,}/g, " · ")
    .replace(/\s*·\s*(?=[\/,;)])|(?<=[\/,;(])\s*·\s*/g, " ")
    .replace(/^[\s·]+|[\s·]+$/g, "")
    .trim();
}
function arrumarAspas(linha) {
  const l = linha.replace(/"{2,}/g, '"');
  return (l.match(/"/g) || []).length % 2 ? l.replace(/"/g, "") : l;
}
const FORNECEDOR_DA_LOJA = /\s*\bFORN(?:E[CS]\w*)?\b\s*[:.\-]?.*$/i;
const RECADO_BALCAO = /\bVENDER\b|\bVENDIDO POR\b|\bPROBLEMA NA VENDA\b|\bANTIGO CADASTRO\b/i;
const AVISO_EMBALAGEM = /\bN[AÃ]O VENDER SEPARADAMENTE\b|\bVENDER SEMPRE O (?:PAR|KIT|JOGO)\b/i;
const CODIGO_3_RE = new RegExp(CODIGO_3, "i");

// Descrição do legado: linhas com veículos, marcadores "> ... <" (observações) e "*".
// Devolve linhas simples e destaques; remove linhas vazias, pontos soltos e códigos isolados.
export function limparDescricao(descricao) {
  const linhas = [];
  const destaques = [];
  const vistos = new Set();
  for (const bruta of String(descricao || "").split(/\r?\n/)) {
    let linha = bruta.replace(MARCADORES, " ").replace(/\s+/g, " ").trim();
    // "CÓDIGOS DE REFERÊNCIA:" abre a lista de códigos de fabricante e distribuidor: dali para baixo nada vai ao site.
    if (/^[>(*\s]*C[OÓ]DIGOS? (DE )?REFER/i.test(linha)) break;
    if (!linha || /^[.\-–_*]+$/.test(linha)) continue;
    if ((RECADO_BALCAO.test(linha) && !AVISO_EMBALAGEM.test(linha)) || (/\bSIMILAR/i.test(linha) && CODIGO_3_RE.test(linha)) || NOTA_INTERNA.test(linha)) continue;
    const destaque = linha.match(/^>+\s*(.+?)\s*<+$/);
    if (destaque) linha = destaque[1];
    linha = cortarCodigos(linha).replace(/^[>\s]+|[<\s]+$/g, "").replace(/[\/\-,;:\s]+$/, "");
    linha = arrumarAspas(removerCodigosDePeca(trocarSetas(linha.replace(FORNECEDOR_DA_LOJA, ""))));
    // Linha só de códigos ("64151H3STD", "1174-49 / NV-200"): toda palavra tem dígito ou é sigla de até 2 letras.
    if (linha.split(/\s+/).every((t) => /\d/.test(t) || t.replace(/[^A-Za-zÀ-ú]/g, "").length <= 2)) continue;
    linha = linha.replace(MARCADORES, " ").replace(/\s+/g, " ").replace(/^["']+|["']+$/g, "").trim();
    if (!linha) continue;
    // Linha que é só um código/referência (sem letras suficientes): não exibir.
    if (!/[A-Za-zÀ-ú]{3}/.test(linha)) continue;
    linha = titularLinha(linha).replace(/^[\s·]+|[\s·]+$/g, "");
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
