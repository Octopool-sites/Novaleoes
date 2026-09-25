#!/usr/bin/env node
// Constrói o catálogo público do site a partir da exportação somente leitura do ERP.
//
//   node scripts/catalogo/construir.mjs [outputs/catalogo-erp.json] [public/catalogo]
//
// Entrada: JSON gerado por scripts/catalogo/exportar-erp.cjs (rodado dentro do container do ERP).
// Saída (arquivos estáticos servidos pela Vercel):
//   meta.json            dicionários (departamentos, grupos, marcas, montadoras, modelos, unidades)
//   indice.json          uma linha compacta por peça, para busca e filtros no navegador
//   detalhes/NNN.json    descrição limpa e aplicações completas, carregadas ao abrir a peça
//
// O que NÃO sai daqui: código interno, código do fabricante/OEM, custo, curva ABC, localização.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { limparNome, limparGrupo, limparDescricao } from "./nomes.mjs";
import { classificar, DEPARTAMENTOS, GRUPOS_BALDE } from "./taxonomia.mjs";

// Itens que o legado deixou em baldes ("LUBRIFICANTES", "DIVERSOS") ganham um grupo derivado
// do próprio nome: a primeira palavra, ou as duas primeiras quando começa com Kit/Jogo/Conjunto.
export function grupoDerivado(nomeLimpo) {
  const palavras = String(nomeLimpo || "").split(/\s+/).filter((p) => /[A-Za-zÀ-ú]/.test(p) && !/^(com|sem|para|de|do|da|e)$/i.test(p));
  if (!palavras.length) return "Outras peças";
  const primeira = palavras[0].replace(/^Kits$/i, "Kit");
  if (/^(Kit|Jogo|Conjunto|Par)$/i.test(primeira) && palavras[1]) {
    const segunda = /^(de|do|da|dos|das)$/i.test(palavras[1]) && palavras[2] ? `${palavras[1]} ${palavras[2]}` : palavras[1];
    return `${primeira} ${segunda}`;
  }
  return primeira.replace(/[,.;:]+$/, "");
}

export const FOTO_BASE = "https://octopool-fotos-produtos.s3.sa-east-1.amazonaws.com/";
const FOTO_ERP = "https://api.octopool.com.br/api/produtos-foto/";
export const BUCKETS = 200;

// Marca do ERP = fabricante + linha do produto ("VIEMAR TERM", "TECFIL F AR", "NAKATA PIVO").
// O site mostra só o fabricante: primeira palavra, exceto marcas de duas palavras conhecidas.
const MARCAS_COMPOSTAS = { NOVO: "Novo Kit", PRO: "Pro Automotive", FILTROS: "Filtros Brasil", TC: "TC Chicotes", AZEVEDO: "Azevedo", GM: "GM" };
// Rótulos internos do legado que não são fabricante: não exibir marca.
const MARCAS_OCULTAS = new Set(["DIVERSOS", "FERRAMENTAS", "UNIVERSAL", "IMPORTADO", "DV", "OUTROS", "GERAL", "LOJA", "NN"]);
const MARCAS_GRAFIA = { "FRAS-LE": "Fras-le", "3-RHO": "3-RHO", NAKATA: "Nakata", MOBENSANI: "Mobensani", CONTITECH: "ContiTech", KITCIA: "Kitcia" };

export function limparMarca(marca) {
  const tokens = String(marca || "").trim().toUpperCase().replace(/[.,]+$/, "").split(/\s+/).filter(Boolean);
  if (!tokens.length) return "";
  const primeiro = tokens[0];
  if (MARCAS_OCULTAS.has(primeiro)) return "";
  if (MARCAS_COMPOSTAS[primeiro] && (primeiro !== "NOVO" || tokens[1] === "KIT")) return MARCAS_COMPOSTAS[primeiro];
  if (MARCAS_GRAFIA[primeiro]) return MARCAS_GRAFIA[primeiro];
  if (/\d/.test(primeiro) || primeiro.length <= 3) return primeiro;
  return primeiro.charAt(0) + primeiro.slice(1).toLowerCase();
}

