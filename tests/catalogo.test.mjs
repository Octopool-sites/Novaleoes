import { test } from "node:test";
import assert from "node:assert/strict";
import { limparNome, limparGrupo, limparDescricao, unidadeLegivel, VAZAMENTO_CODIGO, removerCodigosDePeca, temCodigoDePeca } from "../scripts/catalogo/nomes.mjs";
import { classificar, DEPARTAMENTOS, normalizarTexto } from "../scripts/catalogo/taxonomia.mjs";
import { construir, vazamentos, grupoDerivado, limparMarca, nomeModelo, chaveModelo, idCurto, bucketDe, normalizarAno, BUCKETS, faixaDeAnos, precoPlaceholder, GRUPOS_FORA_DO_SITE, fotosComCodigo, codigoFabricante, similarCompativel, SIMILARES_MAX } from "../scripts/catalogo/construir.mjs";
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

// ---- Revisão de 29/09/2026 (auditoria do catálogo) ----

test("29/09: código de fabricante e interno saem do nome, da descrição e da aplicação", () => {
  assert.equal(limparNome("CUBO RODA TS / 599A"), "Cubo Roda Traseiro");
  assert.equal(limparNome("DISCO FREIO DT VENT 5F 278 / 352 C *"), "Disco Freio Dianteiro Ventilado 5 furos 278");
  assert.equal(limparNome("PIVO INFERIOR / 96051 ( LE )"), "Pivô Inferior ( Lado Esquerdo )");
  assert.equal(limparNome("SENSOR DE POSICAO DA BORBOLETA - DPL708010"), "Sensor de Posição da Borboleta");
  // Medida, lâmpada, fusível, pneu, motor e carro ficam.
  assert.equal(limparNome("LAMPADA 12V 21/5W"), "Lâmpada 12V 21/5W");
  assert.equal(limparNome("FUSIVEL LAMINA 40A"), "Fusível Lamina 40A");
  assert.equal(limparNome("PNEU 175/70 R13"), "Pneu 175/70 R13");
  for (const legit of ["27MM", "104X170", "1300CC", "34CV", "450AH", "EA111", "AP1600", "L200", "F-1000", "K2500", "C180", "CG125", "TITAN150", "97VW"]) {
    assert.equal(temCodigoDePeca(legit), false, legit);
  }
  for (const codigo of ["BB1092", "M31096S", "05801IOSS", "BC868JSTD", "UB636", "MF-419", "75621", "G-1104", "541121407A", "IWP044"]) {
    assert.equal(temCodigoDePeca(codigo), true, codigo);
  }
  assert.equal(removerCodigosDePeca("Reservatório d'Água do Radiador / 11419 / MF-419 / MF419"), "Reservatório d'Água do Radiador");
  assert.equal(removerCodigosDePeca("Caravan NºGM94644668 NºFORD327/96283/2").includes("327"), false);
});

test("29/09: descrição sem setas do balcão, recado interno, fornecedor e aspas quebradas", () => {
  const { linhas, destaques } = limparDescricao([
    "COBALT / ONIX",
    "( * ) >> TRANSMISSAO MANUAL <<",
    "ROLAMENTO RODA DENTADA S/ SENSOR << / 05801IOSS",
    "ATENCAO: >> PEDIR FOTO",
    "SE O CARRO FOR DUSTER PEDIR AMOSTRA",
    "HA 02 MODELOS ( CONFIRMAR SEMPRE )",
    "FORN: RICARDO DINPAR",
    "10W30 MINERAL OLEO DE MOTOR FORNECEDORES: SINAL ( ABC MOTORS )",
    'O DISCO DE EMBREAGEM E DE 200 MM "" SEM "" ATUADOR',
    "LOGUS - AP 1.6 - 1991>1996",
    "Gates: 40859X22XS",
    "Leoes 11302",
  ].join("\n"));
  const tudo = [...linhas, ...destaques].join(" | ");
  assert.deepEqual(destaques, ["Transmissão Manual"]);
  assert.doesNotMatch(tudo, />|<|05801|Pedir|Amostra|Confirmar Sempre|Forn|Dinpar|Sinal|""|40859|11302/i);
  assert.ok(linhas.includes("10W30 Mineral Óleo de Motor"));
  assert.ok(linhas.some((l) => /1991 a 1996/.test(l)));
});

