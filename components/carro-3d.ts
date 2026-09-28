import {
  ACESFilmicToneMapping,
  Box3,
  DirectionalLight,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PCFSoftShadowMap,
  MeshPhysicalMaterial,
  ShadowMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Scene,
  ShaderMaterial,
  Sphere,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { caminho } from "@/lib/base";

// Carro ilustrativo que abre peça por peça. Modelo: "UNO MILLE SMART 2001" de bruno_sales (Sketchfab, CC BY 4.0),
// otimizado e sem emblema/adesivos da montadora; créditos em /assets/car/ATTRIBUTION.txt.
// As peças são os nós reais do modelo: montado, tudo encaixa; aberto, cada parte se afasta na sua direção.
// Renderiza sob demanda: só enquanto a abertura, o giro ou o foco estão em movimento.

export const ARQUIVO_CARRO = "assets/car/nova-leoes-uno-v1.glb";

// Nomes dos nós como estão no modelo. O carregador tira espaços e pontos, e o arquivo veio com os acentos
// corrompidos ("CAPÔ" virou "CAP" + dois caracteres inválidos): achar() compara só letras e números.
// Também as placas: podem ser de um carro de verdade.
const OCULTAR = ["CORPO_METAL.001_0", "PORTA MALAS_ADESIVOS_0", "CORPO.003", "PORTA MALAS_PLACA MERCOSUL_0"];
// [nó, deslocamento no mundo em metros (x = lado do motorista, y = cima, z = frente), início na abertura 0..1]
const MOVIMENTOS: [string, [number, number, number], number][] = [
  ["CAP", [0, 0.78, 0.25], 0], // capô
  ["MOTOR_MOTOR_0", [0, 0.36, 0.05], 0.18],
  ["PORTA MOTORISTA", [0.72, 0.02, 0], 0.04],
  ["PORTA SAPO", [-0.72, 0.02, 0], 0.04],
  ["PORTA MALAS", [0, 0.42, -0.38], 0.06],
  ["RODA DIANTEIRA ESQ.", [0.58, 0, 0.05], 0.1],
  ["RODA DIANTEIRA DIR.", [-0.58, 0, 0.05], 0.1],
  ["RODA TRASEIRA ESQ.", [0.58, 0, -0.05], 0.12],
  ["RODA TRASEIRA DIR.", [-0.58, 0, -0.05], 0.12],
  ["LANTERNAS_LANTERNA TRASEIRA_0", [0, 0, -0.28], 0.14],
  ["LANTERNAS_LANTERNA_0", [0, 0, 0.3], 0.14],
  ["LANTERNAS_SETA_0", [0, 0, 0.3], 0.14],
  ["LANTERNAS_METAL_0", [0, 0, 0.3], 0.14],
  ["CORPO.002_GRADE_0", [0, 0, 0.3], 0.14],
  ["CORPO.001", [0, 0, 0.3], 0.14],
];
const normalizarNome = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
function achar(raiz: Object3D, nome: string) {
  const alvo = normalizarNome(nome);
  let achado: Object3D | undefined;
  raiz.traverse((o) => { if (!achado && normalizarNome(o.name) === alvo) achado = o; });
  return achado;
}

export async function baixarCarro(signal?: AbortSignal) {
  const resposta = await fetch(caminho(ARQUIVO_CARRO), { signal, cache: "force-cache" });
  if (!resposta.ok) throw new Error("modelo indisponível");
  return resposta.arrayBuffer();
}

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

export type PosicaoPino = { id: string; x: number; y: number; visivel: boolean };

export type Carro3D = {
  /** Quanto o carro está aberto, de 0 (montado) a 1 (aberto). O movimento é suavizado. */
  abrir(quanto: number): void;
  /** Gira o carro até a face do pino ficar de frente; null só solta o foco. */
  focar(id: string | null): void;
  /** Gira o carro (botões de seta), em radianos. */
  girar(delta: number): void;
  /** Empurra o carro para a esquerda (px) quando um painel cobre a direita do palco. */
  deslocar(px: number): void;
  dispose(): void;
};

type ParteMovel = { objeto: Object3D; posicao: Vector3; rotacao: Quaternion; desvio: Vector3; giro: Quaternion; inicio: number };
type Ancora = { pino: PinoCarro; objeto: Object3D; centroLocal: Vector3; face: Vector3 | null };

const suave = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
const PITCH_MIN = 0.16, PITCH_MAX = 0.62, PITCH_INICIAL = 0.36;
const YAW_INICIAL = -0.78; // três quartos: frente à esquerda, lateral esquerda à mostra

// Só a pintura precisa do material "físico" (verniz); os outros viram o padrão, que compila mais rápido.
const trocados = new Map<Material, MeshStandardMaterial>();
function simplificar(m: MeshStandardMaterial): MeshStandardMaterial {
  if (!(m instanceof MeshPhysicalMaterial) || m.name.toUpperCase() === "LATARIA") return m;
  let novo = trocados.get(m);
  if (!novo) {
    novo = new MeshStandardMaterial({ name: m.name, color: m.color, map: m.map, normalMap: m.normalMap, roughness: m.roughness, metalness: m.metalness, roughnessMap: m.roughnessMap, metalnessMap: m.metalnessMap, transparent: m.transparent, opacity: m.opacity, side: m.side, depthWrite: m.depthWrite, alphaTest: m.alphaTest });
    trocados.set(m, novo);
    m.dispose();
  }
  return novo;
}

// Pintura com verniz, vidro escuro transparente, borracha e plásticos foscos, cromado só onde é cromado.
function acabamento(m: MeshStandardMaterial): MeshStandardMaterial {
  const nome = m.name.toUpperCase();
  m.envMapIntensity = 1;
  if (nome === "LATARIA" && m instanceof MeshPhysicalMaterial) {
    m.color.set("#4a0710"); m.metalness = 0.55; m.roughness = 0.32; m.clearcoat = 1; m.clearcoatRoughness = 0.04; m.envMapIntensity = 0.95;
  } else if (nome === "METAL") {
    // Molduras das janelas e frisos: borracha/plástico preto acetinado (vinha cinza espelhado, parecia branco).
    m.color.set("#121314"); m.metalness = 0.1; m.roughness = 0.45;
    if (m instanceof MeshPhysicalMaterial) m.clearcoat = 0;
  } else if (nome === "GLASS" || nome === "VIDROS") {
    m.color.set("#0c1114"); m.opacity = 0.28; m.metalness = 0; m.roughness = 0.04; m.envMapIntensity = 1.3; m.depthWrite = false;
  } else if (nome === "GRADE") {
    m.color.set("#0b0b0b"); m.opacity = 0.85; m.roughness = 0.6;
  } else if (nome === "PNEUS") {
    m.color.set("#141414"); m.roughness = 0.92;
  } else if (/^PL.?STIC|^PRETO|AMORTECEDORES|BANCOS/.test(nome)) {
    m.roughness = Math.max(m.roughness, 0.75);
  } else if (nome === "ESPELHO" || nome === "METAL.001") {
    m.color.set("#c9cccf"); m.metalness = 1; m.roughness = 0.12;
  } else if (nome === "MOTOR" && !m.map) {
    // O bloco do motor veio sem textura (branco chapado): vira metal fundido escuro.
    m.color.set("#4b5053"); m.metalness = 0.75; m.roughness = 0.42;
  } else if (nome === "CALOTAS") {
    m.metalness = 0.85; m.roughness = 0.3;
  }
  m.needsUpdate = true;
  return m;
}

function liberar(raiz: Object3D) {
  const geometrias = new Set<Mesh["geometry"]>();
  const materiais = new Set<Material>();
  raiz.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    geometrias.add(o.geometry);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) materiais.add(m);
  });
  geometrias.forEach((g) => g.dispose());
  materiais.forEach((m) => m.dispose());
}

