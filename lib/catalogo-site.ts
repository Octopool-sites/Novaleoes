// Catálogo público do site: tipos, carregamento dos arquivos estáticos em /catalogo/ e filtros.
// Os arquivos são gerados por scripts/catalogo/construir.mjs a partir da exportação do ERP.
// Mesma normalização de lib/commerce-contracts (sem import: os testes rodam este arquivo direto no Node).
export function normalizeSearch(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

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
export type LinhaIndice = [string, string, number, number, number, number, string, [number, number, number][], string | 0, number, number];
export type Detalhe = { d: string[]; h: string[]; a: [modeloIdx: number, versao: string, motor: string, anoInicio: number, anoFim: number, obs: string][] };

export type Peca = {
  depOrdem: number; grupoN: number;
  id: string; nome: string; marca: string; grupo: string; grupoIdx: number; departamento: Departamento;
  precoCents: number; disponivel: number; foto: string; aplicacoes: [number, number, number][];
  externalId: string | null; unidade: string; quantidadeMinima: number; busca: string;
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
  const pecas: Peca[] = linhas.map((l) => {
    const marca = l[2] >= 0 ? meta.marcas[l[2]][0] : "";
    const grupo = meta.grupos[l[3]][0];
    const departamento = departamentoDoGrupo[l[3]];
    const modelos = l[7].map(([m]) => `${meta.montadoras[meta.modelos[m][0]]} ${meta.modelos[m][1]}`).join(" ");
    return {
      id: l[0], nome: l[1], marca, grupo, grupoIdx: l[3], departamento, precoCents: l[4], disponivel: l[5], foto: l[6], aplicacoes: l[7],
      externalId: l[8] || null, unidade: meta.unidades[l[9]] || "", quantidadeMinima: l[10] || 1,
      busca: normalizeSearch(`${l[1]} ${marca} ${grupo} ${departamento.nome} ${modelos}`),
      depOrdem: meta.departamentos.indexOf(departamento), grupoN: meta.grupos[l[3]][2],
    };
  });
  const porId = new Map(pecas.map((p) => [p.id, p]));
  const porExternalId = new Map(pecas.filter((p) => p.externalId).map((p) => [p.externalId!, p]));
  return { meta, pecas, porId, porExternalId };
}

let carregamento: Promise<Catalogo> | null = null;
export function carregarCatalogo(base = "/catalogo"): Promise<Catalogo> {
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
export async function carregarDetalhe(catalogo: Catalogo, id: string, base = "/catalogo"): Promise<Detalhe | null> {
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

// Termos de busca: cada palavra precisa aparecer (ordem livre). "pastilha gol" acha "Pastilha Freio ... Volkswagen Gol".
export function termosDe(q: string) {
  return normalizeSearch(q).split(/\s+/).filter((t) => t.length > 0);
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
    if (termos.length && !termos.every((t) => p.busca.includes(t))) return false;
    return true;
  });
  return ordenar(resultado, filtro, termos);
}

function ordenar(pecas: Peca[], filtro: Filtro, termos: string[]) {
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
      const nomeNorm = normalizeSearch(p.nome);
      if (termos.every((t) => nomeNorm.includes(t))) s += 6;
      else if (termos.some((t) => nomeNorm.includes(t))) s += 2;
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
export function filtroParaUrl(filtro: Filtro) {
  const p = new URLSearchParams();
  if (filtro.q) p.set("q", filtro.q);
  if (filtro.departamento) p.set("dep", filtro.departamento);
  if (filtro.grupo >= 0) p.set("grupo", String(filtro.grupo));
  if (filtro.marca >= 0) p.set("marca", String(filtro.marca));
  if (filtro.montadora >= 0) p.set("montadora", String(filtro.montadora));
  if (filtro.modelo >= 0) p.set("modelo", String(filtro.modelo));
  if (filtro.ano) p.set("ano", String(filtro.ano));
  if (filtro.somenteEstoque) p.set("estoque", "1");
  if (filtro.ordem !== "relevancia") p.set("ordem", filtro.ordem);
  return p;
}

export function filtroDaUrl(search: string): Filtro {
  const p = new URLSearchParams(search);
  const inteiro = (chave: string, padrao: number) => { const v = Number(p.get(chave)); return Number.isInteger(v) && p.has(chave) ? v : padrao; };
  const ordem = p.get("ordem");
  return {
    q: (p.get("q") || "").slice(0, 120), departamento: p.get("dep") || "", grupo: inteiro("grupo", -1), marca: inteiro("marca", -1),
    montadora: inteiro("montadora", -1), modelo: inteiro("modelo", -1), ano: inteiro("ano", 0), somenteEstoque: p.get("estoque") === "1",
    ordem: ordem === "nome" || ordem === "menor-preco" || ordem === "maior-preco" ? ordem : "relevancia",
  };
}

export const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
