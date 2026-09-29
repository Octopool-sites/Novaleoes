import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { CircleAlert, LoaderCircle, MessageCircle, RectangleHorizontal, Search } from "lucide-react";
import type { Catalogo } from "@/lib/catalogo-site";
import { type VeiculoSalvo, rotuloVeiculo } from "@/lib/garagem";
import { whatsappUrl } from "@/lib/loja";
import { PLACA_RE, type CarroSite, type RespostaPlaca, carrosDaPlaca, descreverVeiculo, limparPlaca, mascararPlaca, rotuloCombustivel } from "@/lib/placa-site";
import "./busca-placa.css";

// A busca só aparece quando o servidor diz que está ativa (GET /api/public/placa); uma pergunta por visita.
let status: Promise<boolean> | null = null;
export function placaAtivaNoSite() {
  status ??= fetch("/api/public/placa", { headers: { Accept: "application/json" } })
    .then(async (r) => r.ok && ((await r.json()) as { ativa?: unknown } | null)?.ativa === true)
    .catch(() => false);
  return status;
}

export function usePlacaAtiva() {
  const [ativa, setAtiva] = useState(false);
  useEffect(() => {
    let vivo = true;
    placaAtivaNoSite().then((v) => { if (vivo) setAtiva(v); });
    return () => { vivo = false; };
  }, []);
  return ativa;
}

const TEXTO = {
  invalida: "Confira a placa: use o formato ABC1234 ou ABC1D23.",
  limite: "Muitas consultas em pouco tempo. Aguarde um minuto ou escolha o carro manualmente.",
  indisponivel: "A busca por placa está indisponível agora. Escolha o carro manualmente.",
};

type Estado =
  | { tipo: "inicial" }
  | { tipo: "consultando" }
  | { tipo: "achou"; simulado: boolean; principal: CarroSite; alternativas: CarroSite[]; ano: number; combustivel: string }
  | { tipo: "fora"; simulado: boolean; descricao: string }
  | { tipo: "nao-achou"; simulado: boolean }
  | { tipo: "manual" }
  | { tipo: "erro"; mensagem: string };

// Ano modelo da placa; fora do razoável vira 0 ("todas as peças do modelo").
function anoValido(ano: number | null) {
  const a = Number(ano) || 0;
  return a >= 1950 && a <= new Date().getFullYear() + 1 ? a : 0;
}

function interpretar(catalogo: Catalogo, resposta: RespostaPlaca): Estado {
  if (!resposta || typeof resposta !== "object" || typeof resposta.encontrado !== "boolean") return { tipo: "erro", mensagem: TEXTO.indisponivel };
  if (!resposta.encontrado) return { tipo: "nao-achou", simulado: !!resposta.simulado };
  const { principal, alternativas } = carrosDaPlaca(catalogo, resposta);
  const simulado = !!resposta.simulado;
  if (!principal) return { tipo: "fora", simulado, descricao: descreverVeiculo(resposta.veiculo) };
  return { tipo: "achou", simulado, principal, alternativas, ano: anoValido(resposta.veiculo.ano), combustivel: rotuloCombustivel(resposta.veiculo.combustivel) };
}

