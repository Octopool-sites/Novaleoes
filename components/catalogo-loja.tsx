import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowUpRight, CarFront, Check, ChevronDown, MessageCircle, Package, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import type { Product } from "@/lib/catalog";
import { productTitles } from "./storefront-editorial";
import {
  type Catalogo, type Filtro, type Peca, FILTRO_VAZIO, anosDisponiveis, filtrar, money, resumoAplicacoes, urlFoto,
} from "@/lib/catalogo-site";
import { type Veiculo, type VeiculoSalvo, servePara } from "@/lib/garagem";
import { whatsappUrl } from "@/lib/loja";
import { mensagemProcura } from "@/lib/pedido";
import { compraMinima } from "@/lib/unidades";
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
  onVeiculo: (v: VeiculoSalvo | null) => void;
};

export function precoDaPeca(peca: Peca, live: Map<string, Product>) {
  const atual = peca.externalId ? live.get(peca.externalId) : undefined;
  return atual ? atual.priceCents : peca.precoCents;
}

// O site só sabe se tem ou não tem (a quantidade não é pública). Sem estoque, a peça continua pedível:
// o pedido vira consulta e a loja responde se consegue. Não prometer encomenda (a loja não confirmou).
export const TEXTO_SEM_ESTOQUE = "Sem estoque agora · consulte a loja";
export function disponibilidadeDaPeca(peca: Peca, live: Map<string, Product>) {
  const atual = peca.externalId ? live.get(peca.externalId) : undefined;
  if (atual ? atual.stock > 0 : peca.disponivel > 0) return { texto: "Em estoque na loja", classe: atual ? "nl-disp-online" : "nl-disp-loja", estoque: 1 };
  return { texto: TEXTO_SEM_ESTOQUE, classe: "nl-disp-consulta", estoque: 0 };
}

// Texto do "Não achou?": o que a pessoa digitou, ou o grupo/departamento que ela estava vendo.
export function descricaoDaProcura(catalogo: Catalogo | null, filtro: Filtro) {
  const meta = catalogo?.meta;
  if (filtro.q.trim()) return filtro.q.trim();
  if (meta && filtro.grupo >= 0 && meta.grupos[filtro.grupo]) return meta.grupos[filtro.grupo][0];
  return meta?.departamentos.find((d) => d.id === filtro.departamento)?.nome || "";
}

export function tituloDaPeca(peca: Peca) {
  return (peca.externalId && productTitles[peca.externalId]) || peca.nome;
}

export function fotoDaPeca(peca: Peca, catalogo: Catalogo, live: Map<string, Product>) {
  const atual = peca.externalId ? live.get(peca.externalId) : undefined;
  return atual?.image || urlFoto(catalogo.meta, peca.foto);
}

// Foto emprestada de outra peça do mesmo grupo (a peça não tem foto própria no cadastro).
export function fotoIlustrativa(peca: Peca, live: Map<string, Product>) {
  return peca.fotoIlustrativa && !(peca.externalId && live.get(peca.externalId)?.image);
}

export function dataEstoque(catalogo: Catalogo | null) {
  const iso = catalogo?.meta.exportadoEm;
  if (!iso) return "";
  // O estoque é atualizado mais de uma vez por dia: "28/09, 13h".
  const d = new Date(iso);
  const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" });
  return `${dia}, ${hora.replace(/\D/g, "")}h`;
}