test("29/09: taxonomia corrige as famílias que caíam no departamento errado", () => {
  assert.equal(classificar("VALVULA ESCAPE", "VALVULA ESCAPE GOL 1.0"), "motor");
  assert.equal(classificar("COLETOR", "COLETOR ADMISSAO PALIO"), "motor");
  assert.equal(classificar("COLETOR", "COLETOR ESCAPE PALIO"), "escapamento");
  assert.equal(classificar("CABO", "CABO VELOCIMETRO UNO"), "cabos");
  assert.equal(classificar("SOQUETE", "SOQUETE 1/2 12 MM"), "ferramentas");
  assert.equal(classificar("MANGUEIRA", "MANGUEIRA TBI GOL"), "injecao");
  assert.equal(classificar("AMORT TAMPA PORTA", "AMORT TAMPA TS GOL"), "carroceria");
  assert.equal(classificar("HOMOCINETICA", "HOMOCINETICA LADO RODA GOL"), "transmissao");
  assert.equal(classificar("LUBRIFICANTES", "OLEO MULTI CVT TRANSM AUT 1 L"), "lubrificantes");
});

test("29/09: preço de mentira vira consulta, ano invertido é trocado e patrimônio fica fora", () => {
  assert.equal(precoPlaceholder(0.5, 0), true);
  assert.equal(precoPlaceholder(1.5, 215), true);
  assert.equal(precoPlaceholder(1.5, 3), false); // miudeza de verdade
  assert.equal(precoPlaceholder(62, 60), false);
  assert.deepEqual(faixaDeAnos(2010, 1983), [1983, 2010]);
  assert.deepEqual(faixaDeAnos(1995, 2005), [1995, 2005]);
  assert.ok(GRUPOS_FORA_DO_SITE.test("PATRIMONIO") && GRUPOS_FORA_DO_SITE.test("CONSUMO LOJA") && !GRUPOS_FORA_DO_SITE.test("FILTRO"));
  assert.equal(limparMarca("AUTO STAR PIVO"), "Auto Star");
  assert.equal(limparMarca("PRO TORK"), "Pro Tork");
  assert.equal(limparMarca("AMORT RECOND"), "");
});

test("29/09: catálogo publicado passa na trava inteira (nome, descrição, aplicação e meta)", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const meta = JSON.parse(readFileSync("public/catalogo/meta.json", "utf8"));
  const indice = JSON.parse(readFileSync("public/catalogo/indice.json", "utf8"));
  const detalhes = new Map();
  for (const f of readdirSync("public/catalogo/detalhes")) for (const [id, d] of Object.entries(JSON.parse(readFileSync(`public/catalogo/detalhes/${f}`, "utf8")))) detalhes.set(id, d);
  assert.deepEqual(vazamentos({ meta, indice, detalhes }), []);
  // Foto publicada só com nome sem código (site/<hash>): o nome no bucket do ERP é o código da peça.
  assert.deepEqual(fotosComCodigo({ meta, indice, detalhes }), []);
  assert.equal(indice.pecas.some((p) => /^d{4}.d{3}/.test(p[6] || "")), false);
  assert.equal(indice.pecas.some((p) => /Arquivo Aco|Gondola|Nobreak|Saco Lixo/i.test(p[1])), false);
});

test("29/09: custo e imposto da loja e código com pontos não saem na descrição", () => {
  const { linhas } = limparDescricao("ADITIVO ROSA RADCOOL IMPOSTO: VT PRODUTOS / QT X 1,065\nP/ PRECO CUSTO > IMPOSTO > MULTIPLICAR = 1,08\nBICO 0.280.155.929\nPOLO 2003 032.115.611-H\nVERONA 1989 / 10.1991\nCARROS COM MAIS DE 80.000 KM");
  const tudo = linhas.join(" | ");
  assert.doesNotMatch(tudo, /custo|imposto|multiplic|1,065|0\.280|032\.115/i);
  assert.match(tudo, /10\.1991/);
  assert.match(tudo, /80\.000 KM/i);
  for (const c of ["90.501.168", "0.280.155.929", "BRO.01.10.006", "032.115.611-H", "228.109-02"]) assert.equal(temCodigoDePeca(c), true, c);
  for (const ok of ["1.6", "2.0", "10.1991", "11.08", "1.250"]) assert.equal(temCodigoDePeca(ok), false, ok);
});

