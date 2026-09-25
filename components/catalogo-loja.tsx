import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowUpRight, CarFront, Check, ChevronDown, Package, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import type { Product } from "@/lib/catalog";
import { productTitles } from "./storefront-editorial";
import {
  type Catalogo, type Filtro, type Peca, FILTRO_VAZIO, anosDisponiveis, filtrar, money, resumoAplicacoes, urlFoto,
} from "@/lib/catalogo-site";
import { type Veiculo, servePara } from "@/lib/garagem";
import "./catalogo-loja.css";

const PAGINA = 24;

export type CatalogoLojaProps = {
  catalogo: Catalogo | null;
  carregando: boolean;
  erro: boolean;
  live: Map<string, Product>;
  filtro: Filtro;
  veiculo: Veiculo | null;
  onFiltro: (filtro: Filtro) => void;
  onSelecionar: (peca: Peca) => void;
  onAdicionar: (peca: Peca) => void;
  onTentarNovamente: () => void;
  onEscolherVeiculo: () => void;
};

export function precoDaPeca(peca: Peca, live: Map<string, Product>) {
  const atual = peca.externalId ? live.get(peca.externalId) : undefined;
  return atual ? atual.priceCents : peca.precoCents;
}

export function disponibilidadeDaPeca(peca: Peca, live: Map<string, Product>) {
  const atual = peca.externalId ? live.get(peca.externalId) : undefined;
  if (atual) return atual.stock > 0 ? { texto: "Em estoque · pedido online", classe: "nl-disp-online", estoque: atual.stock } : { texto: "Indisponível no momento", classe: "nl-disp-fora", estoque: 0 };
  if (peca.disponivel > 0) return { texto: "Em estoque na loja", classe: "nl-disp-loja", estoque: peca.disponivel };
  return { texto: "Sob encomenda · consulte", classe: "nl-disp-consulta", estoque: 0 };
}

export function tituloDaPeca(peca: Peca) {
  return (peca.externalId && productTitles[peca.externalId]) || peca.nome;
}

export function fotoDaPeca(peca: Peca, catalogo: Catalogo, live: Map<string, Product>) {
  const atual = peca.externalId ? live.get(peca.externalId) : undefined;
  return atual?.image || urlFoto(catalogo.meta, peca.foto);
}

