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
import { dirname, join, resolve } from "node:path";
import { limparNome, limparGrupo, limparDescricao, removerCodigos, cortarCodigos, removerCodigosDePeca, temCodigoDePeca, VAZAMENTO_CODIGO } from "./nomes.mjs";
import { classificar, DEPARTAMENTOS, GRUPOS_BALDE } from "./taxonomia.mjs";
import { nomePublico, NOME_PUBLICO } from "./fotos-publicas.mjs";

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
// Um collator só: localeCompare(x, "pt-BR") recria o collator a cada comparação (o sort das 39 mil peças levava 35 s).
const PT_BR = new Intl.Collator("pt-BR");

// Marca do ERP = fabricante + linha do produto ("VIEMAR TERM", "TECFIL F AR", "NAKATA PIVO").
// O site mostra só o fabricante: primeira palavra, exceto marcas de duas palavras conhecidas.
// Duas palavras que são o fabricante (conferidas pelo 2º token, antes do mapa de uma palavra): "AUTO STAR PIVO" é
// Auto Star, "PRO TORK" não é Pro Automotive, "FLEX OIL LUB" e "FLEX AUTOMOT" são fabricantes diferentes.
const MARCAS_DUAS_PALAVRAS = [
  ["AUTO", /^STAR$/, "Auto Star"], ["AUTO", /^SHINE$/, "Auto Shine"], ["PRO", /^TORK$/, "Pro Tork"],
  ["FLEX", /^AUTOMOT/, "Flex Automotive"], ["FLEX", /^OIL$/, "Flex Oil"], ["CONTROL", /^FLEX$/, "Control Flex"],
];
const MARCAS_COMPOSTAS = { NOVO: "Novo Kit", PRO: "Pro Automotive", FILTROS: "Filtros Brasil", TC: "TC Chicotes", AZEVEDO: "Azevedo", GM: "GM" };
// Rótulos internos do legado que não são fabricante: não exibir marca. AMORT, MANG, ROL, KIT e OLEO são linha de
// produto ("AMORT RECOND", "ROL DIV", "OLEO DIV"); 416, YBR e H-7 são modelo ou código.
const MARCAS_OCULTAS = new Set(["DIVERSOS", "FERRAMENTAS", "UNIVERSAL", "IMPORTADO", "DV", "OUTROS", "GERAL", "LOJA", "NN",
  "AMORT", "MANG", "ROL", "KIT", "OLEO", "416", "YBR", "H-7"]);
// SAMBEL (12) ao lado de SAMPEL (448) parece erro de digitação, mas não foi confirmado com a loja: fica como está.
const MARCAS_GRAFIA = { "FRAS-LE": "Fras-le", "3-RHO": "3-RHO", NAKATA: "Nakata", MOBENSANI: "Mobensani", CONTITECH: "ContiTech", KITCIA: "Kitcia" };

