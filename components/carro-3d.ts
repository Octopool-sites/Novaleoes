import {
  ACESFilmicToneMapping,
  Box3,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
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

// Carro ilustrativo que abre peça por peça. Modelo: "Car Concept" (CC BY 4.0), créditos em /assets/car/ATTRIBUTION.txt.
// As peças são os nós reais do modelo: montado, tudo encaixa; aberto, cada parte se afasta na sua direção.
// Renderiza sob demanda: só enquanto a abertura, o giro ou o foco estão em movimento.

export const ARQUIVO_CARRO = "assets/car/nova-leoes-carro-v2.glb";

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
};

export type PosicaoPino = { id: string; x: number; y: number; visivel: boolean };

export type Carro3D = {
  /** Quanto o carro está aberto, de 0 (montado) a 1 (aberto). O movimento é suavizado. */
  abrir(quanto: number): void;
  /** Gira o carro até a face do pino ficar de frente; null só solta o foco. */
  focar(id: string | null): void;
  dispose(): void;
};

type ParteMovel = { objeto: Object3D; posicao: Vector3; rotacao: Quaternion; desvio: Vector3; giro: Quaternion; inicio: number };
type Ancora = { pino: PinoCarro; objeto: Object3D; centroLocal: Vector3; face: Vector3 | null };