export async function montarCarro3D(host: HTMLElement, opcoes: {
  pinos: PinoCarro[];
  onPinos: (posicoes: PosicaoPino[]) => void;
  onPronto: () => void;
  onErro: () => void;
  onGirou?: () => void;
  /** Elemento que recebe o gesto de arrastar (pode conter os pinos); padrão: o próprio host. */
  superficie?: HTMLElement;
  /** Download do modelo já iniciado pelo chamador (em paralelo com o import do Three.js). */
  dados?: Promise<ArrayBuffer>;
}): Promise<Carro3D> {
  const superficie = opcoes.superficie ?? host;
  let descartado = false, falhou = false, pronto = false;
  let quadro = 0;
  let renderer: WebGLRenderer | undefined;
  let ambiente: WebGLRenderTarget | undefined;
  let observador: ResizeObserver | undefined;
  const abortar = new AbortController();
  const cena = new Scene();
  const giroGrupo = new Group(); // gira em torno do centro do carro
  const centralizador = new Group(); // desloca o modelo para o centro ficar na origem
  giroGrupo.add(centralizador);
  cena.add(giroGrupo);
  // Perspectiva (lente de ~30°): com câmera ortográfica o carro parecia maquete.
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  const partes: ParteMovel[] = [];
  const ancoras: Ancora[] = [];
  let raioMontado = 2.3, raioAberto = 3;
  const centroAberto = new Vector3(), alvoCamera = new Vector3();

  // Estado animado
  let abertura = 0, aberturaAlvo = 0, desvioTela = 0, desvioTelaAlvo = 0;
  let yaw = YAW_INICIAL, pitch = PITCH_INICIAL, velYaw = 0, yawAlvo: number | null = null;
  let arrastando = false, ultimoX = 0, ultimoY = 0, tipoPonteiro = "mouse", girouAlguma = false, percorrido = 0;

  const v = new Vector3(), w = new Vector3(), dirCamera = new Vector3();
  const identidade = new Quaternion(), interp = new Quaternion();

  const falhar = () => { if (descartado || falhou) return; falhou = true; handle.dispose(); opcoes.onErro(); };
  const contextoPerdido = (e: Event) => { e.preventDefault(); falhar(); };

  function aplicarAbertura(valor: number) {
    for (const p of partes) {
      const q = suave((valor - p.inicio) / (1 - p.inicio));
      p.objeto.position.copy(p.posicao).addScaledVector(p.desvio, q);
      interp.copy(identidade).slerp(p.giro, q);
      p.objeto.quaternion.copy(p.rotacao).multiply(interp);
    }
  }

  function passo() {
    quadro = 0;
    if (descartado || !renderer || !pronto) return;
    if (!host.isConnected) { handle.dispose(); return; }
    const largura = Math.max(1, host.clientWidth), altura = Math.max(1, host.clientHeight);
    if (largura < 2 || altura < 2) return;

    // Suaviza abertura, giro e foco: a rolagem pula em degraus, o carro não.
    let mexendo = false;
    const dA = aberturaAlvo - abertura;
    if (Math.abs(dA) > 0.0008) { abertura += dA * 0.16; mexendo = true; } else abertura = aberturaAlvo;
    const dT = desvioTelaAlvo - desvioTela;
    if (Math.abs(dT) > 0.5) { desvioTela += dT * 0.14; mexendo = true; } else desvioTela = desvioTelaAlvo;
    if (!arrastando) {
      if (yawAlvo !== null) {
        const d = Math.atan2(Math.sin(yawAlvo - yaw), Math.cos(yawAlvo - yaw));
        if (Math.abs(d) > 0.002) { yaw += d * 0.12; mexendo = true; } else { yaw = yawAlvo; yawAlvo = null; }
      } else if (Math.abs(velYaw) > 0.0004) { yaw += velYaw; velYaw *= 0.93; mexendo = true; } else velYaw = 0;
    }

    aplicarAbertura(abertura);
    giroGrupo.rotation.set(0, yaw, 0);
    giroGrupo.updateMatrixWorld(true);

    const aspecto = largura / altura;
    const raio = raioMontado + (raioAberto - raioMontado) * suave(abertura);
    // Tela estreita (celular): aceita cortar a ponta do carro aberto para ele não ficar miúdo.
    // Distância para a esfera do carro caber na tela (a mais apertada entre altura e largura).
    const meioV = (camera.fov * Math.PI) / 360;
    const meioH = Math.atan(Math.tan(meioV) * aspecto);
    // A esfera sobra muito em volta do carro (ele é baixo e comprido): a folga aproxima a câmera.
    const folga = largura < 700 ? 0.74 : aspecto > 1.3 ? 0.72 : 0.8;
    const distancia = (raio / Math.sin(Math.min(meioV, meioH))) * folga;
    camera.aspect = aspecto;
    // Aberto, o capô e o porta-malas sobem: a câmera acompanha o centro do carro aberto.
    alvoCamera.copy(centroAberto).multiplyScalar(suave(abertura)).applyAxisAngle(giroGrupo.up, yaw);
    camera.position.set(alvoCamera.x, alvoCamera.y + Math.sin(pitch) * distancia, alvoCamera.z + Math.cos(pitch) * distancia);
    camera.lookAt(alvoCamera);
    if (Math.abs(desvioTela) > 0.5) camera.setViewOffset(largura, altura, desvioTela, 0, largura, altura);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    dirCamera.copy(camera.position).normalize();

    try { renderer.render(cena, camera); } catch { falhar(); return; }

    const aberto = abertura > 0.55;
    opcoes.onPinos(ancoras.map((a) => {
      v.copy(a.centroLocal).applyMatrix4(a.objeto.matrixWorld);
      if (a.pino.desloca) v.add(w.set(...a.pino.desloca).applyAxisAngle(giroGrupo.up, yaw));
      let visivel = aberto;
      if (visivel && a.face) visivel = w.copy(a.face).applyAxisAngle(giroGrupo.up, yaw).dot(dirCamera) > -0.12;
      v.project(camera);
      return { id: a.pino.id, x: (v.x * 0.5 + 0.5) * largura, y: (-v.y * 0.5 + 0.5) * altura, visivel };
    }));

    if (mexendo) agendar();
  }

  const agendar = () => { if (!descartado && !quadro) quadro = requestAnimationFrame(passo); };

  function redimensionar() {
    if (descartado || !renderer) return;
    const largura = Math.max(1, host.clientWidth), altura = Math.max(1, host.clientHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, largura < 600 ? 1.5 : 1.75));
    renderer.setSize(largura, altura, false);
    agendar();
  }

  // Arrastar gira (mouse também inclina). No celular o gesto vertical continua rolando a página (touch-action: pan-y).
  const aoBaixar = (e: PointerEvent) => {
    if (!e.isPrimary || e.button > 0) return;
    // Painel de peças e botões por cima do carro não giram o carro.
    if ((e.target as Element | null)?.closest?.("[data-sem-giro]")) return;
    arrastando = true; yawAlvo = null; velYaw = 0; ultimoX = e.clientX; ultimoY = e.clientY; tipoPonteiro = e.pointerType; percorrido = 0;
  };
  const aoMover = (e: PointerEvent) => {
    if (!arrastando || !e.isPrimary) return;
    const dx = e.clientX - ultimoX, dy = e.clientY - ultimoY;
    ultimoX = e.clientX; ultimoY = e.clientY;
    percorrido += Math.abs(dx) + Math.abs(dy);
    if (percorrido > 6 && !superficie.dataset.arrastando) { superficie.dataset.arrastando = "1"; try { superficie.setPointerCapture(e.pointerId); } catch { /* ponteiro sintético */ } }
    const passoYaw = (dx / Math.max(320, host.clientWidth)) * Math.PI * 1.25;
    yaw += passoYaw; velYaw = passoYaw;
    if (tipoPonteiro === "mouse") pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch + dy * 0.004));
    if (!girouAlguma && Math.abs(dx) > 2) { girouAlguma = true; opcoes.onGirou?.(); }
    agendar();
  };
  const aoSoltar = (e: PointerEvent) => {
    if (!arrastando) return;
    arrastando = false;
    try { superficie.releasePointerCapture(e.pointerId); } catch { /* já solto */ }
    // Soltar depois de arrastar não conta como clique num pino.
    if (superficie.dataset.arrastando) setTimeout(() => delete superficie.dataset.arrastando, 0);
    agendar();
  };
  const aoClicar = (e: MouseEvent) => { if (superficie.dataset.arrastando) { e.stopPropagation(); e.preventDefault(); } };

  const handle: Carro3D = {
    abrir(quanto) {
      if (descartado || !Number.isFinite(quanto)) return;
      aberturaAlvo = Math.max(0, Math.min(1, quanto));
      agendar();
    },
    focar(id) {
      const a = id ? ancoras.find((x) => x.pino.id === id) : null;
      if (!a?.face) { yawAlvo = null; return; }
      // Gira até a face da parte apontar para a câmera (que olha de +Z, inclinada).
      yawAlvo = -Math.atan2(a.face.x, a.face.z) + 0.35;
      velYaw = 0;
      agendar();
    },
    deslocar(px) {
      if (descartado || !Number.isFinite(px)) return;
      desvioTelaAlvo = px;
      agendar();
    },
    girar(delta) {
      if (descartado) return;
      yawAlvo = (yawAlvo ?? yaw) + delta;
      velYaw = 0;
      if (!girouAlguma) { girouAlguma = true; opcoes.onGirou?.(); }
      agendar();
    },
    dispose() {
      if (descartado) return;
      descartado = true;
      abortar.abort();
      if (quadro) cancelAnimationFrame(quadro);
      observador?.disconnect();
      superficie.removeEventListener("pointerdown", aoBaixar);
      superficie.removeEventListener("pointermove", aoMover);
      superficie.removeEventListener("pointerup", aoSoltar);
      superficie.removeEventListener("pointercancel", aoSoltar);
      superficie.removeEventListener("click", aoClicar, true);
      liberar(cena);
      ambiente?.dispose();
      if (renderer) {
        renderer.domElement.removeEventListener("webglcontextlost", contextoPerdido);
        renderer.domElement.remove();
        renderer.renderLists.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
      }
      cena.clear();
    },
  };

  try {
    renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.setClearColor(0xf6f4ed, 0);
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%;";
    renderer.domElement.addEventListener("webglcontextlost", contextoPerdido);

    const dados = await (opcoes.dados ?? baixarCarro(abortar.signal));
    if (descartado) return handle;
    const gltf = await new GLTFLoader().parseAsync(dados, "");
    if (descartado) { liberar(gltf.scene); return handle; }

    // Acabamento de cada material para parecer carro de verdade (o modelo veio com vários sem cor ou espelhados).
    gltf.scene.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const lista = Array.isArray(o.material) ? o.material : [o.material];
      const transparente = lista.some((m) => m.transparent);
      o.castShadow = !transparente;
      o.receiveShadow = !transparente;
      const novos = lista.map((m) => (m instanceof MeshStandardMaterial ? acabamento(simplificar(m)) : m));
      o.material = Array.isArray(o.material) ? novos : novos[0];
    });
    centralizador.add(gltf.scene);

    // Emblema e adesivos da montadora saem: o carro é ilustrativo, o site não é propaganda da marca.
    for (const nome of OCULTAR) { const o = achar(gltf.scene, nome); if (o) o.visible = false; }

    // Deslocamentos em coordenadas do mundo (Y para cima, frente = +Z, lado do motorista = +X), convertidos
    // para o espaço do pai de cada nó: montado, tudo volta exatamente ao lugar.
    const alvo = new Vector3();
    for (const [nome, desvio, inicio] of MOVIMENTOS) {
      const o = achar(gltf.scene, nome);
      if (!o?.parent) continue;
      o.updateWorldMatrix(true, false);
      o.getWorldPosition(alvo).add(new Vector3(...desvio));
      const local = o.parent.worldToLocal(alvo.clone());
      partes.push({ objeto: o, posicao: o.position.clone(), rotacao: o.quaternion.clone(), desvio: local.sub(o.position), giro: new Quaternion(), inicio });
    }

    // Centro e raio do carro montado e aberto: a câmera enquadra pela esfera, então girar não muda o zoom.
    const caixa = new Box3(), esfera = new Sphere();
    aplicarAbertura(0); centralizador.updateMatrixWorld(true);
    caixa.setFromObject(gltf.scene);
    const centro = caixa.getCenter(new Vector3());
    centralizador.position.copy(centro).multiplyScalar(-1);
    centralizador.updateMatrixWorld(true);
    raioMontado = caixa.setFromObject(gltf.scene).getBoundingSphere(esfera).radius;
    aplicarAbertura(1); centralizador.updateMatrixWorld(true);
    caixa.setFromObject(gltf.scene);
    raioAberto = caixa.getBoundingSphere(esfera).radius;
    caixa.getCenter(centroAberto);

    // Âncoras: centro de cada nó guardado no espaço do próprio nó, para acompanhar a peça.
    for (const pino of opcoes.pinos) {
      const objeto = achar(gltf.scene, pino.no);
      if (!objeto) continue;
      caixa.setFromObject(objeto);
      const centroMundo = caixa.getCenter(new Vector3());
      // canto: ponto dentro da caixa da peça, de -1 a 1 em cada eixo (ex.: o amortecedor dianteiro esquerdo
      // dentro da malha que tem os quatro).
      if (pino.canto) centroMundo.add(caixa.getSize(new Vector3()).multiplyScalar(0.5).multiply(new Vector3(...pino.canto)));
      const centroLocal = objeto.worldToLocal(centroMundo.clone());
      const face = pino.face === null ? null : pino.face ? new Vector3(...pino.face).normalize() : centroMundo.clone().setY(0).normalize();
      ancoras.push({ pino, objeto, centroLocal, face });
    }
    aplicarAbertura(0);

    const sala = new RoomEnvironment();
    const pmrem = new PMREMGenerator(renderer);
    try { ambiente = pmrem.fromScene(sala, 0.04, 0.1, 100, { size: 64 }); } finally { sala.dispose(); pmrem.dispose(); }
    cena.environment = ambiente.texture;
    cena.environmentIntensity = 1.35;
    // Luz de estúdio: principal alta e à frente (faz a sombra no chão), contraluz para o recorte e céu fraco.
    const luz = new DirectionalLight(0xfff6e8, 2.6); luz.position.set(-2.5, 7, 4.5);
    luz.castShadow = true;
    luz.shadow.mapSize.set(1024, 1024);
    Object.assign(luz.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
    luz.shadow.bias = -0.0004;
    luz.shadow.normalBias = 0.02;
    luz.shadow.radius = 6;
    const contra = new DirectionalLight(0xe8eef0, 1.4); contra.position.set(5, 4, -4);
    cena.add(luz, contra, new HemisphereLight(0xfffbf2, 0x8a8a80, 0.6));

    const sombra = new Mesh(new PlaneGeometry(6.4, 6.4), new ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: "varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader: "varying vec2 vUv; void main(){vec2 p=vUv*2.0-1.0;float d=length(p);float a=exp(-dot(p,p)*3.6)*(1.0-smoothstep(0.45,1.0,d))*0.2;gl_FragColor=vec4(0.22,0.22,0.17,a);}",
    }));
    sombra.rotation.x = -Math.PI / 2;
    sombra.position.set(0, caixa.setFromObject(gltf.scene).min.y - 0.01, 0);
    giroGrupo.add(sombra);
    // Chão invisível que só recebe a sombra do carro (e das peças quando ele abre).
    const chao = new Mesh(new PlaneGeometry(30, 30), new ShadowMaterial({ opacity: 0.22 }));
    chao.rotation.x = -Math.PI / 2;
    chao.position.y = sombra.position.y + 0.002;
    chao.receiveShadow = true;
    cena.add(chao);

    host.appendChild(renderer.domElement);
    superficie.style.touchAction = "pan-y";
    superficie.addEventListener("pointerdown", aoBaixar);
    superficie.addEventListener("pointermove", aoMover);
    superficie.addEventListener("pointerup", aoSoltar);
    superficie.addEventListener("pointercancel", aoSoltar);
    superficie.addEventListener("click", aoClicar, true);
    pronto = true;
    observador = new ResizeObserver(redimensionar);
    observador.observe(host);
    redimensionar();
    // Compila os materiais em paralelo (sem travar a página) antes do primeiro quadro; a foto do carro fica na tela.
    try { await renderer.compileAsync(cena, camera); } catch { /* navegador sem compilação paralela: compila no quadro */ }
    if (descartado) return handle;
    passo();
    if (!descartado) opcoes.onPronto();
    return handle;
  } catch {
    falhar();
    return handle;
  }
}