test("29/09 (verificação): chassi fica, código com pontos sai, preço de centavo vira consulta, nota de estoque sai", () => {
  for (const c of ["Peugeot Nº 9.633.359.080", "Bico Injetor / 0280.155.288", "Fusca/kombi 113.115.611", "Fiat 51.736.529", "Oirg 93.284.788 / 93.287.964", "Variant 311.119.665.B", "Válvula Termostática 3494.100"]) assert.equal(temCodigoDePeca(c), true, c);
  for (const ok of ["PALIO 1.4 8V FLEX - 06/.. ( ATE CHASSI 2.616.995 )", "UNO 1.5 8V FIASA - 97 / .. ( CHASSI A PARTIR Nº 5.912.671 )", "Rodas 5.5 X 14", "Correia 6PK 1.235"]) assert.equal(temCodigoDePeca(ok), false, ok);
  assert.equal(removerCodigosDePeca("PALIO 1.4 8V FLEX - 06/.."), "PALIO 1.4 8V FLEX - 06/..");
  assert.equal(precoPlaceholder(0.01, 4.5), true);
  assert.equal(precoPlaceholder(0.22, 6), false);
  assert.deepEqual(limparDescricao("TUCHO VELA CH19\nOBS: AJUSTE ESTOQUE 12/05/23\n07 PC ENFERRUJADAS").linhas, ["Tucho Vela CH19"]);
});

test("07/10: código do fabricante sai limpo, sem a sigla que o legado colou e sem o código interno", () => {
  // Casos reais do cadastro (conferidos no catálogo da marca: Contitech 6PK1580, SYL 2095, Cobreq N1464).
  assert.equal(codigoFabricante("6PK1580-CTT", "CONTITECH"), "6PK1580");
  assert.equal(codigoFabricante("3037-NFX", "NORFLEX"), "3037");
  assert.equal(codigoFabricante("1507-16V-DOF", "DOFAB"), "1507-16V");
  assert.equal(codigoFabricante("M04976+MS", "MS"), "M04976");
  assert.equal(codigoFabricante("M06059+A", "AXIOS BIELETA"), "M06059");
  assert.equal(codigoFabricante("2095", "SYL PASTILHA"), "2095");
  assert.equal(codigoFabricante(" n1464 ", "COBREQ"), "N1464");
  assert.equal(codigoFabricante("M04585*", "SUMEC GERAL"), "M04585");
  // Sigla que não é da marca pode ser parte do código: fica.
  assert.equal(codigoFabricante("08165-AR", "CBOR"), "08165-AR");
  assert.equal(codigoFabricante("4150-B", "BOSCH"), "4150-B", "uma letra depois do hífen é variante do fabricante");
  // Texto que não é código não sai.
  assert.equal(codigoFabricante("0W20 ACDELCO", "ACDELCO"), "");
  assert.equal(codigoFabricante("5W30 (D) MOTORCRAFT", "FORD"), "");
  assert.equal(codigoFabricante("ROSA 33% P USO WURTH", "WURTH"), "");
  assert.equal(codigoFabricante("", "X"), "");
  assert.equal(codigoFabricante("AB", "X"), "");
  assert.equal(codigoFabricante("9029.318", "SYL", true), "", "código interno da loja nunca sai");
  assert.equal(codigoFabricante("1055-MANG", "DV LOJA"), "", "rótulo interno não é fabricante");
  assert.equal(codigoFabricante("6620-DIV", "DIVERSOS"), "");
  assert.equal(codigoFabricante("0211545", "AXIOS BATENTE"), "0211545", "Axios usa 7 dígitos começando em 0");
});

