"use client";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ShoppingBag, ArrowRight, ShieldCheck, PackageCheck, CarFront, Plus, Minus, Trash2, Check, LoaderCircle, Package, AlertCircle, MessageCircle,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { money, type Product } from "@/lib/catalog";
import { normalizeSearch, type Order } from "@/lib/commerce-contracts";
import { type Catalogo, type Filtro, type Peca, FILTRO_VAZIO, carregarCatalogo, filtroDaUrl, filtroParaUrl, filtrar, urlFoto } from "@/lib/catalogo-site";
import { LOJA, whatsappUrl } from "@/lib/loja";
import ScrollHero from "./scroll-hero";
import CatalogoLoja, { tituloDaPeca } from "./catalogo-loja";
import PecaDetalhe from "./peca-detalhe";
import StorefrontEditorial, { productTitles, productBenefits } from "./storefront-editorial";
import { StorefrontInstitucional, RodapeLoja } from "./storefront-institucional";
import "./storefront-redesign.css";
import "./storefront-polish.css";
const StorefrontEditorialVariant = lazy(() => import("./storefront-editorial-variant"));

type Cart = Record<string, number>;
type Linha = { id: string; quantity: number; nome: string; marca: string; image: string; priceCents: number; stock: number; integrado: boolean; peca?: Peca; product?: Product };
const CHAVE_CATALOGO = "c:";
const CHAVE_CARRINHO = "octopool-commerce-live-cart-v1";

export function mensagemWhatsApp(linhas: Pick<Linha, "nome" | "marca" | "quantity">[], veiculo: string, nome: string) {
  const itens = linhas.map((l) => `- ${l.quantity}× ${l.nome}${l.marca ? ` (${l.marca})` : ""}`).join("\n");
  return [`Olá, ${LOJA.nome}! Quero fazer um pedido pelo site:`, itens, veiculo ? `Veículo: ${veiculo}` : "", nome ? `Nome: ${nome}` : "", "Pode confirmar disponibilidade e valor?"].filter(Boolean).join("\n");
}

