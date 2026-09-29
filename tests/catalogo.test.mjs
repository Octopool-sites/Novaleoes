import { test } from "node:test";
import assert from "node:assert/strict";
import { limparNome, limparGrupo, limparDescricao, unidadeLegivel, VAZAMENTO_CODIGO } from "../scripts/catalogo/nomes.mjs";
import { classificar, DEPARTAMENTOS, normalizarTexto } from "../scripts/catalogo/taxonomia.mjs";
import { construir, vazamentos, grupoDerivado, limparMarca, nomeModelo, chaveModelo, idCurto, bucketDe, normalizarAno, BUCKETS } from "../scripts/catalogo/construir.mjs";
import { filtrar, montarCatalogo, filtroDaUrl, filtroParaUrl, FILTRO_VAZIO, resumoAplicacoes, faixaAnos, separarDescricao, termosDe, textoBusca } from "../lib/catalogo-site.ts";

test("nomes: expande abreviações do balcão, restaura acentos e remove código de fabricante do fim", () => {
  assert.equal(limparNome("AMORT DT LE"), "Amortecedor Dianteiro Lado Esquerdo");
  assert.equal(limparNome("BOMBA DAGUA / 766"), "Bomba d'Água");
  assert.equal(limparNome("PAST FREIO DT C ABS"), "Pastilha Freio Dianteiro com ABS");
  assert.equal(limparNome("LAMP H4 HALOG 60/55 W"), "Lâmpada H4 Halógena 60/55 W");
  assert.equal(limparNome("75W90 TUTELA SEMI API GL5 1 L *"), "75W90 Tutela Semi API GL5 1 L");
  assert.equal(limparNome("CORREIA DENT 129 X 220 / 488"), "Correia Dentada 129 X 220");
  assert.equal(limparNome("DISCO FREIO DT SOL 4F 240 ( 31 )"), "Disco Freio Dianteiro Sólido 4 furos 240");
  assert.equal(limparNome("PAST FREIO DT ( 4213 )"), "Pastilha Freio Dianteiro");
  // DIR é o lado em peça de lado e a direção nas outras; adjetivo concorda com o nome feminino.
  assert.equal(limparNome("LANTERNA TS DIR"), "Lanterna Traseira Direita");
  assert.equal(limparNome("FAROL PRINC BIODO DIR"), "Farol Princ Biodo Direito");
  assert.equal(limparNome("CAIXA DIR HIDR"), "Caixa Direção Hidráulica");
  assert.equal(limparNome("BANDEJA COMPLETO DT LD"), "Bandeja Completa Dianteira Lado Direito");
  assert.equal(limparNome("AMORT DT LE"), "Amortecedor Dianteiro Lado Esquerdo");
  assert.equal(normalizarAno(2106), 2006);
  assert.equal(normalizarAno(2208), 2008);
  assert.equal(normalizarAno(120), 0);
  assert.equal(normalizarAno(5487), 0);
  assert.equal(normalizarAno(2014), 2014);
  assert.equal(limparGrupo(""), "Outras peças");
  assert.equal(limparGrupo("CIL MESTRE FREIO"), "Cilindro Mestre Freio");
});

test("descrição: separa destaques '> ... <', remove pontos soltos, códigos isolados e repetições", () => {
  const { linhas, destaques } = limparDescricao("ECOSPORT / FOCUS 2.0 16V\r\n\r\n> 2 PINOS TIPO CANETA <\r\n.\r\n1174-49\r\nECOSPORT / FOCUS 2.0 16V\r\nBOBINA DE IGNICAO");
  assert.deepEqual(destaques, ["2 Pinos Tipo Caneta"]);
  assert.deepEqual(linhas, ["Ecosport / Focus 2.0 16V", "Bobina de Ignição"]);
  assert.equal(unidadeLegivel("JG", 4), "Jogo · venda mínima de 4");
  assert.equal(unidadeLegivel("PC", 2), "venda mínima de 2");
  assert.equal(unidadeLegivel("PC", 1), "");
});

test("taxonomia: grupo específico decide; balde LUBRIFICANTES usa o nome; sem regra vai para outras", () => {
  assert.equal(classificar("PASTILHA FREIO", "PAST FREIO DT"), "freios");
  assert.equal(classificar("LUBRIFICANTES", "5W30 SINTETICO 1 L"), "lubrificantes");
  assert.equal(classificar("LUBRIFICANTES", "KIT ALAVANCA CAMBIO"), "transmissao");
  assert.equal(classificar("LUBRIFICANTES", "PIRELLI 195-50-15"), "rodas");
  assert.equal(classificar("LUBRIFICANTES", "MANGUEIRA"), "outras");
  assert.equal(classificar("FILTRO ACD", "FILTRO ACD"), "filtros");
  assert.equal(classificar("MANGUEIRA", "MANG SUP RAD"), "arrefecimento");
  assert.equal(classificar("CABO CHUPETA", "CABO BATERIA 600 AMP"), "eletrica");
  assert.equal(classificar(null, "TROCADOR CALOR"), "arrefecimento");
  assert.equal(normalizarTexto("Válvula Termostática"), "VALVULA TERMOSTATICA");
  assert.ok(DEPARTAMENTOS.some((d) => d.id === "outras"));
});