export function dataEstoque(catalogo: Catalogo | null) {
  const iso = catalogo?.meta.exportadoEm;
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

export default function CatalogoLoja({ catalogo, carregando, erro, live, filtro, veiculo, onFiltro, onSelecionar, onAdicionar, onTentarNovamente, onEscolherVeiculo }: CatalogoLojaProps) {
  const [limite, setLimite] = useState(PAGINA);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const filtroAdiado = useDeferredValue(filtro);
  const resultados = useMemo(() => (catalogo ? filtrar(catalogo, filtroAdiado) : []), [catalogo, filtroAdiado]);
  useEffect(() => { setLimite(PAGINA); }, [filtroAdiado]);

  const meta = catalogo?.meta;
  const departamento = meta?.departamentos.find((d) => d.id === filtro.departamento) || null;
  const gruposDoDepartamento = departamento && meta ? departamento.grupos.slice(0, 18) : [];
  const modelos = useMemo(() => {
    if (!meta) return [] as { idx: number; montadora: number; nome: string }[];
    return meta.modelos.map((m, idx) => ({ idx, montadora: m[0], nome: m[1] })).filter((m) => filtro.montadora < 0 || m.montadora === filtro.montadora).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [meta, filtro.montadora]);
  const anos = useMemo(() => (catalogo && (filtro.modelo >= 0 || filtro.montadora >= 0) ? anosDisponiveis(catalogo, filtro.modelo, filtro.montadora) : []), [catalogo, filtro.modelo, filtro.montadora]);
  const marcas = useMemo(() => {
    if (!meta) return [] as { idx: number; nome: string; n: number }[];
    const contagem = new Map<string, number>();
    for (const p of resultados) if (p.marca) contagem.set(p.marca, (contagem.get(p.marca) || 0) + 1);
    const lista = meta.marcas.map((m, idx) => ({ idx, nome: m[0], n: contagem.get(m[0]) || 0 })).filter((m) => m.n > 0 || m.idx === filtro.marca);
    return lista.sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, "pt-BR")).slice(0, 60);
  }, [meta, resultados, filtro.marca]);

  const atualizar = (parte: Partial<Filtro>) => onFiltro({ ...filtro, ...parte });
  const filtrandoPeloCarro = !!veiculo && filtro.modelo === veiculo.modelo && filtro.ano === veiculo.ano;
  const filtrosAtivos = [filtro.departamento, filtro.grupo >= 0, filtro.marca >= 0, filtro.montadora >= 0, filtro.modelo >= 0, filtro.ano > 0, filtro.somenteEstoque].filter(Boolean).length;
  const visiveis = resultados.slice(0, limite);
  const estoqueEm = dataEstoque(catalogo);

  return (
    <div className="nl-catalogo">
      <div className={`nl-carro-barra${veiculo ? " com-carro" : ""}`}>
        <CarFront size={20} />
        {veiculo ? (
          <>
            <span>{filtrandoPeloCarro ? <>Mostrando peças para o seu <b>{veiculo.rotulo}</b></> : <>Seu carro: <b>{veiculo.rotulo}</b> · as peças que servem aparecem marcadas</>}</span>
            {filtrandoPeloCarro
              ? <button type="button" onClick={() => atualizar({ montadora: -1, modelo: -1, ano: 0 })}>Ver todas as peças</button>
              : <button type="button" onClick={() => atualizar({ montadora: veiculo.montadora, modelo: veiculo.modelo, ano: veiculo.ano })}>Só peças do meu carro</button>}
            <button type="button" onClick={onEscolherVeiculo}>Trocar carro</button>
          </>
        ) : (
          <>
            <span>Selecione seu carro para ver só as peças com aplicação para ele.</span>
            <button type="button" className="nl-carro-barra-cta" onClick={onEscolherVeiculo}>Selecionar meu carro</button>
          </>
        )}
      </div>

      <div className="nl-catalog-tools">
        <form className="searchbox" role="search" onSubmit={(e) => e.preventDefault()}>
          <Search size={20} />
          <input aria-label="Buscar peça por nome, marca, grupo ou veículo" placeholder="Busque a peça: nome, marca ou carro (ex.: pastilha gol)" maxLength={120} value={filtro.q} onChange={(e) => atualizar({ q: e.target.value })} />
          {filtro.q && <button type="button" aria-label="Limpar busca" onClick={() => atualizar({ q: "" })}>×</button>}
        </form>
        <button type="button" className={`nl-filtros-toggle${filtrosAbertos ? " ativo" : ""}`} aria-expanded={filtrosAbertos} aria-controls="nl-filtros" onClick={() => setFiltrosAbertos((v) => !v)}>
          <SlidersHorizontal size={16} /> Filtros{filtrosAtivos > 0 && <b>{filtrosAtivos}</b>}
        </button>
        <span className="subtle" aria-live="polite">
          {carregando ? "Carregando catálogo…" : erro ? "Catálogo indisponível" : `${resultados.length.toLocaleString("pt-BR")} ${resultados.length === 1 ? "peça" : "peças"}${estoqueEm ? ` · estoque de ${estoqueEm}` : ""}`}
        </span>
      </div>

      <nav className="category-nav nl-departamentos" aria-label="Departamentos">
        <div className="wrap">
          <button type="button" className={!filtro.departamento ? "active" : ""} aria-pressed={!filtro.departamento} onClick={() => atualizar({ departamento: "", grupo: -1 })}>Todas as peças</button>
          {meta?.departamentos.filter((d) => d.n > 0).map((d) => (
            <button type="button" key={d.id} className={filtro.departamento === d.id ? "active" : ""} aria-pressed={filtro.departamento === d.id} onClick={() => atualizar({ departamento: d.id, grupo: -1 })} title={d.resumo}>
              {d.nome}<small>{d.n.toLocaleString("pt-BR")}</small>
            </button>
          ))}
        </div>
      </nav>

      {departamento && meta && gruposDoDepartamento.length > 1 && (
        <div className="nl-grupos" role="group" aria-label={`Grupos de ${departamento.nome}`}>
          <span className="nl-grupos-rotulo">{departamento.resumo}</span>
          <div className="nl-grupos-lista">
            <button type="button" className={filtro.grupo < 0 ? "active" : ""} onClick={() => atualizar({ grupo: -1 })}>Todos os grupos</button>
            {gruposDoDepartamento.map((gIdx) => (
              <button type="button" key={gIdx} className={filtro.grupo === gIdx ? "active" : ""} aria-pressed={filtro.grupo === gIdx} onClick={() => atualizar({ grupo: filtro.grupo === gIdx ? -1 : gIdx })}>
                {meta.grupos[gIdx][0]}<small>{meta.grupos[gIdx][2]}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      <div id="nl-filtros" className={`nl-filtros${filtrosAbertos ? " aberto" : ""}`} hidden={!filtrosAbertos}>
        <div className="nl-filtro-veiculo">
          <p className="nl-filtro-titulo"><CarFront size={18} /> Veículo</p>
          <div className="nl-filtro-selects">
            <label>Montadora
              <span className="nl-select"><select value={filtro.montadora} onChange={(e) => atualizar({ montadora: Number(e.target.value), modelo: -1, ano: 0 })}>
                <option value={-1}>Todas</option>
                {meta?.montadoras.map((m, idx) => <option key={m} value={idx}>{m}</option>)}
              </select><ChevronDown size={15} /></span>
            </label>
            <label>Modelo
              <span className="nl-select"><select value={filtro.modelo} disabled={!meta} onChange={(e) => { const modelo = Number(e.target.value); atualizar({ modelo, montadora: modelo >= 0 && meta ? meta.modelos[modelo][0] : filtro.montadora, ano: 0 }); }}>
                <option value={-1}>Todos</option>
                {modelos.map((m) => <option key={m.idx} value={m.idx}>{filtro.montadora < 0 && meta ? `${meta.montadoras[m.montadora]} ${m.nome}` : m.nome}</option>)}
              </select><ChevronDown size={15} /></span>
            </label>
            <label>Ano
              <span className="nl-select"><select value={filtro.ano} disabled={!anos.length} onChange={(e) => atualizar({ ano: Number(e.target.value) })}>
                <option value={0}>{anos.length ? "Todos" : "Escolha o modelo"}</option>
                {anos.map((a) => <option key={a} value={a}>{a}</option>)}
              </select><ChevronDown size={15} /></span>
            </label>
          </div>
        </div>
        <div className="nl-filtro-outros">
          <label>Marca da peça
            <span className="nl-select"><select value={filtro.marca} onChange={(e) => atualizar({ marca: Number(e.target.value) })}>
              <option value={-1}>Todas</option>
              {marcas.map((m) => <option key={m.idx} value={m.idx}>{m.nome} ({m.n})</option>)}
            </select><ChevronDown size={15} /></span>
          </label>
          <label>Ordenar
            <span className="nl-select"><select value={filtro.ordem} onChange={(e) => atualizar({ ordem: e.target.value as Filtro["ordem"] })}>
              <option value="relevancia">Relevância</option>
              <option value="nome">Nome (A–Z)</option>
              <option value="menor-preco">Menor preço</option>
              <option value="maior-preco">Maior preço</option>
            </select><ChevronDown size={15} /></span>
          </label>
          <label className="nl-check"><input type="checkbox" checked={filtro.somenteEstoque} onChange={(e) => atualizar({ somenteEstoque: e.target.checked })} /> Só peças em estoque</label>
          {filtrosAtivos > 0 && <button type="button" className="nl-limpar" onClick={() => onFiltro({ ...FILTRO_VAZIO, q: filtro.q })}><X size={14} /> Limpar filtros</button>}
        </div>
      </div>

      {(filtro.montadora >= 0 || filtro.modelo >= 0 || filtro.marca >= 0 || filtro.ano > 0 || filtro.somenteEstoque) && meta && (
        <div className="nl-filtros-resumo" aria-label="Filtros aplicados">
          {filtro.montadora >= 0 && <button type="button" onClick={() => atualizar({ montadora: -1, modelo: -1, ano: 0 })}>{meta.montadoras[filtro.montadora]} <X size={12} /></button>}
          {filtro.modelo >= 0 && <button type="button" onClick={() => atualizar({ modelo: -1, ano: 0 })}>{meta.modelos[filtro.modelo][1]} <X size={12} /></button>}
          {filtro.ano > 0 && <button type="button" onClick={() => atualizar({ ano: 0 })}>{filtro.ano} <X size={12} /></button>}
          {filtro.marca >= 0 && <button type="button" onClick={() => atualizar({ marca: -1 })}>{meta.marcas[filtro.marca][0]} <X size={12} /></button>}
          {filtro.somenteEstoque && <button type="button" onClick={() => atualizar({ somenteEstoque: false })}>Em estoque <X size={12} /></button>}
        </div>
      )}

      {erro && (
        <div className="inline-error">
          <AlertCircle size={18} /> Não foi possível carregar o catálogo. <button type="button" onClick={onTentarNovamente}>Tentar novamente</button>
        </div>
      )}

      <div className="product-grid" aria-busy={filtro !== filtroAdiado}>
        {catalogo && visiveis.map((p) => <CartaoPeca key={p.id} peca={p} catalogo={catalogo} live={live} veiculo={veiculo} onSelecionar={onSelecionar} onAdicionar={onAdicionar} />)}
      </div>
      {carregando && <div className="nl-skeletons" role="status" aria-label="Carregando catálogo">{[1, 2, 3, 4].map((i) => <div key={i} />)}</div>}
      {catalogo && !resultados.length && !carregando && (
        <div className="empty-state">
          <Search />
          <h3>Nenhuma peça encontrada</h3>
          <p>Tente outro nome, a marca da peça ou só o modelo do carro. Se preferir, a equipe procura para você pelo WhatsApp.</p>
          <button type="button" onClick={() => onFiltro(FILTRO_VAZIO)}>Limpar busca e filtros</button>
        </div>
      )}
      {resultados.length > visiveis.length && (
        <div className="nl-carregar-mais">
          <span>Mostrando {visiveis.length.toLocaleString("pt-BR")} de {resultados.length.toLocaleString("pt-BR")}</span>
          <button type="button" className="nl-button" onClick={() => setLimite((l) => l + PAGINA * 2)}>Ver mais peças <ChevronDown size={17} /></button>
        </div>
      )}
    </div>
  );
}

function CartaoPeca({ peca, catalogo, live, veiculo, onSelecionar, onAdicionar }: { peca: Peca; catalogo: Catalogo; live: Map<string, Product>; veiculo: Veiculo | null; onSelecionar: (p: Peca) => void; onAdicionar: (p: Peca) => void }) {
  const titulo = tituloDaPeca(peca);
  const foto = fotoDaPeca(peca, catalogo, live);
  const preco = precoDaPeca(peca, live);
  const disp = disponibilidadeDaPeca(peca, live);
  const aplicacoes = resumoAplicacoes(catalogo.meta, peca);
  const indisponivel = !!peca.externalId && disp.estoque <= 0;
  const serve = servePara(peca, veiculo);
  return (
    <article className="product-card nl-product-card">
      <button type="button" className="product-photo photo-button" onClick={() => onSelecionar(peca)} aria-label={`Ver detalhes de ${titulo}`}>
        {foto ? <img src={foto} alt={titulo} loading="lazy" decoding="async" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : <div className="nl-photo-placeholder"><Package size={44} strokeWidth={1} /><small>Foto em breve</small></div>}
        <span>{peca.grupo}</span>
        {serve && <em className="nl-serve"><Check size={13} /> Serve no seu {catalogo.meta.modelos[veiculo!.modelo][1]}</em>}
        <i className="nl-photo-open" aria-hidden="true"><ArrowUpRight size={18} /></i>
      </button>
      <div className="product-info">
        <p className="product-brand">{peca.marca || peca.departamento.nome}</p>
        <h3><button type="button" onClick={() => onSelecionar(peca)}>{titulo}</button></h3>
        <p className="application">{aplicacoes ? <><CarFront size={13} aria-hidden="true" /> {aplicacoes}</> : "Aplicação conferida pela equipe."}</p>
        <div className="product-bottom">
          <div>
            <strong>{preco > 0 ? money(preco) : "Consultar preço"}</strong>
            <small className={disp.classe}>{disp.texto}</small>
          </div>
          <button type="button" disabled={indisponivel} onClick={() => onAdicionar(peca)} aria-label={`Adicionar ${titulo} ao pedido`} className="add-button"><Plus size={17} /><span>{indisponivel ? "Indisponível" : "Adicionar ao pedido"}</span></button>
        </div>
      </div>
    </article>
  );
}
