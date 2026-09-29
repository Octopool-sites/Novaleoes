// Uso (fora do build do site): coloque o GLB original baixado do Sketchfab em modelos/i20nline.glb e rode com
// node scripts/carro/montar-hatch.mjs a partir de uma pasta com @gltf-transform/*, meshoptimizer e three
// instalados (o kit C:\dev\fabrica-3d do PC do Luca já tem tudo). malhas-i20.json = índice das 633 malhas do original.
// Monta o carro da vitrine Nova Leões a partir do "2020 Hyundai i20 N-Line" (Sketchfab, shreyanshchaurasia13, CC BY 4.0).
// Entrada: modelos/i20nline.glb (original) + info.json (índices das malhas, gerado pelo visualizador).
// Saída: saida/nova-leoes-hatch-v2.glb + saida/manifesto.json
//
// O que faz:
//  - leva tudo para metros, Y para cima, +Z frente, +X lado do motorista, chão em y = 0;
//  - agrupa as malhas em PEÇAS com nome ASCII (NL_*) e origem na dobradiça/eixo (capô, portas, rodas...);
//  - troca os 22 materiais do autor por poucos materiais próprios (pintura cinza da Higgsfield, vidro, preto...);
//  - tira logos, emblemas, placas, suporte de placa e as calotas centrais (marca); a grade fica inteira;
//  - o forro interno das portas (parte da "banheira" M38 do interior) sai com a porta;
//  - acrescenta, por código, as peças da vista "aberta": motor com correia e polias, filtro de ar laranja,
//    amortecedor com mola vermelha e o cofre fechado (assoalho, caixas de roda, corta-fogo, radiador, bateria);
//  - junta primitivas por peça+material, simplifica e quantiza (sem texturas, sem Draco/Meshopt: CSP sem wasm).
//    A PINTURA não é simplificada: o autor gravou normais por canto (ponderadas) e é isso que deixa a lataria
//    lisa; simplificar e recalcular as normais deixava o carro com cara de amassado (v1, 29-09).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { Document, NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, dedup, quantize, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import * as THREE from "three";
import { mergeGeometries, toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const origem = await io.read("modelos/i20nline.glb");
const info = JSON.parse(readFileSync(new URL("./malhas-i20.json", import.meta.url), "utf8")).info;
const porIndice = new Map(info.map((m) => [m.i, m]));
const grupoDe = (m) => { const c = m.pai.split("<"); return c.length >= 2 ? c[c.length - 2] : c[0]; };
const G = (g) => info.filter((m) => grupoDe(m) === g).map((m) => m.i);

// ---------------------------------------------------------------- peças (índices do info.json)
const PECAS = {
  NL_CAPO: [413],
  NL_GRADE: [289], // desenho da grade: fica inteiro (sem simplificar), senão vira facetas grandes
  // O teto (560, frisos 486/487, antena 423) fica na carroceria: não sobe mais na abertura (pedido do Luca, 29-09).
  // 325/337 e 330/335 NÃO são da porta: são a lateral e o pé dos bancos (iguais a 318/336 e 339 do outro lado do
  // banco). Na v1 iam com a porta e pareciam um porta-objetos "descolado" (Luca, 29-09).
  NL_PORTA_DE: [2, 20, 23, 24, 47, 49, 60, 63, 102, 243, 387, 523],
  NL_PORTA_TE: [4, 232, 246, 386, 383, 524],
  NL_RODA_DE: [15, 81, 70, ...G("node_id142_128"), ...G("node_id136_122")],
  NL_RODA_TE: [1, 457, 238, ...G("node_id650_605"), ...G("node_id611_567")],
  NL_PARALAMA_DE: [94],
  NL_DISCO_DE: [86, ...G("node_id635_590")],
  NL_PINCA_DE: [...G("node_id707_660")],
  NL_FAROL_E: [471, 6, 10, 13, 236, 251, 260],
  NL_VOLANTE: [313, 327, 338, 341],
  NL_CAMBIO: [342],
  NL_ESCAPAMENTO: [506, 507, 508, 509, 510, 511, 138, 139, 149, 150, 583],
};
// Marca e placas: fora do arquivo.
const REMOVER = new Set([
  ...G("node_id3_1"), // placas
  381, // suporte da placa dianteira (a grade é completada por cima do vão; ver GRADE)
  359, 360, // fundo oval do emblema dianteiro
  396, 170, // emblemas H dianteiro e traseiro
  87, 420, 80, 456, // H no centro das quatro rodas
  ...G("node_id182_162"), ...G("node_id244_219"), ...G("node_id232_208"), // letreiros N / i20 / N Line
  ...G("node_id280_253"), ...G("node_id298_270"), // "N" nos paralamas
  ...G("node_id198_177"), ...G("node_id629_584"), ...G("node_id204_183"), ...G("node_id341_308"), // calotas centrais com logo
]);

// ---------------------------------------------------------------- materiais novos
const MAT = {
  PINTURA: { cor: 0x6b6d70, metal: 0.45, rug: 0.4, clearcoat: 1 },
  PRETO: { cor: 0x121314, metal: 0.05, rug: 0.55 },
  PLASTICO: { cor: 0x1b1c1d, metal: 0, rug: 0.72 },
  VIDRO: { cor: 0x1a2124, metal: 0, rug: 0.04, alfa: 0.58 },
  LENTE: { cor: 0xd6dde1, metal: 0, rug: 0.03, alfa: 0.22 },
  CROMO: { cor: 0xd4d6d8, metal: 1, rug: 0.16 },
  RODA: { cor: 0xbfc1c3, metal: 0.9, rug: 0.3 },
  PNEU: { cor: 0x1c1d1e, metal: 0, rug: 0.9 },
  DISCO: { cor: 0x8c8e90, metal: 0.9, rug: 0.38 },
  LANTERNA: { cor: 0x8a0f14, metal: 0.1, rug: 0.3 },
  INTERIOR: { cor: 0x2a2b2d, metal: 0, rug: 0.82 },
  MOTOR: { cor: 0x46484b, metal: 0.65, rug: 0.42 },
  MOLA: { cor: 0xb3141d, metal: 0.25, rug: 0.4 },
  FILTRO: { cor: 0xe8892c, metal: 0, rug: 0.78 },
  RESERVATORIO: { cor: 0xd8d4c8, metal: 0, rug: 0.55 },
};
const DO_AUTOR = { material_0: "PRETO", material_1: "PINTURA", material_2: "PLASTICO", material_3: "LANTERNA", material_4: "INTERIOR", material_5: "CROMO", material_6: "VIDRO", material_7: "RODA", material_8: "LANTERNA", material_9: "PLASTICO", material_10: "CROMO", material_11: "LENTE", material_12: "PNEU", material_13: "DISCO", material_14: "CROMO", material_15: "LANTERNA", material_16: "CROMO", material_17: "PLASTICO", material_18: "MOTOR", material_19: "LANTERNA", material_20: "PLASTICO", material_21: "PLASTICO" };
// Exceções por malha: o teto do N-Line é preto (vira pintura, como o carro da Higgsfield); os aros escuros viram prata.
const MAT_MALHA = { 560: "PINTURA", 0: "RODA", 1: "RODA", 14: "RODA", 15: "RODA" };
for (const i of [...G("node_id635_590"), ...G("node_id624_579"), ...G("node_id173_153"), ...G("node_id428_391")]) MAT_MALHA[i] = "DISCO";

// ---------------------------------------------------------------- normalização (metros, chão em 0)
const cenaOrig = origem.getRoot().listScenes()[0];
const caixa0 = getBounds(cenaOrig);
const comp = Math.max(caixa0.max[0] - caixa0.min[0], caixa0.max[2] - caixa0.min[2]);
const ESCALA = 4.0 / comp; // i20: 3,995 m
const centro = [(caixa0.min[0] + caixa0.max[0]) / 2, caixa0.min[1], (caixa0.min[2] + caixa0.max[2]) / 2];
const NORMAL = new THREE.Matrix4().makeScale(ESCALA, ESCALA, ESCALA).multiply(new THREE.Matrix4().makeTranslation(-centro[0], -centro[1], -centro[2]));

// ---------------------------------------------------------------- lê cada malha do autor já no espaço do mundo
const nomeParaIndice = new Map(info.map((m) => [m.nome, m.i]));
const pecaDe = new Map();
for (const [p, lista] of Object.entries(PECAS)) for (const i of lista) pecaDe.set(i, p);
const blocos = new Map(); // "PECA|MAT" -> [{pos, nor, idx}]
function empilhar(peca, mat, pos, nor, idx) {
  const k = `${peca}|${mat}`;
  if (!blocos.has(k)) blocos.set(k, []);
  blocos.get(k).push({ pos, nor, idx });
}
// Primitivas de uma malha do autor já no mundo: [{pos, nor|null, idx, mat}]
function lerMalha(node, i) {
  const W = NORMAL.clone().multiply(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
  const N = new THREE.Matrix3().getNormalMatrix(W);
  const saida = [];
  for (const prim of node.getMesh().listPrimitives()) {
    const P = prim.getAttribute("POSITION"), Nn = prim.getAttribute("NORMAL"), I = prim.getIndices();
    const n = P.getCount();
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    const v = new THREE.Vector3(), a = [0, 0, 0];
    for (let k = 0; k < n; k++) {
      P.getElement(k, a); v.fromArray(a).applyMatrix4(W); pos.set([v.x, v.y, v.z], k * 3);
      if (Nn) { Nn.getElement(k, a); v.fromArray(a).applyMatrix3(N).normalize(); nor.set([v.x, v.y, v.z], k * 3); }
    }
    const idx = I ? Uint32Array.from(I.getArray()) : Uint32Array.from({ length: n }, (_, k) => k);
    if (W.determinant() < 0) for (let t = 0; t < idx.length; t += 3) { const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; }
    saida.push({ pos, nor: Nn ? nor : null, idx, mat: MAT_MALHA[i] || DO_AUTOR[prim.getMaterial()?.getName()] || "PLASTICO" });
  }
  return saida;
}
const noDe = new Map();
for (const node of origem.getRoot().listNodes()) if (node.getMesh()) noDe.set(nomeParaIndice.get(node.getName()), node);
const centroide = (pos, idx, t) => [0, 1, 2].map((e) => (pos[idx[t] * 3 + e] + pos[idx[t + 1] * 3 + e] + pos[idx[t + 2] * 3 + e]) / 3);

// ---- forro das portas: a "banheira" do interior (M38) tem as laterais lisas no lugar do forro das portas; com a
// porta aberta esse trecho ficava parado tampando os bancos (Luca, 29-09). O trecho de M38 atrás da chapa de cada
// porta (silhueta da chapa vista de lado, em z/y) sai, e cada porta ganha um forro próprio feito por código (FORRO,
// mais abaixo) que abre junto.
function silhueta(indices) {
  const CEL = 0.01, Z0 = -2.1, Y0 = 0, NZ = 420, NY = 150, grade = new Uint8Array(NZ * NY);
  for (const i of indices) for (const { pos, idx } of lerMalha(noDe.get(i), i)) for (let t = 0; t < idx.length; t += 3) {
    const p = [0, 1, 2].map((k) => [pos[idx[t + k] * 3 + 2], pos[idx[t + k] * 3 + 1]]);
    const zmin = Math.min(...p.map((q) => q[0])), zmax = Math.max(...p.map((q) => q[0])), ymin = Math.min(...p.map((q) => q[1])), ymax = Math.max(...p.map((q) => q[1]));
    const d = (p[1][1] - p[2][1]) * (p[0][0] - p[2][0]) + (p[2][0] - p[1][0]) * (p[0][1] - p[2][1]);
    for (let a = Math.floor((zmin - Z0) / CEL); a <= Math.floor((zmax - Z0) / CEL); a++) for (let b = Math.floor((ymin - Y0) / CEL); b <= Math.floor((ymax - Y0) / CEL); b++) {
      if (a < 0 || a >= NZ || b < 0 || b >= NY) continue;
      const z = Z0 + (a + 0.5) * CEL, y = Y0 + (b + 0.5) * CEL;
      let dentro = false;
      if (Math.abs(d) < 1e-12) dentro = true; // triângulo de perfil: marca a caixa
      else { const l1 = ((p[1][1] - p[2][1]) * (z - p[2][0]) + (p[2][0] - p[1][0]) * (y - p[2][1])) / d, l2 = ((p[2][1] - p[0][1]) * (z - p[2][0]) + (p[0][0] - p[2][0]) * (y - p[2][1])) / d; dentro = l1 >= -0.05 && l2 >= -0.05 && 1 - l1 - l2 >= -0.05; }
      if (dentro) grade[b * NZ + a] = 1;
    }
  }
  const dentro = (z, y) => { const a = Math.floor((z - Z0) / CEL), b = Math.floor((y - Y0) / CEL); return a >= 0 && a < NZ && b >= 0 && b < NY && grade[b * NZ + a] === 1; };
  // contorno por linha (y, z mínimo, z máximo): vira o desenho do forro
  const linhas = [];
  for (let b = 0; b < NY; b++) {
    let a0 = -1, a1 = -1;
    for (let a = 0; a < NZ; a++) if (grade[b * NZ + a]) { if (a0 < 0) a0 = a; a1 = a; }
    if (a0 >= 0) linhas.push({ y: Y0 + (b + 0.5) * CEL, z0: Z0 + a0 * CEL, z1: Z0 + (a1 + 1) * CEL });
  }
  return { dentro, linhas };
}
const silPortaDE = silhueta([2]), silPortaTE = silhueta([4]);
const DIVIDIR = {
  38: ([x, y, z]) => (x < 0.5 ? null : silPortaDE.dentro(z, y) || silPortaTE.dentro(z, y) ? "REMOVER" : null),
};

// ---- grade dianteira 100% (Luca, 29-09): sem o suporte de placa (381) o desenho da grade (M289) já continua por
// trás da placa. Só onde ficava o emblema a grade é lisa: esse vão é refeito com o próprio desenho da grade, copiado
// da faixa ao lado (mesma altura), acompanhando a curva da grade em z.
const GRADE = { malha: 289, vao: { x: 0.11, y0: 0.505, y1: 0.615 }, faixa: 0.11 };
function completarGrade({ pos, nor, idx }) {
  const { vao, faixa } = GRADE;
  // curva da frente da grade: z máximo por fatia de x
  const fat = new Map();
  for (let v = 0; v < pos.length; v += 3) { const k = Math.round(pos[v] * 50); fat.set(k, Math.max(fat.get(k) ?? -9, pos[v + 2])); }
  const zc = (x) => { const k = Math.round(x * 50); return fat.get(k) ?? fat.get(k - 1) ?? fat.get(k + 1); };
  const noVao = (c) => Math.abs(c[0]) < vao.x && c[1] > vao.y0 && c[1] < vao.y1;
  const manter = [], copiar = [];
  for (let t = 0; t < idx.length; t += 3) {
    const c = centroide(pos, idx, t);
    if (!noVao(c)) manter.push(t);
    const ax = Math.abs(c[0]);
    if (ax >= vao.x && ax < vao.x + faixa && c[1] > vao.y0 && c[1] < vao.y1) copiar.push(t);
  }
  const P = Array.from(pos), N = Array.from(nor), I = [];
  for (const t of manter) I.push(idx[t], idx[t + 1], idx[t + 2]);
  for (const t of copiar) {
    const lado = Math.sign(centroide(pos, idx, t)[0]);
    for (let passo = faixa; passo < vao.x + faixa - 1e-6; passo += faixa) {
      const dx = -lado * passo;
      for (let k = 0; k < 3; k++) {
        const v = idx[t + k];
        const x = pos[v * 3], nx = x + dx;
        P.push(nx, pos[v * 3 + 1], pos[v * 3 + 2] + (zc(nx) - zc(x)));
        N.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]);
        I.push(P.length / 3 - 1);
      }
    }
  }
  console.log(`grade: ${idx.length / 3 - manter.length} triângulos do vão fora, ${copiar.length * Math.round(vao.x / faixa)} copiados`);
  return { pos: Float32Array.from(P), nor: Float32Array.from(N), idx: Uint32Array.from(I) };
}