test("07/10: similares nos dois sentidos, só entre peças do site e do mesmo grupo; busca acha pelo código", () => {
  const prod = (id, nome, marca, grupo, ref, disp = 1, preco = 50) => ({ id, nome, marca, grupo, ref, descricao: "", preco, disp, foto: null, unidade: "JG", qmin: 1 });
  const exportacao = {
    prods: [
      prod("syl", "PAST FREIO DT / 2095", "SYL PASTILHA", "PASTILHA FREIO", "2095", 0, 95),
      prod("cob", "PAST FREIO DT / 2095", "COBREQ", "PASTILHA FREIO", "N1464", 1, 227),
      prod("fras", "PAST FREIO DT", "FRAS-LE", "PASTILHA FREIO", "PD/598", 0, 120),
      prod("kit", "KIT CORREIA DENT", "CONTITECH", "KIT CORREIA DENTADA", "CT1028K1", 1, 300),
      prod("corr", "CORREIA DENT", "CONTITECH", "CORREIA DENTADA", "CT1028-CTT", 1, 90),
      prod("loja", "MOVEL BALCAO", "", "PATRIMONIO", "X100", 1, 10),
    ],
    apl: [],
    // A SYL lista a Cobreq; a Fras-le lista a SYL (o outro sentido); kit × correia avulsa não é similar; o móvel não está no site.
    sim: [{ pid: "syl", sid: "cob" }, { pid: "fras", sid: "syl" }, { pid: "kit", sid: "corr" }, { pid: "syl", sid: "loja" }, { pid: "syl", sid: "syl" }],
    bind: [],
  };
  const { meta, indice, detalhes, similaresForaDoGrupo } = construir(exportacao);
  const id = (pid) => idCurto(pid);
  // Com estoque primeiro: a Cobreq antes da Fras-le.
  assert.deepEqual(detalhes.get(id("syl")).s, [id("cob"), id("fras")]);
  assert.deepEqual(detalhes.get(id("cob")).s, [id("syl")]);
  assert.deepEqual(detalhes.get(id("fras")).s, [id("syl")]);
  assert.equal(detalhes.get(id("kit")).s, undefined, "kit de correia não é similar da correia avulsa");
  assert.equal(similaresForaDoGrupo.length, 1);
  const linha = (pid) => indice.pecas.find((p) => p[0] === id(pid));
  assert.equal(linha("syl")[12], "2095");
  assert.equal(linha("corr")[12], "CT1028", "sigla da marca sai do código");
  assert.equal(linha("fras")[12], "PD/598");
  // O nome continua sem código: a trava de vazamento vale para nome, descrição e aplicação.
  assert.deepEqual(vazamentos({ meta, indice, detalhes }), []);
  assert.ok(!JSON.stringify(indice).includes("syl\""), "id do ERP não vaza");
  assert.equal(similarCompativel({ grupo: "LUBRIFICANTES" }, { grupo: "AMORTECEDOR" }), true, "balde do legado não diz nada: vale o cadastro");
  assert.ok(SIMILARES_MAX >= 6);

  const catalogo = montarCatalogo(meta, indice.pecas);
  const achados = (q) => filtrar(catalogo, { ...FILTRO_VAZIO, q }).map((p) => p.id);
  for (const q of ["N1464", "n-1464", "N 1464", "cobreq n1464"]) assert.equal(achados(q)[0], id("cob"), q);
  assert.equal(achados("2095")[0], id("syl"));
  assert.equal(achados("syl 2095")[0], id("syl"));
  assert.equal(achados("PD598")[0], id("fras"), "barra do código não atrapalha");
  assert.equal(achados("pd/598")[0], id("fras"));
  assert.equal(catalogo.porId.get(id("syl")).codigo, "2095");
});

test("07/10: catálogo antigo (sem código e sem similares) continua abrindo", () => {
  const meta = { versao: 1, total: 1, comEstoque: 1, departamentos: [{ id: "freios", nome: "Freios", resumo: "", n: 1, grupos: [0], capa: "" }], grupos: [["Pastilha", 0, 1]], marcas: [["Cobreq", 1]], montadoras: [], modelos: [], unidades: ["JG"] };
  const catalogo = montarCatalogo(meta, [["abc12345", "Pastilha Freio Dianteiro", 0, 0, 9000, 1, "", [], 0, 0, 1, 0]]);
  assert.equal(catalogo.pecas[0].codigo, "");
  assert.equal(filtrar(catalogo, { ...FILTRO_VAZIO, q: "pastilha" }).length, 1);
});