export function limparMarca(marca) {
  const tokens = String(marca || "").trim().toUpperCase().replace(/[.,]+$/, "").split(/\s+/).filter(Boolean);
  if (!tokens.length) return "";
  const primeiro = tokens[0];
  if (MARCAS_OCULTAS.has(primeiro)) return "";
  const dupla = MARCAS_DUAS_PALAVRAS.find(([t1, t2]) => t1 === primeiro && t2.test(tokens[1] || ""));
  if (dupla) return dupla[2];
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

// Faixa de anos da aplicação. Ano inicial maior que o final ("2010 / 1983") é digitação invertida no legado:
// sem a troca, a peça nunca aparece no filtro por ano (o site exige início ≤ ano ≤ fim).
export function faixaDeAnos(inicio, fim) {
  const ai = normalizarAno(inicio), af = normalizarAno(fim);
  return ai && af && ai > af ? [af, ai] : [ai, af];
}

// Itens da própria loja (móveis, monitor, saco de lixo), cadastrados no ERP mas que não estão à venda.
export const GRUPOS_FORA_DO_SITE = /^(PATRIMONIO|CONSUMO LOJA)$/i;

// Preço de mentira do legado: R$ 0,50 é "sem preço", e R$ 1,00 a R$ 1,99 numa família cuja mediana passa de R$ 15
// ("Cabo Engate Comando Câmbio" a R$ 1,50, mediana R$ 215) também. Os dois viram "sob consulta" (precoCents 0).
export const PRECO_PLACEHOLDER = 0.5;
export const PRECO_SUSPEITO = 2;
export const MEDIANA_MINIMA = 15;
export const FATOR_OUTLIER = 15;
export function precoPlaceholder(preco, mediana) {
  return preco === PRECO_PLACEHOLDER || (preco > 0 && preco < PRECO_SUSPEITO && mediana >= MEDIANA_MINIMA);
}
function mediana(valores) {
  if (!valores.length) return 0;
  const v = [...valores].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function idCurto(id) {
  return parseInt(createHash("sha1").update(String(id)).digest("hex").slice(0, 12), 16).toString(36).padStart(8, "0").slice(-8);
}

export function bucketDe(id) {
  return parseInt(id.slice(0, 4), 36) % BUCKETS;
}

// Fotos que não responderam na conferência (scripts/catalogo/verificar-fotos.mjs) saem do catálogo.
// Desenhos técnicos (catálogo do fabricante com medidas, hoje só pastilhas): saem da vitrine e ficam no detalhe.
// Lista gerada medindo as fotos (branco, traço, cor); ver docs/catalogo-erp.md.
const DESENHOS = new Set(existsSync("scripts/catalogo/fotos-desenho.json") ? JSON.parse(readFileSync("scripts/catalogo/fotos-desenho.json", "utf8")) : []);
const FOTO_FIXA = existsSync("scripts/catalogo/fotos-ilustrativas.json") ? JSON.parse(readFileSync("scripts/catalogo/fotos-ilustrativas.json", "utf8")) : {};
const FOTOS_QUEBRADAS = new Set(existsSync("outputs/fotos-quebradas.json") ? JSON.parse(readFileSync("outputs/fotos-quebradas.json", "utf8")) : []);

// Nome publicado da foto do bucket. No bucket ela se chama pelo código da peça (9019.580.jpg): o site publica a cópia
// site/<hash>.jpg (scripts/catalogo/fotos-publicas.mjs). A montagem pela linha de comando liga o nome público com
// definirNomeDasFotos(); sem isso (testes com dados de exemplo) o nome passa como está.
let nomeDaFoto = (chave) => chave;
export function definirNomeDasFotos(fn) { nomeDaFoto = fn; }
function fotoPublica(url) {
  const texto = String(url || "").trim();
  if (!texto || FOTOS_QUEBRADAS.has(texto) || (FOTO_FIXA._fotoErrada || []).includes(texto.split("?")[0])) return "";
  if (texto.startsWith(FOTO_BASE)) return nomeDaFoto(decodeURIComponent(texto.slice(FOTO_BASE.length).split("?")[0]));
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

  const produtos = [...(exportacao.prods || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .filter((p) => !GRUPOS_FORA_DO_SITE.test(String(p.grupo || "").trim()));
  // 1ª passada: nome público, grupo e departamento de cada peça, e a mediana de preço de cada grupo público
  // (só preços de R$ 2 para cima, para o preço de mentira não puxar a mediana).
  const base = [];
  const precosPorGrupo = new Map();
  for (const p of produtos) {
    const limpo = removerCodigosDePeca(limparNome(p.nome));
    // Nome que vira só código ou sobra ("11098", ">> USAR12E <<", "ML") cai para o nome do grupo.
    const nome = /[A-Za-zÀ-ú]{3}/.test(limpo) ? limpo : limparGrupo(p.grupo);
    if (!nome) continue;
    const balde = !String(p.grupo || "").trim() || GRUPOS_BALDE.test(String(p.grupo).trim());
    const grupoNome = balde ? grupoDerivado(nome) : limparGrupo(p.grupo);
    const dep = classificar(p.grupo, p.nome);
    const chaveGrupo = `${grupoNome}|${dep}`;
    const preco = Number(p.preco) || 0;
    if (preco >= PRECO_SUSPEITO) { if (!precosPorGrupo.has(chaveGrupo)) precosPorGrupo.set(chaveGrupo, []); precosPorGrupo.get(chaveGrupo).push(preco); }
    base.push({ p, nome, grupoNome, dep, chaveGrupo, preco });
  }
  const medianas = new Map([...precosPorGrupo].map(([k, v]) => [k, mediana(v)]));
  const revisarPrecos = [];

  for (const { p, nome, grupoNome, dep, chaveGrupo, preco } of base) {
    const id = idCurto(p.id);
    if (usados.has(id) && usados.get(id) !== p.id) throw new Error(`Colisão de id curto: ${id}`);
    usados.set(id, p.id);
    const depIdx = DEPARTAMENTOS.findIndex((d) => d.id === dep);
    const gIdx = grupos.idx(chaveGrupo, [grupoNome, depIdx, 0]);
    contagemGrupo.set(gIdx, (contagemGrupo.get(gIdx) || 0) + 1);
    const marca = limparMarca(p.marca);
    const mIdx = marca ? marcas.idx(marca) : -1;
    if (marca) contagemMarca.set(mIdx, (contagemMarca.get(mIdx) || 0) + 1);
    const med = medianas.get(chaveGrupo) || 0;
    const placeholder = precoPlaceholder(preco, med);
    const precoCents = preco > 0 && !placeholder ? Math.round(preco * 100) : 0;
    // Para a loja corrigir no ERP (o site não escreve lá): preço de mentira em peça com estoque e preço fora da curva.
    if (placeholder && Number(p.disp) > 0) revisarPrecos.push({ motivo: "preço de mentira em peça com estoque", id, p, med });
    else if (med && preco > FATOR_OUTLIER * med) revisarPrecos.push({ motivo: `mais de ${FATOR_OUTLIER}x a mediana do grupo`, id, p, med });
    // O site só acompanha o ERP e só diz se tem ou não tem: nenhuma quantidade sai no catálogo público.
    const disp = Number(p.disp) > 0 ? 1 : 0;
    const fotoCadastro = fotoPublica(p.foto);
    const desenho = !!fotoCadastro && DESENHOS.has(String(p.foto || "").trim().split("?")[0]);
    const foto = desenho ? "" : fotoCadastro;
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
      const [ai, af] = faixaDeAnos(a.ai, a.af);
      aplicacoes.push([modIdx, removerCodigosDePeca(removerCodigos(a.v)), removerCodigosDePeca(removerCodigos(a.mt)), ai, af, removerCodigosDePeca(cortarCodigos(a.o))]);
      const chave = `${modIdx}|${ai}|${af}`;
      if (!resumo.has(chave)) resumo.set(chave, [modIdx, ai, af]);
    }
    aplicacoes.sort((x, y) => x[0] - y[0] || x[3] - y[3]);

    pecas.push([id, nome, mIdx, gIdx, precoCents, disp, foto, [...resumo.values()].sort((x, y) => x[0] - y[0] || x[1] - y[1]), extPorProduto.get(p.id) || 0, uIdx, qmin, 0]);
    const { linhas, destaques } = limparDescricao(p.descricao);
    detalhes.set(id, desenho ? { d: linhas, h: destaques, a: aplicacoes, t: fotoCadastro } : { d: linhas, h: destaques, a: aplicacoes });
  }

  // Peça sem foto (ou só com desenho) ganha a foto real de outra peça do mesmo grupo, marcada como ilustrativa
  // (posição 11 = 1). Preferência: peça com estoque e com mais aplicações; empate pelo id, para ser estável.
  // Primeiro a mesma marca no mesmo grupo (a foto mostra a embalagem certa); depois qualquer marca do grupo.
  const melhores = new Map();
  const disputar = (chave, p) => {
    const nota = (p[5] > 0 ? 100000 : 0) + p[7].length;
    const atual = melhores.get(chave);
    if (!atual || nota > atual.nota || (nota === atual.nota && p[0] < atual.id)) melhores.set(chave, { nota, id: p[0], foto: p[6] });
  };
  for (const p of pecas) if (p[6]) { disputar(`${p[3]}|${p[2]}`, p); disputar(`${p[3]}`, p); }
  // Grupo com foto fixa (scripts/catalogo/fotos-ilustrativas.json) não usa a escolha automática.
  const fixa = new Map();
  grupos.lista.forEach((g, gIdx) => { const url = FOTO_FIXA[g[0]]; if (url && fotoPublica(url)) fixa.set(gIdx, fotoPublica(url)); });
  for (const p of pecas) {
    if (p[6]) continue;
    const escolhida = fixa.has(p[3]) ? { foto: fixa.get(p[3]) } : (p[2] >= 0 && melhores.get(`${p[3]}|${p[2]}`)) || melhores.get(`${p[3]}`);
    if (escolhida) { p[6] = escolhida.foto; p[11] = 1; }
  }

  // Ordena por nome para o índice ser estável entre exportações.
  pecas.sort((a, b) => PT_BR.compare(a[1], b[1]) || a[0].localeCompare(b[0]));
  for (const [gIdx, n] of contagemGrupo) grupos.lista[gIdx][2] = n;

  const departamentos = DEPARTAMENTOS.map((d, depIdx) => {
    const idxGrupos = grupos.lista.map((g, i) => [g, i]).filter(([g]) => g[1] === depIdx).sort((a, b) => b[0][2] - a[0][2] || PT_BR.compare(a[0][0], b[0][0])).map(([, i]) => i);
    // Capa do departamento: peça com foto, estoque e preço do grupo mais numeroso, com mais aplicações.
    let capa = "";
    for (const g of idxGrupos) {
      const candidatas = pecas.filter((p) => p[3] === g && p[6] && !p[11] && p[5] > 0 && p[4] > 0).sort((x, y) => y[7].length - x[7].length || x[0].localeCompare(y[0]));
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
  return { meta, indice: { pecas }, detalhes, revisarPrecos };
}

// Trava: nenhum texto publicado pode conter referência de código ("COD ...", "Orig ...", "Usar GP30120", "Leoes 11302",
// "Renault: 7700866518"), nem no índice, nem no detalhe, nem nos dicionários do meta. Nome também não pode ter número
// de 5 dígitos solto (código de catálogo), a não ser medida ("10000 MM").
const NUMERO_CODIGO_NOME = /\b\d{5,}\b(?!\s*(?:MM|CM|MT|M|ML|L|LT|KM|W|V|A|AH|KG|G|RPM|MAH|BTU|PSI|CV)\b)/i;
export function vazamentos({ meta, indice, detalhes }) {
  const achados = [];
  const conferir = (t, extra) => { if (t && (VAZAMENTO_CODIGO.test(t) || temCodigoDePeca(t) || (extra && extra.test(t)))) achados.push(t); };
  for (const p of indice.pecas) conferir(p[1], NUMERO_CODIGO_NOME);
  for (const d of detalhes.values()) {
    for (const t of [...d.d, ...d.h, ...d.a.flatMap((a) => [a[1], a[2], a[5]])]) conferir(t);
    if (d.t && VAZAMENTO_CODIGO.test(d.t)) achados.push(d.t); // URL da foto: o nome do arquivo é tratado à parte
  }
  if (meta) {
    for (const g of meta.grupos) conferir(g[0], NUMERO_CODIGO_NOME);
    for (const m of meta.marcas) conferir(m[0]);
    for (const m of meta.modelos) conferir(m[1]);
    for (const m of meta.montadoras) conferir(m);
  }
  return achados;
}

// Trava das fotos: nome publicado tem que ser o nome sem código (site/<hash>) ou a rota pública do ERP.
export function fotosComCodigo({ meta, indice, detalhes }) {
  const ruins = [];
  const conferir = (foto) => { if (foto && !foto.startsWith(FOTO_ERP) && !NOME_PUBLICO.test(foto)) ruins.push(`foto: ${foto}`); };
  for (const p of indice.pecas) conferir(p[6]);
  for (const d of detalhes.values()) if (d.t) conferir(d.t);
  for (const d of meta?.departamentos || []) conferir(d.capa);
  return ruins;
}

// Relatório para a loja (outputs/, fora do site): peças com preço a conferir no ERP.
export function csvPrecosARevisar(revisarPrecos) {
  const campo = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const reais = (v) => (Number(v) || 0).toFixed(2).replace(".", ",");
  const linhas = [["motivo", "nome no ERP", "marca no ERP", "grupo no ERP", "preço no ERP", "mediana do grupo", "tem estoque", "peça no site"].map(campo).join(";")];
  for (const r of [...revisarPrecos].sort((a, b) => a.motivo.localeCompare(b.motivo) || String(a.p.grupo).localeCompare(String(b.p.grupo)) || String(a.p.nome).localeCompare(String(b.p.nome)))) {
    linhas.push([r.motivo, r.p.nome, r.p.marca, r.p.grupo, reais(r.p.preco), reais(r.med), Number(r.p.disp) > 0 ? "sim" : "não", `?peca=${r.id}`].map(campo).join(";"));
  }
  return `﻿${linhas.join("\r\n")}\r\n`;
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
  // Fotos sem código no nome: só entra a foto já copiada para site/ (publicar-fotos.mjs grava a lista).
  const arquivoPublicadas = join(dirname(entrada), "fotos-publicadas.json");
  if (!existsSync(arquivoPublicadas)) {
    console.error(`ERRO: falta ${arquivoPublicadas}. Rode antes: node scripts/catalogo/publicar-fotos.mjs (copia as fotos para nomes sem código).`);
    process.exit(1);
  }
  const publicadas = new Set(JSON.parse(readFileSync(arquivoPublicadas, "utf8")));
  definirNomeDasFotos((chave) => { const nome = nomePublico(chave); return publicadas.has(nome) ? nome : ""; });
  const resultado = construir(exportacao);
  const achados = [...vazamentos(resultado), ...fotosComCodigo(resultado)];
  if (achados.length) {
    console.error(`ERRO: ${achados.length} textos com referência de código. Exemplos:`);
    for (const t of achados.slice(0, 15)) console.error(`- ${t}`);
    process.exit(1);
  }
  escrever(saida, resultado);
  // outputs/ é ignorado pelo git: o relatório não vai ao site nem suja o clone da atualização automática.
  const relatorio = join(dirname(entrada), "precos-a-revisar.csv");
  writeFileSync(relatorio, csvPrecosARevisar(resultado.revisarPrecos));
  const tamanho = (f) => `${(statSync(join(saida, f)).size / 1024).toFixed(0)} KB`;
  const detalhesTotal = readdirSync(join(saida, "detalhes")).reduce((s, f) => s + statSync(join(saida, "detalhes", f)).size, 0);
  console.log(`Catálogo gerado em ${saida}`);
  console.log(`  peças: ${resultado.meta.total} (com estoque ${resultado.meta.comEstoque}, com foto ${resultado.meta.comFoto})`);
  console.log(`  grupos: ${resultado.meta.grupos.length} · marcas: ${resultado.meta.marcas.length} · montadoras: ${resultado.meta.montadoras.length} · modelos: ${resultado.meta.modelos.length}`);
  console.log(`  meta.json ${tamanho("meta.json")} · indice.json ${tamanho("indice.json")} · detalhes/ ${(detalhesTotal / 1024 / 1024).toFixed(1)} MB em ${BUCKETS} arquivos`);
  for (const d of resultado.meta.departamentos) console.log(`  - ${d.nome}: ${d.n} peças, ${d.grupos.length} grupos`);
  console.log(`  preços a revisar no ERP: ${resultado.revisarPrecos.length} em ${relatorio}`);
}