let lidas = 0, removidas = 0;
for (const [i, node] of noDe) {
  if (i === undefined) throw new Error(`malha sem índice: ${node.getName()}`);
  if (REMOVER.has(i)) { removidas++; continue; }
  const peca = pecaDe.get(i) || "NL_CARROCERIA";
  for (let { pos, nor, idx, mat } of lerMalha(node, i)) {
    if (i === GRADE.malha && !process.env.SEM_GRADE) ({ pos, nor, idx } = completarGrade({ pos, nor, idx }));
    if (DIVIDIR[i]) {
      const partes = new Map();
      for (let t = 0; t < idx.length; t += 3) {
        const p = DIVIDIR[i](centroide(pos, idx, t)) || peca;
        if (!partes.has(p)) partes.set(p, []);
        partes.get(p).push(idx[t], idx[t + 1], idx[t + 2]);
      }
      for (const [p, lista] of partes) {
        if (p === "REMOVER") { console.log(`M${i}: ${lista.length / 3} triângulos fora`); continue; }
        // só os vértices usados: a caixa da peça (dobradiça) é medida pelos vértices
        const novo = new Map(), P = [], Nr = [];
        const I = Uint32Array.from(lista, (v) => {
          if (!novo.has(v)) { novo.set(v, P.length / 3); P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); if (nor) Nr.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]); }
          return novo.get(v);
        });
        empilhar(p, mat, Float32Array.from(P), nor ? Float32Array.from(Nr) : null, I);
        if (p !== peca) console.log(`M${i}: ${lista.length / 3} triângulos -> ${p}`);
      }
    } else empilhar(peca, mat, pos, nor, idx);
    lidas++;
  }
}

