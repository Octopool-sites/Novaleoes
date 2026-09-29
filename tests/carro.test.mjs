import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { mkdirSync, readFileSync, statSync } from "node:fs";

// O carro da abertura depende de nomes de nós do GLB (components/carro-modelo.ts). Se um nome sumir, a peça não
// se mexe e o número some sem erro nenhum: este teste lê o JSON do GLB (sem WebGL) e confere tudo.
mkdirSync("outputs", { recursive: true });
buildSync({
  entryPoints: ["components/carro-modelo.ts"], bundle: true, platform: "node", format: "esm",
  outfile: "outputs/test-carro-modelo.mjs", logLevel: "silent",
});
const { ARQUIVO_CARRO, POSTER_CARRO, FOTO_ABERTO, MOVIMENTOS, ZONAS } = await import("../outputs/test-carro-modelo.mjs");

function lerGlb(arquivo) {
  const buf = readFileSync(arquivo);
  assert.equal(buf.readUInt32LE(0), 0x46546c67, "não é GLB");
  const tamanho = buf.readUInt32LE(12);
  assert.equal(buf.readUInt32LE(16), 0x4e4f534a, "primeiro bloco não é JSON");
  return JSON.parse(buf.subarray(20, 20 + tamanho).toString("utf8"));
}
const glb = lerGlb(`public/${ARQUIVO_CARRO}`);
const nomes = glb.nodes.map((n) => n.name);

test("GLB do carro: todos os nós de movimento e dos números existem, com nome único", () => {
  for (const nome of [...MOVIMENTOS.map((m) => m.no), ...ZONAS.map((z) => z.pino.no)]) {
    assert.equal(nomes.filter((n) => n === nome).length, 1, `nó ${nome}`);
  }
});

test("GLB do carro: sem decodificador WASM (CSP sem wasm-unsafe-eval) e sem imagem embutida", () => {
  const exigidas = glb.extensionsRequired ?? [];
  for (const e of exigidas) assert.ok(["KHR_mesh_quantization"].includes(e), `extensão exigida ${e}`);
  for (const proibida of ["KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu"]) {
    assert.ok(!(glb.extensionsUsed ?? []).includes(proibida), proibida);
  }
  assert.equal((glb.images ?? []).length, 0, "imagens embutidas");
});

test("GLB do carro: orçamento de peso e de materiais", () => {
  assert.ok(statSync(`public/${ARQUIVO_CARRO}`).size <= 4 * 1024 * 1024, "até 4 MB");
  assert.ok(glb.materials.length <= 16, "materiais");
  assert.equal(glb.materials.filter((m) => m.extensions?.KHR_materials_clearcoat).length, 1, "só a pintura tem verniz");
  assert.ok(!glb.materials.some((m) => /logo|emblema|placa/i.test(m.name)), "sem logo nem placa");
});

test("carro: foto de espera, foto do carro aberto e créditos existem", () => {
  for (const f of [POSTER_CARRO, FOTO_ABERTO, "assets/car/ATTRIBUTION.txt"]) assert.ok(statSync(`public/${f}`).size > 0, f);
  assert.match(readFileSync("public/assets/car/ATTRIBUTION.txt", "utf8"), /i20/);
});

test("carro: cada número abre departamentos que existem no catálogo, e a foto de reserva tem posição válida", () => {
  const meta = JSON.parse(readFileSync("public/catalogo/meta.json", "utf8"));
  const deps = new Set(meta.departamentos.map((d) => d.id));
  assert.equal(ZONAS.length, 9);
  for (const z of ZONAS) {
    for (const d of z.deps) assert.ok(deps.has(d), `${z.id}: departamento ${d}`);
    assert.ok(z.foto[0] > 0 && z.foto[0] < 100 && z.foto[1] > 0 && z.foto[1] < 100, `${z.id}: posição na foto`);
  }
});
