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
  PCFShadowMap,
  MeshPhysicalMaterial,
  ShadowMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Scene,
  ShaderMaterial,
  Sphere,
  Texture,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { caminho } from "@/lib/base";
import { ARQUIVO_CARRO, MOVIMENTOS, type PinoCarro } from "./carro-modelo";

// Carro ilustrativo que abre peça por peça: o hatch cinza da versão A (foto da Higgsfield) em 3D, feito a partir do
// "2020 Hyundai i20 N- Line" (Sketchfab, CC BY 4.0), sem logos nem placas; créditos em /assets/car/ATTRIBUTION.txt.
// Cada peça que se move é um nó NL_* com a origem na dobradiça: montado, tudo encaixa; aberto, cada parte gira ou se
// afasta (components/carro-modelo.ts). Renderiza sob demanda: só enquanto a abertura, o giro ou o foco se mexem.

export type { PinoCarro };

const DEV = !!(import.meta as { env?: { DEV?: boolean } }).env?.DEV;

// achar() compara só letras e números (o carregador tira espaços e pontos dos nomes dos nós).
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
// O mapa é de cada montagem: global, ele guardava os materiais (e texturas) de todas as montagens anteriores.
function simplificar(m: MeshStandardMaterial, trocados: Map<Material, MeshStandardMaterial>): MeshStandardMaterial {
  if (!(m instanceof MeshPhysicalMaterial) || m.name.toUpperCase() === "PINTURA") return m;
  let novo = trocados.get(m);
  if (!novo) {
    novo = new MeshStandardMaterial({ name: m.name, color: m.color, map: m.map, normalMap: m.normalMap, roughness: m.roughness, metalness: m.metalness, roughnessMap: m.roughnessMap, metalnessMap: m.metalnessMap, transparent: m.transparent, opacity: m.opacity, side: m.side, depthWrite: m.depthWrite, alphaTest: m.alphaTest });
    trocados.set(m, novo);
    m.dispose();
  }
  return novo;
}