// ---------------------------------------------------------------- caixas das peças (para dobradiças e extras)
function caixaDe(peca) {
  const b = new THREE.Box3();
  for (const [k, lista] of blocos) if (k.startsWith(peca + "|")) for (const { pos } of lista) for (let t = 0; t < pos.length; t += 3) b.expandByPoint(new THREE.Vector3(pos[t], pos[t + 1], pos[t + 2]));
  return b;
}
const cx = Object.fromEntries(Object.keys(PECAS).map((p) => [p, caixaDe(p)]));
const cCorpo = caixaDe("NL_CARROCERIA");

// ---------------------------------------------------------------- extras mecânicos (por código)
// junta geometrias do three mesmo misturando indexadas e não indexadas (Extrude x Cylinder), só posição+normal
function juntar(geos) {
  const misto = geos.some((g) => !g.index);
  const limpas = geos.map((g) => {
    if (!g.attributes.normal) g.computeVertexNormals();
    const h = misto && g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(h.attributes)) if (k !== "position" && k !== "normal") h.deleteAttribute(k);
    h.clearGroups();
    return h;
  });
  const r = mergeGeometries(limpas);
  if (!r) throw new Error("mergeGeometries falhou");
  return r;
}
function addGeo(peca, mat, geo) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.index) { const n = geo.attributes.position.count; geo.setIndex([...Array(n).keys()]); }
  empilhar(peca, mat, Float32Array.from(geo.attributes.position.array), Float32Array.from(geo.attributes.normal.array), Uint32Array.from(geo.index.array));
}
const M4 = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
const rodaC = cx.NL_RODA_DE.getCenter(new THREE.Vector3()); // centro da roda dianteira esquerda
const discoC = cx.NL_DISCO_DE.getCenter(new THREE.Vector3());