const suave = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
const PITCH_MIN = 0.16, PITCH_MAX = 0.62, PITCH_INICIAL = 0.36;
const YAW_INICIAL = -0.78; // três quartos: frente à esquerda, lateral esquerda à mostra

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
  const camera = new OrthographicCamera(-4, 4, 3, -3, 0.1, 80);
  const partes: ParteMovel[] = [];
  const ancoras: Ancora[] = [];
  let raioMontado = 2.3, raioAberto = 3;

  // Estado animado
  let abertura = 0, aberturaAlvo = 0;
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
    const meiaAltura = Math.max((raio * (largura < 700 ? 0.7 : 0.94)) / aspecto, raio * 0.56);
    camera.left = -meiaAltura * aspecto; camera.right = meiaAltura * aspecto;
    camera.top = meiaAltura; camera.bottom = -meiaAltura;
    camera.position.set(0, Math.sin(pitch) * 20, Math.cos(pitch) * 20);
    camera.lookAt(0, 0, 0);
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
    renderer.toneMappingExposure = 1.15;
    renderer.setClearColor(0xf6f4ed, 0);
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%;";
    renderer.domElement.addEventListener("webglcontextlost", contextoPerdido);

    const dados = await (opcoes.dados ?? baixarCarro(abortar.signal));
    if (descartado) return handle;
    const gltf = await new GLTFLoader().parseAsync(dados, "");
    if (descartado) { liberar(gltf.scene); return handle; }

    const mat = {
      pintura: new MeshPhysicalMaterial({ color: "#3c4344", metalness: 0.78, roughness: 0.27, clearcoat: 1, clearcoatRoughness: 0.12, side: DoubleSide }),
      acabamento: new MeshStandardMaterial({ color: "#222826", metalness: 0.62, roughness: 0.34, side: DoubleSide }),
      cromado: new MeshStandardMaterial({ color: "#bbc0bb", metalness: 0.91, roughness: 0.23, side: DoubleSide }),
      borracha: new MeshStandardMaterial({ color: "#171b1a", metalness: 0.03, roughness: 0.86, side: DoubleSide }),
      interior: new MeshStandardMaterial({ color: "#514c43", metalness: 0.06, roughness: 0.7, side: DoubleSide }),
      interiorEscuro: new MeshStandardMaterial({ color: "#252a28", metalness: 0.12, roughness: 0.6, side: DoubleSide }),
      mecanica: new MeshStandardMaterial({ color: "#6b7370", metalness: 0.8, roughness: 0.38, side: DoubleSide }),
      vidro: new MeshPhysicalMaterial({ color: "#a8b4b0", metalness: 0.14, roughness: 0.12, transparent: true, opacity: 0.32, depthWrite: false, side: DoubleSide }),
      farol: new MeshStandardMaterial({ color: "#faf3d9", emissive: "#e9d8a4", emissiveIntensity: 0.35, metalness: 0.15, roughness: 0.24 }),
      lanterna: new MeshStandardMaterial({ color: "#a33b2a", emissive: "#6c1f12", emissiveIntensity: 0.2, metalness: 0.1, roughness: 0.25 }),
      freio: new MeshStandardMaterial({ color: "#b99951", metalness: 0.7, roughness: 0.36 }),
    };
    const escolher = (nome: string): Material => {
      if (/Tireside|Tiretread|Floormat/i.test(nome)) return mat.borracha;
      if (/Glass/i.test(nome)) return mat.vidro;
      if (/Headlight|Signallight/i.test(nome)) return mat.farol;
      if (/Brakelight/i.test(nome)) return mat.lanterna;
      if (/Rim1|Disc|Mirror/i.test(nome)) return mat.cromado;
      if (/Brake/i.test(nome)) return mat.freio;
      if (/Paint 1|Panel Sides/i.test(nome)) return mat.pintura;
      if (/Interior 3|Interior 1/i.test(nome)) return mat.interior;
      if (/Interior|Dashboard/i.test(nome)) return mat.interiorEscuro;
      if (/Mechanical|Hardware/i.test(nome)) return mat.mecanica;
      return mat.acabamento;
    };
    const antigos = new Set<Material>();
    gltf.scene.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const originais = Array.isArray(o.material) ? o.material : [o.material];
      originais.forEach((m) => antigos.add(m));
      o.material = Array.isArray(o.material) ? originais.map((m) => escolher(m.name)) : escolher(originais[0].name);
    });
    antigos.forEach((m) => m.dispose());
    centralizador.add(gltf.scene);

    // Deslocamentos no espaço local de cada nó (o modelo é Z para cima; o pai converte para Y para cima).
    const mover = (nome: string, desvio: [number, number, number], eixo: Vector3 | null = null, angulo = 0, inicio = 0) => {
      const o = gltf.scene.getObjectByName(nome);
      if (!o) return;
      partes.push({ objeto: o, posicao: o.position.clone(), rotacao: o.quaternion.clone(), desvio: new Vector3(...desvio), giro: eixo ? new Quaternion().setFromAxisAngle(eixo, angulo) : new Quaternion(), inicio });
    };
    mover("BodyHood", [0, -0.35, 1.05], new Vector3(1, 0, 0), 0.22, 0.02);
    mover("BodyRoofPanel", [0, 0.05, 1.25], null, 0, 0.06);
    for (const n of ["BodyWindshield", "BodyWindshieldGasket", "BodyWindshieldWipers", "BodyWindshieldWipersBase"]) mover(n, [0, -0.18, 0.7], null, 0, 0.05);
    mover("BodyDoorLColor1", [0.95, -0.02, 0.18], new Vector3(0, 0, 1), -0.16, 0.03);
    mover("BodyDoorRColor1", [-0.95, -0.02, 0.18], new Vector3(0, 0, 1), 0.16, 0.03);
    mover("BodyRearPanelsColor1", [0, 0.42, 0.62], new Vector3(1, 0, 0), -0.1, 0.07);
    mover("BodyPanelsColor2", [0, 0, 0.16], null, 0, 0.07);
    mover("WheelFrontL", [1.1, -0.1, 0], null, 0, 0.09);
    mover("WheelFrontR", [-1.1, -0.1, 0], null, 0, 0.09);
    mover("WheelRearL", [1.05, 0.12, 0], null, 0, 0.11);
    mover("WheelRearR", [-1.05, 0.12, 0], null, 0, 0.11);
    mover("Engine", [0, -0.1, 0.95], null, 0, 0.14);

    // Centro e raio do carro montado e aberto: a câmera enquadra pela esfera, então girar não muda o zoom.
    const caixa = new Box3(), esfera = new Sphere();
    aplicarAbertura(0); centralizador.updateMatrixWorld(true);
    caixa.setFromObject(gltf.scene);
    const centro = caixa.getCenter(new Vector3());
    centralizador.position.copy(centro).multiplyScalar(-1);
    centralizador.updateMatrixWorld(true);
    raioMontado = caixa.setFromObject(gltf.scene).getBoundingSphere(esfera).radius;
    aplicarAbertura(1); centralizador.updateMatrixWorld(true);
    raioAberto = caixa.setFromObject(gltf.scene).getBoundingSphere(esfera).radius;

    // Âncoras: centro de cada nó guardado no espaço do próprio nó, para acompanhar a peça.
    for (const pino of opcoes.pinos) {
      const objeto = gltf.scene.getObjectByName(pino.no);
      if (!objeto) continue;
      caixa.setFromObject(objeto);
      const centroMundo = caixa.getCenter(new Vector3());
      const centroLocal = objeto.worldToLocal(centroMundo.clone());
      const face = pino.face === null ? null : pino.face ? new Vector3(...pino.face).normalize() : centroMundo.clone().setY(0).normalize();
      ancoras.push({ pino, objeto, centroLocal, face });
    }
    aplicarAbertura(0);

    const sala = new RoomEnvironment();
    const pmrem = new PMREMGenerator(renderer);
    try { ambiente = pmrem.fromScene(sala, 0.045, 0.1, 100, { size: 128 }); } finally { sala.dispose(); pmrem.dispose(); }
    cena.environment = ambiente.texture;
    cena.environmentIntensity = 1.35;
    const luz = new DirectionalLight(0xfff4de, 2.8); luz.position.set(-3, 7, 5);
    const contra = new DirectionalLight(0xe8f0ef, 2.1); contra.position.set(5, 4, -4);
    cena.add(luz, contra, new HemisphereLight(0xfffbf2, 0x88897b, 1.7));

    const sombra = new Mesh(new PlaneGeometry(6.4, 6.4), new ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: "varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader: "varying vec2 vUv; void main(){vec2 p=vUv*2.0-1.0;float d=length(p);float a=exp(-dot(p,p)*3.6)*(1.0-smoothstep(0.45,1.0,d))*0.2;gl_FragColor=vec4(0.22,0.22,0.17,a);}",
    }));
    sombra.rotation.x = -Math.PI / 2;
    sombra.position.set(0, caixa.setFromObject(gltf.scene).min.y - 0.01, 0);
    giroGrupo.add(sombra);

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
    passo();
    if (!descartado) opcoes.onPronto();
    return handle;
  } catch {
    falhar();
    return handle;
  }
}
