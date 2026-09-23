"use client";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Search,
  ShoppingBag,
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  PackageCheck,
  CarFront,
  Plus,
  Minus,
  Trash2,
  Check,
  LoaderCircle,
  Package,
  AlertCircle,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  money,
  type Product,
} from "@/lib/catalog";
import { normalizeSearch, type Order } from "@/lib/commerce-contracts";
import ScrollHero from "./scroll-hero";
import StoreProductCard from "./store-product-card";
import StorefrontEditorial, { productTitles, productBenefits } from "./storefront-editorial";
import "./storefront-redesign.css";
import "./storefront-polish.css";
const StorefrontEditorialVariant = lazy(() => import("./storefront-editorial-variant"));
type Cart = Record<string, number>;
export default function Storefront() {
  const [editorialVariant] = useState(() => new URLSearchParams(window.location.search).get("visual") === "editorial");
  const storefrontHref = editorialVariant ? "/?visual=editorial" : "/";
  const [products, setProducts] = useState<Product[]>([]),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("Todas as peças"),
    [cart, setCart] = useState<Cart>({}),
    [cartOpen, setCartOpen] = useState(false),
    [detail, setDetail] = useState<Product | null>(null),
    [step, setStep] = useState<"cart" | "checkout" | "success">("cart"),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [catalogError, setCatalogError] = useState(false),
    [ordersEnabled, setOrdersEnabled] = useState(false),
    [order, setOrder] = useState<Order | null>(null),
    [hydrated, setHydrated] = useState(false),
    [catalogLoading, setCatalogLoading] = useState(true);
  const [form, setForm] = useState({
    customerName: "",
    email: "",
    phone: "",
    vehicle: "",
    note: "",
  });
  const attempt = useRef("");
  async function refresh() {
    try {
      const r = await fetch("/api/public/catalog");
      if (!r.ok) throw Error();
      const data = (await r.json()) as { products: Product[]; ordersEnabled:boolean };
      setProducts(data.products);
      setOrdersEnabled(data.ordersEnabled===true);
      setCatalogError(false);
    } catch {
      setCatalogError(true);
      setOrdersEnabled(false);
    } finally { setCatalogLoading(false); }
  }
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("octopool-commerce-live-cart-v1") || "{}",
      );
      if (saved && typeof saved === "object" && !Array.isArray(saved))
        setCart(
          Object.fromEntries(
            Object.entries(saved)
              .filter(
                ([k, v]) =>
                  k.length < 81 &&
                  Number.isInteger(v) &&
                  Number(v) > 0 &&
                  Number(v) <= 20,
              )
              .map(([k, v]) => [k, Number(v)]),
          ),
        );
    } catch {}
    setHydrated(true);
    void refresh();
  }, []);
  useEffect(() => {
    if (hydrated)
      try {
        localStorage.setItem("octopool-commerce-live-cart-v1", JSON.stringify(cart));
      } catch {}
  }, [cart, hydrated]);
  const filtered = products.filter(
    (p) =>
      p.published &&
      (category === "Todas as peças" || p.category === category) &&
      normalizeSearch(`${p.name} ${productTitles[p.id] || ""} ${p.brand} ${p.sku}`).includes(
        normalizeSearch(query),
      ),
  );
  const lines = Object.entries(cart).map(([id, quantity]) => ({
    product: products.find((p) => p.id === id),
    id,
    quantity,
  }));
  const total = lines.reduce(
    (s, l) => s + (l.product?.priceCents || 0) * l.quantity,
    0,
  );
  const count = Object.values(cart).reduce((s, q) => s + q, 0);
  function change(id: string, quantity: number) {
    attempt.current = "";
    setError("");
    setCart((prev) => {
      const next = { ...prev };
      if (quantity <= 0) delete next[id];
      else next[id] = Math.min(20, quantity);
      return next;
    });
  }
  function add(p: Product) {
    if (p.stock <= 0) return;
    change(p.id, Math.min((cart[p.id] || 0) + 1, p.stock));
    setStep("cart");
    setDetail(null);
    setCartOpen(true);
  }
  function updateForm(key: keyof typeof form, value: string) {
    attempt.current = "";
    setForm((prev) => ({ ...prev, [key]: value }));
  }
  function exploreCategory(nextCategory: string) {
    setQuery("");
    setCategory(nextCategory);
    requestAnimationFrame(() => {
      const catalog = document.getElementById("catalogo");
      catalog?.focus({ preventScroll: true });
      catalog?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    });
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !ordersEnabled) return;
    setLoading(true);
    setError("");
    attempt.current ||= crypto.randomUUID();
    try {
      const r = await fetch("/api/public/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          idempotency: attempt.current,
          items: lines.map((l) => ({ productId: l.id, quantity: l.quantity })),
        }),
      });
      const data = (await r.json()) as {
        order: Order;
        error?: string;
        retryable?: boolean;
      };
      if (!r.ok && data.retryable) attempt.current = "";
      if (!r.ok)
        throw new Error(data.error || "Não foi possível enviar o pedido.");
      setOrder(data.order);
      setCart({});
      setStep("success");
      attempt.current = "";
      void refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Falha de conexão. Tente novamente.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    type Tool = {
      name: string;
      description: string;
      inputSchema: object;
      annotations: object;
      execute: (input: unknown) => unknown;
    };
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: Tool,
            options: { signal: AbortSignal },
          ) => unknown;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: "search_store_catalog",
            description:
              "Filtra as peças da Nova Leões na mesma busca visível da loja.",
            inputSchema: {
              type: "object",
              properties: { query: { type: "string", maxLength: 120 } },
              required: ["query"],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute(input) {
              if (
                !input ||
                typeof input !== "object" ||
                !("query" in input) ||
                typeof input.query !== "string" ||
                input.query.length > 120 ||
                Object.keys(input).length !== 1
              )
                throw new Error(
                  "Informe apenas query, com até 120 caracteres.",
                );
              setQuery(input.query);
              setCategory("Todas as peças");
              return {
                query: input.query,
                results: products
                  .filter((p) =>
                    normalizeSearch(`${p.name} ${productTitles[p.id] || ""} ${p.brand} ${p.sku}`).includes(
                      normalizeSearch(input.query as string),
                    ),
                  )
                  .map((p) => ({
                    id: p.id,
                    name: p.name,
                    priceCents: p.priceCents,
                  })),
              };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => lifecycle.abort();
  }, [products]);
  return (
    <div className={`nl-store${editorialVariant ? " nl-store-editorial" : ""}`}>
      <a className="nl-skip-link" href="#catalogo">Pular apresentação e ir ao catálogo</a>
      <header className="store-header wrap">
        <a href={storefrontHref} className="store-brand">
          <img src="/assets/logo.png" alt="" />
          <span>
            NOVA LEÕES<small>AUTOPEÇAS</small>
          </span>
        </a>
        <nav className="nl-header-nav" aria-label="Navegação principal"><a href="#catalogo">Nossas peças</a><a href="#como-funciona">Como funciona</a><a href="#duvidas">Dúvidas</a></nav>
        <button
          className="cart-trigger"
          aria-label={`Meu pedido, ${count} ${count === 1 ? "peça" : "peças"}`}
          onClick={() => {
            setStep("cart");
            setError("");
            setCartOpen(true);
          }}
        >
          <ShoppingBag size={23} />
          <span>Meu pedido</span>
          <b>{count}</b>
        </button>
      </header>
      <ScrollHero products={products} onProduct={setDetail} />
      <div className="nl-value-strip"><div className="wrap"><span><CarFront size={21} /><span><b>A peça certa para o seu carro</b><small>Aplicação conferida pela equipe</small></span></span><span><ShieldCheck size={21} /><span><b>Compra com acompanhamento</b><small>Pedido sujeito à aprovação da loja</small></span></span><span><PackageCheck size={21} /><span><b>Da nossa loja para o seu caminho</b><small>Retirada combinada no balcão</small></span></span></div></div>
      <main className="wrap">
        {editorialVariant && <Suspense fallback={null}><StorefrontEditorialVariant products={products} onExplore={exploreCategory} /></Suspense>}
        <section id="catalogo" className="catalog-section" tabIndex={-1}>
          <div className="section-heading">
            <div><p className="nl-kicker"><span /> {editorialVariant ? "DO CUIDADO À PEÇA" : "NOSSA SELEÇÃO"}</p><h2>{editorialVariant ? <>Agora, encontre<br /><em>a sua peça.</em></> : <>O próximo cuidado<br /><em>começa aqui.</em></>}</h2></div>
            <p className="nl-catalog-intro">{editorialVariant ? <>Nome, marca ou código: comece pelo que você sabe.<br />A aplicação é conferida com você antes da aprovação.</> : <>Encontre o que seu carro precisa.<br />A gente cuida dos detalhes com você.</>}</p>
          </div>
          <div className="nl-catalog-tools"><form className="searchbox" onSubmit={e => e.preventDefault()}><Search size={20}/><input aria-label="Buscar por peça, marca ou código" placeholder="Qual peça você procura?" maxLength={120} value={query} onChange={e=>setQuery(e.target.value)}/>{query && <button type="button" aria-label="Limpar busca" onClick={()=>setQuery("")}>×</button>}</form><span className="subtle" aria-live="polite">{catalogLoading ? "Carregando peças…" : `${filtered.length} ${filtered.length === 1 ? "peça selecionada" : "peças selecionadas"}`}</span></div>
      <nav className="category-nav" aria-label="Categorias de peças">
        <div className="wrap">
          {[
            ...new Set(["Todas as peças", ...products.filter(p => p.published).map((p) => p.category)]),
          ].map((c) => (
            <button
              key={c}
              className={category === c ? "active" : ""}
              aria-pressed={category === c}
              onClick={() => {
                setCategory(c);
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </nav>
        {catalogError && (
          <div className="inline-error">
            <AlertCircle size={18} />
            Não foi possível atualizar o catálogo.{" "}
            <button onClick={refresh}>Tentar novamente</button>
          </div>
        )}
          {!ordersEnabled && !catalogLoading && !catalogError && <div className="inline-notice nl-catalog-notice"><AlertCircle size={18} /><p><b>Nosso catálogo já está aqui.</b> Estamos preparando o envio de pedidos online. Por enquanto, explore as peças e suas informações.</p></div>}
          <div className="product-grid">
            {filtered.map(p => <StoreProductCard key={p.id} product={p} onSelect={setDetail} onAdd={add} unavailable={catalogError} />)}
          </div>
          {catalogLoading && <div className="nl-skeletons" role="status" aria-label="Carregando catálogo">{[1,2,3,4].map(i=><div key={i}/>)}</div>}
          {!filtered.length && !catalogLoading && !catalogError && (
            <div className="empty-state">
              <Search />
              <h3>Nenhuma peça encontrada</h3>
              <p>Tente o nome da peça, a marca ou o código.</p>
              <button
                onClick={() => {
                  setQuery("");
                  setCategory("Todas as peças");
                }}
              >
                Limpar busca
              </button>
            </div>
          )}
        </section>
        <StorefrontEditorial />
      </main>
      <footer className="nl-footer">
        <div className="wrap">
          <div className="nl-footer-top">
            <div><p className="nl-kicker">NOVA LEÕES AUTOPEÇAS</p><h2>Seu próximo caminho<br />merece <em>cuidado.</em></h2></div>
            <a className="nl-button" href="#catalogo">Encontrar minha peça <ArrowUpRight size={19} /></a>
          </div>
          <div className="nl-footer-bottom">
            <a className="store-brand" href={storefrontHref} aria-label="Nova Leões, início"><img src="/assets/logo.png" alt="" loading="lazy" /><span>NOVA LEÕES<small>AUTOPEÇAS</small></span></a>
            <nav aria-label="Navegação do rodapé"><a href="#catalogo">Peças</a><a href="#como-funciona">Como comprar</a><a href="#duvidas">Dúvidas</a></nav>
            <span>Um ambiente da <b>octopool</b></span>
          </div>
          <div className="nl-footer-meta"><span>Seu carro. Nosso cuidado.</span><a href="/gestao">Acesso da equipe <ArrowUpRight size={13} /></a></div>
        </div>
      </footer>
      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="product-dialog nl-product-dialog sm:max-w-[860px]">
          {detail && (
            <>
              <div className="detail-photo"><span className="nl-detail-category">{detail.category}</span>
                {detail.image ? (
                  <img src={detail.image} alt={detail.name} />
                ) : (
                  <Package size={64} />
                )}
              </div>
              <div className="nl-detail-content">
                <p className="eyebrow">
                  {detail.brand} · {detail.sku}
                </p>
                <DialogTitle className="detail-title">
                  {productTitles[detail.id] || detail.name}
                </DialogTitle>
                <DialogDescription className="detail-description">
                  {productBenefits[detail.id]} {detail.description}
                </DialogDescription>
                <div className="compatibility-note">
                  <CarFront size={21} />
                  <span><b>Serve no seu carro?</b>Informe modelo, ano e motor. A equipe confere a aplicação antes de aprovar.</span>
                </div>
                <strong className="detail-price">
                  {money(detail.priceCents)}
                </strong>
                <p className="subtle">Preço sujeito à conferência na aprovação</p>
                <button
                  className="primary-button wide"
                  disabled={detail.stock <= 0}
                  onClick={() => add(detail)}
                >
                  {detail.stock > 0
                    ? "Adicionar ao carrinho"
                    : "Indisponível"}
                  <ShoppingBag size={18} />
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent className="cart-sheet nl-cart-sheet sm:max-w-[530px] w-full">
          <SheetHeader>
            <p className="nl-cart-eyebrow">SEU PRÓXIMO CUIDADO</p>
            <SheetTitle>
              {step === "success"
                ? "Pedido aguardando aprovação"
                : step === "checkout"
                  ? "Enviar pedido para aprovação"
                  : "Meu carrinho"}
            </SheetTitle>
            <SheetDescription>
              {step === "success"
                ? "Seu pedido já está na gestão do e-commerce."
                : "O envio não reserva peças. Aguarde a aprovação da loja."}
            </SheetDescription>
          </SheetHeader>
          {step === "success" && order ? (
            <div className="order-success">
              <span className="success-circle">
                <Check size={32} />
              </span>
              <h2>Pedido registrado, {order.customerName.split(" ")[0]}.</h2>
              <p>
                Seu pedido <strong>{order.number}</strong> foi salvo.
              </p>
              <div className="receipt-row">
                <span>Total solicitado</span>
                <strong>{money(order.totalCents)}</strong>
              </div>
              <div className="receipt-row">
                <span>Situação</span>
                <strong>
                  {order.status === "STOCK_PENDING"
                    ? "Verificando estoque"
                    : order.status === "AWAITING_APPROVAL"
                      ? "Aguardando aprovação da loja"
                      : "Consulte a gestão"}
                </strong>
              </div>
              <p className="subtle">
                A loja vai conferir a aplicação, o valor e a disponibilidade antes de aprovar.
                O envio não reserva nem baixa peças do estoque. Aguarde o contato da equipe antes de retirar.
              </p>
              <button
                className="text-button"
                onClick={() => setCartOpen(false)}
              >
                Continuar explorando a loja
              </button>
            </div>
          ) : (
            <>
              <div className="cart-scroll">
                {lines.length ? (
                  <>
                    {lines.map((l) => (
                      <div className="cart-line" key={l.id}>
                        {l.product?.image ? (
                          <img src={l.product.image} alt="" />
                        ) : (
                          <Package />
                        )}
                        <div className="cart-line-main">
                          <h3>{productTitles[l.id] || l.product?.name || "Peça indisponível"}</h3>
                          <p>
                            {l.product?.brand} · {l.product?.sku}
                          </p>
                          <strong>
                            {money((l.product?.priceCents || 0) * l.quantity)}
                          </strong>
                          <div className="quantity">
                            <button
                              aria-label={`Diminuir ${l.product?.name}`}
                              onClick={() => change(l.id, l.quantity - 1)}
                            >
                              <Minus size={15} />
                            </button>
                            <span>{l.quantity}</span>
                            <button
                              aria-label={`Aumentar ${l.product?.name}`}
                              disabled={
                                l.quantity >=
                                Math.min(20, l.product?.stock || 0)
                              }
                              onClick={() => change(l.id, l.quantity + 1)}
                            >
                              <Plus size={15} />
                            </button>
                          </div>
                        </div>
                        <button
                          className="remove-line"
                          aria-label={`Remover ${l.product?.name}`}
                          onClick={() => change(l.id, 0)}
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    ))}
                    {step === "checkout" && (
                      <form
                        id="checkout-form"
                        className="checkout-form"
                        onSubmit={submit}
                      >
                        <h3>Quem vai receber o pedido?</h3>
                        <p className="subtle">
                          Informe seus dados para a loja conferir o pedido.
                        </p>
                        <label>
                          Nome completo
                          <input
                            autoComplete="name"
                            required
                            minLength={3}
                            maxLength={100}
                            value={form.customerName}
                            onChange={(e) =>
                              updateForm("customerName", e.target.value)
                            }
                            placeholder="Seu nome"
                          />
                        </label>
                        <div className="form-two">
                          <label>
                            E-mail
                            <input
                              type="email"
                              autoComplete="email"
                              required
                              maxLength={150}
                              value={form.email}
                              onChange={(e) =>
                                updateForm("email", e.target.value)
                              }
                              placeholder="voce@exemplo.com"
                            />
                          </label>
                          <label>
                            Telefone
                            <input
                              type="tel"
                              autoComplete="tel"
                              required
                              pattern="[0-9 ()+\-]{10,22}"
                              maxLength={22}
                              value={form.phone}
                              onChange={(e) =>
                                updateForm("phone", e.target.value)
                              }
                              placeholder="(11) 99999-9999"
                            />
                          </label>
                        </div>
                        <label>
                          Veículo <span>opcional</span>
                          <input
                            maxLength={150}
                            value={form.vehicle}
                            onChange={(e) =>
                              updateForm("vehicle", e.target.value)
                            }
                            placeholder="Modelo, ano e motor"
                          />
                        </label>
                        <label>
                          Observação <span>opcional</span>
                          <textarea
                            maxLength={500}
                            value={form.note}
                            onChange={(e) => updateForm("note", e.target.value)}
                            placeholder="Algo que a loja precisa saber?"
                          />
                        </label>
                        <div className="inline-notice">
                          <PackageCheck size={20} />
                          <div>
                            <b>Retirada na loja</b>
                            <p>
                              Confirmação de horário pela equipe. Entregas e
                              pagamentos online ainda não estão ativados.
                            </p>
                          </div>
                        </div>
                      </form>
                    )}
                  </>
                ) : (
                  <div className="empty-state">
                    <ShoppingBag size={40} />
                    <h3>Seu carrinho está vazio.</h3>
                    <p>Escolha uma peça para começar.</p>
                    <a className="nl-empty-link" href="#catalogo" onClick={() => setCartOpen(false)}>Explorar peças <ArrowRight size={16} /></a>
                  </div>
                )}
              </div>
              {lines.length > 0 && (
                <div className="cart-footer">
                  <div className="receipt-row">
                    <span>Total solicitado</span>
                    <strong>{money(total)}</strong>
                  </div>
                  {error && (
                    <p role="alert" className="inline-error">
                      {error}
                    </p>
                  )}
                  {!ordersEnabled && <p role="status" className="inline-error">O atendimento online está sendo preparado. Em breve você poderá enviar seu pedido.</p>}
                  {step === "cart" ? (
                    <button
                      className="primary-button wide"
                      disabled={
                        !ordersEnabled || catalogError ||
                        lines.some(
                          (l) => !l.product || l.quantity > l.product.stock,
                        )
                      }
                      onClick={() => {
                        setError("");
                        setStep("checkout");
                      }}
                    >
                      Continuar <ArrowRight size={18} />
                    </button>
                  ) : (
                    <>
                      <button
                        type="submit"
                        form="checkout-form"
                        className="primary-button wide"
                        disabled={
                          !ordersEnabled || loading ||
                          lines.some(
                            (l) => !l.product || l.quantity > l.product.stock,
                          )
                        }
                      >
                        {loading ? (
                          <LoaderCircle className="animate-spin" size={18} />
                        ) : (
                          <Check size={18} />
                        )}{" "}
                        {loading ? "Enviando…" : "Enviar para aprovação"}
                      </button>
                      <button
                        className="text-button"
                        disabled={loading}
                        onClick={() => setStep("cart")}
                      >
                        Voltar ao carrinho
                      </button>
                    </>
                  )}
                  <small>
                    Aguarde a confirmação da loja antes de retirar.
                  </small>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