// Acabamento: as cores já vêm do arquivo (materiais próprios, sem textura). Aqui só o que depende da cena:
// reflexo do estúdio, verniz da pintura e vidros/lentes sem escrever profundidade (não recortam o que está atrás).
function acabamento(m: MeshStandardMaterial): MeshStandardMaterial {
  const nome = m.name.toUpperCase();
  m.envMapIntensity = 1;
  if (nome === "PINTURA" && m instanceof MeshPhysicalMaterial) {
    m.clearcoat = 0.5; m.clearcoatRoughness = 0.32; m.roughness = Math.max(m.roughness, 0.45); m.envMapIntensity = 0.7;
  } else if (nome === "VIDRO" || nome === "LENTE") {
    m.transparent = true; m.depthWrite = false; m.envMapIntensity = 1.3;
  } else if (nome === "CROMO" || nome === "RODA") {
    m.envMapIntensity = 1.2;
  } else if (nome === "PRETO") {
    // Frisos e molduras: preto acetinado (em ângulo rasante o preto brilhante refletia o estúdio e parecia branco).
    m.envMapIntensity = 0.6;
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
  // Texturas não saem com o material: sem isto, cada ida e volta de página deixava as imagens do carro na GPU.
  const texturas = new Set<Texture>();
  materiais.forEach((m) => {
    for (const valor of Object.values(m)) if (valor instanceof Texture) texturas.add(valor);
    m.dispose();
  });
  texturas.forEach((t) => { t.dispose(); (t.source?.data as { close?: () => void } | undefined)?.close?.(); });
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
      // O giro é no espaço do pai (eixo do mundo convertido): a peça gira em torno da própria origem, a dobradiça.
      interp.copy(identidade).slerp(p.giro, q);
      p.objeto.quaternion.copy(interp).multiply(p.rotacao);
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
    // No celular (retrato) 0,74 deixava a frente e a traseira do carro fora da tela.
    const folga = largura < 700 ? 0.86 : aspecto > 1.3 ? 0.72 : 0.8;
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
    renderer.shadowMap.type = PCFShadowMap; // o PCFSoft saiu no three r186
    renderer.setClearColor(0xf1e8dc, 0);
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%;";
    renderer.domElement.addEventListener("webglcontextlost", contextoPerdido);

    const dados = await (opcoes.dados ?? baixarCarro(abortar.signal));
    if (descartado) return handle;
    const gltf = await new GLTFLoader().parseAsync(dados, "");
    if (descartado) { liberar(gltf.scene); return handle; }

    // Acabamento de cada material para parecer carro de verdade (o modelo veio com vários sem cor ou espelhados).
    const trocados = new Map<Material, MeshStandardMaterial>();
    gltf.scene.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const lista = Array.isArray(o.material) ? o.material : [o.material];
      const transparente = lista.some((m) => m.transparent);
      o.castShadow = !transparente;
      o.receiveShadow = !transparente;
      const novos = lista.map((m) => (m instanceof MeshStandardMaterial ? acabamento(simplificar(m, trocados)) : m));
      o.material = Array.isArray(o.material) ? novos : novos[0];
    });
    centralizador.add(gltf.scene);

    // Deslocamentos em coordenadas do mundo (Y para cima, frente = +Z, lado do motorista = +X), convertidos
    // para o espaço do pai de cada nó: montado, tudo volta exatamente ao lugar.
    const alvo = new Vector3(), qPai = new Quaternion();
    for (const mov of MOVIMENTOS) {
      const o = achar(gltf.scene, mov.no);
      if (!o?.parent) { if (DEV) console.warn("carro-3d: nó não encontrado", mov.no); continue; }
      o.updateWorldMatrix(true, false);
      o.getWorldPosition(alvo).add(new Vector3(...(mov.desvio ?? [0, 0, 0])));
      const local = o.parent.worldToLocal(alvo.clone());
      const giro = new Quaternion();
      if (mov.giro) {
        o.parent.getWorldQuaternion(qPai).invert();
        giro.setFromAxisAngle(new Vector3(...mov.giro.eixo).normalize().applyQuaternion(qPai), (mov.giro.graus * Math.PI) / 180);
      }
      partes.push({ objeto: o, posicao: o.position.clone(), rotacao: o.quaternion.clone(), desvio: local.sub(o.position), giro, inicio: mov.inicio });
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
      if (!objeto) { if (DEV) console.warn("carro-3d: nó do pino não encontrado", pino.no); continue; }
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
    const luz = new DirectionalLight(0xfff3e4, 2.5); luz.position.set(-2.5, 7, 4.5);
    luz.castShadow = true;
    luz.shadow.mapSize.set(1024, 1024);
    Object.assign(luz.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
    luz.shadow.bias = -0.0004;
    luz.shadow.normalBias = 0.02;
    luz.shadow.radius = 6;
    const contra = new DirectionalLight(0xe8eef0, 1.4); contra.position.set(5, 4, -4);
    // Céu claro e chão bege: a parte de baixo do carro pega o calor do estúdio, como na foto da Higgsfield.
    cena.add(luz, contra, new HemisphereLight(0xfffaf2, 0xcdbba3, 0.7));

    const sombra = new Mesh(new PlaneGeometry(6.4, 6.4), new ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: "varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader: "varying vec2 vUv; void main(){vec2 p=vUv*2.0-1.0;float d=length(p);float a=exp(-dot(p,p)*3.6)*(1.0-smoothstep(0.45,1.0,d))*0.24;gl_FragColor=vec4(0.30,0.24,0.18,a);}",
    }));
    sombra.rotation.x = -Math.PI / 2;
    sombra.position.set(0, caixa.setFromObject(gltf.scene).min.y - 0.01, 0);
    giroGrupo.add(sombra);
    // Chão invisível que só recebe a sombra do carro (e das peças quando ele abre).
    const chao = new Mesh(new PlaneGeometry(30, 30), new ShadowMaterial({ opacity: 0.3, color: 0x4a3c2e }));
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
