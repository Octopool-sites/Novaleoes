import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight } from "lucide-react";
import type { Product } from "@/lib/catalog";
import { productTitles } from "./storefront-editorial";
import "./storefront-editorial-variant.css";

const stories = [
  {
    id: "suspensao",
    productId: "amortecedor",
    number: "01",
    category: "Suspensão",
    title: "Controle.",
    subtitle: "Para sentir o caminho.\nCom mais conforto.",
    description: "A suspensão trabalha a cada curva, a cada desnível. O amortecedor ajuda a controlar os movimentos do carro.",
    guidance: "Barulhos ou mudanças na estabilidade? Procure uma avaliação antes de escolher a peça.",
    action: "Explorar suspensão",
  },
  {
    id: "filtros",
    productId: "filtro-ar",
    number: "02",
    category: "Filtros",
    title: "Respiração.",
    subtitle: "Um cuidado pequeno.\nUm papel importante.",
    description: "O filtro de ar retém impurezas antes que cheguem ao motor. A manutenção começa também no que você não vê.",
    guidance: "O ambiente e o uso contam. Consulte no manual a orientação de inspeção e troca.",
    action: "Explorar filtros",
  },
  {
    id: "motor",
    productId: "correia",
    number: "03",
    category: "Motor",
    title: "Sincronia.",
    subtitle: "Cada movimento.\nNo tempo certo.",
    description: "A correia dentada mantém componentes do motor em sincronia. Planejar a manutenção faz parte do cuidado.",
    guidance: "Respeite o intervalo indicado para o seu veículo e confirme a aplicação antes da troca.",
    action: "Explorar peças de motor",
  },
] as const;

function StoryImage({ name, product }: { name: string; product: Product | undefined }) {
  const [productPhotoFailed, setProductPhotoFailed] = useState(false);
  const showProduct = name === "filtros" && product?.image && !productPhotoFailed;
  return (
    <div className={`nl-v2-artboard${showProduct ? " nl-v2-artboard-product" : ""}`}>
      {!showProduct && <img
        className="nl-v2-scene"
        src={name === "filtros" ? "/assets/car/nova-leoes-assembled.webp" : "/assets/car/nova-leoes-exploded.webp"}
        alt=""
        width={2688}
        height={1520}
        loading="lazy"
        decoding="async"
      />}
      {showProduct && <div className="nl-v2-filter-study">
        <span>O CUIDADO ESTÁ NOS DETALHES</span>
        <img src={product.image} alt="" loading="lazy" decoding="async" onError={() => setProductPhotoFailed(true)} />
        <small>Foto da peça do catálogo</small>
      </div>}
    </div>
  );
}

function CatalogReference({ product }: { product: Product }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  return <div className="nl-v2-catalog-reference">
    {product.image && !photoFailed && <img src={product.image} alt="" loading="lazy" decoding="async" onError={() => setPhotoFailed(true)} />}
    <div><span>NO CATÁLOGO NOVA LEÕES</span><strong>{productTitles[product.id] || product.name}</strong><small>{product.brand} · Cód. {product.sku}</small></div>
  </div>;
}

function defaultVersionHref() {
  const url = new URL(window.location.href);
  url.searchParams.delete("visual");
  return `${url.pathname}${url.search}#catalogo`;
}

export default function StorefrontEditorialVariant({ products, onExplore }: {
  products: Product[];
  onExplore: (category: string) => void;
}) {
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.location.hash !== "#cuidados") return;
    const frame = requestAnimationFrame(() => {
      section.current?.scrollIntoView({ behavior: "instant", block: "start" });
      section.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <section ref={section} className="nl-v2-stories" id="cuidados" tabIndex={-1} aria-labelledby="nl-v2-stories-title">
      <div className="nl-v2-comparison" aria-label="Comparação de versões da vitrine">
        <span><i aria-hidden="true" /> VERSÃO B · EDITORIAL</span>
        <a href={defaultVersionHref()}>Ver versão A <ArrowUpRight size={14} aria-hidden="true" /></a>
      </div>
      <div className="nl-v2-stories-heading">
        <div>
          <p className="nl-v2-eyebrow">POR TRÁS DE CADA PEÇA, UM CUIDADO</p>
          <h2 id="nl-v2-stories-title">O que move<br /><em>o seu caminho?</em></h2>
        </div>
        <div className="nl-v2-stories-intro">
          <p>Mais do que encontrar uma peça, entender o que ela faz pelo seu carro. Comece pelo cuidado que você procura.</p>
          <a href="#catalogo">Já sabe o que precisa? Vá ao catálogo <ArrowDown size={17} aria-hidden="true" /></a>
        </div>
      </div>
      <div className="nl-v2-story-grid">
        {stories.map(story => {
          const available = products.some(product => product.published && product.category === story.category);
          const featured = products.find(product => product.published && product.id === story.productId && product.category === story.category);
          return (
            <article className={`nl-v2-story nl-v2-story-${story.id}`} key={story.id}>
              <div className="nl-v2-story-media">
                <StoryImage name={story.id} product={featured} />
                <span className="nl-v2-story-index">{story.number} / {story.category}</span>
                <h3>{story.title}</h3>
                <small className="nl-v2-story-illustration">Cena ilustrativa</small>
              </div>
              <div className="nl-v2-story-copy">
                <h4>{story.subtitle}</h4>
                <p>{story.description}</p>
                {featured && <CatalogReference key={featured.image} product={featured} />}
                <div className="nl-v2-story-guidance"><span>VALE CONFERIR</span><p>{story.guidance}</p></div>
                <button type="button" onClick={() => onExplore(available ? story.category : "Todas as peças")}>
                  <span>{available ? story.action : "Explorar catálogo"}</span><ArrowRight size={19} aria-hidden="true" />
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <div className="nl-v2-stories-bottom">
        <p>Carro ilustrativo, sem indicação de compatibilidade. Fotos das peças conforme o catálogo.</p>
        <span>Escolha pelo cuidado. Confirme pela aplicação.</span>
      </div>
    </section>
  );
}
