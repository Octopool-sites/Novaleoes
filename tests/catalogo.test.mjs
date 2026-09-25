import { test } from "node:test";
import assert from "node:assert/strict";
import { limparNome, limparGrupo, limparDescricao, unidadeLegivel } from "../scripts/catalogo/nomes.mjs";
import { classificar, DEPARTAMENTOS, normalizarTexto } from "../scripts/catalogo/taxonomia.mjs";
import { construir, grupoDerivado, limparMarca, nomeModelo, chaveModelo, idCurto, bucketDe, normalizarAno, BUCKETS } from "../scripts/catalogo/construir.mjs";
import { filtrar, montarCatalogo, filtroDaUrl, filtroParaUrl, FILTRO_VAZIO, resumoAplicacoes, faixaAnos } from "../lib/catalogo-site.ts";

test("nomes: expande abreviações do balcão, restaura acentos e remove código de fabricante do fim", () => {
  assert.equal(limparNome("AMORT DT LE"), "Amortecedor Dianteiro Lado Esquerdo");
  assert.equal(limparNome("BOMBA DAGUA / 766"), "Bomba d'Água");
  assert.equal(limparNome("PAST FREIO DT C ABS"), "Pastilha Freio Dianteiro com ABS");
  assert.equal(limparNome("LAMP H4 HALOG 60/55 W"), "Lâmpada H4 Halógena 60/55 W");
  assert.equal(limparNome("75W90 TUTELA SEMI API GL5 1 L *"), "75W90 Tutela Semi API GL5 1 L");
  assert.equal(limparNome("CORREIA DENT 129 X 220 / 488"), "Correia Dentada 129 X 220");
  assert.equal(limparNome("DISCO FREIO DT SOL 4F 240 ( 31 )"), "Disco Freio Dianteiro Sólido 4 furos 240");
  assert.equal(limparNome("PAST FREIO DT ( 4213 )"), "Pastilha Freio Dianteiro");
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
  assert.equal(unidadeLegivel("JG", 4), "Jogo com 4");
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
  const url = filtroParaUrl({ ...FILTRO_VAZIO, q: "gol", departamento: "freios", modelo: 0, ano: 2010 }).toString();
  assert.deepEqual(filtroDaUrl(`?${url}`), { ...FILTRO_VAZIO, q: "gol", departamento: "freios", modelo: 0, ano: 2010 });
  assert.deepEqual(filtroDaUrl("?ano=abc&ordem=x&grupo=1.5"), FILTRO_VAZIO);
});