// Motor transversal no vão do capô.
const capo = cx.NL_CAPO;
// Altura mínima da face de baixo do capô sobre o vão do motor: todo o motor fica abaixo dela (fechado, nada fura).
let hCapo = Infinity;
for (const [k, lista] of blocos) if (k.startsWith("NL_CAPO|")) for (const { pos } of lista) for (let t = 0; t < pos.length; t += 3) {
  if (pos[t] > -0.36 && pos[t] < 0.40 && pos[t + 2] > capo.min.z + 0.12 && pos[t + 2] < capo.max.z - 0.12) hCapo = Math.min(hCapo, pos[t + 1]);
}
const motorC = new THREE.Vector3(0.02, hCapo - 0.47, (capo.min.z + capo.max.z) / 2 + 0.02);
console.log("capô: altura mínima", hCapo.toFixed(3), "centro do motor", motorC.toArray().map((v) => v.toFixed(3)).join(","));
// ---- motor 1.0/1.6 transversal, visto pela frente-esquerda como na foto da Higgsfield
function engrenagem(r, dentes, furos, esp) {
  // perfil dentado + furos de alívio, extrudado na espessura e deitado no eixo X
  const s = new THREE.Shape();
  const passo = (Math.PI * 2) / dentes;
  for (let d = 0; d < dentes; d++) {
    const a0 = d * passo;
    const pts = [[a0, r * 0.93], [a0 + passo * 0.18, r], [a0 + passo * 0.5, r], [a0 + passo * 0.68, r * 0.93]];
    for (const [a, rr] of pts) { const x = Math.cos(a) * rr, y = Math.sin(a) * rr; d === 0 && a === a0 ? s.moveTo(x, y) : s.lineTo(x, y); }
  }
  s.closePath();
  for (let f = 0; f < furos; f++) {
    const a = (f / furos) * Math.PI * 2 + 0.3, h = new THREE.Path();
    h.absarc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.2, 0, Math.PI * 2, true);
    s.holes.push(h);
  }
  const miolo = new THREE.Path(); miolo.absarc(0, 0, r * 0.14, 0, Math.PI * 2, true); s.holes.push(miolo);
  return new THREE.ExtrudeGeometry(s, { depth: esp, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -esp / 2).rotateY(Math.PI / 2);
}
{
  const bloco = new THREE.BoxGeometry(0.56, 0.26, 0.34, 1, 1, 1).applyMatrix4(M4(motorC.x, motorC.y - 0.03, motorC.z));
  const carter = new THREE.BoxGeometry(0.50, 0.06, 0.28).applyMatrix4(M4(motorC.x, motorC.y - 0.17, motorC.z - 0.01)); // cárter raso: o protetor embaixo fica escondido atrás do para-choque
  const cabecote = new THREE.BoxGeometry(0.54, 0.09, 0.28).applyMatrix4(M4(motorC.x, motorC.y + 0.145, motorC.z - 0.01));
  // alternador e compressor (cilindros na frente, embaixo)
  const alternador = new THREE.CylinderGeometry(0.06, 0.06, 0.13, 24).rotateZ(Math.PI / 2).applyMatrix4(M4(motorC.x + 0.12, motorC.y - 0.07, motorC.z + 0.23));
  const compressor = new THREE.CylinderGeometry(0.055, 0.055, 0.16, 24).rotateZ(Math.PI / 2).applyMatrix4(M4(motorC.x - 0.1, motorC.y - 0.15, motorC.z + 0.22));
  addGeo("NL_MOTOR", "MOTOR", juntar([bloco, carter, cabecote, alternador, compressor]));
  // tampa de válvulas preta com as quatro bobinas
  const tampa = new THREE.BoxGeometry(0.50, 0.045, 0.22).applyMatrix4(M4(motorC.x, motorC.y + 0.21, motorC.z - 0.01));
  const bobinas = [];
  for (let k = -1.5; k <= 1.5; k++) {
    bobinas.push(new THREE.BoxGeometry(0.05, 0.05, 0.075).applyMatrix4(M4(motorC.x + k * 0.1, motorC.y + 0.255, motorC.z - 0.01)));
    bobinas.push(new THREE.CylinderGeometry(0.014, 0.014, 0.04, 12).applyMatrix4(M4(motorC.x + k * 0.1, motorC.y + 0.28, motorC.z + 0.035)));
  }
  const tampaOleo = new THREE.CylinderGeometry(0.028, 0.028, 0.03, 20).applyMatrix4(M4(motorC.x - 0.2, motorC.y + 0.245, motorC.z + 0.05));
  addGeo("NL_MOTOR", "PLASTICO", juntar([tampa, ...bobinas, tampaOleo]));
  // coletor de admissão: quatro tubos curvos para trás + plenum
  const tubos = [];
  for (let k = -1.5; k <= 1.5; k++) {
    const curva = new THREE.CatmullRomCurve3([new THREE.Vector3(motorC.x + k * 0.1, motorC.y + 0.12, motorC.z - 0.15), new THREE.Vector3(motorC.x + k * 0.1, motorC.y + 0.2, motorC.z - 0.24), new THREE.Vector3(motorC.x + k * 0.07, motorC.y + 0.1, motorC.z - 0.3)]);
    tubos.push(new THREE.TubeGeometry(curva, 12, 0.021, 10, false));
  }
  const plenum = new THREE.CylinderGeometry(0.045, 0.045, 0.38, 20).rotateZ(Math.PI / 2).applyMatrix4(M4(motorC.x, motorC.y + 0.08, motorC.z - 0.31));
  addGeo("NL_MOTOR", "PLASTICO", juntar([...tubos, plenum]));
  // escudo térmico do coletor de escape, na frente (metálico)
  const escudo = new THREE.BoxGeometry(0.40, 0.11, 0.025).applyMatrix4(M4(motorC.x - 0.03, motorC.y + 0.05, motorC.z + 0.185));
  addGeo("NL_MOTOR", "DISCO", escudo);
  // caixa do filtro de ar (fica) — o elemento laranja sai na abertura
  const caixaFiltro = new THREE.BoxGeometry(0.30, 0.07, 0.22).applyMatrix4(M4(motorC.x - 0.2, motorC.y + 0.3, motorC.z + 0.02));
  const duto = new THREE.CylinderGeometry(0.035, 0.035, 0.18, 16).rotateX(Math.PI / 2).applyMatrix4(M4(motorC.x - 0.2, motorC.y + 0.3, motorC.z - 0.17));
  addGeo("NL_MOTOR", "PLASTICO", juntar([caixaFiltro, duto]));
}
// correia dentada e engrenagens na ponta do motor do lado do motorista (+X), viradas para a câmera
const ladoX = motorC.x + 0.31;
const polias = [
  { y: motorC.y + 0.16, z: motorC.z + 0.09, r: 0.07, dentes: 26, furos: 5 }, // comando de admissão
  { y: motorC.y + 0.16, z: motorC.z - 0.08, r: 0.07, dentes: 26, furos: 5 }, // comando de escape
  { y: motorC.y - 0.16, z: motorC.z + 0.02, r: 0.042, dentes: 18, furos: 0 }, // virabrequim
  { y: motorC.y + 0.0, z: motorC.z + 0.13, r: 0.03, dentes: 0, furos: 0 }, // tensor
];
{
  const engrenagens = [], cubos = [];
  for (const p of polias) {
    if (p.dentes) engrenagens.push(engrenagem(p.r, p.dentes, p.furos, 0.024).applyMatrix4(M4(ladoX, p.y, p.z)));
    else engrenagens.push(new THREE.CylinderGeometry(p.r, p.r, 0.024, 28).rotateZ(Math.PI / 2).applyMatrix4(M4(ladoX, p.y, p.z)));
    cubos.push(new THREE.CylinderGeometry(p.r * 0.2, p.r * 0.2, 0.04, 14).rotateZ(Math.PI / 2).applyMatrix4(M4(ladoX + 0.006, p.y, p.z)));
  }
  addGeo("NL_CORREIA", "DISCO", juntar(engrenagens));
  addGeo("NL_CORREIA", "MOTOR", juntar(cubos));
  // correia: passa por fora das quatro, fechada
  const ordem = [0, 3, 2, 1];
  const centroP = ordem.reduce((s, k) => s.add(new THREE.Vector3(ladoX, polias[k].y, polias[k].z)), new THREE.Vector3()).multiplyScalar(1 / ordem.length);
  const caminho = [];
  for (const k of ordem) {
    const p = polias[k];
    const fora = new THREE.Vector3(0, p.y - centroP.y, p.z - centroP.z).normalize();
    for (let s = -4; s <= 4; s++) {
      const ang = Math.atan2(fora.y, fora.z) + (s / 4) * 1.05;
      caminho.push(new THREE.Vector3(ladoX, p.y + Math.sin(ang) * (p.r + 0.005), p.z + Math.cos(ang) * (p.r + 0.005)));
    }
  }
  const curva = new THREE.CatmullRomCurve3(caminho, true, "centripetal");
  const correia = new THREE.TubeGeometry(curva, 220, 0.006, 6, true);
  const pc = correia.attributes.position;
  for (let k = 0; k < pc.count; k++) pc.setX(k, ladoX + (pc.getX(k) - ladoX) * 3.6); // larga (em X) e fina
  addGeo("NL_CORREIA", "PNEU", correia);
}

