import { useEffect, useState } from "react";
import { CarFront, MessageCircle, Package, ShoppingBag } from "lucide-react";
import { DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { Product } from "@/lib/catalog";
import { productBenefits } from "./storefront-editorial";
import { type Catalogo, type Detalhe, type Peca, carregarDetalhe, faixaAnos, money } from "@/lib/catalogo-site";
import { disponibilidadeDaPeca, fotoDaPeca, precoDaPeca, tituloDaPeca } from "./catalogo-loja";
import { unidadeLegivel } from "@/lib/unidades";

export default function PecaDetalhe({ peca, catalogo, live, onAdicionar, onWhatsApp }: {
  peca: Peca; catalogo: Catalogo; live: Map<string, Product>; onAdicionar: (peca: Peca) => void; onWhatsApp: (peca: Peca) => string;
}) {
  const [detalhe, setDetalhe] = useState<Detalhe | null | undefined>(undefined);
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
  return (
    <>
      <div className="detail-photo"><span className="nl-detail-category">{peca.departamento.nome} · {peca.grupo}</span>
        {foto ? <img src={foto} alt={titulo} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : <Package size={64} />}
      </div>
      <div className="nl-detail-content">
        <p className="eyebrow">{peca.marca || "Marca a confirmar"}{unidade ? ` · ${unidade}` : ""}</p>
        <DialogTitle className="detail-title">{titulo}</DialogTitle>
        <DialogDescription className="detail-description">
          {beneficio ? `${beneficio} ` : ""}
          {detalhe === undefined ? "Carregando informações da peça…" : detalhe?.d.length ? detalhe.d.join(" · ") : "Descrição conforme o cadastro da loja."}
        </DialogDescription>
        {detalhe?.h.length ? <ul className="nl-detail-destaques">{detalhe.h.map((h) => <li key={h}>{h}</li>)}</ul> : null}
        <div className="nl-detail-aplicacoes">
          <p className="nl-detail-subtitulo"><CarFront size={17} /> {aplicacoes.length ? `Aplicação (${aplicacoes.length} ${aplicacoes.length === 1 ? "veículo" : "veículos"})` : "Aplicação"}</p>
          {aplicacoes.length ? (
            <table>
              <thead><tr><th>Veículo</th><th>Versão / motor</th><th>Anos</th></tr></thead>
              <tbody>
                {aplicacoes.slice(0, 40).map((a, i) => (
                  <tr key={i}>
                    <td>{meta.montadoras[meta.modelos[a[0]][0]]} {meta.modelos[a[0]][1]}</td>
                    <td>{[a[1], a[2]].filter(Boolean).join(" · ") || "—"}{a[5] ? <small> {a[5]}</small> : null}</td>
                    <td>{faixaAnos(a[3], a[4]) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="subtle">{detalhe === undefined ? "Conferindo os veículos…" : "Aplicação informada pela descrição ou conferida pela equipe no atendimento."}</p>}
          {aplicacoes.length > 40 && <p className="subtle">E mais {aplicacoes.length - 40} veículos. Informe o seu no pedido.</p>}
        </div>
        <div className="compatibility-note">
          <CarFront size={21} />
          <span><b>Serve no seu carro?</b>Informe modelo, ano e motor no pedido. A equipe confere a aplicação antes de aprovar.</span>
        </div>
        <strong className="detail-price">{preco > 0 ? money(preco) : "Preço sob consulta"}</strong>
        <p className={`subtle ${disp.classe}`}>{disp.texto}{preco > 0 ? " · preço sujeito à conferência na aprovação" : ""}</p>
        <div className="nl-detail-acoes">
          <button type="button" className="primary-button wide" disabled={indisponivel} onClick={() => onAdicionar(peca)}>
            {indisponivel ? "Indisponível" : "Adicionar ao pedido"} <ShoppingBag size={18} />
          </button>
          <a className="nl-whats-button" href={onWhatsApp(peca)} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={18} /> Perguntar no WhatsApp
          </a>
        </div>
      </div>
    </>
  );
}
