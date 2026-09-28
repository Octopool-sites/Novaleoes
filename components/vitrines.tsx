import { ArrowRight, CarFront, Package } from "lucide-react";
import { type Catalogo, urlFoto } from "@/lib/catalogo-site";
import type { Veiculo } from "@/lib/garagem";

// Faixa "Qual é o seu carro?" logo depois da abertura: o atalho mais usado em loja de autopeças.
export function VitrineVeiculo({ catalogo, veiculo, onEscolher, onMontadora, onVerPecas }: {
  catalogo: Catalogo | null; veiculo: Veiculo | null; onEscolher: () => void; onMontadora: (idx: number) => void; onVerPecas: () => void;
}) {
  const montadoras = catalogo
    ? catalogo.meta.montadoras.map((nome, idx) => ({ nome, idx, n: catalogo.meta.modelos.filter((m) => m[0] === idx).reduce((s, m) => s + m[2], 0) }))
      .sort((a, b) => b.n - a.n).slice(0, 12)
    : [];
  return (
    <section className="nl-vitrine-veiculo" id="veiculos" aria-labelledby="nl-veiculo-titulo">
      <div className="wrap">
        <div className="nl-vv-cabeca">
          <div>
            <p className="nl-kicker"><span /> COMPRE PELO SEU CARRO</p>
            <h2 id="nl-veiculo-titulo">{veiculo ? <>Peças para o seu<br /><em>{veiculo.rotulo}.</em></> : <>Qual é o<br /><em>seu carro?</em></>}</h2>
          </div>
          <div className="nl-vv-acoes">
            <button type="button" className="nl-button" onClick={onEscolher}><CarFront size={18} /> {veiculo ? "Trocar de carro" : "Selecionar meu carro"}</button>
            {veiculo && <button type="button" className="nl-vv-link" onClick={onVerPecas}>Ver peças que servem <ArrowRight size={16} /></button>}
          </div>
        </div>
        <div className="nl-vv-montadoras" role="list">
          {montadoras.map((m) => (
            <button type="button" role="listitem" key={m.idx} onClick={() => onMontadora(m.idx)}>
              <b>{m.nome}</b><small>{m.n.toLocaleString("pt-BR")} aplicações</small>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export function VitrineDepartamentos({ catalogo, onDepartamento }: { catalogo: Catalogo | null; onDepartamento: (id: string) => void }) {
  if (!catalogo) return null;
  const deps = catalogo.meta.departamentos.filter((d) => d.n > 0 && d.id !== "outras");
  return (
    <section className="nl-vitrine-deps" aria-labelledby="nl-deps-titulo">
      <div className="nl-deps-cabeca">
        <p className="nl-kicker"><span /> DEPARTAMENTOS</p>
        <h2 id="nl-deps-titulo">Encontre pela <em>parte do carro.</em></h2>
      </div>
      <div className="nl-deps-grade">
        {deps.map((d) => (
          <button type="button" key={d.id} onClick={() => onDepartamento(d.id)}>
            <span className="nl-deps-foto">{d.capa ? <img src={urlFoto(catalogo.meta, d.capa)} alt="" loading="lazy" decoding="async" /> : <Package size={34} strokeWidth={1} />}</span>
            <b>{d.nome}</b>
            <small>{d.n.toLocaleString("pt-BR")} itens</small>
          </button>
        ))}
      </div>
    </section>
  );
}
