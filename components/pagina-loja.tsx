import { useEffect } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { type Pagina, PAGINAS, hrefPagina } from "@/lib/paginas";
import { BASE_URL } from "@/lib/base";
import { SecaoContato, SecaoEntrega, SecaoPoliticas, SecaoServicos, SecaoSobre } from "./storefront-institucional";
import { SecaoAplicacao, SecaoComoComprar, SecaoDuvidas } from "./storefront-editorial";
import "./pagina-loja.css";

export default function PaginaLoja({ pagina, totalPecas, onPagina, onCatalogo }: {
  pagina: Pagina; totalPecas: number; onPagina: (p: Pagina) => void; onCatalogo: () => void;
}) {
  const info = PAGINAS.find((p) => p.id === pagina)!;
  useEffect(() => {
    const anterior = document.title;
    document.title = `${info.titulo} | Nova Leões Autopeças`;
    return () => { document.title = anterior; };
  }, [info.titulo]);

  const conteudo = {
    "quem-somos": <div className="nl-institucional"><SecaoSobre totalPecas={totalPecas} /><SecaoServicos /></div>,
    "onde-estamos": <div className="nl-institucional"><SecaoContato /></div>,
    "como-comprar": <div className="nl-editorial"><SecaoComoComprar onCatalogo={onCatalogo} /><SecaoAplicacao /></div>,
    entrega: <div className="nl-institucional"><SecaoEntrega /></div>,
    "trocas-e-garantia": <div className="nl-institucional"><SecaoPoliticas /></div>,
    duvidas: <div className="nl-editorial"><SecaoDuvidas /></div>,
  }[pagina];

  return (
    <div className="nl-pagina">
      <nav className="nl-pagina-trilha" aria-label="Você está em">
        <a href={BASE_URL} onClick={(e) => { e.preventDefault(); onCatalogo(); }}><ArrowLeft size={15} /> Voltar às peças</a>
        <span>A loja / <b>{info.titulo}</b></span>
      </nav>
      {conteudo}
      <nav className="nl-pagina-outras" aria-label="Mais sobre a loja">
        <p className="nl-kicker"><span /> MAIS SOBRE A LOJA</p>
        <div>
          {PAGINAS.filter((p) => p.id !== pagina).map((p) => (
            <a key={p.id} href={hrefPagina(p.id)} onClick={(e) => { e.preventDefault(); onPagina(p.id); }}>
              <b>{p.titulo}</b><small>{p.resumo}</small><ArrowRight size={16} />
            </a>
          ))}
        </div>
      </nav>
    </div>
  );
}
