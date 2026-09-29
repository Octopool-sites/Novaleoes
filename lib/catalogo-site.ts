// Catálogo público do site: tipos, carregamento dos arquivos estáticos em /catalogo/ e filtros.
// Os arquivos são gerados por scripts/catalogo/construir.mjs a partir da exportação do ERP.
// Mesma normalização de lib/commerce-contracts (sem import: os testes rodam este arquivo direto no Node).
export function normalizeSearch(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// Texto da busca, igual no índice e no que o cliente digita: sem acento, apóstrofo e hífen somem
// ("D´agua" = "dagua", "HR-V" = "hrv", "S-10" = "s10"), o resto da pontuação vira espaço.
export function textoBusca(s: string) {
  return normalizeSearch(s).replace(/['´`’‘"]/g, "").replace(/(\S)-(?=\S)/g, "$1").replace(/[/,;:()[\]{}+*!?|]+/g, " ").replace(/\s+/g, " ").trim();
}

const PALAVRAS_VAZIAS = new Set(["de", "da", "do", "das", "dos", "para", "pra", "pro", "com", "e", "o", "a", "os", "as", "em", "no", "na", "p"]);
// Abreviações do balcão e apelidos de montadora: o termo digitado vale por qualquer uma das formas.
// Siglas de duas letras substituem o termo (sozinhas casariam com qualquer palavra: "ts" está em "kits").
const SIGLAS: Record<string, string[]> = { dt: ["dianteir"], ts: ["traseir"], ld: ["direit"], le: ["esquerd"] };
const SINONIMOS: Record<string, string[]> = {
  diant: ["dianteir"], tras: ["traseir"], amort: ["amortecedor"], vw: ["volkswagen"], gm: ["chevrolet"], chevy: ["chevrolet"], mb: ["mercedes"],
};

// Singular e masculino: "pastilhas" acha "pastilha", "amortecedores" acha "amortecedor", "dianteira" acha "dianteiro".
export function raizBusca(t: string) {
  let r = t;
  if (r.length > 4 && (r.endsWith("oes") || r.endsWith("aes"))) r = `${r.slice(0, -3)}ao`;
  else if (r.length > 4 && r.endsWith("ois")) r = `${r.slice(0, -3)}ol`;
  else if (r.length > 4 && r.endsWith("eis")) r = `${r.slice(0, -3)}el`;
  else if (r.length > 4 && r.endsWith("ns")) r = `${r.slice(0, -2)}m`;
  else if (r.length > 5 && /[rzl]es$/.test(r)) r = r.slice(0, -2);
  else if (r.length >= 4 && r.endsWith("s") && !r.endsWith("ss") && !/\d/.test(r)) r = r.slice(0, -1);
  if (r.length >= 6 && /[ao]$/.test(r)) r = r.slice(0, -1);
  return r;
}

// Cada palavra da busca vira a lista de formas que valem por ela; a peça precisa ter todas as palavras.
export function termosDe(q: string): string[][] {
  return textoBusca(q).split(" ").filter((t) => t && !PALAVRAS_VAZIAS.has(t))
    .map((t) => SIGLAS[t] || [...new Set([raizBusca(t), ...(SINONIMOS[t] || [])])]);
}

// Óleo de motor e de câmbio vem em grupos pela viscosidade ("5W30", "20W50", "ATF"), sem a palavra "óleo".
const GRUPO_OLEO = /^(\d{1,2}w(\d{2})?|atf|sae|oleo.*)$/i;

export type Departamento = { id: string; nome: string; resumo: string; n: number; grupos: number[]; capa: string };
export type Meta = {
  versao: number; exportadoEm: string | null; geradoEm: string; empresa: string; total: number; comEstoque: number; comFoto: number;
  fotoBase: string; buckets: number; departamentos: Departamento[];
  grupos: [nome: string, departamentoIdx: number, n: number][];
  marcas: [nome: string, n: number][];
  montadoras: string[];
  modelos: [montadoraIdx: number, nome: string, n: number][];
  unidades: string[];
};
// [id, nome, marcaIdx, grupoIdx, precoCents, disponivel, foto, aplicacoes[modeloIdx, anoInicio, anoFim], externalId|0, unidadeIdx, qtdMinima]
// Posição 5 é 0/1 (tem/não tem); posição 11 = 1 quando a foto é ilustrativa (de outra peça do mesmo grupo).
export type LinhaIndice = [string, string, number, number, number, number, string, [number, number, number][], string | 0, number, number, number?];
// t: desenho técnico do fabricante, mostrado só no detalhe.
export type Detalhe = { d: string[]; h: string[]; a: [modeloIdx: number, versao: string, motor: string, anoInicio: number, anoFim: number, obs: string][]; t?: string };

export type Peca = {
  depOrdem: number; grupoN: number;
  id: string; nome: string; marca: string; grupo: string; grupoIdx: number; departamento: Departamento;
  precoCents: number; disponivel: number; foto: string; aplicacoes: [number, number, number][];
  externalId: string | null; unidade: string; quantidadeMinima: number; busca: string; fotoIlustrativa: boolean;
};

export type Catalogo = { meta: Meta; pecas: Peca[]; porId: Map<string, Peca>; porExternalId: Map<string, Peca> };

export type Filtro = {
  q: string; departamento: string; grupo: number; marca: number; montadora: number; modelo: number; ano: number;
  somenteEstoque: boolean; ordem: "relevancia" | "nome" | "menor-preco" | "maior-preco";
};

export const FILTRO_VAZIO: Filtro = { q: "", departamento: "", grupo: -1, marca: -1, montadora: -1, modelo: -1, ano: 0, somenteEstoque: false, ordem: "relevancia" };

export function urlFoto(meta: Meta, foto: string) {
  if (!foto) return "";
  return foto.startsWith("http") ? foto : meta.fotoBase + foto;
}

export function montarCatalogo(meta: Meta, linhas: LinhaIndice[]): Catalogo {
  const departamentoDoGrupo = meta.grupos.map((g) => meta.departamentos[g[1]]);
  // Texto de busca de marca, grupo e modelo calculado uma vez por item da lista, não uma vez por peça.
  const marcaBusca = meta.marcas.map((m) => textoBusca(m[0]));
  const grupoBusca = meta.grupos.map((g, i) => textoBusca(`${g[0]} ${departamentoDoGrupo[i]?.nome ?? ""}${GRUPO_OLEO.test(normalizeSearch(g[0])) ? " oleo lubrificante" : ""}`));
  const modeloBusca = meta.modelos.map((m) => textoBusca(`${meta.montadoras[m[0]]} ${m[1]}`));
  const pecas: Peca[] = linhas.map((l) => {
    const marca = l[2] >= 0 ? meta.marcas[l[2]][0] : "";
    const grupo = meta.grupos[l[3]][0];
    const departamento = departamentoDoGrupo[l[3]];
    const modelos = l[7].map(([m]) => modeloBusca[m]).join(" ");
    return {
      id: l[0], nome: l[1], marca, grupo, grupoIdx: l[3], departamento, precoCents: l[4], disponivel: l[5], foto: l[6], aplicacoes: l[7],
      externalId: l[8] || null, unidade: meta.unidades[l[9]] || "", quantidadeMinima: l[10] || 1, fotoIlustrativa: l[11] === 1,
      busca: `${textoBusca(l[1])} ${l[2] >= 0 ? marcaBusca[l[2]] : ""} ${grupoBusca[l[3]]} ${modelos}`,
      depOrdem: meta.departamentos.indexOf(departamento), grupoN: meta.grupos[l[3]][2],
    };
  });
  const porId = new Map(pecas.map((p) => [p.id, p]));
  const porExternalId = new Map(pecas.filter((p) => p.externalId).map((p) => [p.externalId!, p]));
  return { meta, pecas, porId, porExternalId };
}

let carregamento: Promise<Catalogo> | null = null;
// Prefixo "/" na Vercel ou a subpasta da prévia (VITE_BASE). Sem import para os testes rodarem no Node.
const BASE_CATALOGO = `${((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) ?? "/"}catalogo`;

export function carregarCatalogo(base = BASE_CATALOGO): Promise<Catalogo> {
  if (!carregamento) {
    carregamento = (async () => {
      const [meta, indice] = await Promise.all([
        fetch(`${base}/meta.json`).then((r) => { if (!r.ok) throw new Error("meta"); return r.json() as Promise<Meta>; }),
        fetch(`${base}/indice.json`).then((r) => { if (!r.ok) throw new Error("indice"); return r.json() as Promise<{ pecas: LinhaIndice[] }>; }),
      ]);
      return montarCatalogo(meta, indice.pecas);
    })().catch((e) => { carregamento = null; throw e; });
  }
  return carregamento;
}

export function bucketDe(id: string, buckets: number) {
  return parseInt(id.slice(0, 4), 36) % buckets;
}

const detalhesCache = new Map<number, Promise<Record<string, Detalhe>>>();
export async function carregarDetalhe(catalogo: Catalogo, id: string, base = BASE_CATALOGO): Promise<Detalhe | null> {
  const bucket = bucketDe(id, catalogo.meta.buckets);
  if (!detalhesCache.has(bucket)) {
    const pedido = fetch(`${base}/detalhes/${String(bucket).padStart(3, "0")}.json`).then((r) => {
      if (!r.ok) throw new Error("detalhe");
      return r.json() as Promise<Record<string, Detalhe>>;
    }).catch((e) => { detalhesCache.delete(bucket); throw e; });
    detalhesCache.set(bucket, pedido);
  }
  return (await detalhesCache.get(bucket)!)[id] ?? null;
}

export function aplicaAno(aplicacao: [number, number, number], ano: number) {
  const [, inicio, fim] = aplicacao;
  if (!ano) return true;
  if (inicio && ano < inicio) return false;
  if (fim && ano > fim) return false;
  return true;
}

export function filtrar(catalogo: Catalogo, filtro: Filtro): Peca[] {
  const termos = termosDe(filtro.q);
  const { meta } = catalogo;
  const modelosDaMontadora = filtro.montadora >= 0 ? new Set(meta.modelos.map((m, i) => (m[0] === filtro.montadora ? i : -1)).filter((i) => i >= 0)) : null;
  const resultado = catalogo.pecas.filter((p) => {
    if (filtro.somenteEstoque && p.disponivel <= 0) return false;
    if (filtro.departamento && p.departamento.id !== filtro.departamento) return false;
    if (filtro.grupo >= 0 && p.grupoIdx !== filtro.grupo) return false;
    if (filtro.marca >= 0 && p.marca !== meta.marcas[filtro.marca]?.[0]) return false;
    if (filtro.modelo >= 0) {
      if (!p.aplicacoes.some((a) => a[0] === filtro.modelo && aplicaAno(a, filtro.ano))) return false;
    } else if (modelosDaMontadora) {
      if (!p.aplicacoes.some((a) => modelosDaMontadora.has(a[0]) && aplicaAno(a, filtro.ano))) return false;
    } else if (filtro.ano) {
      if (!p.aplicacoes.some((a) => aplicaAno(a, filtro.ano))) return false;
    }
    if (termos.length && !termos.every((formas) => formas.some((t) => p.busca.includes(t)))) return false;
    return true;
  });
  return ordenar(resultado, filtro, termos);
}

function ordenar(pecas: Peca[], filtro: Filtro, termos: string[][]) {
  const nome = (a: Peca, b: Peca) => a.nome.localeCompare(b.nome, "pt-BR");
  if (filtro.ordem === "nome") return pecas.sort(nome);
  if (filtro.ordem === "menor-preco") return pecas.sort((a, b) => (a.precoCents || Infinity) - (b.precoCents || Infinity) || nome(a, b));
  if (filtro.ordem === "maior-preco") return pecas.sort((a, b) => b.precoCents - a.precoCents || nome(a, b));
  // Relevância: com foto e em estoque primeiro; busca pelo nome pesa mais que pela aplicação.
  const pontos = (p: Peca) => {
    let s = 0;
    if (p.disponivel > 0) s += 4;
    if (p.foto) s += 2;
    if (p.externalId) s += 3;
    if (termos.length) {
      const nomeNorm = textoBusca(p.nome);
      const noNome = (formas: string[]) => formas.some((t) => nomeNorm.includes(t));
      if (termos.every(noNome)) s += 6;
      else if (termos.some(noNome)) s += 2;
    }
    return s;
  };
  // Desempate: ordem dos departamentos (freios, suspensão, direção…), depois os grupos mais vendidos por volume de cadastro.
  return pecas.map((p) => [pontos(p), p] as const)
    .sort((a, b) => b[0] - a[0] || a[1].depOrdem - b[1].depOrdem || b[1].grupoN - a[1].grupoN || a[1].grupoIdx - b[1].grupoIdx || nome(a[1], b[1]))
    .map(([, p]) => p);
}

// Resumo curto das aplicações para o cartão: "Fiat Uno, Palio · 2001–2010" / "+3 veículos".
export function resumoAplicacoes(meta: Meta, peca: Peca, maximo = 2) {
  if (!peca.aplicacoes.length) return "";
  const porModelo = new Map<number, { inicio: number; fim: number }>();
  for (const [m, ai, af] of peca.aplicacoes) {
    const atual = porModelo.get(m);
    if (!atual) porModelo.set(m, { inicio: ai, fim: af });
    else { atual.inicio = atual.inicio && ai ? Math.min(atual.inicio, ai) : 0; atual.fim = atual.fim && af ? Math.max(atual.fim, af) : 0; }
  }
  const nomes = [...porModelo.keys()].slice(0, maximo).map((m) => `${meta.montadoras[meta.modelos[m][0]]} ${meta.modelos[m][1]}`);
  const restante = porModelo.size - nomes.length;
  return nomes.join(", ") + (restante > 0 ? ` +${restante}` : "");
}

export function faixaAnos(inicio: number, fim: number) {
  if (inicio && fim) return inicio === fim ? String(inicio) : `${inicio}–${fim}`;
  if (inicio) return `${inicio} em diante`;
  if (fim) return `até ${fim}`;
  return "";
}

// Ano de 2 dígitos do cadastro ("05", "16") para 4 dígitos; "..." = sem limite (0).
function anoCurto(texto: string) {
  if (!/^\d+$/.test(texto)) return 0;
  const n = Number(texto);
  if (texto.length === 4) return n;
  return n <= (new Date().getFullYear() % 100) + 1 ? 2000 + n : 1900 + n;
}

// A descrição do ERP mistura texto com a lista de aplicação ("Palio 1.4 8V FIRE - 05 / 13").
// Separa: o texto vai para a descrição; os veículos, para a tabela de aplicação.
const LINHA_VEICULO = /^(.+?)\s+-\s*(\d{2}|\d{4}|\.{2,})\s*\/\s*(\d{2}|\d{4}|\.{2,})\s*$/;
export type VeiculoDescrito = { nome: string; inicio: number; fim: number };
export function separarDescricao(linhas: string[]) {
  const texto: string[] = [];
  const veiculos: VeiculoDescrito[] = [];
  for (const linha of linhas) {
    const m = linha.trim().match(LINHA_VEICULO);
    if (m) veiculos.push({ nome: m[1].trim(), inicio: anoCurto(m[2]), fim: anoCurto(m[3]) });
    else if (linha.trim()) texto.push(linha.trim());
  }
  return { texto, veiculos };
}

export function anosDisponiveis(catalogo: Catalogo, modelo: number, montadora: number) {
  const anos = new Set<number>();
  // Anos até o atual: aplicação "em diante" não pode oferecer ano que ainda não existe.
  const atual = new Date().getFullYear();
  const minimo = 1960;
  for (const p of catalogo.pecas) for (const [m, ai, af] of p.aplicacoes) {
    if (modelo >= 0 ? m !== modelo : montadora >= 0 ? catalogo.meta.modelos[m][0] !== montadora : false) continue;
    const inicio = Math.max(minimo, ai || Math.max(minimo, (af || atual) - 15));
    const fim = Math.min(atual, af || Math.min(atual, inicio + 15));
    for (let a = inicio; a <= fim; a++) anos.add(a);
  }
  return [...anos].sort((a, b) => b - a);
}

// Estado do filtro na URL, para compartilhar uma busca ("?q=pastilha&dep=freios").
// Estado do filtro na URL, para compartilhar uma busca. Vai por NOME ("?montadora=Fiat&modelo=Uno"), não por
// posição interna: as posições mudam a cada exportação do catálogo e um link antigo apontaria para outro carro.
export const CHAVES_FILTRO = ["q", "dep", "grupo", "marca", "montadora", "modelo", "ano", "estoque", "ordem"];

export function filtroParaUrl(filtro: Filtro, meta?: Meta | null) {
  const p = new URLSearchParams();
  const nome = <T,>(lista: T[] | undefined, i: number, f: (x: T) => string) => (lista && i >= 0 && i < lista.length ? f(lista[i]) : "");
  if (filtro.q) p.set("q", filtro.q);
  if (filtro.departamento) p.set("dep", filtro.departamento);
  if (filtro.grupo >= 0 && meta) p.set("grupo", nome(meta.grupos, filtro.grupo, (g) => g[0]));
  if (filtro.marca >= 0 && meta) p.set("marca", nome(meta.marcas, filtro.marca, (m) => m[0]));
  if (filtro.montadora >= 0 && meta) p.set("montadora", nome(meta.montadoras, filtro.montadora, (m) => m));
  if (filtro.modelo >= 0 && meta) p.set("modelo", nome(meta.modelos, filtro.modelo, (m) => m[1]));
  if (filtro.ano) p.set("ano", String(filtro.ano));
  if (filtro.somenteEstoque) p.set("estoque", "1");
  if (filtro.ordem !== "relevancia") p.set("ordem", filtro.ordem);
  for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
  return p;
}

// Sem meta (catálogo ainda carregando) só lê o que não depende do catálogo; com meta, resolve os nomes e
// descarta o que não existe (link velho ou digitado errado não quebra a página).
export function filtroDaUrl(search: string, meta?: Meta | null): Filtro {
  const p = new URLSearchParams(search);
  const ordem = p.get("ordem");
  const anoTxt = Number(p.get("ano"));
  const norm = (x: string) => normalizeSearch(x);
  const achar = <T,>(chave: string, lista: T[] | undefined, f: (x: T) => string, aceita: (i: number) => boolean = () => true) => {
    const v = p.get(chave);
    if (!v || !lista) return -1;
    const alvo = norm(v);
    const i = lista.findIndex((x, idx) => norm(f(x)) === alvo && aceita(idx));
    return i;
  };
  const departamento = meta ? (meta.departamentos.some((d) => d.id === p.get("dep")) ? p.get("dep")! : "") : p.get("dep") || "";
  const montadora = achar("montadora", meta?.montadoras, (m) => m);
  const modelo = achar("modelo", meta?.modelos, (m) => m[1], (i) => montadora < 0 || meta!.modelos[i][0] === montadora);
  const depIdx = meta && departamento ? meta.departamentos.findIndex((d) => d.id === departamento) : -1;
  return {
    q: (p.get("q") || "").slice(0, 120), departamento,
    grupo: achar("grupo", meta?.grupos, (g) => g[0], (i) => depIdx < 0 || meta!.grupos[i][1] === depIdx),
    marca: achar("marca", meta?.marcas, (m) => m[0]),
    montadora: montadora >= 0 ? montadora : modelo >= 0 ? meta!.modelos[modelo][0] : -1, modelo,
    ano: Number.isInteger(anoTxt) && anoTxt >= 1950 && anoTxt <= new Date().getFullYear() + 1 ? anoTxt : 0,
    somenteEstoque: p.get("estoque") === "1",
    ordem: ordem === "nome" || ordem === "menor-preco" || ordem === "maior-preco" ? ordem : "relevancia",
  };
}

export const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
