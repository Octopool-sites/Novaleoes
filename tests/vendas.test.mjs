import { test } from "node:test";
import assert from "node:assert/strict";
import { filtrar, montarCatalogo, FILTRO_VAZIO } from "../lib/catalogo-site.ts";

// Linha do índice: [id, nome, marca, grupo, preço, disponível, foto, aplicações, externalId, unidade, venda mínima]
const meta = {
  versao: 1, exportadoEm: null, geradoEm: "", empresa: "", total: 3, comEstoque: 3, comFoto: 0, fotoBase: "", buckets: 1,
  departamentos: [{ id: "motor", nome: "Motor", resumo: "", n: 3, grupos: [], capa: "" }],
  grupos: [["Anéis", 0, 3]], marcas: [["KS", 3]], montadoras: [], modelos: [], unidades: ["", "JG"],
};
const linha = (id, nome, preco, qmin) => [id, nome, 0, 0, preco, 1, "", [], 0, 1, qmin];

test("ordenar por preço usa o valor que o cartão mostra (total da compra mínima)", () => {
  const c = montarCatalogo(meta, [
    linha("a", "Anel avulso", 9000, 1), // R$ 90,00
    linha("b", "Jogo de anéis", 6200, 4), // 4 × R$ 62,00 = R$ 248,00
    linha("c", "Anel de consulta", 0, 1), // sem preço: sempre no fim do "menor preço"
  ]);
  const ordem = (o) => filtrar(c, { ...FILTRO_VAZIO, ordem: o }).map((p) => p.id).join("");
  assert.equal(ordem("menor-preco"), "abc");
  assert.equal(ordem("maior-preco"), "bac");
});