test("construir: gera índice compacto sem código interno, com aplicações, marcas e vínculo Commerce", () => {
  const exportacao = {
    exportadoEm: "2026-09-25T13:31:32.676Z", empresa: "NOVA LEÕES AUTOPEÇAS",
    prods: [
      { id: "ckprod1", nome: "PAST FREIO DT / 1261", marca: "COBREQ", grupo: "PASTILHA FREIO", descricao: "GOL 1.6 - 08 / 14\r\n> COM ALARME <", preco: 89.9, disp: 3, foto: "https://octopool-fotos-produtos.s3.sa-east-1.amazonaws.com/9025.849.jpg", unidade: "JG", qmin: 1 },
      { id: "ckprod2", nome: "FILTRO AR / 4150", marca: "TECFIL", grupo: "FILTRO DE AR", descricao: "", preco: 0.5, disp: 0, foto: "https://http2.mlstatic.com/x.jpg", unidade: "PC", qmin: 1 },
      { id: "ckprod3", nome: "MANGUEIRA", marca: null, grupo: "LUBRIFICANTES", descricao: ".", preco: 12, disp: 1, foto: null, unidade: "PC", qmin: 2 },
    ],
    apl: [
      { pid: "ckprod1", m: "Volkswagen", mo: "GOL", v: "G5", mt: "1.6 8V", ai: 2008, af: 2014, o: null },
      { pid: "ckprod1", m: "Volkswagen", mo: "VOYAGE", v: null, mt: null, ai: 2009, af: null, o: null },
    ],
    bind: [{ ext: "filtro-ar", pid: "ckprod2" }],
  };
  const { meta, indice, detalhes } = construir(exportacao);
  assert.equal(meta.total, 3);
  assert.equal(meta.comEstoque, 2);
  assert.deepEqual(meta.montadoras, ["Volkswagen"]);
  assert.deepEqual(meta.modelos, [[0, "Gol", 1], [0, "Voyage", 1]]);
  const serializado = JSON.stringify(indice) + JSON.stringify([...detalhes.values()]);
  assert.ok(!serializado.includes("1261") && !serializado.includes("4150") && !serializado.includes("ckprod"), "códigos e ids do ERP não vazam");
  const pastilha = indice.pecas.find((p) => p[1].startsWith("Pastilha"));
  assert.equal(pastilha[4], 8990);
  assert.equal(pastilha[6], "9025.849.jpg");
  assert.deepEqual(pastilha[7], [[0, 2008, 2014], [1, 2009, 0]]);
  const filtro = indice.pecas.find((p) => p[1].startsWith("Filtro"));
  assert.equal(filtro[4], 0, "preço abaixo de R$ 1 vira 'consultar'");
  assert.equal(filtro[6], "", "foto de host de terceiros não entra");
  assert.equal(filtro[8], "filtro-ar");
  const mangueira = indice.pecas.find((p) => p[1] === "Mangueira");
  assert.equal(meta.grupos[mangueira[3]][0], "Mangueira");
  assert.equal(meta.departamentos[meta.grupos[mangueira[3]][1]].id, "outras");
  assert.equal(mangueira[10], 2);
  const detalhe = detalhes.get(pastilha[0]);
  assert.deepEqual(detalhe.h, ["Com Alarme"]);
  assert.equal(detalhe.a.length, 2);
  assert.equal(idCurto("ckprod1").length, 8);
  assert.ok(bucketDe(pastilha[0]) < BUCKETS);
  assert.equal(grupoDerivado("Kit de Juntas Motor"), "Kit Juntas");
  assert.equal(grupoDerivado("com Rolamento"), "Rolamento");
  assert.equal(limparMarca("COFAP AMORT"), "Cofap");
  assert.equal(limparMarca("VIEMAR TERM"), "Viemar");
  assert.equal(limparMarca("TECFIL F AR"), "Tecfil");
  assert.equal(limparMarca("DIVERSOS"), "");
  assert.equal(limparMarca("NOVO KIT"), "Novo Kit");
  assert.equal(limparMarca("SKF ROL RODA"), "SKF");
  assert.equal(nomeModelo("S-10"), nomeModelo("S10"));
  assert.equal(nomeModelo("HRV"), "HR-V");
  assert.equal(chaveModelo("Del Rey"), chaveModelo("DELREY"));
  assert.equal(limparMarca("MS"), "MS");

  const catalogo = montarCatalogo(meta, indice.pecas);
  assert.equal(filtrar(catalogo, { ...FILTRO_VAZIO, q: "pastilha gol" }).length, 1);
  assert.equal(filtrar(catalogo, { ...FILTRO_VAZIO, modelo: 0, ano: 2010 }).length, 1);
  assert.equal(filtrar(catalogo, { ...FILTRO_VAZIO, modelo: 0, ano: 2016 }).length, 0);
  assert.equal(filtrar(catalogo, { ...FILTRO_VAZIO, modelo: 1, ano: 2020 }).length, 1, "anoFim vazio = em diante");
  assert.equal(filtrar(catalogo, { ...FILTRO_VAZIO, departamento: "freios" }).length, 1);
  assert.equal(filtrar(catalogo, { ...FILTRO_VAZIO, somenteEstoque: true }).length, 2);
  assert.equal(resumoAplicacoes(meta, catalogo.pecas.find((p) => p.nome.startsWith("Pastilha"))), "Volkswagen Gol, Volkswagen Voyage");
  assert.equal(faixaAnos(2008, 2014), "2008–2014");
  assert.equal(faixaAnos(2009, 0), "2009 em diante");
  // Filtro vai para a URL por nome e volta resolvido; link velho ou inválido é ignorado, sem quebrar.
  const url = filtroParaUrl({ ...FILTRO_VAZIO, q: "gol", departamento: "freios", montadora: 0, modelo: 0, ano: 2010 }, meta).toString();
  assert.match(url, /montadora=Volkswagen/);
  assert.match(url, /modelo=Gol/);
  assert.deepEqual(filtroDaUrl(`?${url}`, meta), { ...FILTRO_VAZIO, q: "gol", departamento: "freios", montadora: 0, modelo: 0, ano: 2010 });
  assert.deepEqual(filtroDaUrl("?modelo=voyage", meta), { ...FILTRO_VAZIO, montadora: 0, modelo: 1 }, "modelo sem montadora resolve a montadora");
  assert.deepEqual(filtroDaUrl("?modelo=99999&marca=99999&montadora=Ford&dep=inexistente", meta), FILTRO_VAZIO, "índice velho e nome inexistente são ignorados");
  assert.deepEqual(filtroDaUrl("?ano=abc&ordem=x&grupo=1.5", meta), FILTRO_VAZIO);
  assert.deepEqual(filtroDaUrl("?modelo=Gol&q=disco"), { ...FILTRO_VAZIO, q: "disco" }, "sem o catálogo carregado, não chuta posições");
});

