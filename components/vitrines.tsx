import { Package } from "lucide-react";
import { type Catalogo, urlFoto } from "@/lib/catalogo-site";

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