// filtro de ar laranja com pregas (a peça que flutua na abertura)
{
  const fx = motorC.x - 0.20, fy = motorC.y + 0.355, fz = motorC.z + 0.02;
  const moldura = new THREE.BoxGeometry(0.27, 0.035, 0.19).applyMatrix4(M4(fx, fy, fz));
  addGeo("NL_FILTRO_AR", "PLASTICO", new THREE.BoxGeometry(0.28, 0.012, 0.20).applyMatrix4(M4(fx, fy - 0.022, fz)));
  const pregas = [];
  for (let k = 0; k < 18; k++) pregas.push(new THREE.BoxGeometry(0.012, 0.04, 0.18).rotateZ(k % 2 ? 0.25 : -0.25).applyMatrix4(M4(fx - 0.125 + k * 0.0147, fy + 0.004, fz)));
  addGeo("NL_FILTRO_AR", "FILTRO", juntar([moldura, ...pregas]));
}
// amortecedor dianteiro esquerdo com mola vermelha, por dentro do disco
{
  const ax = discoC.x - 0.13, az = rodaC.z - 0.02;
  const base = rodaC.y + 0.02, topo = rodaC.y + 0.46; // o coxim fica abaixo da borda do capô (fechado, nada aparece)
  const corpo = new THREE.CylinderGeometry(0.028, 0.028, (topo - base) * 0.6, 20).applyMatrix4(M4(ax, base + (topo - base) * 0.3, az));
  const haste = new THREE.CylinderGeometry(0.012, 0.012, (topo - base) * 0.5, 12).applyMatrix4(M4(ax, base + (topo - base) * 0.72, az));
  const coxim = new THREE.CylinderGeometry(0.06, 0.07, 0.03, 24).applyMatrix4(M4(ax, topo, az));
  const prato = new THREE.CylinderGeometry(0.075, 0.075, 0.012, 24).applyMatrix4(M4(ax, base + (topo - base) * 0.42, az));
  const pratoS = new THREE.CylinderGeometry(0.075, 0.075, 0.012, 24).applyMatrix4(M4(ax, topo - 0.03, az));
  addGeo("NL_AMORTECEDOR_DE", "MOTOR", juntar([corpo, haste, coxim, prato, pratoS]));
  class Helice extends THREE.Curve {
    constructor(y0, y1, r, voltas) { super(); Object.assign(this, { y0, y1, r, voltas }); }
    getPoint(t, alvo = new THREE.Vector3()) { const a = t * this.voltas * Math.PI * 2; return alvo.set(ax + Math.cos(a) * this.r, this.y0 + (this.y1 - this.y0) * t, az + Math.sin(a) * this.r); }
  }
  const mola = new THREE.TubeGeometry(new Helice(base + (topo - base) * 0.43, topo - 0.035, 0.062, 5.5), 220, 0.011, 8, false);
  addGeo("NL_AMORTECEDOR_DE", "MOLA", mola);
}

// Cofre do motor fechado (Luca, 29-09: pelo vão do motor dava para ver o chão). O modelo do autor não tem nada
// abaixo do capô: aqui entram protetor de cárter, caixas de roda internas com a torre do amortecedor, corta-fogo,
// travessa com radiador, mangueira, servo-freio, bateria, reservatório e caixa de fusíveis. Tudo abaixo da face de
// baixo do capô (medida ponto a ponto), então com o capô fechado nada aparece.
{
  const pontosCapo = [];
  for (const [k, lista] of blocos) if (k.startsWith("NL_CAPO|")) for (const { pos } of lista) for (let t = 0; t < pos.length; t += 3) pontosCapo.push([pos[t], pos[t + 1], pos[t + 2]]);
  const sobCapo = (x0, x1, z0, z1) => { let m = Infinity; for (const [x, y, z] of pontosCapo) if (x >= x0 && x <= x1 && z >= z0 && z <= z1) m = Math.min(m, y); return m; };
  const ax = discoC.x - 0.13, az = rodaC.z - 0.02; // eixo do amortecedor (igual ao bloco de cima)
  const zFogo = 0.985, zFarol = 1.40, zRad = 1.705, xAba = 0.54, yPiso = 0.115;
  const xBorda = 0.755;
  const yDeck = Math.min(0.70, sobCapo(xAba, xBorda, zFogo, zFarol) - 0.03, sobCapo(-xBorda, -xAba, zFogo, zFarol) - 0.03);
  const yTrav = Math.min(0.68, sobCapo(-0.46, 0.46, 1.64, 1.80) - 0.03);
  const yFogo = Math.min(0.86, sobCapo(-0.6, 0.6, zFogo, zFogo + 0.12) - 0.03);
  console.log("cofre: deck", yDeck.toFixed(3), "travessa", yTrav.toFixed(3), "corta-fogo", yFogo.toFixed(3));
  const caixa = (sx, sy, sz, x, y, z) => new THREE.BoxGeometry(sx, sy, sz).applyMatrix4(M4(x, y, z));
  // protetor de cárter (piso do cofre)
  addGeo("NL_COFRE", "PLASTICO", caixa(2 * xAba + 0.02, 0.012, zRad - zFogo + 0.03, 0, yPiso, (zFogo + zRad) / 2));
  const chapa = [];
  for (const s of [1, -1]) {
    // caixa de roda interna: alta até o farol, baixa embaixo do farol
    chapa.push(caixa(0.012, yDeck - yPiso, zFarol - zFogo, s * xAba, (yDeck + yPiso) / 2, (zFogo + zFarol) / 2));
    chapa.push(caixa(0.012, 0.5 - yPiso, zRad - zFarol, s * xAba, (0.5 + yPiso) / 2, (zFarol + zRad) / 2));
    // aba de cima da caixa de roda até a borda do paralama, com o furo da torre do amortecedor
    const forma = new THREE.Shape();
    const xa = s * xAba, xb = s * xBorda;
    forma.moveTo(Math.min(xa, xb), zFogo); forma.lineTo(Math.max(xa, xb), zFogo); forma.lineTo(Math.max(xa, xb), zFarol); forma.lineTo(Math.min(xa, xb), zFarol); forma.closePath();
    const furo = new THREE.Path(); furo.absarc(s * ax, az, 0.085, 0, Math.PI * 2, true); forma.holes.push(furo);
    chapa.push(new THREE.ExtrudeGeometry(forma, { depth: 0.01, bevelEnabled: false, curveSegments: 20 }).rotateX(Math.PI / 2).applyMatrix4(M4(0, yDeck + 0.005, 0)));
    // anel da torre em volta do furo
    chapa.push(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 32, 1, true).applyMatrix4(M4(s * ax, yDeck - 0.005, az)));
  }
  // prateleira embaixo de cada farol (fechava a fresta entre farol, travessa e caixa de roda)
  for (const s of [1, -1]) chapa.push(caixa(0.26, 0.01, 0.30, s * 0.57, 0.495, 1.55));
  // corta-fogo e travessa do radiador
  chapa.push(caixa(2 * xAba + 0.02, yFogo - yPiso, 0.012, 0, (yFogo + yPiso) / 2, zFogo));
  chapa.push(caixa(0.92, 0.035, 0.07, 0, yTrav, zRad + 0.02));
  addGeo("NL_COFRE", "PINTURA", juntar(chapa));
  // coxim do amortecedor do lado do passageiro (o do motorista vem com o amortecedor)
  addGeo("NL_COFRE", "MOTOR", juntar([
    new THREE.CylinderGeometry(0.06, 0.07, 0.03, 24).applyMatrix4(M4(-ax, yDeck + 0.02, az)),
    ...[0, 1, 2].map((k) => new THREE.CylinderGeometry(0.009, 0.009, 0.02, 10).applyMatrix4(M4(-ax + Math.cos(k * 2.1) * 0.08, yDeck + 0.018, az + Math.sin(k * 2.1) * 0.08))),
  ]));
  // radiador: colmeia de aletas entre dois tanques pretos
  const yR0 = 0.17, yR1 = yTrav - 0.03, hR = yR1 - yR0;
  const aletas = [];
  for (let x = -0.40; x <= 0.40; x += 0.0115) aletas.push(caixa(0.0016, hR, 0.024, x, (yR0 + yR1) / 2, zRad));
  for (let y = yR0 + 0.03; y < yR1; y += 0.05) aletas.push(caixa(0.80, 0.004, 0.02, 0, y, zRad));
  addGeo("NL_COFRE", "DISCO", juntar(aletas));
  addGeo("NL_COFRE", "PLASTICO", juntar([
    caixa(0.05, hR + 0.02, 0.045, -0.43, (yR0 + yR1) / 2, zRad), caixa(0.05, hR + 0.02, 0.045, 0.43, (yR0 + yR1) / 2, zRad),
    // defletor do eletroventilador atrás da colmeia
    caixa(0.78, hR - 0.04, 0.012, 0, (yR0 + yR1) / 2, zRad - 0.03),
  ]));
  // mangueira superior do radiador até a caixa-d'água do motor
  const mangueira = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.40, yR1 - 0.04, zRad - 0.02), new THREE.Vector3(-0.38, yR1 - 0.05, zRad - 0.09), new THREE.Vector3(-0.31, motorC.y + 0.1, motorC.z + 0.19)]);
  addGeo("NL_COFRE", "PNEU", new THREE.TubeGeometry(mangueira, 24, 0.02, 10, false));
  // servo-freio com cilindro-mestre e reservatório de fluido (lado do motorista, no corta-fogo)
  addGeo("NL_COFRE", "PRETO", juntar([
    new THREE.CylinderGeometry(0.11, 0.11, 0.09, 36).rotateX(Math.PI / 2).applyMatrix4(M4(0.37, 0.56, zFogo + 0.05)),
    new THREE.CylinderGeometry(0.03, 0.03, 0.12, 16).rotateX(Math.PI / 2).applyMatrix4(M4(0.37, 0.56, zFogo + 0.15)),
  ]));
  addGeo("NL_COFRE", "RESERVATORIO", juntar([
    new THREE.CylinderGeometry(0.035, 0.035, 0.06, 20).applyMatrix4(M4(0.37, 0.62, zFogo + 0.15)),
    caixa(0.08, 0.12, 0.13, 0.44, 0.50, 1.33), // reservatório de expansão do arrefecimento
  ]));
  addGeo("NL_COFRE", "PLASTICO", juntar([
    new THREE.CylinderGeometry(0.03, 0.03, 0.02, 20).applyMatrix4(M4(0.37, 0.66, zFogo + 0.15)),
    new THREE.CylinderGeometry(0.026, 0.026, 0.022, 20).applyMatrix4(M4(0.44, 0.57, 1.36)),
  ]));
  // bateria (lado do passageiro) com bandeja, tampa e bornes; caixa de fusíveis na frente dela
  const bx = -0.445, bz = 1.20, by0 = 0.34, by1 = 0.53;
  addGeo("NL_COFRE", "PLASTICO", juntar([
    caixa(0.17, by1 - by0, 0.24, bx, (by0 + by1) / 2, bz), caixa(0.19, 0.02, 0.26, bx, by0 - 0.01, bz),
    caixa(0.12, 0.08, 0.16, -0.36, 0.45, 1.50), new THREE.CylinderGeometry(0.02, 0.02, by0 - yPiso, 12).applyMatrix4(M4(bx, (by0 + yPiso) / 2, bz)),
  ]));
  addGeo("NL_COFRE", "PRETO", juntar([
    caixa(0.175, 0.012, 0.245, bx, by1 + 0.006, bz), caixa(0.125, 0.012, 0.165, -0.36, 0.496, 1.50),
    new THREE.CylinderGeometry(0.012, 0.012, 0.025, 12).applyMatrix4(M4(bx - 0.045, by1 + 0.02, bz - 0.085)),
  ]));
  addGeo("NL_COFRE", "MOLA", juntar([
    new THREE.CylinderGeometry(0.012, 0.012, 0.025, 12).applyMatrix4(M4(bx + 0.045, by1 + 0.02, bz - 0.085)),
    caixa(0.045, 0.02, 0.04, bx + 0.045, by1 + 0.03, bz - 0.085), // capa vermelha do borne positivo
  ]));
}

