import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CarFront, Check, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { type Catalogo, anosDisponiveis, normalizeSearch } from "@/lib/catalogo-site";
import type { Veiculo, VeiculoSalvo } from "@/lib/garagem";

type Passo = "montadora" | "modelo" | "ano";

export default function SeletorVeiculo({ catalogo, aberto, inicial, montadoraInicial, onFechar, onSalvar }: {
  catalogo: Catalogo; aberto: boolean; inicial: Veiculo | null; montadoraInicial: number;
  onFechar: () => void; onSalvar: (v: VeiculoSalvo | null) => void;
}) {
  const { meta } = catalogo;
  const [passo, setPasso] = useState<Passo>("montadora");
  const [montadora, setMontadora] = useState(-1);
  const [modelo, setModelo] = useState(-1);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (!aberto) return;
    setBusca("");
    if (montadoraInicial >= 0) { setMontadora(montadoraInicial); setModelo(-1); setPasso("modelo"); }
    else if (inicial) { setMontadora(inicial.montadora); setModelo(inicial.modelo); setPasso("montadora"); }
    else { setMontadora(-1); setModelo(-1); setPasso("montadora"); }
  }, [aberto, montadoraInicial, inicial]);

  const montadoras = useMemo(() => {
    const pecas = meta.montadoras.map(() => 0);
    meta.modelos.forEach(([m, , n]) => { pecas[m] += n; });
    return meta.montadoras.map((nome, idx) => ({ idx, nome, n: pecas[idx], modelos: meta.modelos.filter((m) => m[0] === idx).length }))
      .filter((m) => m.n > 0).sort((a, b) => b.n - a.n);
  }, [meta]);
  const modelos = useMemo(() => {
    const termo = normalizeSearch(busca);
    return meta.modelos.map(([m, nome, n], idx) => ({ idx, m, nome, n }))
      .filter((x) => x.m === montadora && (!termo || normalizeSearch(x.nome).includes(termo)))
      .sort((a, b) => b.n - a.n);
  }, [meta, montadora, busca]);
  const anos = useMemo(() => (modelo >= 0 ? anosDisponiveis(catalogo, modelo, -1) : []), [catalogo, modelo]);

  const salvar = (ano: number) => {
    onSalvar({ montadora: meta.montadoras[montadora], modelo: meta.modelos[modelo][1], ano });
    onFechar();
  };
  const titulo = passo === "montadora" ? "Qual é o seu carro?" : passo === "modelo" ? `Modelo ${meta.montadoras[montadora]}` : `Ano do ${meta.modelos[modelo][1]}`;

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="nl-seletor sm:max-w-[760px]">
        <div className="nl-seletor-topo">
          {passo !== "montadora" && (
            <button type="button" className="nl-seletor-voltar" onClick={() => setPasso(passo === "ano" ? "modelo" : "montadora")} aria-label="Voltar"><ArrowLeft size={18} /></button>
          )}
          <div>
            <p className="nl-seletor-passos"><span className={passo === "montadora" ? "ativo" : ""}>1 Montadora</span><span className={passo === "modelo" ? "ativo" : ""}>2 Modelo</span><span className={passo === "ano" ? "ativo" : ""}>3 Ano</span></p>
            <DialogTitle className="nl-seletor-titulo">{titulo}</DialogTitle>
            <DialogDescription className="nl-seletor-desc">Com o carro escolhido, o catálogo mostra só as peças com aplicação cadastrada para ele.</DialogDescription>
          </div>
        </div>

        {passo === "montadora" && (
          <div className="nl-seletor-grade">
            {montadoras.map((m) => (
              <button type="button" key={m.idx} className={montadora === m.idx ? "ativo" : ""} onClick={() => { setMontadora(m.idx); setModelo(-1); setBusca(""); setPasso("modelo"); }}>
                <b>{m.nome}</b><small>{m.modelos} modelos · {m.n.toLocaleString("pt-BR")} peças</small>
              </button>
            ))}
          </div>
        )}

        {passo === "modelo" && (
          <>
            <label className="nl-seletor-busca"><Search size={17} /><input autoFocus placeholder={`Buscar modelo ${meta.montadoras[montadora]}`} value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
            <div className="nl-seletor-grade nl-seletor-modelos">
              {modelos.map((m) => (
                <button type="button" key={m.idx} className={modelo === m.idx ? "ativo" : ""} onClick={() => { setModelo(m.idx); setPasso("ano"); }}>
                  <b>{m.nome}</b><small>{m.n.toLocaleString("pt-BR")} peças</small>
                </button>
              ))}
              {!modelos.length && <p className="nl-seletor-vazio">Nenhum modelo com esse nome. Confira a grafia ou fale com a loja.</p>}
            </div>
          </>
        )}

        {passo === "ano" && (
          <>
            <div className="nl-seletor-grade nl-seletor-anos">
              {anos.map((a) => (
                <button type="button" key={a} className={inicial?.modelo === modelo && inicial.ano === a ? "ativo" : ""} onClick={() => salvar(a)}>{a}</button>
              ))}
            </div>
            <button type="button" className="nl-seletor-sem-ano" onClick={() => salvar(0)}><CarFront size={16} /> Não sei o ano: mostrar todas as peças do {meta.modelos[modelo][1]}</button>
          </>
        )}

        {inicial && (
          <div className="nl-seletor-rodape">
            <span><Check size={15} /> Carro salvo: <b>{inicial.rotulo}</b></span>
            <button type="button" onClick={() => { onSalvar(null); onFechar(); }}>Remover carro</button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