export default function CatalogoLoja({ catalogo, carregando, erro, live, filtro, veiculo, onFiltro, onSelecionar, onAdicionar, onTentarNovamente, onVeiculo }: CatalogoLojaProps) {
  const [limite, setLimite] = useState(PAGINA);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const filtroAdiado = useDeferredValue(filtro);
  const resultados = useMemo(() => (catalogo ? filtrar(catalogo, filtroAdiado) : []), [catalogo, filtroAdiado]);
  // Com o carro no filtro, as peças universais (lâmpada, óleo, bateria…) e as sem aplicação cadastrada ficam de fora.
  // Numa busca, avisa quantas existem sem o filtro do carro.
  const comCarro = filtroAdiado.montadora >= 0 || filtroAdiado.modelo >= 0;
  const semCarro = useMemo(() => (catalogo && comCarro && (filtroAdiado.q.trim() || filtroAdiado.grupo >= 0)
    ? filtrar(catalogo, { ...filtroAdiado, montadora: -1, modelo: -1, ano: 0 }).length : 0), [catalogo, comCarro, filtroAdiado]);
  // Marcas contadas sem o filtro de marca: escolher uma não esconde as outras da lista.
  const resultadosSemMarca = useMemo(() => (catalogo && filtroAdiado.marca >= 0 ? filtrar(catalogo, { ...filtroAdiado, marca: -1 }) : resultados), [catalogo, filtroAdiado, resultados]);
  useEffect(() => { setLimite(PAGINA); }, [filtroAdiado]);

  const meta = catalogo?.meta;
  const departamento = meta?.departamentos.find((d) => d.id === filtro.departamento) || null;
  const gruposDoDepartamento = departamento && meta ? departamento.grupos.slice(0, 18) : [];
  const modelos = useMemo(() => {
    if (!meta) return [] as { idx: number; montadora: number; nome: string }[];
    if (filtro.montadora < 0) return [];
    return meta.modelos.map((m, idx) => ({ idx, montadora: m[0], nome: m[1], n: m[2] })).filter((m) => m.montadora === filtro.montadora && m.n > 0).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [meta, filtro.montadora]);
  const montadorasAz = useMemo(() => {
    if (!meta) return [] as { idx: number; nome: string }[];
    const comPecas = new Set(meta.modelos.filter((m) => m[2] > 0).map((m) => m[0]));
    return meta.montadoras.map((nome, idx) => ({ idx, nome })).filter((m) => comPecas.has(m.idx)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [meta]);
  const anos = useMemo(() => (catalogo && filtro.modelo >= 0 ? anosDisponiveis(catalogo, filtro.modelo, -1) : []), [catalogo, filtro.modelo]);
  const marcas = useMemo(() => {
    if (!meta) return [] as { idx: number; nome: string; n: number }[];
    const contagem = new Map<string, number>();
    for (const p of resultadosSemMarca) if (p.marca) contagem.set(p.marca, (contagem.get(p.marca) || 0) + 1);
    const lista = meta.marcas.map((m, idx) => ({ idx, nome: m[0], n: contagem.get(m[0]) || 0 })).filter((m) => m.n > 0 || m.idx === filtro.marca);
    return lista.sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, "pt-BR")).slice(0, 60);
  }, [meta, resultadosSemMarca, filtro.marca]);
  const verSemCarro = () => atualizar({ montadora: -1, modelo: -1, ano: 0 });
  const rotuloCarro = meta && filtro.modelo >= 0 ? `${meta.montadoras[meta.modelos[filtro.modelo][0]]} ${meta.modelos[filtro.modelo][1]}${filtro.ano ? ` ${filtro.ano}` : ""}` : meta && filtro.montadora >= 0 ? meta.montadoras[filtro.montadora] : "";

  const atualizar = (parte: Partial<Filtro>) => onFiltro({ ...filtro, ...parte });
  const linkProcura = whatsappUrl(mensagemProcura(descricaoDaProcura(catalogo, filtro), rotuloCarro || veiculo?.rotulo || ""));
  // Montadora → modelo → ano, um de cada vez. O carro fica lembrado a partir do modelo.
  const lembrar = (modelo: number, ano: number) => { if (meta) onVeiculo(modelo >= 0 ? { montadora: meta.montadoras[meta.modelos[modelo][0]], modelo: meta.modelos[modelo][1], ano } : null); };
  const escolherMontadora = (montadora: number) => { atualizar({ montadora, modelo: -1, ano: 0 }); lembrar(-1, 0); };
  const escolherModelo = (modelo: number) => { atualizar({ modelo, ano: 0 }); lembrar(modelo, 0); };
  const escolherAno = (ano: number) => { atualizar({ ano }); lembrar(filtro.modelo, ano); };
  const limparCarro = () => { atualizar({ montadora: -1, modelo: -1, ano: 0 }); lembrar(-1, 0); };
  const filtrosAtivos = [filtro.marca >= 0, filtro.somenteEstoque, filtro.ordem !== "relevancia"].filter(Boolean).length;
  const visiveis = resultados.slice(0, limite);
  const estoqueEm = dataEstoque(catalogo);

  return (
    <div className="nl-catalogo">
      <div className={`nl-carro-barra${filtro.modelo >= 0 ? " com-carro" : ""}`} role="group" aria-label="Filtrar pelo seu carro">
        <p className="nl-carro-barra-rotulo"><CarFront size={19} /> {veiculo && filtro.modelo === veiculo.modelo ? <>Peças para o seu <b>{veiculo.rotulo}</b></> : "Qual é o seu carro?"}</p>
        <div className="nl-carro-selects">
          <span className="nl-select"><select aria-label="Montadora" value={filtro.montadora} disabled={!meta} onChange={(e) => escolherMontadora(Number(e.target.value))}>
            <option value={-1}>Montadora</option>
            {montadorasAz.map((m) => <option key={m.idx} value={m.idx}>{m.nome}</option>)}
          </select><ChevronDown size={15} /></span>
          <span className="nl-select"><select aria-label="Modelo" value={filtro.modelo} disabled={filtro.montadora < 0} onChange={(e) => escolherModelo(Number(e.target.value))}>
            <option value={-1}>Modelo</option>
            {modelos.map((m) => <option key={m.idx} value={m.idx}>{m.nome}</option>)}
          </select><ChevronDown size={15} /></span>
          <span className="nl-select"><select aria-label="Ano" value={filtro.ano} disabled={filtro.modelo < 0} onChange={(e) => escolherAno(Number(e.target.value))}>
            <option value={0}>Ano</option>
            {anos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select><ChevronDown size={15} /></span>
          {(filtro.montadora >= 0 || veiculo) && <button type="button" className="nl-carro-limpar" onClick={limparCarro}><X size={14} /> Limpar</button>}
        </div>
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
          {filtrosAtivos > 0 && <button type="button" className="nl-limpar" onClick={() => atualizar({ marca: -1, somenteEstoque: false, ordem: "relevancia" })}><X size={14} /> Limpar filtros</button>}
        </div>
      </div>

      {(filtro.marca >= 0 || filtro.somenteEstoque) && meta && (
        <div className="nl-filtros-resumo" aria-label="Filtros aplicados">
          {filtro.marca >= 0 && <button type="button" onClick={() => atualizar({ marca: -1 })}>{meta.marcas[filtro.marca]?.[0] ?? "Marca"} <X size={12} /></button>}
          {filtro.somenteEstoque && <button type="button" onClick={() => atualizar({ somenteEstoque: false })}>Em estoque <X size={12} /></button>}
        </div>
      )}

      {semCarro > resultados.length && resultados.length > 0 && (
        <p className="nl-aviso-carro" role="status">
          <CarFront size={16} aria-hidden="true" />
          <span>Mostrando {resultados.length.toLocaleString("pt-BR")} {resultados.length === 1 ? "peça" : "peças"} com aplicação cadastrada para o {rotuloCarro}. Sem o filtro do carro são {semCarro.toLocaleString("pt-BR")}, incluindo peças universais.</span>
          <button type="button" onClick={verSemCarro}>Ver todas</button>
        </p>
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
          <h3>Nenhuma peça encontrada{rotuloCarro ? ` para o ${rotuloCarro}` : ""}</h3>
          {semCarro > 0
            ? <p>Existem {semCarro.toLocaleString("pt-BR")} {semCarro === 1 ? "peça" : "peças"} para essa busca sem o filtro do carro (peças universais ou sem aplicação cadastrada). A equipe confere se servem no seu carro.</p>
            : <p>Tente outro nome, a marca da peça ou só o modelo do carro. Se preferir, a equipe procura para você pelo WhatsApp.</p>}
          <a className="primary-button nl-procura-whats" href={linkProcura} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} /> Pedir esta peça no WhatsApp</a>
          <div className="nl-vazio-acoes">
            {semCarro > 0 && <button type="button" onClick={verSemCarro}>Ver as {semCarro.toLocaleString("pt-BR")} sem o filtro do carro</button>}
            <button type="button" onClick={() => onFiltro({ ...FILTRO_VAZIO, q: filtro.q, montadora: filtro.montadora, modelo: filtro.modelo, ano: filtro.ano })}>Limpar os outros filtros</button>
          </div>
        </div>
      )}
      {resultados.length > visiveis.length && (
        <div className="nl-carregar-mais">
          <span>Mostrando {visiveis.length.toLocaleString("pt-BR")} de {resultados.length.toLocaleString("pt-BR")}</span>
          <button type="button" className="nl-button" onClick={() => setLimite((l) => l + PAGINA * 2)}>Ver mais peças <ChevronDown size={17} /></button>
        </div>
      )}
      {catalogo && resultados.length > 0 && !carregando && (
        <aside className="nl-nao-achou" aria-label="Pedir uma peça para a loja">
          <p><b>Não achou a peça que procura?</b><span>Mande o nome da peça e o carro: a equipe procura para você e responde pelo WhatsApp.</span></p>
          <a className="nl-whats-button" href={linkProcura} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} /> Pedir pelo WhatsApp</a>
        </aside>
      )}
    </div>
  );
}