// Campo "placa" do seletor "Meu carro" e da barra do catálogo. A placa vive só no estado deste componente:
// não vai para URL, localStorage, log nem mensagem do WhatsApp, e é apagada ao usar o carro.
export default function BuscaPlaca({ catalogo, onUsar, manual, autoFocus = false }: {
  catalogo: Catalogo; onUsar: (v: VeiculoSalvo) => void;
  /** Onde fica a escolha manual, para os avisos: "abaixo", "na barra acima". */
  manual: string; autoFocus?: boolean;
}) {
  const id = useId();
  const [placa, setPlaca] = useState("");
  const [estado, setEstado] = useState<Estado>({ tipo: "inicial" });
  const controle = useRef<AbortController | null>(null);
  useEffect(() => () => controle.current?.abort(), []);

  const valida = PLACA_RE.test(placa);
  const consultando = estado.tipo === "consultando";
  const { meta } = catalogo;

  function digitar(valor: string) {
    const nova = limparPlaca(valor);
    if (nova === placa) return;
    controle.current?.abort();
    setPlaca(nova);
    if (estado.tipo !== "inicial") setEstado({ tipo: "inicial" });
  }

  async function consultar(e: FormEvent) {
    e.preventDefault();
    if (!valida || consultando) return;
    controle.current?.abort();
    const c = new AbortController();
    controle.current = c;
    setEstado({ tipo: "consultando" });
    try {
      const r = await fetch("/api/public/placa", {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ placa }), signal: c.signal, cache: "no-store",
      });
      if (c.signal.aborted) return;
      if (r.status === 429) return setEstado({ tipo: "erro", mensagem: TEXTO.limite });
      if (r.status === 400) return setEstado({ tipo: "erro", mensagem: TEXTO.invalida });
      if (!r.ok) return setEstado({ tipo: "erro", mensagem: TEXTO.indisponivel });
      const resposta = (await r.json()) as RespostaPlaca;
      if (!c.signal.aborted) setEstado(interpretar(catalogo, resposta));
    } catch {
      if (!c.signal.aborted) setEstado({ tipo: "erro", mensagem: TEXTO.indisponivel });
    }
  }

  function usar(carro: CarroSite, ano: number) {
    onUsar({ montadora: meta.montadoras[carro.montadora], modelo: meta.modelos[carro.modelo][1], ano });
    setPlaca("");
    setEstado({ tipo: "inicial" });
  }

  function naoEOMeu() {
    setPlaca("");
    setEstado({ tipo: "manual" });
  }

  const selo = (simulado: boolean) => simulado && <span className="nl-placa-selo" title="Resposta de teste: nenhuma consulta real foi feita">Simulação</span>;

  return (
    <form className="nl-placa" onSubmit={consultar} role="search" aria-label="Buscar o carro pela placa">
      <label className="nl-placa-rotulo" htmlFor={`${id}-placa`}>Buscar pela placa</label>
      <div className="nl-placa-linha">
        <span className="nl-placa-campo">
          <RectangleHorizontal size={18} aria-hidden="true" />
          <input
            id={`${id}-placa`} value={mascararPlaca(placa)} onChange={(e) => digitar(e.target.value)} autoFocus={autoFocus}
            inputMode="text" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
            maxLength={8} enterKeyHint="search" placeholder="ABC1D23" aria-describedby={`${id}-dica`}
            aria-invalid={placa.length === 7 && !valida ? true : undefined}
          />
        </span>
        <button type="submit" disabled={!valida || consultando}>
          {consultando ? <LoaderCircle size={16} className="nl-placa-girando" aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
          <span>{consultando ? "Consultando…" : "Buscar"}</span>
        </button>
      </div>
      <p className="nl-placa-dica" id={`${id}-dica`}>Usamos a placa só para identificar o modelo; ela não fica salva.</p>

      <div className="nl-placa-resultado" aria-live="polite">
        {estado.tipo === "inicial" && placa.length === 7 && !valida && <p className="nl-placa-erro"><CircleAlert size={16} aria-hidden="true" /> {TEXTO.invalida}</p>}

        {estado.tipo === "consultando" && <p className="nl-placa-status">Consultando…</p>}

        {estado.tipo === "achou" && (
          <div className="nl-placa-achou">
            <p>Encontramos: <b>{rotuloVeiculo(catalogo, estado.principal.modelo, estado.ano)}{estado.combustivel ? ` · ${estado.combustivel}` : ""}</b>. É o seu carro?{selo(estado.simulado)}</p>
            <div className="nl-placa-acoes">
              <button type="button" className="nl-placa-usar" onClick={() => usar(estado.principal, estado.ano)}>Usar este carro</button>
              <button type="button" className="nl-placa-nao" onClick={naoEOMeu}>Não é o meu carro</button>
            </div>
            {estado.alternativas.length > 0 && (
              <div className="nl-placa-alternativas">
                <small>Pode ser também:</small>
                {estado.alternativas.map((a) => (
                  <button type="button" key={a.modelo} onClick={() => usar(a, estado.ano)}>{rotuloVeiculo(catalogo, a.modelo, estado.ano)}</button>
                ))}
              </div>
            )}
          </div>
        )}

        {estado.tipo === "fora" && (
          <div className="nl-placa-fora">
            <p>Identificamos um <b>{estado.descricao}</b>, mas ainda não temos peças cadastradas para ele no site. Fale com a loja pelo WhatsApp.{selo(estado.simulado)}</p>
            <div className="nl-placa-acoes">
              <a className="nl-placa-whats" href={whatsappUrl(`Olá! Não achei no site peças para o meu carro (${estado.descricao}). Podem me ajudar?`)} target="_blank" rel="noopener noreferrer">
                <MessageCircle size={16} aria-hidden="true" /> Falar com a loja
              </a>
            </div>
          </div>
        )}

        {estado.tipo === "nao-achou" && <p>Não encontramos essa placa. Escolha a montadora, o modelo e o ano {manual}.{selo(estado.simulado)}</p>}
        {estado.tipo === "manual" && <p>Tudo bem. Escolha a montadora, o modelo e o ano {manual}.</p>}
        {estado.tipo === "erro" && <p className="nl-placa-erro"><CircleAlert size={16} aria-hidden="true" /> {estado.mensagem}</p>}
      </div>
    </form>
  );
}
