"use client";
import { useEffect, useRef, useState } from "react";
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
  categories,
  money,
  type Product,
} from "@/lib/catalog";
import { normalizeSearch, type Order } from "@/lib/commerce-contracts";
type Cart = Record<string, number>;
export default function Storefront() {
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
    [hydrated, setHydrated] = useState(false);
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
    }
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
      normalizeSearch(`${p.name} ${p.brand} ${p.sku}`).includes(
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
                    normalizeSearch(`${p.name} ${p.brand} ${p.sku}`).includes(
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
    <>
      <div className="preview-note">
        Pedidos sujeitos à aprovação da loja · retirada no balcão{" "}
        <a href="/gestao">
          Acesso da equipe <ArrowUpRight size={13} />
        </a>
      </div>
      <header className="store-header wrap">
        <a href="/" className="store-brand">
          <img src="/assets/logo.png" alt="" />
          <span>
            NOVA LEÕES<small>AUTOPEÇAS · DESDE 1993</small>
          </span>
        </a>
        <form
          className="searchbox"
          onSubmit={(e) => {
            e.preventDefault();
            document
              .getElementById("catalogo")
              ?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          <Search size={21} />
          <input
            aria-label="Buscar por peça, marca ou código"
            placeholder="Qual peça você procura?"
            maxLength={120}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button aria-label="Buscar peças">
            <ArrowRight size={20} />
          </button>
        </form>
        <button
          className="cart-trigger"
          onClick={() => {
            setStep("cart");
            setError("");
            setCartOpen(true);
          }}
        >
          <ShoppingBag size={23} />
          <span>Meu carrinho</span>
          <b>{count}</b>
        </button>
      </header>
      <nav className="category-nav" aria-label="Categorias de peças">
        <div className="wrap">
          {[
            ...new Set([...categories, ...products.map((p) => p.category)]),
          ].map((c) => (
            <button
              key={c}
              className={category === c ? "active" : ""}
              aria-pressed={category === c}
              onClick={() => {
                setCategory(c);
                if (c !== "Todas as peças")
                  document
                    .getElementById("catalogo")
                    ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </nav>
      <main className="wrap">
        {catalogError && (
          <div className="inline-error">
            <AlertCircle size={18} />
            Não foi possível atualizar o catálogo.{" "}
            <button onClick={refresh}>Tentar novamente</button>
          </div>
        )}
        {!query && category === "Todas as peças" && (
          <>
            <section className="store-hero">
              <div className="hero-copy">
                <p className="eyebrow">QUEM CONHECE, CUIDA.</p>
                <h1>
                  A peça certa.
                  <br />
                  <span>Sem complicar.</span>
                </h1>
                <p>
                  Encontre o que seu carro precisa, com a atenção de quem
                  entende de autopeças.
                </p>
                <a className="primary-button" href="#catalogo">
                  Encontrar minha peça <ArrowRight size={19} />
                </a>
              </div>
              <div className="hero-product">
                <span className="hero-label">CUIDADO EM CADA DETALHE</span>
                <img src="/assets/9025.849.jpg" alt="Amortecedor Cofap" />
                <div className="hero-caption">
                  <span>Da manutenção ao próximo caminho.</span>
                  <span>Nova Leões Autopeças</span>
                </div>
              </div>
            </section>
            <div className="trust-strip">
              <span>
                <Search />
                Busca por peça, marca ou código
              </span>
              <span>
                <CarFront />
                Confira a aplicação antes de comprar
              </span>
              <span>
                <PackageCheck />
                Pedido direto com a loja
              </span>
            </div>
          </>
        )}
        <section id="catalogo" className="catalog-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ENCONTRE SUA PRÓXIMA PEÇA</p>
              <h2>
                {query
                  ? `Resultados para “${query}”`
                  : category === "Todas as peças"
                    ? "Seu carro bem cuidado."
                    : category}
              </h2>
            </div>
            <span className="subtle" aria-live="polite">
              {filtered.length} peças no catálogo
            </span>
          </div>
          <div className="product-grid">
            {filtered.map((p) => (
              <article className="product-card" key={p.id}>
                <button
                  className="product-photo photo-button"
                  onClick={() => setDetail(p)}
                  aria-label={`Ver ${p.name}`}
                >
                  {p.image ? (
                    <img src={p.image} alt={p.name} loading="lazy" />
                  ) : (
                    <Package size={54} />
                  )}
                  <span>{p.category}</span>
                </button>
                <div className="product-info">
                  <p className="product-brand">
                    {p.brand} <span>· {p.sku}</span>
                  </p>
                  <h3>
                    <button onClick={() => setDetail(p)}>{p.name}</button>
                  </h3>
                  <p className="application">
                    Confirme a aplicação no seu veículo
                  </p>
                  <div className="product-bottom">
                    <div>
                      <strong>{money(p.priceCents)}</strong>
                      <small>
                        {p.stock > 0
                          ? "consulte a aplicação"
                          : "indisponível"}
                      </small>
                    </div>
                    <button
                      disabled={!p.stock || catalogError}
                      onClick={() => add(p)}
                      aria-label={`Adicionar ${p.name}`}
                      className="add-button"
                    >
                      <Plus size={22} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {!filtered.length && (
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
        <section className="help-strip">
          <ShieldCheck size={32} />
          <div>
            <h2>Peça parecida nem sempre é a peça certa.</h2>
            <p>
              Confira código, modelo, motor e ano do veículo antes de concluir o
              pedido.
            </p>
          </div>
        </section>
      </main>
      <footer className="wrap store-footer">
        <span>Nova Leões Autopeças</span>
        <span>
          Uma loja conectada por <b>octopool</b>
        </span>
        <a href="/gestao">
          Área de gestão <ArrowUpRight size={15} />
        </a>
      </footer>
      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="product-dialog sm:max-w-[760px]">
          {detail && (
            <>
              <div className="detail-photo">
                {detail.image ? (
                  <img src={detail.image} alt={detail.name} />
                ) : (
                  <Package size={64} />
                )}
              </div>
              <div>
                <p className="eyebrow">
                  {detail.brand} · {detail.sku}
                </p>
                <DialogTitle className="detail-title">
                  {detail.name}
                </DialogTitle>
                <DialogDescription className="detail-description">
                  {detail.description}
                </DialogDescription>
                <div className="compatibility-note">
                  <CarFront size={21} />
                  <span>
                    Informe seu veículo no pedido. A aplicação precisa ser
                    confirmada pela loja.
                  </span>
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
        <SheetContent className="cart-sheet sm:max-w-[530px] w-full">
          <SheetHeader>
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
                          <h3>{l.product?.name || "Peça indisponível"}</h3>
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
                    <button onClick={() => setCartOpen(false)}>
                      Explorar peças
                    </button>
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
    </>
  );
}