// Forro das portas do motorista (as que abrem). Contorno = silhueta da chapa da porta, 1,5 cm para dentro; é uma
// placa com espessura entre a chapa e a cabine: a face de dentro é o forro, a borda é o batente pintado. Por cima
// vêm friso, apoio de braço, porta-objetos, puxador, maçaneta e alto-falante. Vai num nó filho da porta
// (NL_PORTA_*_FORRO) e por isso abre junto, sem ser simplificado.
const X_FORRO = 0.69, X_FORRO_FORA = 0.755; // a chapa da porta começa em x = 0,764
function forroPorta(porta, sil, d) {
  const peca = `${porta}_FORRO`;
  const lin = sil.linhas;
  const yBase = lin[0].y + 0.015, yTopo = lin[lin.length - 1].y - 0.012;
  // contorno suavizado (média de 7 linhas = 7 cm) e a cada 3 cm: em degraus, a borda saía listrada
  const media = (k, campo) => { let s = 0, n = 0; for (let j = Math.max(0, k - 3); j <= Math.min(lin.length - 1, k + 3); j++) { s += lin[j][campo]; n++; } return s / n; };
  const lisas = lin.map((l, k) => ({ y: l.y, z0: media(k, "z0"), z1: media(k, "z1") }));
  const usadas = lisas.filter((l, k) => l.y >= yBase && l.y <= yTopo && (k % 3 === 0 || l.y + 0.03 > yTopo));
  const pts = [];
  for (const l of usadas) pts.push(new THREE.Vector2(l.z1 - 0.015, l.y));
  for (const l of [...usadas].reverse()) pts.push(new THREE.Vector2(l.z0 + 0.015, l.y));
  const placa = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: X_FORRO_FORA - X_FORRO, bevelEnabled: false, curveSegments: 1 })
    .rotateY(-Math.PI / 2).applyMatrix4(M4(X_FORRO_FORA, 0, 0));
  // grupo 0 = as duas tampas (a de dentro é o forro), grupo 1 = a borda (batente)
  const parte = (g) => { const r = new THREE.BufferGeometry(); for (const k of ["position", "normal"]) { const at = placa.attributes[k]; r.setAttribute(k, new THREE.BufferAttribute(at.array.slice(g.start * 3, (g.start + g.count) * 3), 3)); } return r; };
  addGeo(peca, "INTERIOR", parte(placa.groups[0]));
  addGeo(peca, "PINTURA", toCreasedNormals(parte(placa.groups[1]), (40 * Math.PI) / 180));
  const topo = usadas[usadas.length - 1], xIn = (e) => X_FORRO - e / 2; // caixa encostada no forro, com espessura e
  const plast = [
    caixa(0.022, 0.05, topo.z1 - topo.z0 - 0.05, xIn(0.022), yTopo - 0.025, (topo.z0 + topo.z1) / 2), // friso de cima
    caixa(0.075, 0.035, d.apoio[1] - d.apoio[0], xIn(0.075), 0.625, (d.apoio[0] + d.apoio[1]) / 2), // apoio de braço
    caixa(0.03, 0.09, 0.05, xIn(0.03), 0.575, d.apoio[1] - 0.04), // pé do apoio (puxador)
    // porta-objetos aberto em cima: fundo, parede de fora e as duas pontas
    caixa(0.06, 0.012, d.bolsa[1] - d.bolsa[0], xIn(0.06), 0.33, (d.bolsa[0] + d.bolsa[1]) / 2),
    caixa(0.01, 0.11, d.bolsa[1] - d.bolsa[0], X_FORRO - 0.055, 0.38, (d.bolsa[0] + d.bolsa[1]) / 2),
    caixa(0.06, 0.11, 0.012, xIn(0.06), 0.38, d.bolsa[0]), caixa(0.06, 0.11, 0.012, xIn(0.06), 0.38, d.bolsa[1]),
  ];
  addGeo(peca, "PLASTICO", juntar(plast));
  addGeo(peca, "PRETO", juntar([
    new THREE.CylinderGeometry(0.075, 0.075, 0.01, 32).rotateZ(Math.PI / 2).applyMatrix4(M4(X_FORRO - 0.005, d.som[1], d.som[0])), // alto-falante
    caixa(0.012, 0.05, 0.14, X_FORRO - 0.006, 0.79, d.macaneta), // moldura da maçaneta
    caixa(0.012, 0.025, 0.1, X_FORRO - 0.006, 0.645, d.apoio[1] - 0.09), // botões do vidro
  ]));
  addGeo(peca, "CROMO", juntar([
    new THREE.TorusGeometry(0.078, 0.004, 6, 32).rotateY(Math.PI / 2).applyMatrix4(M4(X_FORRO - 0.011, d.som[1], d.som[0])),
    caixa(0.02, 0.018, 0.08, X_FORRO - 0.016, 0.79, d.macaneta), // maçaneta
  ]));
}
function caixa(sx, sy, sz, x, y, z) { return new THREE.BoxGeometry(sx, sy, sz).applyMatrix4(M4(x, y, z)); }
forroPorta("NL_PORTA_DE", silPortaDE, { apoio: [-0.22, 0.2], bolsa: [-0.05, 0.5], som: [0.62, 0.43], macaneta: 0.5 });
forroPorta("NL_PORTA_TE", silPortaTE, { apoio: [-0.95, -0.55], bolsa: [-0.9, -0.5], som: [-0.4, 0.45], macaneta: -0.42 });

