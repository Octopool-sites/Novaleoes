import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Hand, Package, Plus, X } from "lucide-react";
import type { Product } from "@/lib/catalog";
import { type Catalogo, type Peca, money } from "@/lib/catalogo-site";
import { type Veiculo, servePara } from "@/lib/garagem";
import { disponibilidadeDaPeca, fotoDaPeca, precoDaPeca, tituloDaPeca } from "./catalogo-loja";
import type { Carro3D, PosicaoPino } from "./carro-3d";
import { ARQUIVO_CARRO, FOTO_ABERTO, POSTER_CARRO, ZONAS } from "./carro-modelo";
import { caminho } from "@/lib/base";
import { compraMinima } from "@/lib/unidades";
import "./carro-interativo.css";

export { ZONAS };

// Compra pela parte do carro, na abertura: o carro abre com a rolagem, cada parte tem um número e o painel mostra
// as peças à venda daquela parte. Logo abaixo vem o catálogo (sem faixa intermediária).
const NA_VITRINE = 4;

let downloadModelo: Promise<ArrayBuffer> | null = null;
function baixarModelo() {
  downloadModelo ??= fetch(caminho(ARQUIVO_CARRO), { cache: "force-cache" })
    .then((r) => { if (!r.ok) throw new Error("modelo"); return r.arrayBuffer(); })
    .catch((e) => { downloadModelo = null; throw e; });
  return downloadModelo;
}

