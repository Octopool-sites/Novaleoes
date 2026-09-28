import { useEffect, useState } from "react";
import { CarFront, Check, ChevronDown, Link2, MessageCircle, Package, Share2, ShoppingBag, TriangleAlert } from "lucide-react";
import { DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { Product } from "@/lib/catalog";
import { productBenefits } from "./storefront-editorial";
import { type Catalogo, type Detalhe, type Peca, aplicaAno, carregarDetalhe, faixaAnos, money, normalizeSearch, separarDescricao } from "@/lib/catalogo-site";
import { type Veiculo, servePara } from "@/lib/garagem";
import { disponibilidadeDaPeca, fotoDaPeca, precoDaPeca, tituloDaPeca } from "./catalogo-loja";
import { unidadeLegivel } from "@/lib/unidades";
import CalculoFrete from "./calculo-frete";
import { BASE_URL } from "@/lib/base";

// Até ~180 caracteres de texto do cadastro à vista; o resto fica em "Mais informações".
const LIMITE_TEXTO = 180;
const VEICULOS_A_VISTA = 8;

export function linkDaPeca(peca: Peca) {
  return `${location.origin}${BASE_URL}?peca=${peca.id}`;
}

export default function PecaDetalhe({ peca, catalogo, live, veiculo, onAdicionar, onWhatsApp, onEscolherVeiculo }: {
  peca: Peca; catalogo: Catalogo; live: Map<string, Product>; veiculo: Veiculo | null;
  onAdicionar: (peca: Peca) => void; onWhatsApp: (peca: Peca) => string; onEscolherVeiculo: () => void;
}) {
  const [detalhe, setDetalhe] = useState<Detalhe | null | undefined>(undefined);
  const [copiado, setCopiado] = useState(false);
  const [todosVeiculos, setTodosVeiculos] = useState(false);
  useEffect(() => {
    let ativo = true;
    setDetalhe(undefined);
    setTodosVeiculos(false);
    carregarDetalhe(catalogo, peca.id).then((d) => ativo && setDetalhe(d)).catch(() => ativo && setDetalhe(null));
    return () => { ativo = false; };
  }, [catalogo, peca.id]);
  const titulo = tituloDaPeca(peca);
  const foto = fotoDaPeca(peca, catalogo, live);
  const preco = precoDaPeca(peca, live);
  const disp = disponibilidadeDaPeca(peca, live);
  const indisponivel = !!peca.externalId && disp.estoque <= 0;
  const beneficio = peca.externalId ? productBenefits[peca.externalId] : "";
  const unidade = unidadeLegivel(peca.unidade, peca.quantidadeMinima);
  const { meta } = catalogo;
  const aplicacoes = detalhe?.a ?? [];
  const serve = servePara(peca, veiculo);
  const ordenadas = veiculo ? [...aplicacoes].sort((x, y) => Number(y[0] === veiculo.modelo) - Number(x[0] === veiculo.modelo)) : aplicacoes;
  const { texto, veiculos: descritos } = separarDescricao(detalhe?.d ?? []);
  const aVista: string[] = [];
  for (const t of texto) { if (aVista.length && [...aVista, t].join(" · ").length > LIMITE_TEXTO) break; aVista.push(t); }
  const maisTexto = texto.slice(aVista.length);
  // A lista da descrição costuma ser mais completa que a tabela estruturada; usa a que tiver mais veículos.
  const usarDescritos = descritos.length > aplicacoes.length;
  const modeloDoCarro = veiculo ? normalizeSearch(meta.modelos[veiculo.modelo][1]) : "";
  const descritoDoCarro = (d: { nome: string; inicio: number; fim: number }) =>
    !!veiculo && normalizeSearch(d.nome).startsWith(modeloDoCarro) && aplicaAno([0, d.inicio, d.fim], veiculo.ano);
  const listaDescritos = [...descritos].sort((x, y) => Number(descritoDoCarro(y)) - Number(descritoDoCarro(x)) || x.nome.localeCompare(y.nome, "pt-BR"));
  const totalVeiculos = usarDescritos ? descritos.length : aplicacoes.length;
  const limite = todosVeiculos ? Infinity : VEICULOS_A_VISTA;

  async function compartilhar() {
    const url = linkDaPeca(peca);
    const dados = { title: `${titulo} | ${"Nova Leões Autopeças"}`, text: `${titulo}${preco > 0 ? ` por ${money(preco)}` : ""} na Nova Leões Autopeças`, url };
    try {
      if (navigator.share) { await navigator.share(dados); return; }
    } catch { return; }
    try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch {}
  }

  return (
    <>
      <div className="detail-photo"><span className="nl-detail-category">{peca.departamento.nome} · {peca.grupo}</span>
        {foto ? <img src={foto} alt={titulo} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : <div className="nl-photo-placeholder"><Package size={64} strokeWidth={1} /><small>Foto em breve</small></div>}
      </div>
      <div className="nl-detail-content">
        <p className="eyebrow">{peca.marca || "Marca conferida no atendimento"}{unidade ? ` · ${unidade}` : ""}</p>
        <DialogTitle className="detail-title">{titulo}</DialogTitle>
        {veiculo && (serve
          ? <p className="nl-detail-serve"><Check size={16} /> Serve no seu {veiculo.rotulo}</p>
          : <p className="nl-detail-nao-serve"><TriangleAlert size={16} /> Sem aplicação cadastrada para o seu {veiculo.rotulo}. Confirme com a loja.</p>)}
        <DialogDescription className="detail-description">
          {beneficio ? `${beneficio} ` : ""}
          {detalhe === undefined ? "Carregando informações da peça…" : aVista.length ? aVista.join(" · ") : beneficio ? "" : totalVeiculos ? "Confira abaixo os veículos em que a peça é aplicada." : "Descrição conforme o cadastro da loja."}
        </DialogDescription>
        {maisTexto.length > 0 && <details className="nl-detail-mais"><summary>Mais informações do cadastro <ChevronDown size={14} /></summary><p>{maisTexto.join(" · ")}</p></details>}
        {detalhe?.h.length ? <ul className="nl-detail-destaques">{detalhe.h.map((h) => <li key={h}>{h}</li>)}</ul> : null}

        <strong className="detail-price">{preco > 0 ? money(preco) : "Preço sob consulta"}</strong>
        <p className={`subtle ${disp.classe}`}>{disp.texto}{preco > 0 ? " · valor confirmado pela loja no pedido" : ""}</p>
        <div className="nl-detail-acoes">
          <button type="button" className="primary-button wide" disabled={indisponivel} onClick={() => onAdicionar(peca)}>
            {indisponivel ? "Indisponível" : "Adicionar ao pedido"} <ShoppingBag size={18} />
          </button>
          <a className="nl-whats-button" href={onWhatsApp(peca)} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} /> Perguntar no WhatsApp</a>
        </div>
        <button type="button" className="nl-compartilhar" onClick={compartilhar}>{copiado ? <><Link2 size={15} /> Link copiado</> : <><Share2 size={15} /> Compartilhar esta peça</>}</button>

        <CalculoFrete titulo="Frete para o seu endereço" />

        <div className="nl-detail-aplicacoes">
          <p className="nl-detail-subtitulo"><CarFront size={17} /> {totalVeiculos ? `Aplicação · ${totalVeiculos} ${totalVeiculos === 1 ? "veículo" : "veículos"}` : "Aplicação"}
            {!veiculo && <button type="button" onClick={onEscolherVeiculo}>Conferir no meu carro</button>}</p>
          {usarDescritos ? (
            <table className="nl-aplic-descritos">
              <thead><tr><th>Veículo</th><th>Anos</th></tr></thead>
              <tbody>
                {listaDescritos.slice(0, limite).map((d, i) => {
                  const doCarro = descritoDoCarro(d);
                  return <tr key={i} className={doCarro ? "nl-aplic-carro" : ""}><td>{d.nome}{doCarro && <small>seu carro</small>}</td><td>{faixaAnos(d.inicio, d.fim) || "Todos"}</td></tr>;
                })}
              </tbody>
            </table>
          ) : aplicacoes.length ? (
            <table>
              <thead><tr><th>Veículo</th><th>Versão / motor</th><th>Anos</th></tr></thead>
              <tbody>
                {ordenadas.slice(0, limite).map((a, i) => {
                  const doCarro = !!veiculo && a[0] === veiculo.modelo && aplicaAno([a[0], a[3], a[4]], veiculo.ano);
                  return (
                    <tr key={i} className={doCarro ? "nl-aplic-carro" : ""}>
                      <td>{meta.montadoras[meta.modelos[a[0]][0]]} {meta.modelos[a[0]][1]}{doCarro && <small>seu carro</small>}</td>
                      <td>{[a[1], a[2]].filter(Boolean).join(" · ") || "Todas"}{a[5] ? <small> {a[5]}</small> : null}</td>
                      <td>{faixaAnos(a[3], a[4]) || "Todos"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <p className="subtle">{detalhe === undefined ? "Conferindo os veículos…" : "Sem tabela de aplicação no cadastro. Informe seu carro no pedido: a equipe confere antes de aprovar."}</p>}
          {totalVeiculos > VEICULOS_A_VISTA && (
            <button type="button" className="nl-aplic-mais" aria-expanded={todosVeiculos} onClick={() => setTodosVeiculos((v) => !v)}>
              {todosVeiculos ? "Mostrar menos" : `Ver todos os ${totalVeiculos} veículos`} <ChevronDown size={14} />
            </button>
          )}
        </div>
        <div className="compatibility-note">
          <CarFront size={21} />
          <span><b>A loja confere antes de aprovar</b>Com modelo, ano e motor informados no pedido, a equipe confirma a aplicação antes de separar a peça.</span>
        </div>
      </div>
    </>
  );
}
