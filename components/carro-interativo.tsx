import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, CarFront, ChevronLeft, ChevronRight, Hand, Package, Plus, X } from "lucide-react";
import type { Product } from "@/lib/catalog";
import { type Catalogo, type Peca, money } from "@/lib/catalogo-site";
import { type Veiculo, servePara } from "@/lib/garagem";
import { disponibilidadeDaPeca, fotoDaPeca, precoDaPeca, tituloDaPeca } from "./catalogo-loja";
import type { Carro3D, PinoCarro, PosicaoPino } from "./carro-3d";
import { caminho } from "@/lib/base";
import "./carro-interativo.css";

// Compra pela parte do carro, dentro da abertura: o carro abre com a rolagem, cada parte tem um botão
// e o painel mostra as peças à venda daquela parte.
type Zona = { id: string; nome: string; deps: string[]; pino: PinoCarro };
export const ZONAS: Zona[] = [
  { id: "motor", nome: "Motor", deps: ["motor", "correias", "filtros", "injecao", "arrefecimento", "lubrificantes"], pino: { id: "motor", no: "MOTOR_MOTOR_0", face: null } },
  { id: "freios", nome: "Freios", deps: ["freios"], pino: { id: "freios", no: "RODA DIANTEIRA ESQ._METAL_0", face: [1, 0, 0.2] } },
  { id: "suspensao", nome: "Suspensão", deps: ["suspensao"], pino: { id: "suspensao", no: "CORPO_AMORTECEDORES_0", canto: [0.9, 0.2, 0.95], face: [1, 0, 0.3] } },
  { id: "rodas", nome: "Rodas e pneus", deps: ["rodas"], pino: { id: "rodas", no: "RODA TRASEIRA ESQ.", face: [1, 0, -0.2] } },
  { id: "direcao", nome: "Direção", deps: ["direcao"], pino: { id: "direcao", no: "INTERNA.002", face: null } },
  { id: "transmissao", nome: "Câmbio e embreagem", deps: ["transmissao", "cabos"], pino: { id: "transmissao", no: "INTERNA_PRETO_0", canto: [0, -0.4, -0.3], face: null } },
  { id: "eletrica", nome: "Elétrica e faróis", deps: ["eletrica"], pino: { id: "eletrica", no: "LANTERNAS_LANTERNA_0", canto: [0.75, 0, 0], face: [0, 0, 1] } },
  { id: "escapamento", nome: "Escapamento", deps: ["escapamento"], pino: { id: "escapamento", no: "CORPO", canto: [-0.4, -0.85, -0.95], face: [0, 0, -1] } },
  { id: "carroceria", nome: "Carroceria", deps: ["carroceria"], pino: { id: "carroceria", no: "PORTA MOTORISTA", face: [1, 0, 0] } },
];

const NA_VITRINE = 4;