// Economia de dados ligada (ou rede 2G): nada de 3D (modelo + Three.js ~1,7 MB); fica a foto do carro aberto.
function economiaDeDados() {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c && (c.saveData === true || /(^|-)2g$/.test(c.effectiveType || ""));
}

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
    if (economiaDeDados()) setSem3d(true);
    return () => m.removeEventListener("change", aplicar);
  }, []);

  // O 3D (modelo + Three.js) espera o catálogo chegar, ou 2,5 s: no 4G fraco as peças com preço aparecem
  // primeiro, e a foto do carro fica na tela enquanto isso.
  const [liberado, setLiberado] = useState(false);
  useEffect(() => {
    if (catalogo) { setLiberado(true); return; }
    const t = setTimeout(() => setLiberado(true), 2500);
    return () => clearTimeout(t);
  }, [catalogo]);

  useEffect(() => {
    const alvo = palco.current;
    if (!alvo || !liberado || sem3d) return;
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
    // O modelo começa a baixar junto com o código do 3D, e uma vez só (montar de novo reaproveita o download).
    // A montagem espera um instante: se o componente for desfeito logo em seguida (React monta, desmonta e
    // monta de novo no início), a primeira nem começa e o trabalho pesado não é feito em dobro.
    const modulo = import("./carro-3d");
    const espera = setTimeout(() => {
      void modulo.then(({ montarCarro3D }) => montarCarro3D(alvo, {
        pinos: ZONAS.map((z) => z.pino), onPinos: posicionar, superficie: area.current ?? undefined, dados: baixarModelo(),
        onPronto: () => !descartado && setPronto(true), onErro: () => !descartado && setSem3d(true), onGirou: () => !descartado && setGirou(true),
      })).then((h) => { if (descartado) h.dispose(); else { carro.current = h; atualizarRolagem(); } }).catch(() => !descartado && setSem3d(true));
    }, 30);
    baixarModelo().catch(() => {});
    return () => { descartado = true; clearTimeout(espera); carro.current?.dispose(); carro.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liberado, sem3d]);

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

  // No celular o painel é uma folha fixa embaixo: fecha quando a pessoa rola para o catálogo (o fim da abertura
  // passa da metade da tela), senão ele cobre as peças.
  useEffect(() => {
    if (!zona) return;
    const conferir = () => { const r = secao.current?.getBoundingClientRect(); if (r && r.bottom < innerHeight * 0.55) escolher(null); };
    addEventListener("scroll", conferir, { passive: true });
    return () => removeEventListener("scroll", conferir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zona]);

  function escolher(id: string | null) {
    setZona(id);
    const z = ZONAS.find((x) => x.id === id);
    setDep(z?.deps[0] || "");
    carro.current?.focar(id);
    if (id) carro.current?.abrir(1);
    // No computador o painel cobre a direita do palco: o carro anda para a esquerda.
    const largo = (area.current?.clientWidth ?? 0) > 800;
    carro.current?.deslocar(id && largo ? 200 : 0);
  }
  function abrirCarro() {
    if (!secao.current) return;
    const r = secao.current.getBoundingClientRect();
    const curso = Math.max(1, r.height - innerHeight * 0.85);
    scrollTo({ top: scrollY + r.top - innerHeight * 0.12 + curso * 0.72, behavior: reduzido ? "instant" : "smooth" });
    // O botão some quando o carro abre: o foco vai para o primeiro número (senão cai no início da página).
    setTimeout(() => pinos.current.get(ZONAS[0].id)?.focus({ preventScroll: true }), reduzido ? 50 : 900);
  }
  // Atalho de teclado/leitor de tela para cada parte: rola até o carro aberto e abre o painel.
  function escolherPeloAtalho(id: string) {
    escolher(id);
    secao.current?.scrollIntoView({ block: "end", behavior: reduzido ? "instant" : "smooth" });
  }

  const zonaAtual = ZONAS.find((z) => z.id === zona) || null;
  const departamento = catalogo?.meta.departamentos.find((d) => d.id === dep) || null;
  // Uma peça de cada grupo principal da parte (em Freios: pastilha, disco, lona, cilindro...), a melhor de cada:
  // serve no carro escolhido, tem foto própria, mais aplicações.
  const vitrine = useMemo(() => {
    const d = catalogo?.meta.departamentos.find((x) => x.id === dep);
    if (!catalogo || !d) return [] as Peca[];
    const pontos = (p: Peca) => (servePara(p, veiculo) ? 1000 : 0) + (p.foto ? (p.fotoIlustrativa ? 40 : 100) : 0) + Math.min(39, p.aplicacoes.length);
    const porGrupo = new Map<number, Peca>();
    for (const p of catalogo.pecas) {
      if (p.departamento.id !== dep || p.precoCents <= 0 || p.disponivel <= 0) continue;
      const atual = porGrupo.get(p.grupoIdx);
      if (!atual || pontos(p) > pontos(atual)) porGrupo.set(p.grupoIdx, p);
    }
    return d.grupos.map((g) => porGrupo.get(g)).filter((p): p is Peca => !!p).slice(0, NA_VITRINE);
  }, [catalogo, dep, veiculo]);

  const semCarro = sem3d;
  const painel = zonaAtual && (
    <aside className="nl-carro-painel" data-sem-giro aria-live="polite" aria-label={`Peças de ${zonaAtual.nome}`}>
      <div className="nl-carro-painel-topo">
        <p className="nl-kicker"><span /> PEÇAS DE {zonaAtual.nome.toUpperCase()}</p>
        <button type="button" className="nl-carro-fechar" aria-label="Fechar" onClick={() => escolher(null)}><X size={18} /></button>
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
          // Mesmo valor que entra no pedido pelo "+": com venda mínima, o total da compra mínima.
          const minima = compraMinima(preco, p.quantidadeMinima);
          const disp = disponibilidadeDaPeca(p, live);
          return (
            <li key={p.id}>
              <button type="button" className="nl-carro-peca" onClick={() => onSelecionar(p)}>
                <span className="nl-carro-peca-foto">{foto ? <img src={foto} alt="" loading="lazy" decoding="async" /> : <Package size={26} strokeWidth={1.2} />}</span>
                <span className="nl-carro-peca-info"><b>{tituloDaPeca(p)}</b><small>{p.marca || p.grupo}{servePara(p, veiculo) ? " · serve no seu carro" : ""}</small><strong>{money(minima.totalCents)}</strong>{minima.detalhe && <small className="nl-carro-minima">{minima.detalhe}</small>}<span className={`nl-carro-disp ${disp.classe}`}>{disp.texto}</span></span>
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
    </aside>
  );
  const titulo = semCarro || aberto
    ? <>Toque num número <em>e veja as peças.</em></>
    : <>Role para abrir <em>o carro.</em></>;
  // Só o carro, na tela inteira, e o catálogo logo abaixo.
  return (
    <section ref={secao} className={`nl-carro${reduzido || semCarro ? " nl-carro-estatico" : ""}${girou || zona ? " nl-carro-usado" : ""}`} aria-label="Compre pela parte do carro">
      <h1 className="sr-only">Nova Leões Autopeças: peças para o seu carro em Guarulhos</h1>
      <div className="nl-carro-fixo">
        <div ref={area} className="nl-carro-palco-area">
          {semCarro ? (
            // Sem WebGL ou com economia de dados: a foto do carro aberto, com os mesmos números por cima.
            <div className="nl-carro-foto" role="img" aria-label="Carro ilustrativo aberto, com os números das partes">
              <div className="nl-carro-foto-quadro">
                <img src={caminho(FOTO_ABERTO)} alt="" decoding="async" />
                {ZONAS.map((z, i) => (
                  <button type="button" key={z.id} className={`nl-pino nl-pino-foto${zona === z.id ? " ativo" : ""}`} data-visivel="1"
                    style={{ left: `${z.foto[0]}%`, top: `${z.foto[1]}%` }} data-lado={z.foto[0] > 78 ? "esq" : ""}
                    onClick={() => escolher(zona === z.id ? null : z.id)} aria-label={`Peças de ${z.nome}`}>
                    <span className="nl-pino-ponto">{i + 1}</span><span className="nl-pino-nome">{z.nome}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div ref={palco} className="nl-carro-palco" role="img" aria-label="Carro ilustrativo que abre peça por peça. Arraste ou use as setas para girar; os números sobre o carro abrem as peças de cada parte." />
              <div className="nl-carro-pinos">
                {ZONAS.map((z, i) => (
                  <button type="button" key={z.id} ref={(el) => { if (el) pinos.current.set(z.id, el); else pinos.current.delete(z.id); }}
                    className={`nl-pino${zona === z.id ? " ativo" : ""}`} data-visivel="0" tabIndex={-1} onClick={() => escolher(zona === z.id ? null : z.id)} aria-label={`Peças de ${z.nome}`}>
                    <span className="nl-pino-ponto">{i + 1}</span><span className="nl-pino-nome">{z.nome}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="nl-carro-legenda">
            <p className="nl-kicker"><span /> COMPRE PELA PARTE DO CARRO</p>
            <h2 className="nl-carro-titulo">{titulo}</h2>
            <p className="nl-carro-promessa">Desde 1993 em Guarulhos · entrega própria</p>
          </div>
          {!pronto && !semCarro && <div className="nl-carro-carregando"><img src={caminho(POSTER_CARRO)} alt="" fetchPriority="high" decoding="async" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /><span className="nl-carro-barra-carga" /></div>}
          <div className="nl-carro-controles" data-sem-giro>
            {pronto && (
              <div className="nl-carro-girar" role="group" aria-label="Girar o carro">
                <button type="button" aria-label="Girar o carro para a esquerda" onClick={() => carro.current?.girar(-Math.PI / 4)}><ChevronLeft size={20} /></button>
                <button type="button" aria-label="Girar o carro para a direita" onClick={() => carro.current?.girar(Math.PI / 4)}><ChevronRight size={20} /></button>
              </div>
            )}
            {pronto && !aberto && !reduzido && <button type="button" className="nl-carro-abrir" onClick={abrirCarro}>Abrir o carro <ArrowRight size={16} /></button>}
            {pronto && aberto && !girou && <span className="nl-carro-dica" aria-hidden="true"><Hand size={15} /> Arraste para girar</span>}
          </div>
          {painel}
          {/* Atalhos das partes para teclado e leitor de tela: só aparecem quando recebem foco. */}
          {!semCarro && (
            <nav className="nl-carro-atalhos" aria-label="Partes do carro" data-sem-giro>
              <ul>
                {ZONAS.map((z, i) => <li key={z.id}><button type="button" aria-pressed={zona === z.id} onClick={() => escolherPeloAtalho(z.id)}><b>{i + 1}</b>{z.nome}</button></li>)}
              </ul>
            </nav>
          )}
          <small className="nl-carro-nota">Veículo ilustrativo<span className="nl-carro-nota-longa">. A aplicação de cada peça é conferida pela loja</span> · <a href={caminho("assets/car/ATTRIBUTION.txt")} target="_blank" rel="noopener noreferrer">Créditos do modelo</a></small>
        </div>
      </div>
    </section>
  );
}