function CartaoPeca({ peca, catalogo, live, veiculo, onSelecionar, onAdicionar }: { peca: Peca; catalogo: Catalogo; live: Map<string, Product>; veiculo: Veiculo | null; onSelecionar: (p: Peca) => void; onAdicionar: (p: Peca) => void }) {
  const titulo = tituloDaPeca(peca);
  const foto = fotoDaPeca(peca, catalogo, live);
  const preco = precoDaPeca(peca, live);
  const disp = disponibilidadeDaPeca(peca, live);
  const compra = compraMinima(preco, peca.quantidadeMinima);
  const aplicacoes = resumoAplicacoes(catalogo.meta, peca);
  const serve = servePara(peca, veiculo);
  return (
    <article className="product-card nl-product-card">
      <button type="button" className="product-photo photo-button" onClick={() => onSelecionar(peca)}>
        <span className="sr-only">{titulo}: ver detalhes{serve ? ", serve no seu carro" : ""}</span>
        {foto ? <img src={foto} alt="" loading="lazy" decoding="async" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : <div className="nl-photo-placeholder" aria-hidden="true"><Package size={44} strokeWidth={1} /><small>Foto em breve</small></div>}
        <span aria-hidden="true">{peca.grupo}</span>
        {foto && fotoIlustrativa(peca, live) && <small className="nl-foto-ilustrativa" aria-hidden="true">Foto ilustrativa</small>}
        {serve && <em className="nl-serve" aria-hidden="true"><Check size={13} /> Serve no seu {catalogo.meta.modelos[veiculo!.modelo]?.[1] ?? "carro"}</em>}
        <i className="nl-photo-open" aria-hidden="true"><ArrowUpRight size={18} /></i>
      </button>
      <div className="product-info">
        <p className="product-brand">{peca.marca || peca.departamento.nome}</p>
        <h3><button type="button" onClick={() => onSelecionar(peca)}>{titulo}</button></h3>
        <p className="application">{aplicacoes ? <><CarFront size={13} aria-hidden="true" /> {aplicacoes}</> : "Aplicação conferida pela equipe."}</p>
        <div className="product-bottom">
          <div>
            <strong>{preco > 0 ? money(compra.totalCents) : "Consultar preço"}</strong>
            {compra.detalhe && <small className="nl-compra-minima">{compra.detalhe}</small>}
            <small className={disp.classe}>{disp.texto}</small>
          </div>
          <button type="button" onClick={() => onAdicionar(peca)} aria-label={`Adicionar ${compra.quantidade > 1 ? `${compra.quantidade} unidades ` : ""}ao pedido: ${titulo}`} className="add-button"><Plus size={17} /><span>Adicionar ao pedido</span></button>
        </div>
      </div>
    </article>
  );
}