test("código de fabricante e referências não chegam ao site", () => {
  assert.equal(limparNome("AMORT DT ( USAR GP30120 )"), "Amortecedor Dianteiro");
  assert.equal(limparNome("BATERIA 60AH ( LE ) > USAR CS50E"), "Bateria 60AH ( Lado Esquerdo )");
  assert.equal(limparNome("ATUAL T-010037"), "");
  assert.equal(limparNome("AXIAL DH 320 MM ( REF )"), "Axial DH 320 MM");
  const { linhas, destaques } = limparDescricao([
    "COD Orig 1234211018", "COD Fabricante: 03.066.72 / 0306672", "64151H3STD ( COD SKY )", "Fiat Marea 2.0 20V 99/( REF: 5984837 )",
    "Cod. Metalsystem ----> M31544", ">> Usar Atuador 510 0065 11 <<", "Usar C/ RO4529 OU Similar", ">> Atenção: Difícil de Usar <<", "GOL 1.6 - 08 / 14",
  ].join("\n"));
  assert.deepEqual(linhas, ["Fiat Marea 2.0 20V 99", "GOL 1.6 - 08 / 14"]);
  assert.deepEqual(destaques, ["Atenção: Difícil de Usar"]);
  for (const t of [...linhas, ...destaques]) assert.equal(VAZAMENTO_CODIGO.test(t), false, t);
  const { indice, detalhes } = construir({ prods: [{ id: "x1", nome: "PAST FREIO ( ATUAL AL910 )", marca: "COBREQ", grupo: "PASTILHA FREIO", descricao: "COD GM 46.842.706\nPALIO 1.0", preco: 50, disp: 1, foto: null, unidade: "JG", qmin: 1 }],
    apl: [{ pid: "x1", m: "Fiat", mo: "PALIO", v: null, mt: null, ai: 2000, af: 2005, o: "Orig 7.086.502" }], bind: [] });
  assert.deepEqual(vazamentos({ indice, detalhes }), []);
  assert.doesNotMatch(JSON.stringify(indice) + JSON.stringify([...detalhes.values()]), /AL910|46\.842|7\.086/);
});