// Modelos: o legado grava o mesmo carro com grafias diferentes (S-10/S10, HR-V/HRV, Del Rey/Delrey).
// A chave junta as grafias; a grafia exibida vem do mapa ou da primeira forma normalizada.
const GRAFIA_MODELO = { S10: "S10", TCROSS: "T-Cross", DELREY: "Del Rey", F1000: "F-1000", F250: "F-250", CRV: "CR-V", HRV: "HR-V",
  WRV: "WR-V", RCZ: "RCZ", ASX: "ASX", UP: "up!", SW4: "SW4", RAV4: "RAV4", HB20: "HB20", IX35: "ix35", I30: "i30", DS3: "DS3", DS4: "DS4",
  ZX: "ZX", TT: "TT", TR4: "TR4", L200: "L200", D20: "D20", KA: "Ka", SANTAFE: "Santa Fe", VERACRUZ: "Vera Cruz", GRANDLIVINA: "Grand Livina",
  CLASSEA: "Classe A", RANGEROVER: "Range Rover", CROSSFOX: "CrossFox", SPACEFOX: "SpaceFox", "118I": "118i", "120I": "120i", "320I": "320i", "328I": "328i" };

export function chaveModelo(modelo) {
  return String(modelo || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]/g, "");
}

export function nomeModelo(modelo) {
  const texto = String(modelo || "").trim();
  if (!texto) return "";
  const chave = chaveModelo(texto);
  if (GRAFIA_MODELO[chave]) return GRAFIA_MODELO[chave];
  return texto.split(/\s+/).map((t) => (/\d/.test(t) || t.length <= 2 ? t.toUpperCase() : t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())).join(" ");
}

// Anos da aplicação vêm com erros de digitação do legado (2106 = 2006, 2207 = 2007, 120, 5487).
// Corrige o padrão "21xx/22xx" e descarta o resto; 0 = não informado.
export function normalizarAno(valor) {
  const ano = Number(valor) || 0;
  const limite = new Date().getFullYear() + 2;
  if (ano >= 1950 && ano <= limite) return ano;
  if (ano >= 2100 && ano <= 2999) { const corrigido = 2000 + (ano % 100); return corrigido <= limite ? corrigido : 0; }
  return 0;
}

export function idCurto(id) {
  return parseInt(createHash("sha1").update(String(id)).digest("hex").slice(0, 12), 16).toString(36).padStart(8, "0").slice(-8);
}

export function bucketDe(id) {
  return parseInt(id.slice(0, 4), 36) % BUCKETS;
}

// Fotos que não responderam na conferência (scripts/catalogo/verificar-fotos.mjs) saem do catálogo.
const FOTOS_QUEBRADAS = new Set(existsSync("outputs/fotos-quebradas.json") ? JSON.parse(readFileSync("outputs/fotos-quebradas.json", "utf8")) : []);

function fotoPublica(url) {
  const texto = String(url || "").trim();
  if (!texto || FOTOS_QUEBRADAS.has(texto)) return "";
  if (texto.startsWith(FOTO_BASE)) return texto.slice(FOTO_BASE.length).split("?")[0];
  if (texto.startsWith(FOTO_ERP)) return texto; // foto colada no cadastro, servida pela rota pública do ERP
  return ""; // hosts de terceiros ficam fora (CSP e direitos de imagem)
}

function indexador() {
  const mapa = new Map();
  const lista = [];
  return {
    idx(chave, valor = chave) {
      if (!mapa.has(chave)) { mapa.set(chave, lista.length); lista.push(valor); }
      return mapa.get(chave);
    },
    lista,
  };
}