export default function Storefront() {
  const [editorialVariant] = useState(() => new URLSearchParams(window.location.search).get("visual") === "editorial");
  const storefrontHref = editorialVariant ? "/?visual=editorial" : "/";
  const [products, setProducts] = useState<Product[]>([]),
    [cart, setCart] = useState<Cart>({}),
    [cartOpen, setCartOpen] = useState(false),
    [detalhe, setDetalhe] = useState<Peca | null>(null),
    [detalheLive, setDetalheLive] = useState<Product | null>(null),
    [step, setStep] = useState<"cart" | "checkout" | "success">("cart"),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [catalogError, setCatalogError] = useState(false),
    [ordersEnabled, setOrdersEnabled] = useState(false),
    [order, setOrder] = useState<Order | null>(null),
    [hydrated, setHydrated] = useState(false),
    [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [catalogoErro, setCatalogoErro] = useState(false);
  const [catalogoCarregando, setCatalogoCarregando] = useState(true);
  const [filtro, setFiltroEstado] = useState<Filtro>(() => filtroDaUrl(window.location.search));
  const [form, setForm] = useState({ customerName: "", email: "", phone: "", vehicle: "", note: "" });
  const attempt = useRef("");
  const live = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  async function refresh() {
    try {
      const r = await fetch("/api/public/catalog");
      if (!r.ok) throw Error();
      const data = (await r.json()) as { products: Product[]; ordersEnabled: boolean };
      setProducts(data.products);
      setOrdersEnabled(data.ordersEnabled === true);
      setCatalogError(false);
    } catch {
      setCatalogError(true);
      setOrdersEnabled(false);
    } finally { setCatalogLoading(false); }
  }
  const carregar = useCallback(() => {
    setCatalogoCarregando(true);
    setCatalogoErro(false);
    carregarCatalogo().then((c) => { setCatalogo(c); setCatalogoErro(false); }).catch(() => setCatalogoErro(true)).finally(() => setCatalogoCarregando(false));
  }, []);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CHAVE_CARRINHO) || "{}");
      if (saved && typeof saved === "object" && !Array.isArray(saved))
        setCart(Object.fromEntries(Object.entries(saved).filter(([k, v]) => k.length < 81 && Number.isInteger(v) && Number(v) > 0 && Number(v) <= 20).map(([k, v]) => [k, Number(v)])));
    } catch {}
    setHydrated(true);
    void refresh();
    carregar();
  }, [carregar]);
  useEffect(() => {
    if (hydrated) try { localStorage.setItem(CHAVE_CARRINHO, JSON.stringify(cart)); } catch {}
  }, [cart, hydrated]);

  // Filtro do catálogo na URL, para compartilhar uma busca. Preserva ?visual=editorial.
  const setFiltro = useCallback((proximo: Filtro) => {
    setFiltroEstado(proximo);
    try {
      const params = filtroParaUrl(proximo);
      if (editorialVariant) params.set("visual", "editorial");
      const query = params.toString();
      history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
    } catch {}
  }, [editorialVariant]);
  useEffect(() => {
    // Chegou por um link com filtro: leva direto ao catálogo depois de carregar.
    if (catalogo && JSON.stringify(filtroDaUrl(window.location.search)) !== JSON.stringify(FILTRO_VAZIO) && !window.location.hash)
      document.getElementById("catalogo")?.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogo]);

  const linhas: Linha[] = useMemo(() => Object.entries(cart).map(([id, quantity]) => {
    if (id.startsWith(CHAVE_CATALOGO)) {
      const peca = catalogo?.porId.get(id.slice(CHAVE_CATALOGO.length));
      if (!peca) return { id, quantity, nome: catalogo ? "Peça indisponível" : "Carregando peça…", marca: "", image: "", priceCents: 0, stock: 0, integrado: false };
      return { id, quantity, nome: tituloDaPeca(peca), marca: peca.marca, image: urlFoto(catalogo!.meta, peca.foto), priceCents: peca.precoCents, stock: peca.disponivel, integrado: false, peca };
    }
    const product = live.get(id);
    if (!product) return { id, quantity, nome: "Peça indisponível", marca: "", image: "", priceCents: 0, stock: 0, integrado: true };
    return { id, quantity, nome: productTitles[id] || product.name, marca: product.brand, image: product.image, priceCents: product.priceCents, stock: product.stock, integrado: true, product };
  }), [cart, catalogo, live]);
  const total = linhas.reduce((s, l) => s + l.priceCents * l.quantity, 0);
  const semPreco = linhas.some((l) => l.priceCents <= 0);
  const count = Object.values(cart).reduce((s, q) => s + q, 0);
  const todasIntegradas = linhas.length > 0 && linhas.every((l) => l.integrado && l.product);
  const pedidoOnline = ordersEnabled && todasIntegradas && !catalogError;
  const linkWhatsApp = whatsappUrl(mensagemWhatsApp(linhas, form.vehicle, form.customerName));

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
  function adicionarPeca(peca: Peca) {
    const atual = peca.externalId ? live.get(peca.externalId) : undefined;
    if (atual) { addLive(atual); return; }
    const id = CHAVE_CATALOGO + peca.id;
    change(id, (cart[id] || 0) + 1);
    setStep("cart");
    setDetalhe(null);
    setCartOpen(true);
  }
  function addLive(p: Product) {
    if (p.stock <= 0) return;
    change(p.id, Math.min((cart[p.id] || 0) + 1, p.stock));
    setStep("cart");
    setDetalhe(null);
    setDetalheLive(null);
    setCartOpen(true);
  }
  function abrirProduto(p: Product) {
    const peca = catalogo?.porExternalId.get(p.id);
    if (peca) setDetalhe(peca); else setDetalheLive(p);
  }
  function updateForm(key: keyof typeof form, value: string) {
    attempt.current = "";
    setForm((prev) => ({ ...prev, [key]: value }));
  }
  const irAoCatalogo = () => requestAnimationFrame(() => {
    const el = document.getElementById("catalogo");
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  });
  function explorarDepartamento(id: string) {
    setFiltro({ ...FILTRO_VAZIO, departamento: id });
    irAoCatalogo();
  }
  function exploreCategory(nextCategory: string) {
    const alvo = normalizeSearch(nextCategory);
    const dep = catalogo?.meta.departamentos.find((d) => normalizeSearch(d.nome).includes(alvo) || alvo.includes(normalizeSearch(d.nome).split(" ")[0]));
    explorarDepartamento(dep?.id || "");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !pedidoOnline) return;
    setLoading(true);
    setError("");
    attempt.current ||= crypto.randomUUID();
    try {
      const r = await fetch("/api/public/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, idempotency: attempt.current, items: linhas.map((l) => ({ productId: l.id, quantity: l.quantity })) }),
      });
      const data = (await r.json()) as { order: Order; error?: string; retryable?: boolean };
      if (!r.ok && data.retryable) attempt.current = "";
      if (!r.ok) throw new Error(data.error || "Não foi possível enviar o pedido.");
      setOrder(data.order);
      setCart({});
      setStep("success");
      attempt.current = "";
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    type Tool = { name: string; description: string; inputSchema: object; annotations: object; execute: (input: unknown) => unknown };
    const context = (document as Document & { modelContext?: { registerTool: (tool: Tool, options: { signal: AbortSignal }) => unknown } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(context.registerTool({
        name: "search_store_catalog",
        description: "Filtra as peças da Nova Leões na mesma busca visível da loja.",
        inputSchema: { type: "object", properties: { query: { type: "string", maxLength: 120 } }, required: ["query"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) {
          if (!input || typeof input !== "object" || !("query" in input) || typeof input.query !== "string" || input.query.length > 120 || Object.keys(input).length !== 1)
            throw new Error("Informe apenas query, com até 120 caracteres.");
          const q = input.query as string;
          setFiltro({ ...FILTRO_VAZIO, q });
          const results = catalogo ? filtrar(catalogo, { ...FILTRO_VAZIO, q }).slice(0, 50).map((p) => ({ id: p.id, name: tituloDaPeca(p), priceCents: p.precoCents })) : [];
          return { query: q, results };
        },
      }, { signal: lifecycle.signal })).catch(() => {});
    } catch {}
    return () => lifecycle.abort();
  }, [catalogo, setFiltro]);

  const contatoWhats = whatsappUrl(`Olá! Vi o site da ${LOJA.nome} e quero falar com a loja.`);
  return (
    <div className={`nl-store${editorialVariant ? " nl-store-editorial" : ""}`}>
      <a className="nl-skip-link" href="#catalogo">Pular apresentação e ir ao catálogo</a>
      <header className="store-header wrap">
        <a href={storefrontHref} className="store-brand">
          <img src="/assets/logo.png" alt="" />
          <span>NOVA LEÕES<small>AUTOPEÇAS</small></span>
        </a>
        <nav className="nl-header-nav" aria-label="Navegação principal"><a href="#catalogo">Peças</a><a href="#como-funciona">Como comprar</a><a href="#quem-somos">Quem somos</a><a href="#contato">Contato</a><a href="#duvidas">Dúvidas</a></nav>
        <button className="cart-trigger" aria-label={`Meu pedido, ${count} ${count === 1 ? "peça" : "peças"}`} onClick={() => { setStep("cart"); setError(""); setCartOpen(true); }}>
          <ShoppingBag size={23} />
          <span>Meu pedido</span>
          <b>{count}</b>
        </button>
      </header>
      <ScrollHero products={products} onProduct={abrirProduto} />
      <div className="nl-value-strip"><div className="wrap"><span><CarFront size={21} /><span><b>A peça certa para o seu carro</b><small>Aplicação conferida pela equipe</small></span></span><span><ShieldCheck size={21} /><span><b>Compra com acompanhamento</b><small>Pedido sujeito à aprovação da loja</small></span></span><span><PackageCheck size={21} /><span><b>Da nossa loja para o seu caminho</b><small>Retirada no balcão ou entrega própria</small></span></span></div></div>
      <main className="wrap">
        {editorialVariant && <Suspense fallback={null}><StorefrontEditorialVariant products={products} onExplore={exploreCategory} /></Suspense>}
        <section id="catalogo" className="catalog-section" tabIndex={-1}>
          <div className="section-heading">
            <div><p className="nl-kicker"><span /> {editorialVariant ? "DO CUIDADO À PEÇA" : "CATÁLOGO COMPLETO"}</p><h2>{editorialVariant ? <>Agora, encontre<br /><em>a sua peça.</em></> : <>Todas as peças<br /><em>da loja, aqui.</em></>}</h2></div>
            <p className="nl-catalog-intro">{catalogo ? <>{catalogo.meta.total.toLocaleString("pt-BR")} itens do estoque da Nova Leões, por departamento, marca ou veículo.<br />A aplicação é conferida com você antes da aprovação.</> : <>O catálogo da loja, por departamento, marca ou veículo.<br />A aplicação é conferida com você antes da aprovação.</>}</p>
          </div>
          {!ordersEnabled && !catalogLoading && !catalogError && <div className="inline-notice nl-catalog-notice"><AlertCircle size={18} /><p><b>Pedido online em preparação.</b> Monte seu pedido normalmente e envie pelo WhatsApp: a equipe confere e responde com valor e disponibilidade.</p></div>}
          <CatalogoLoja
            catalogo={catalogo} carregando={catalogoCarregando} erro={catalogoErro} live={live} filtro={filtro} onFiltro={setFiltro}
            onSelecionar={setDetalhe} onAdicionar={adicionarPeca} onTentarNovamente={carregar}
          />
        </section>
        <StorefrontEditorial />
        <StorefrontInstitucional totalPecas={catalogo?.meta.total || 0} />
      </main>
      <RodapeLoja storefrontHref={storefrontHref} departamentos={catalogo?.meta.departamentos.filter((d) => d.n > 0) || []} onDepartamento={explorarDepartamento} />

      <Dialog open={!!detalhe || !!detalheLive} onOpenChange={(open) => { if (!open) { setDetalhe(null); setDetalheLive(null); } }}>
        <DialogContent className="product-dialog nl-product-dialog sm:max-w-[900px]">
          {detalhe && catalogo && <PecaDetalhe peca={detalhe} catalogo={catalogo} live={live} onAdicionar={adicionarPeca} onWhatsApp={(p) => whatsappUrl(mensagemWhatsApp([{ nome: tituloDaPeca(p), marca: p.marca, quantity: 1 }], "", ""))} />}
          {!detalhe && detalheLive && (
            <>
              <div className="detail-photo"><span className="nl-detail-category">{detalheLive.category}</span>
                {detalheLive.image ? <img src={detalheLive.image} alt={detalheLive.name} /> : <Package size={64} />}
              </div>
              <div className="nl-detail-content">
                <p className="eyebrow">{detalheLive.brand}</p>
                <DialogTitle className="detail-title">{productTitles[detalheLive.id] || detalheLive.name}</DialogTitle>
                <DialogDescription className="detail-description">{productBenefits[detalheLive.id]} {detalheLive.description}</DialogDescription>
                <div className="compatibility-note"><CarFront size={21} /><span><b>Serve no seu carro?</b>Informe modelo, ano e motor. A equipe confere a aplicação antes de aprovar.</span></div>
                <strong className="detail-price">{money(detalheLive.priceCents)}</strong>
                <p className="subtle">Preço sujeito à conferência na aprovação</p>
                <button className="primary-button wide" disabled={detalheLive.stock <= 0} onClick={() => addLive(detalheLive)}>{detalheLive.stock > 0 ? "Adicionar ao pedido" : "Indisponível"}<ShoppingBag size={18} /></button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent className="cart-sheet nl-cart-sheet sm:max-w-[530px] w-full">
          <SheetHeader>
            <p className="nl-cart-eyebrow">SEU PRÓXIMO CUIDADO</p>
            <SheetTitle>{step === "success" ? "Pedido aguardando aprovação" : step === "checkout" ? "Enviar pedido para aprovação" : "Meu pedido"}</SheetTitle>
            <SheetDescription>{step === "success" ? "Seu pedido já está na gestão do e-commerce." : "O envio não reserva peças. A loja confere aplicação, preço e disponibilidade."}</SheetDescription>
          </SheetHeader>
          {step === "success" && order ? (
            <div className="order-success">
              <span className="success-circle"><Check size={32} /></span>
              <h2>Pedido registrado, {order.customerName.split(" ")[0]}.</h2>
              <p>Seu pedido <strong>{order.number}</strong> foi salvo.</p>
              <div className="receipt-row"><span>Total solicitado</span><strong>{money(order.totalCents)}</strong></div>
              <div className="receipt-row"><span>Situação</span><strong>{order.status === "STOCK_PENDING" ? "Verificando estoque" : order.status === "AWAITING_APPROVAL" ? "Aguardando aprovação da loja" : "Consulte a gestão"}</strong></div>
              <p className="subtle">A loja vai conferir a aplicação, o valor e a disponibilidade antes de aprovar. O envio não reserva nem baixa peças do estoque. Aguarde o contato da equipe antes de retirar.</p>
              <button className="text-button" onClick={() => setCartOpen(false)}>Continuar explorando a loja</button>
            </div>
          ) : (
            <>
              <div className="cart-scroll">
                {linhas.length ? (
                  <>
                    {linhas.map((l) => (
                      <div className="cart-line" key={l.id}>
                        {l.image ? <img src={l.image} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} /> : <Package />}
                        <div className="cart-line-main">
                          <h3>{l.nome}</h3>
                          <p>{l.marca || (l.integrado ? "" : "Marca a confirmar")}</p>
                          <strong>{l.priceCents > 0 ? money(l.priceCents * l.quantity) : "Preço sob consulta"}</strong>
                          {!l.integrado && <small className="nl-cart-line-obs">{l.stock > 0 ? "Em estoque na loja · confirmação pelo WhatsApp" : "Sob consulta · a loja confirma pelo WhatsApp"}</small>}
                          <div className="quantity">
                            <button aria-label={`Diminuir ${l.nome}`} onClick={() => change(l.id, l.quantity - 1)}><Minus size={15} /></button>
                            <span>{l.quantity}</span>
                            <button aria-label={`Aumentar ${l.nome}`} disabled={l.quantity >= (l.integrado ? Math.min(20, l.stock) : 20)} onClick={() => change(l.id, l.quantity + 1)}><Plus size={15} /></button>
                          </div>
                        </div>
                        <button className="remove-line" aria-label={`Remover ${l.nome}`} onClick={() => change(l.id, 0)}><Trash2 size={17} /></button>
                      </div>
                    ))}
                    {step === "checkout" && (
                      <form id="checkout-form" className="checkout-form" onSubmit={submit}>
                        <h3>Quem vai receber o pedido?</h3>
                        <p className="subtle">Informe seus dados para a loja conferir o pedido.</p>
                        <label>Nome completo<input autoComplete="name" required minLength={3} maxLength={100} value={form.customerName} onChange={(e) => updateForm("customerName", e.target.value)} placeholder="Seu nome" /></label>
                        <div className="form-two">
                          <label>E-mail<input type="email" autoComplete="email" required maxLength={150} value={form.email} onChange={(e) => updateForm("email", e.target.value)} placeholder="voce@exemplo.com" /></label>
                          <label>Telefone<input type="tel" autoComplete="tel" required pattern="[0-9 ()+\-]{10,22}" maxLength={22} value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} placeholder="(11) 99999-9999" /></label>
                        </div>
                        <label>Veículo <span>opcional</span><input maxLength={150} value={form.vehicle} onChange={(e) => updateForm("vehicle", e.target.value)} placeholder="Modelo, ano e motor" /></label>
                        <label>Observação <span>opcional</span><textarea maxLength={500} value={form.note} onChange={(e) => updateForm("note", e.target.value)} placeholder="Algo que a loja precisa saber?" /></label>
                        <div className="inline-notice"><PackageCheck size={20} /><div><b>Retirada na loja ou entrega</b><p>Confirmação de horário pela equipe. Pagamentos online ainda não estão ativados.</p></div></div>
                      </form>
                    )}
                  </>
                ) : (
                  <div className="empty-state">
                    <ShoppingBag size={40} />
                    <h3>Seu pedido está vazio.</h3>
                    <p>Escolha uma peça para começar.</p>
                    <a className="nl-empty-link" href="#catalogo" onClick={() => setCartOpen(false)}>Explorar peças <ArrowRight size={16} /></a>
                  </div>
                )}
              </div>
              {linhas.length > 0 && (
                <div className="cart-footer">
                  <div className="receipt-row"><span>{semPreco ? "Total parcial" : "Total solicitado"}</span><strong>{money(total)}</strong></div>
                  {semPreco && <p className="subtle">Itens sem preço no site entram como "sob consulta".</p>}
                  {error && <p role="alert" className="inline-error">{error}</p>}
                  {step === "cart" ? (
                    <>
                      {pedidoOnline ? (
                        <button className="primary-button wide" disabled={linhas.some((l) => !l.product || l.quantity > l.product.stock)} onClick={() => { setError(""); setStep("checkout"); }}>Continuar <ArrowRight size={18} /></button>
                      ) : (
                        <div className="nl-cart-aviso">{!ordersEnabled ? "O envio online está em preparação. Envie o pedido pelo WhatsApp e a equipe responde com valor e disponibilidade." : "Este pedido tem peças conferidas só pela equipe. Envie pelo WhatsApp: a loja confirma valor e disponibilidade."}</div>
                      )}
                      <a className="nl-cart-whats" href={linkWhatsApp} target="_blank" rel="noopener noreferrer"><MessageCircle size={17} /> Enviar pedido pelo WhatsApp</a>
                    </>
                  ) : (
                    <>
                      <button type="submit" form="checkout-form" className="primary-button wide" disabled={!pedidoOnline || loading || linhas.some((l) => !l.product || l.quantity > l.product.stock)}>
                        {loading ? <LoaderCircle className="animate-spin" size={18} /> : <Check size={18} />} {loading ? "Enviando…" : "Enviar para aprovação"}
                      </button>
                      <a className="nl-cart-whats" href={linkWhatsApp} target="_blank" rel="noopener noreferrer"><MessageCircle size={17} /> Prefiro enviar pelo WhatsApp</a>
                      <button className="text-button" disabled={loading} onClick={() => setStep("cart")}>Voltar ao pedido</button>
                    </>
                  )}
                  <small>Aguarde a confirmação da loja antes de retirar. Dúvidas: <a href={contatoWhats} target="_blank" rel="noopener noreferrer">{LOJA.telefone}</a></small>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