// Assoalho da cabine e soleiras (o modelo não tem piso: via-se o chão por baixo dos bancos). Os pés dos bancos
// (337, 336, 339...) terminam em y = 0,299: o carpete fica exatamente aí. Estreito o bastante para não entrar nas
// rodas; a soleira fica logo abaixo da borda de baixo das portas.
addGeo("NL_CABINE", "INTERIOR", caixa(1.24, 0.05, 2.24, 0, 0.274, -0.17));
addGeo("NL_CABINE", "PRETO", juntar([1, -1].map((s) => caixa(0.14, 0.055, 1.77, s * 0.69, 0.2275, -0.085))));

// ---------------------------------------------------------------- dobradiças / eixos (origem de cada peça)
const PIVO = {
  NL_CAPO: [0, capo.max.y - 0.01, capo.min.z + 0.02], // borda traseira, gira para cima
  NL_PORTA_DE: [cx.NL_PORTA_DE.max.x - 0.12, 0.7, 0.80], // borda dianteira
  NL_PORTA_TE: [cx.NL_PORTA_TE.max.x - 0.08, 0.7, -0.27],
  NL_RODA_DE: rodaC.toArray(),
  NL_RODA_TE: cx.NL_RODA_TE.getCenter(new THREE.Vector3()).toArray(),
};
// Nós filhos: mesma origem do pai (acompanham o giro da porta).
const PAI = { NL_PORTA_DE_FORRO: "NL_PORTA_DE", NL_PORTA_TE_FORRO: "NL_PORTA_TE" };
for (const [filho, pai] of Object.entries(PAI)) PIVO[filho] = PIVO[pai];