export function construir(exportacao) {
  const aplPorProduto = new Map();
  for (const a of exportacao.apl || []) {
    if (!aplPorProduto.has(a.pid)) aplPorProduto.set(a.pid, []);
    aplPorProduto.get(a.pid).push(a);
  }
  const extPorProduto = new Map((exportacao.bind || []).map((b) => [b.pid, b.ext]));

  const marcas = indexador();
  const grupos = indexador();
  const montadoras = indexador();
  const modelos = indexador();
  const unidades = indexador();
  const contagemGrupo = new Map();
  const contagemMarca = new Map();
  const usados = new Map();
  const pecas = [];
  const detalhes = new Map();

  const produtos = [...(exportacao.prods || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const p of produtos) {
    const nome = limparNome(p.nome) || limparGrupo(p.grupo);
    if (!nome) continue;
    const id = idCurto(p.id);
    if (usados.has(id) && usados.get(id) !== p.id) throw new Error(`Colisão de id curto: ${id}`);
    usados.set(id, p.id);
    const balde = !String(p.grupo || "").trim() || GRUPOS_BALDE.test(String(p.grupo).trim());
    const grupoNome = balde ? grupoDerivado(nome) : limparGrupo(p.grupo);
    const dep = classificar(p.grupo, p.nome);
    const depIdx = DEPARTAMENTOS.findIndex((d) => d.id === dep);
    const gIdx = grupos.idx(`${grupoNome}|${dep}`, [grupoNome, depIdx, 0]);
    contagemGrupo.set(gIdx, (contagemGrupo.get(gIdx) || 0) + 1);
    const marca = limparMarca(p.marca);
    const mIdx = marca ? marcas.idx(marca) : -1;
    if (marca) contagemMarca.set(mIdx, (contagemMarca.get(mIdx) || 0) + 1);
    const precoCents = Number(p.preco) >= 1 ? Math.round(Number(p.preco) * 100) : 0;
    const disp = Math.max(0, Math.floor(Number(p.disp) || 0));
    const foto = fotoPublica(p.foto);
    const unidade = String(p.unidade || "").trim().toUpperCase();
    const uIdx = unidades.idx(unidade);
    const qmin = Number(p.qmin) > 1 ? Number(p.qmin) : 1;

    const aplicacoes = [];
    const resumo = new Map();
    for (const a of aplPorProduto.get(p.id) || []) {
      const montadora = String(a.m || "").trim();
      const modelo = nomeModelo(a.mo);
      if (!montadora || !modelo) continue;
      const montIdx = montadoras.idx(montadora);
      const modIdx = modelos.idx(`${montIdx}|${chaveModelo(modelo)}`, [montIdx, modelo]);
      const ai = normalizarAno(a.ai), af = normalizarAno(a.af);
      aplicacoes.push([modIdx, String(a.v || "").trim(), String(a.mt || "").trim(), ai, af, String(a.o || "").trim()]);
      const chave = `${modIdx}|${ai}|${af}`;
      if (!resumo.has(chave)) resumo.set(chave, [modIdx, ai, af]);
    }
    aplicacoes.sort((x, y) => x[0] - y[0] || x[3] - y[3]);

    pecas.push([id, nome, mIdx, gIdx, precoCents, disp, foto, [...resumo.values()].sort((x, y) => x[0] - y[0] || x[1] - y[1]), extPorProduto.get(p.id) || 0, uIdx, qmin]);
    const { linhas, destaques } = limparDescricao(p.descricao);
    detalhes.set(id, { d: linhas, h: destaques, a: aplicacoes });
  }

  // Ordena por nome para o índice ser estável entre exportações.
  pecas.sort((a, b) => a[1].localeCompare(b[1], "pt-BR") || a[0].localeCompare(b[0]));
  for (const [gIdx, n] of contagemGrupo) grupos.lista[gIdx][2] = n;

  const departamentos = DEPARTAMENTOS.map((d, depIdx) => {
    const idxGrupos = grupos.lista.map((g, i) => [g, i]).filter(([g]) => g[1] === depIdx).sort((a, b) => b[0][2] - a[0][2] || a[0][0].localeCompare(b[0][0], "pt-BR")).map(([, i]) => i);
    // Capa do departamento: peça com foto, estoque e preço do grupo mais numeroso, com mais aplicações.
    let capa = "";
    for (const g of idxGrupos) {
      const candidatas = pecas.filter((p) => p[3] === g && p[6] && p[5] > 0 && p[4] > 0).sort((x, y) => y[7].length - x[7].length || x[0].localeCompare(y[0]));
      if (candidatas.length) { capa = candidatas[0][6]; break; }
    }
    return { id: d.id, nome: d.nome, resumo: d.resumo, n: idxGrupos.reduce((s, i) => s + grupos.lista[i][2], 0), grupos: idxGrupos, capa };
  });
  const pecasPorModelo = new Array(modelos.lista.length).fill(0);
  for (const p of pecas) for (const m of new Set(p[7].map((a) => a[0]))) pecasPorModelo[m]++;

  const meta = {
    versao: 1,
    exportadoEm: exportacao.exportadoEm || null,
    geradoEm: new Date().toISOString(),
    empresa: exportacao.empresa || "",
    total: pecas.length,
    comEstoque: pecas.filter((p) => p[5] > 0).length,
    comFoto: pecas.filter((p) => p[6]).length,
    fotoBase: FOTO_BASE,
    buckets: BUCKETS,
    departamentos,
    grupos: grupos.lista,
    marcas: marcas.lista.map((nome, i) => [nome, contagemMarca.get(i) || 0]),
    montadoras: montadoras.lista,
    modelos: modelos.lista.map((m, i) => [m[0], m[1], pecasPorModelo[i]]),
    unidades: unidades.lista,
  };
  return { meta, indice: { pecas }, detalhes };
}

export function escrever(saida, { meta, indice, detalhes }) {
  const dirDetalhes = join(saida, "detalhes");
  if (existsSync(dirDetalhes)) rmSync(dirDetalhes, { recursive: true, force: true });
  mkdirSync(dirDetalhes, { recursive: true });
  writeFileSync(join(saida, "meta.json"), JSON.stringify(meta));
  writeFileSync(join(saida, "indice.json"), JSON.stringify(indice));
  const buckets = Array.from({ length: BUCKETS }, () => ({}));
  for (const [id, detalhe] of detalhes) buckets[bucketDe(id)][id] = detalhe;
  buckets.forEach((conteudo, i) => {
    const ordenado = Object.fromEntries(Object.entries(conteudo).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(join(dirDetalhes, `${String(i).padStart(3, "0")}.json`), JSON.stringify(ordenado));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))) {
  const entrada = resolve(process.argv[2] || "outputs/catalogo-erp.json");
  const saida = resolve(process.argv[3] || "public/catalogo");
  const exportacao = JSON.parse(readFileSync(entrada, "utf8"));
  const resultado = construir(exportacao);
  escrever(saida, resultado);
  const tamanho = (f) => `${(statSync(join(saida, f)).size / 1024).toFixed(0)} KB`;
  const detalhesTotal = readdirSync(join(saida, "detalhes")).reduce((s, f) => s + statSync(join(saida, "detalhes", f)).size, 0);
  console.log(`Catálogo gerado em ${saida}`);
  console.log(`  peças: ${resultado.meta.total} (com estoque ${resultado.meta.comEstoque}, com foto ${resultado.meta.comFoto})`);
  console.log(`  grupos: ${resultado.meta.grupos.length} · marcas: ${resultado.meta.marcas.length} · montadoras: ${resultado.meta.montadoras.length} · modelos: ${resultado.meta.modelos.length}`);
  console.log(`  meta.json ${tamanho("meta.json")} · indice.json ${tamanho("indice.json")} · detalhes/ ${(detalhesTotal / 1024 / 1024).toFixed(1)} MB em ${BUCKETS} arquivos`);
  for (const d of resultado.meta.departamentos) console.log(`  - ${d.nome}: ${d.n} peças, ${d.grupos.length} grupos`);
}