export default function CarroInterativo({ catalogo, live, veiculo, onSelecionar, onAdicionar, onDepartamento }: {
  catalogo: Catalogo | null; live: Map<string, Product>; veiculo: Veiculo | null;
  onSelecionar: (p: Peca) => void; onAdicionar: (p: Peca) => void; onDepartamento: (id: string) => void;
}) {
  const secao = useRef<HTMLElement>(null);
  const palco = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const pinos = useRef(new Map<string, HTMLButtonElement>());
  const carro = useRef<Carro3D | null>(null);
  const [pronto, setPronto] = useState(false);
  const [sem3d, setSem3d] = useState(false);
  const [reduzido, setReduzido] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [girou, setGirou] = useState(false);
  const [zona, setZona] = useState<string | null>(null);
  const [dep, setDep] = useState<string>("");

  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const aplicar = () => setReduzido(m.matches);
    aplicar(); m.addEventListener("change", aplicar);
    return () => m.removeEventListener("change", aplicar);
  }, []);

  // Monta o 3D assim que a abertura entra na tela (ela é a primeira coisa da página).
  useEffect(() => {
    const alvo = palco.current;
    if (!alvo) return;
    let descartado = false;
    const posicionar = (lista: PosicaoPino[]) => {
      for (const p of lista) {
        const el = pinos.current.get(p.id);
        if (!el) continue;
        el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
        // Perto da borda direita, o nome vai para a esquerda do ponto (senão corta).
        el.dataset.lado = p.x > (palco.current?.clientWidth ?? 0) - 170 ? "esq" : "";
        el.dataset.visivel = p.visivel ? "1" : "0";
        el.tabIndex = p.visivel ? 0 : -1;
      }
      const algum = lista.some((p) => p.visivel);
      setAberto((a) => (a === algum ? a : algum));
    };
    // O modelo (0,7 MB) começa a baixar junto com o código do 3D, não depois dele.
    const dados = fetch(caminho("assets/car/nova-leoes-uno-v1.glb"), { cache: "force-cache" }).then((r) => { if (!r.ok) throw new Error("modelo"); return r.arrayBuffer(); });
    dados.catch(() => {});
    void import("./carro-3d").then(({ montarCarro3D }) => montarCarro3D(alvo, {
      pinos: ZONAS.map((z) => z.pino), onPinos: posicionar, superficie: area.current ?? undefined, dados,
      onPronto: () => !descartado && setPronto(true), onErro: () => !descartado && setSem3d(true), onGirou: () => !descartado && setGirou(true),
    })).then((h) => { if (descartado) h.dispose(); else { carro.current = h; atualizarRolagem(); } }).catch(() => !descartado && setSem3d(true));
    return () => { descartado = true; carro.current?.dispose(); carro.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rolagem abre o carro. Com movimento reduzido, ele já começa aberto.
  function atualizarRolagem() {
    if (!carro.current || !secao.current) return;
    if (reduzido) { carro.current.abrir(1); return; }
    const r = secao.current.getBoundingClientRect();
    const curso = Math.max(1, r.height - innerHeight * 0.85);
    const p = Math.min(1, Math.max(0, (innerHeight * 0.12 - r.top) / curso));
    carro.current.abrir(Math.max(p / 0.7, zona ? 1 : 0));
  }
  useEffect(() => {
    let q = 0;
    const agendar = () => { if (!q) q = requestAnimationFrame(() => { q = 0; atualizarRolagem(); }); };
    addEventListener("scroll", agendar, { passive: true });
    addEventListener("resize", agendar);
    agendar();
    return () => { removeEventListener("scroll", agendar); removeEventListener("resize", agendar); cancelAnimationFrame(q); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduzido, zona, pronto]);

  function escolher(id: string | null) {
    setZona(id);
    const z = ZONAS.find((x) => x.id === id);
    setDep(z?.deps[0] || "");
    carro.current?.focar(id);
    if (id) carro.current?.abrir(1);
  }
  function abrirCarro() {
    if (!secao.current) return;
    const r = secao.current.getBoundingClientRect();
    const curso = Math.max(1, r.height - innerHeight * 0.85);
    scrollTo({ top: scrollY + r.top - innerHeight * 0.12 + curso * 0.72, behavior: reduzido ? "instant" : "smooth" });
  }

  const zonaAtual = ZONAS.find((z) => z.id === zona) || null;
  const departamento = catalogo?.meta.departamentos.find((d) => d.id === dep) || null;
  const vitrine = useMemo(() => {
    if (!catalogo || !dep) return [] as Peca[];
    const candidatas = catalogo.pecas.filter((p) => p.departamento.id === dep && p.precoCents > 0 && p.disponivel > 0);
    const pontos = (p: Peca) => (servePara(p, veiculo) ? 1000 : 0) + (p.foto ? (p.fotoIlustrativa ? 40 : 100) : 0) + Math.min(39, p.aplicacoes.length);
    return candidatas.sort((a, b) => pontos(b) - pontos(a)).slice(0, NA_VITRINE);
  }, [catalogo, dep, veiculo]);

  const semCarro = sem3d;
  return (
    <section ref={secao} className={`nl-carro${reduzido || semCarro ? " nl-carro-estatico" : ""}`} aria-label="Compre pela parte do carro">
      <h1 className="sr-only">Nova Leões Autopeças: peças para o seu carro em Guarulhos</h1>
      <div className="nl-carro-fixo">
        <div className="nl-carro-texto">
          {zonaAtual ? (
            <div className="nl-carro-painel" aria-live="polite">
              <div className="nl-carro-painel-topo">
                <p className="nl-kicker"><span /> PEÇAS DE {zonaAtual.nome.toUpperCase()}</p>
                <button type="button" className="nl-carro-fechar" aria-label="Fechar e voltar às partes do carro" onClick={() => escolher(null)}><X size={18} /></button>
              </div>
              {zonaAtual.deps.length > 1 && catalogo && (
                <div className="nl-carro-deps" role="group" aria-label={`Departamentos de ${zonaAtual.nome}`}>
                  {zonaAtual.deps.map((id) => {
                    const d = catalogo.meta.departamentos.find((x) => x.id === id);
                    return d ? <button type="button" key={id} className={dep === id ? "ativo" : ""} aria-pressed={dep === id} onClick={() => setDep(id)}>{d.nome}</button> : null;
                  })}
                </div>
              )}
              <ul className="nl-carro-pecas">
                {catalogo && vitrine.map((p) => {
                  const foto = fotoDaPeca(p, catalogo, live);
                  const preco = precoDaPeca(p, live);
                  const disp = disponibilidadeDaPeca(p, live);
                  return (
                    <li key={p.id}>
                      <button type="button" className="nl-carro-peca" onClick={() => onSelecionar(p)}>
                        <span className="nl-carro-peca-foto">{foto ? <img src={foto} alt="" loading="lazy" decoding="async" /> : <Package size={26} strokeWidth={1.2} />}</span>
                        <span className="nl-carro-peca-info"><b>{tituloDaPeca(p)}</b><small>{p.marca || p.grupo}{servePara(p, veiculo) ? " · serve no seu carro" : ""}</small><strong>{money(preco)}</strong><span className={`nl-carro-disp ${disp.classe}`}>{disp.texto}</span></span>
                      </button>
                      <button type="button" className="nl-carro-add" aria-label={`Adicionar ${tituloDaPeca(p)} ao pedido`} onClick={() => onAdicionar(p)}><Plus size={17} /></button>
                    </li>
                  );
                })}
                {!catalogo && [1, 2, 3].map((i) => <li key={i} className="nl-carro-peca-vazia" />)}
              </ul>
              {departamento && (
                <button type="button" className="nl-button nl-carro-ver-todas" onClick={() => onDepartamento(departamento.id)}>
                  Ver todas as {departamento.n.toLocaleString("pt-BR")} peças de {departamento.nome} <ArrowRight size={17} />
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="nl-kicker"><span /> COMPRE PELA PARTE DO CARRO</p>
              <h2 className="nl-carro-titulo">Toque na parte.<br /><em>Veja as peças.</em></h2>
              <p className="nl-carro-copy">{catalogo ? `${catalogo.meta.total.toLocaleString("pt-BR")} peças da Nova Leões, com preço e estoque. ` : ""}Escolha uma parte do carro ou vá direto ao catálogo.</p>
              <div className="nl-carro-zonas" role="list" aria-label="Partes do carro">
                {ZONAS.map((z) => <button type="button" role="listitem" key={z.id} onClick={() => escolher(z.id)}>{z.nome}</button>)}
              </div>
              <a className="nl-carro-direto" href="#catalogo">Ir direto ao catálogo <ArrowUpRight size={15} /></a>
            </>
          )}
        </div>

        <div ref={area} className="nl-carro-palco-area">
          <div ref={palco} className="nl-carro-palco" role="img" aria-label="Carro ilustrativo que abre peça por peça. Arraste para girar; os botões sobre o carro abrem as peças de cada parte." />
          <div className="nl-carro-pinos">
            {ZONAS.map((z, i) => (
              <button type="button" key={z.id} ref={(el) => { if (el) pinos.current.set(z.id, el); else pinos.current.delete(z.id); }}
                className={`nl-pino${zona === z.id ? " ativo" : ""}`} data-visivel="0" tabIndex={-1} onClick={() => escolher(zona === z.id ? null : z.id)} aria-label={`Peças de ${z.nome}`}>
                <span className="nl-pino-ponto">{i + 1}</span><span className="nl-pino-nome">{z.nome}</span>
              </button>
            ))}
          </div>
          {!pronto && <div className="nl-carro-carregando">{semCarro ? <><CarFront size={64} strokeWidth={0.8} /><span>Escolha a parte do carro na lista</span></> : <><img src={caminho("assets/car/nova-leoes-uno-poster.jpg")} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /><span className="nl-carro-barra-carga" /></>}</div>}
          {pronto && !aberto && !reduzido && <button type="button" className="nl-carro-abrir" onClick={abrirCarro}>Abrir o carro <ArrowRight size={16} /></button>}
          {pronto && aberto && !girou && <span className="nl-carro-dica" aria-hidden="true"><Hand size={15} /> Arraste para girar</span>}
          {pronto && (
            <div className="nl-carro-girar" role="group" aria-label="Girar o carro">
              <button type="button" aria-label="Girar o carro para a esquerda" onClick={() => carro.current?.girar(-Math.PI / 4)}><ChevronLeft size={20} /></button>
              <button type="button" aria-label="Girar o carro para a direita" onClick={() => carro.current?.girar(Math.PI / 4)}><ChevronRight size={20} /></button>
            </div>
          )}
          <small className="nl-carro-nota">Veículo ilustrativo<span className="nl-carro-nota-longa">. A aplicação de cada peça é conferida pela loja</span> · <a href={caminho("assets/car/ATTRIBUTION.txt")} target="_blank" rel="noopener noreferrer">Créditos do modelo</a></small>
        </div>
      </div>
    </section>
  );
}
