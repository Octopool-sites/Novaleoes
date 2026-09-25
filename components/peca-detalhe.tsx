import { useEffect, useState } from "react";
import { CarFront, Check, Link2, MessageCircle, Package, Share2, ShoppingBag, TriangleAlert } from "lucide-react";
import { DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { Product } from "@/lib/catalog";
import { productBenefits } from "./storefront-editorial";
import { type Catalogo, type Detalhe, type Peca, aplicaAno, carregarDetalhe, faixaAnos, money } from "@/lib/catalogo-site";
import { type Veiculo, servePara } from "@/lib/garagem";
import { disponibilidadeDaPeca, fotoDaPeca, precoDaPeca, tituloDaPeca } from "./catalogo-loja";
import { unidadeLegivel } from "@/lib/unidades";
import CalculoFrete from "./calculo-frete";

export function linkDaPeca(peca: Peca) {
  return `${location.origin}/?peca=${peca.id}`;
}

export default function PecaDetalhe({ peca, catalogo, live, veiculo, onAdicionar, onWhatsApp, onEscolherVeiculo }: {
  peca: Peca; catalogo: Catalogo; live: Map<string, Product>; veiculo: Veiculo | null;
  onAdicionar: (peca: Peca) => void; onWhatsApp: (peca: Peca) => string; onEscolherVeiculo: () => void;
}) {
  const [detalhe, setDetalhe] = useState<Detalhe | null | undefined>(undefined);
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    let ativo = true;
    setDetalhe(undefined);
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
          {detalhe === undefined ? "Carregando informações da peça…" : detalhe?.d.length ? detalhe.d.join(" · ") : "Descrição conforme o cadastro da loja."}
        </DialogDescription>
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
          <p className="nl-detail-subtitulo"><CarFront size={17} /> {aplicacoes.length ? `Aplicação · ${aplicacoes.length} ${aplicacoes.length === 1 ? "veículo" : "veículos"}` : "Aplicação"}
            {!veiculo && <button type="button" onClick={onEscolherVeiculo}>Conferir no meu carro</button>}</p>
          {aplicacoes.length ? (
            <table>
              <thead><tr><th>Veículo</th><th>Versão / motor</th><th>Anos</th></tr></thead>
              <tbody>
                {ordenadas.slice(0, 60).map((a, i) => {
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
          {aplicacoes.length > 60 && <p className="subtle">E mais {aplicacoes.length - 60} veículos. Informe o seu no pedido.</p>}
        </div>
        <div className="compatibility-note">
          <CarFront size={21} />
          <span><b>A loja confere antes de aprovar</b>Com modelo, ano e motor informados no pedido, a equipe confirma a aplicação antes de separar a peça.</span>
        </div>
      </div>
    </>
  );
}
