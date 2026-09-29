// Dados do carro da abertura, sem Three.js (o componente e os testes importam daqui sem puxar o 3D).
// Modelo: hatch cinza no estilo do carro da Higgsfield da versão A, feito a partir do "2020 Hyundai i20 N- Line"
// de shreyanshchaurasia13 (Sketchfab, CC BY 4.0), sem logos nem placas; créditos em /assets/car/ATTRIBUTION.txt.
// Convenção do arquivo: metros, Y para cima, +Z frente, +X lado do motorista, chão em y = 0. Cada peça que se
// move é um nó NL_* com a origem na dobradiça (capô, portas) ou no cubo (rodas).

export const ARQUIVO_CARRO = "assets/car/nova-leoes-hatch-v3.glb";
export const POSTER_CARRO = "assets/car/nova-leoes-hatch-poster.webp";
/** Foto do carro aberto tirada do próprio 3D (fabrica-3d/6-conferir/foto-aberto.mjs): reserva sem WebGL ou com
 * economia de dados. A da Higgsfield (nova-leoes-exploded.webp) tinha teto levantado e placa na grade. */
export const FOTO_ABERTO = "assets/car/nova-leoes-aberto-3d.webp";

export type Movimento = {
  no: string;
  /** Deslocamento no mundo, em metros. */
  desvio?: [number, number, number];
  /** Giro em torno da origem do nó (a dobradiça), eixo no mundo. */
  giro?: { eixo: [number, number, number]; graus: number };
  /** Início na abertura, de 0 a 1: as peças saem em sequência. */
  inicio: number;
};

// A pose aberta: capô aberto, portas do motorista abertas (o forro vai junto, NL_PORTA_*_FORRO), rodas desse lado
// afastadas, paralama fora, e o filtro de ar sobe do motor. O teto fica no lugar (Luca, 29-09: não precisa subir).
export const MOVIMENTOS: Movimento[] = [
  { no: "NL_CAPO", giro: { eixo: [1, 0, 0], graus: -58 }, inicio: 0 },
  { no: "NL_PORTA_DE", giro: { eixo: [0, 1, 0], graus: -68 }, inicio: 0.04 },
  { no: "NL_PORTA_TE", giro: { eixo: [0, 1, 0], graus: -62 }, inicio: 0.08 },
  { no: "NL_RODA_DE", desvio: [0.62, 0, 0.12], inicio: 0.1 },
  { no: "NL_PARALAMA_DE", desvio: [0.5, 0.22, 0.18], inicio: 0.12 },
  { no: "NL_RODA_TE", desvio: [0.62, 0, -0.08], inicio: 0.12 },
  { no: "NL_FILTRO_AR", desvio: [0, 0.42, 0.06], inicio: 0.22 },
];

export type PinoCarro = {
  id: string;
  /** Nó do modelo onde o pino fica preso (acompanha a peça quando ela se afasta). */
  no: string;
  /** Deslocamento do pino em relação ao centro do nó, no espaço do carro (Y para cima, +Z = frente). */
  desloca?: [number, number, number];
  /** Direção para onde a parte "olha"; o pino some quando essa face está de costas para a câmera. */
  face?: [number, number, number] | null;
  /** Ponto dentro da caixa da peça, de -1 a 1 por eixo, em vez do centro. */
  canto?: [number, number, number];
};

export type Zona = {
  id: string; nome: string; deps: string[]; pino: PinoCarro;
  /** Posição do número na foto do carro aberto (reserva sem 3D), em % da imagem: a projeção do 3D, com Motor e
   * Direção afastados um pouco para não encostarem nos vizinhos no celular. */
  foto: [number, number];
};

export const ZONAS: Zona[] = [
  { id: "motor", nome: "Motor", deps: ["motor", "correias", "filtros", "injecao", "arrefecimento", "lubrificantes"], pino: { id: "motor", no: "NL_MOTOR", desloca: [0, 0.12, 0], face: null }, foto: [27, 49] },
  { id: "freios", nome: "Freios", deps: ["freios"], pino: { id: "freios", no: "NL_DISCO_DE", face: [1, 0, 0.2] }, foto: [40, 71] },
  { id: "suspensao", nome: "Suspensão", deps: ["suspensao"], pino: { id: "suspensao", no: "NL_AMORTECEDOR_DE", desloca: [0, 0.08, 0], face: [1, 0, 0.3] }, foto: [38.5, 57.5] },
  { id: "rodas", nome: "Rodas e pneus", deps: ["rodas"], pino: { id: "rodas", no: "NL_RODA_TE", face: [1, 0, -0.2] }, foto: [85.5, 48.5] },
  { id: "direcao", nome: "Direção", deps: ["direcao"], pino: { id: "direcao", no: "NL_VOLANTE", face: null }, foto: [47, 32] },
  { id: "transmissao", nome: "Câmbio e embreagem", deps: ["transmissao", "cabos"], pino: { id: "transmissao", no: "NL_CAMBIO", face: null }, foto: [43, 43] },
  { id: "eletrica", nome: "Elétrica e faróis", deps: ["eletrica"], pino: { id: "eletrica", no: "NL_FAROL_E", face: [0, 0, 1] }, foto: [29.5, 62.5] },
  { id: "escapamento", nome: "Escapamento", deps: ["escapamento"], pino: { id: "escapamento", no: "NL_ESCAPAMENTO", face: null }, foto: [64, 31.5] },
  { id: "carroceria", nome: "Carroceria", deps: ["carroceria"], pino: { id: "carroceria", no: "NL_PORTA_DE", face: [1, 0, 0] }, foto: [60.5, 51.5] },
];
