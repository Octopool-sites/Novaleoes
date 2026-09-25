import { useEffect, useState } from "react";
import { LoaderCircle, MapPin, Store, Truck, MessageCircle } from "lucide-react";
import { CHAVE_CEP, type OpcaoFrete, type ResultadoFrete, calcularFrete, formatarCep, limparCep } from "@/lib/frete";
import { money } from "@/lib/catalogo-site";

const icones = { retirada: Store, entrega: Truck, combinar: MessageCircle } as const;

export function lerCepSalvo() {
  try { return localStorage.getItem(CHAVE_CEP) || ""; } catch { return ""; }
}

export default function CalculoFrete({ selecionada, onResultado, onSelecionar, titulo = "Calcule o frete" }: {
  selecionada?: OpcaoFrete["tipo"] | null;
  onResultado?: (r: ResultadoFrete | null) => void;
  onSelecionar?: (o: OpcaoFrete) => void;
  titulo?: string;
}) {
  const [cep, setCep] = useState(() => formatarCep(lerCepSalvo()));
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<ResultadoFrete | null>(null);

  async function calcular(valor = cep) {
    if (limparCep(valor).length !== 8) { setErro("Digite os 8 números do CEP."); return; }
    setCarregando(true); setErro("");
    try {
      const r = await calcularFrete(valor);
      setResultado(r); onResultado?.(r);
      try { localStorage.setItem(CHAVE_CEP, limparCep(valor)); } catch {}
      if (onSelecionar && !selecionada) onSelecionar(r.opcoes[0]);
    } catch (e) {
      setResultado(null); onResultado?.(null);
      setErro(e instanceof Error ? e.message : "Não foi possível calcular agora.");
    } finally { setCarregando(false); }
  }
  // CEP já salvo de uma visita anterior: calcula sozinho.
  useEffect(() => { if (limparCep(cep).length === 8) void calcular(cep); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div className="nl-frete">
      <p className="nl-frete-titulo"><Truck size={16} /> {titulo}</p>
      {/* div, não form: este bloco também aparece dentro do formulário de checkout */}
      <div className="nl-frete-form" role="group" aria-label="Calcular frete">
        <input inputMode="numeric" autoComplete="postal-code" aria-label="CEP de entrega" placeholder="00000-000" maxLength={9} value={cep}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void calcular(); } }}
          onChange={(e) => { const v = formatarCep(e.target.value); setCep(v); if (limparCep(v).length === 8) void calcular(v); }} />
        <button type="button" disabled={carregando} onClick={() => void calcular()}>{carregando ? <LoaderCircle className="animate-spin" size={16} /> : "Calcular"}</button>
      </div>
      <a className="nl-frete-nao-sei" href="https://buscacepinter.correios.com.br/app/endereco/index.php" target="_blank" rel="noopener noreferrer">Não sei meu CEP</a>
      {erro && <p className="nl-frete-erro" role="alert">{erro}</p>}
      {resultado && (
        <div className="nl-frete-resultado" aria-live="polite">
          <p className="nl-frete-endereco"><MapPin size={14} /> {[resultado.endereco.logradouro, resultado.endereco.bairro, `${resultado.endereco.cidade}/${resultado.endereco.uf}`].filter(Boolean).join(" · ")}
            {resultado.distanciaKm !== null && <span> · cerca de {resultado.distanciaKm.toFixed(1).replace(".", ",")} km da loja</span>}</p>
          <ul>
            {resultado.opcoes.map((o) => {
              const Icone = icones[o.tipo];
              const conteudo = <><Icone size={17} /><span><b>{o.titulo}</b><small>{o.prazo}</small></span><strong>{o.tipo === "combinar" ? "A combinar" : o.valorCents ? money(o.valorCents) : "Grátis"}</strong></>;
              return (
                <li key={o.tipo}>
                  {onSelecionar ? (
                    <label className={selecionada === o.tipo ? "ativo" : ""}><input type="radio" name="nl-frete-opcao" checked={selecionada === o.tipo} onChange={() => onSelecionar(o)} />{conteudo}</label>
                  ) : <div>{conteudo}</div>}
                </li>
              );
            })}
          </ul>
          <p className="nl-frete-nota">Valor estimado pela distância. A loja confirma o frete junto com o pedido.</p>
        </div>
      )}
    </div>
  );
}
