import { ArrowUpRight, Package, Plus } from "lucide-react";
import { money, type Product } from "@/lib/catalog";
import { productBenefits, productTitles } from "./storefront-editorial";

export default function StoreProductCard({ product, onSelect, onAdd, unavailable }: {
  product: Product;
  onSelect: (product: Product) => void;
  onAdd: (product: Product) => void;
  unavailable: boolean;
}) {
  const title = productTitles[product.id] || product.name;
  return <article className="product-card nl-product-card">
    <button className="product-photo photo-button" onClick={() => onSelect(product)} aria-label={`Ver detalhes de ${title}`}>
      {product.image ? <img src={product.image} alt={product.name} loading="lazy" decoding="async" /> : <div className="nl-photo-placeholder"><Package size={44} strokeWidth={1} /><small>Imagem em breve</small></div>}
      <span>{product.category}</span>
      <i className="nl-photo-open" aria-hidden="true"><ArrowUpRight size={18} /></i>
    </button>
    <div className="product-info">
      <p className="product-brand">{product.brand}</p>
      <h3><button onClick={() => onSelect(product)}>{title}</button></h3>
      <p className="application">{productBenefits[product.id] || "Confira a aplicação para seu veículo."}</p>
      <div className="product-bottom">
        <div><strong>{money(product.priceCents)}</strong><small>{product.stock > 0 ? "Aplicação a confirmar" : "Indisponível no momento"}</small></div>
        <button disabled={product.stock <= 0 || unavailable} onClick={() => onAdd(product)} aria-label={`Adicionar ${title} ao carrinho`} className="add-button"><Plus size={17} /><span>Adicionar</span></button>
      </div>
      <span className="nl-product-code">Cód. {product.sku}</span>
    </div>
  </article>;
}