// ---------------------------------------------------------------- documento novo
const doc = new Document();
const buf = doc.createBuffer();
const materiais = {};
for (const [nome, m] of Object.entries(MAT)) {
  const c = new THREE.Color(m.cor).convertSRGBToLinear();
  const mat = doc.createMaterial(nome).setBaseColorFactor([c.r, c.g, c.b, m.alfa ?? 1]).setMetallicFactor(m.metal).setRoughnessFactor(m.rug);
  if (m.alfa !== undefined) mat.setAlphaMode("BLEND");
  if (m.clearcoat) {
    const ext = doc.createExtension(ALL_EXTENSIONS.find((E) => E.EXTENSION_NAME === "KHR_materials_clearcoat"));
    mat.setExtension("KHR_materials_clearcoat", ext.createClearcoat().setClearcoatFactor(1).setClearcoatRoughnessFactor(0.12));
  }
  materiais[nome] = mat;
}
const cena = doc.createScene("NovaLeoesHatch");
const raiz = doc.createNode("NL_HATCH");
cena.addChild(raiz);
const nos = {};
// v2: lataria e grade inteiras custam ~0,9 MB; o peso sai de peças escuras/pequenas onde a simplificação não aparece.
const RATIO = { PNEU: 0.16, RODA: 0.13, INTERIOR: 0.22, PRETO: 0.17, PLASTICO: 0.17, PINTURA: 0.34, CROMO: 0.15, LENTE: 0.1, VIDRO: 0.5, DISCO: 0.24, LANTERNA: 0.16, MOTOR: 0.3 };
const EXTRAS = new Set(["NL_MOTOR", "NL_CORREIA", "NL_FILTRO_AR", "NL_AMORTECEDOR_DE", "NL_COFRE", "NL_CABINE", "NL_PORTA_DE_FORRO", "NL_PORTA_TE_FORRO"]);
// Materiais que ficam com a malha e as normais do autor (só soldados): a lataria. O autor gravou uma normal por
// canto de face (ponderada pela face); é o que deixa a chapa lisa com poucos vértices. Simplificar e recalcular
// as normais (v1) deixava reflexos ondulados, cara de carro batido.
const SEM_SIMPLIFICAR = new Set(["PINTURA"]);
const PECA_INTEIRA = new Set(["NL_GRADE"]);
// Solda cantos na mesma posição cujas normais diferem menos que `graus` (média das normais do grupo).
function soldarComNormal(pos, nor, idx, graus) {
  const cosV = Math.cos((graus * Math.PI) / 180);
  const porPosicao = new Map(), novo = new Uint32Array(pos.length / 3);
  const P = [], N = [], soma = [];
  for (let v = 0; v < pos.length / 3; v++) {
    const chave = `${Math.round(pos[v * 3] * 2e4)},${Math.round(pos[v * 3 + 1] * 2e4)},${Math.round(pos[v * 3 + 2] * 2e4)}`;
    let grupo = porPosicao.get(chave);
    if (!grupo) porPosicao.set(chave, (grupo = []));
    const n = [nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]];
    let alvo = grupo.find((g) => g.dir[0] * n[0] + g.dir[1] * n[1] + g.dir[2] * n[2] >= cosV);
    if (!alvo) { alvo = { dir: n, id: P.length / 3 }; grupo.push(alvo); P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); soma.push([0, 0, 0]); }
    const s = soma[alvo.id]; s[0] += n[0]; s[1] += n[1]; s[2] += n[2];
    novo[v] = alvo.id;
  }
  for (const s of soma) { const l = Math.hypot(...s) || 1; N.push(s[0] / l, s[1] / l, s[2] / l); }
  const I = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = novo[idx[t]], b = novo[idx[t + 1]], c = novo[idx[t + 2]];
    if (a !== b && b !== c && a !== c) I.push(a, b, c);
  }
  return { pos: Float32Array.from(P), nor: Float32Array.from(N), idx: Uint32Array.from(I) };
}
const VINCO = { PINTURA: 42, VIDRO: 50, PNEU: 35, RODA: 30 };
function soldarPosicao(pos, idx) {
  const n = pos.length / 3, mapa = new Map(), novo = new Uint32Array(n), p2 = new Float32Array(n * 3);
  let m = 0;
  for (let v = 0; v < n; v++) {
    const chave = `${Math.round(pos[v * 3] * 2e4)},${Math.round(pos[v * 3 + 1] * 2e4)},${Math.round(pos[v * 3 + 2] * 2e4)}`;
    let a = mapa.get(chave);
    if (a === undefined) { a = m++; mapa.set(chave, a); p2.set(pos.subarray(v * 3, v * 3 + 3), a * 3); }
    novo[v] = a;
  }
  const i2 = new Uint32Array(idx.length);
  for (let t = 0; t < idx.length; t++) i2[t] = novo[idx[t]];
  return { pos: p2.slice(0, m * 3), idx: i2 };
}
// Normal por vértice média das faces vizinhas, separando o vértice quando o ângulo entre faces passa do vinco.
function normaisComVinco(pos, idx, graus) {
  const cosV = Math.cos((graus * Math.PI) / 180);
  const nt = idx.length / 3, fn = new Float32Array(nt * 3), fa = new Float32Array(nt);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < nt; t++) {
    a.fromArray(pos, idx[t * 3] * 3); b.fromArray(pos, idx[t * 3 + 1] * 3); c.fromArray(pos, idx[t * 3 + 2] * 3);
    const n = b.sub(a).cross(c.sub(a)); const area = n.length(); fa[t] = area;
    if (area > 0) n.divideScalar(area); fn.set([n.x, n.y, n.z], t * 3);
  }
  const porVert = Array.from({ length: pos.length / 3 }, () => []);
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) porVert[idx[t * 3 + k]].push(t);
  const P = [], N = [], I = new Uint32Array(idx.length);
  const chaveCanto = new Map();
  for (let v = 0; v < porVert.length; v++) {
    const faces = porVert[v];
    const grupos = []; // [{n: Vector3 (soma), faces: []}]
    for (const t of faces) {
      const nf = new THREE.Vector3(fn[t * 3], fn[t * 3 + 1], fn[t * 3 + 2]);
      let g = grupos.find((g) => g.dir.dot(nf) >= cosV);
      if (!g) { g = { dir: nf.clone(), soma: new THREE.Vector3(), faces: [] }; grupos.push(g); }
      g.soma.addScaledVector(nf, fa[t] || 1e-9); g.faces.push(t);
    }
    for (const g of grupos) {
      const nn = g.soma.lengthSq() > 0 ? g.soma.normalize() : g.dir;
      const novo = P.length / 3;
      P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); N.push(nn.x, nn.y, nn.z);
      for (const t of g.faces) chaveCanto.set(t * 3 + idx.subarray(t * 3, t * 3 + 3).indexOf(v), novo);
    }
  }
  for (let q = 0; q < idx.length; q++) I[q] = chaveCanto.get(q);
  return { pos: Float32Array.from(P), nor: Float32Array.from(N), idx: I };
}
let trisAntes = 0, trisDepois = 0;
for (const [k, lista] of blocos) {
  const [peca, mat] = k.split("|");
  // concatena
  let nv = 0, ni = 0; for (const b of lista) { nv += b.pos.length / 3; ni += b.idx.length; }
  let pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3); let idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const b of lista) {
    pos.set(b.pos, ov * 3);
    if (b.nor) nor.set(b.nor, ov * 3);
    for (let t = 0; t < b.idx.length; t++) idx[oi + t] = b.idx[t] + ov;
    ov += b.pos.length / 3; oi += b.idx.length;
  }
  trisAntes += idx.length / 3;
  if (!EXTRAS.has(peca) && (SEM_SIMPLIFICAR.has(mat) || PECA_INTEIRA.has(peca)) && lista.every((b) => b.nor)) {
    ({ pos, nor, idx } = soldarComNormal(pos, nor, idx, +(process.env.SOLDA_GRAUS || 15)));
    if (process.env.DEBUG) console.log(k, "t", ni / 3, "->", idx.length / 3, "(sem simplificar), vértices", pos.length / 3);
  } else if (!EXTRAS.has(peca)) {
    // O autor exportou normais facetadas (cada face com os próprios vértices): solda só por POSIÇÃO para o
    // simplificador conseguir colapsar, e depois recalcula as normais com ângulo de vinco (quina viva continua viva).
    ({ pos, idx } = soldarPosicao(pos, idx));
    const ratio = RATIO[mat] ?? 0.4;
    const alvo = Math.max(3, Math.floor((idx.length / 3) * ratio)) * 3;
    const [simp, erro] = MeshoptSimplifier.simplify(idx, pos, 3, alvo, +(process.env.ERRO || 0.0015), ["LockBorder"]);
    if (process.env.DEBUG) console.log(k, "t", ni / 3, "->", simp.length / 3, "erro", erro.toFixed(5));
    if (simp.length >= 3) idx = Uint32Array.from(simp);
    ({ pos, nor, idx } = normaisComVinco(pos, idx, VINCO[mat] ?? 38));
  }
  trisDepois += idx.length / 3;
  // origem da peça na dobradiça
  const pv = PIVO[peca] || [0, 0, 0];
  for (let t = 0; t < pos.length; t += 3) { pos[t] -= pv[0]; pos[t + 1] -= pv[1]; pos[t + 2] -= pv[2]; }
  const criarNo = (nome) => {
    if (nos[nome]) return nos[nome];
    const pai = PAI[nome];
    nos[nome] = doc.createNode(nome).setTranslation(pai ? [0, 0, 0] : PIVO[nome] || [0, 0, 0]);
    (pai ? criarNo(pai) : raiz).addChild(nos[nome]);
    return nos[nome];
  };
  criarNo(peca);
  const prim = doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(pos).setBuffer(buf))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(nor).setBuffer(buf))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(pos.length / 3 < 65535 ? Uint16Array.from(idx) : idx).setBuffer(buf))
    .setMaterial(materiais[mat]);
  const mesh = doc.createMesh(`${peca}_${mat}`).addPrimitive(prim);
  nos[peca].addChild(doc.createNode(`${peca}_${mat}`).setMesh(mesh));
}
doc.getRoot().getAsset().copyright = "Base: \"2020 Hyundai i20 N- Line\" por shreyanshchaurasia13 (Sketchfab), CC BY 4.0. Adaptado para a vitrine Nova Leões: logos, placas e suporte de placa removidos, grade completada, peças separadas, motor/filtro/amortecedor e cofre do motor adicionados.";
await doc.transform(prune(), weld({ tolerance: 0.00001 }), dedup(), quantize({ quantizePosition: 14, quantizeNormal: +(process.env.BITS_NORMAL || 8) }));
mkdirSync("saida", { recursive: true });
const SAIDA = process.env.SAIDA || "saida/nova-leoes-hatch-v2.glb";
await io.write(SAIDA, doc);
console.log("gravado", SAIDA);
const manifesto = { escala: ESCALA, pivos: PIVO, caixas: Object.fromEntries(Object.entries(nos).map(([p]) => [p, (() => { const b = caixaDe(p); return [b.min.toArray().map((v) => +v.toFixed(3)), b.max.toArray().map((v) => +v.toFixed(3))]; })()])), trisAntes: Math.round(trisAntes), trisDepois: Math.round(trisDepois), malhasLidas: lidas, removidas };
writeFileSync("saida/manifesto.json", JSON.stringify(manifesto, null, 1));
console.log(JSON.stringify(manifesto, null, 1));