test("descrição: separa a lista de veículos do texto e converte anos de 2 dígitos", () => {
  const { texto, veiculos } = separarDescricao(["Doblo / Palio / Mobi / Strada", "Mobi 1.0 8V EVO - 16 / ...", "Palio 1.3 8V FIRE - 02 / 05", "Palio / Siena / Strada 96", "Opala 4.1 - 85 / 92"]);
  assert.deepEqual(texto, ["Doblo / Palio / Mobi / Strada", "Palio / Siena / Strada 96"]);
  assert.deepEqual(veiculos, [
    { nome: "Mobi 1.0 8V EVO", inicio: 2016, fim: 0 },
    { nome: "Palio 1.3 8V FIRE", inicio: 2002, fim: 2005 },
    { nome: "Opala 4.1", inicio: 1985, fim: 1992 },
  ]);
});

test("estoque público: o catálogo só diz se tem ou não tem, nunca a quantidade", () => {
  const { indice } = construir({ prods: [
    { id: "a", nome: "PASTILHA", marca: "COBREQ", grupo: "PASTILHA FREIO", descricao: "", preco: 10, disp: 37, foto: null, unidade: "PC", qmin: 1 },
    { id: "b", nome: "DISCO", marca: "FREMAX", grupo: "DISCO FREIO", descricao: "", preco: 10, disp: 0, foto: null, unidade: "PC", qmin: 1 },
  ], apl: [], bind: [] });
  assert.deepEqual(indice.pecas.map((l) => l[5]).sort(), [0, 1]);
});

test("busca: tolera pontuação, plural, feminino, preposições, siglas do balcão e sinônimos", () => {
  const dep = (id, nome) => ({ id, nome, resumo: "", n: 1, grupos: [], capa: "" });
  const meta = {
    versao: 1, exportadoEm: null, geradoEm: "", empresa: "", total: 5, comEstoque: 5, comFoto: 0, fotoBase: "", buckets: 1,
    departamentos: [dep("freios", "Freios"), dep("arrefecimento", "Arrefecimento"), dep("lubrificantes", "Lubrificantes e fluidos"), dep("suspensao", "Suspensão")],
    grupos: [["Pastilha Freio", 0, 1], ["Bomba d'Água", 1, 1], ["5W30", 2, 1], ["Amortecedor", 3, 1], ["Fluido Freio", 2, 1]],
    marcas: [["Cobreq", 1]], montadoras: ["Volkswagen", "Honda"], modelos: [[0, "Gol", 1], [1, "HR-V", 1]], unidades: [""],
  };
  const linha = (id, nome, grupo, aplic = []) => [id, nome, 0, grupo, 1000, 1, "", aplic, 0, 0, 1];
  const c = montarCatalogo(meta, [
    linha("a", "Pastilha Freio Dianteiro", 0, [[0, 2008, 2014]]),
    linha("b", "Bomba D´agua", 1, [[1, 2016, 0]]),
    linha("c", "5W30 Sintético API SN 1 L", 2),
    linha("d", "Amortecedor Traseiro", 3, [[0, 2008, 2014]]),
    linha("e", "Fluido de Freio DOT 4", 4),
  ]);
  const ids = (q) => filtrar(c, { ...FILTRO_VAZIO, q }).map((p) => p.id).sort().join("");
  assert.equal(textoBusca("Bomba D´água HR-V (S-10)"), "bomba dagua hrv s10");
  assert.equal(ids("bomba dagua"), "b");
  assert.equal(ids("bomba d'água"), "b");
  assert.equal(ids("hrv"), "b");
  assert.equal(ids("pastilhas"), "a");
  assert.equal(ids("pastilha dianteira"), "a");
  assert.equal(ids("pastilha de freio para gol"), "a");
  assert.equal(ids("vw gol"), "ad");
  assert.equal(ids("amortecedores"), "d");
  assert.equal(ids("amort ts"), "d");
  assert.equal(ids("óleo 5w-30"), "c", "óleo de motor vem em grupo pela viscosidade");
  assert.equal(ids("oleo"), "c", "fluido de freio não é óleo");
  assert.equal(ids("kits"), "", "sigla solta não casa com pedaço de palavra");
  assert.deepEqual(termosDe("ts"), [["traseir"]]);
});
