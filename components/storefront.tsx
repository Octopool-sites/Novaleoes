"use client";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ShoppingBag, ArrowRight, ShieldCheck, PackageCheck, CarFront, Plus, Minus, Trash2, Check, LoaderCircle, Package, MessageCircle, Search, Truck,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { money, type Product } from "@/lib/catalog";
import { normalizeSearch, type Order } from "@/lib/commerce-contracts";
import { type Catalogo, type Filtro, type Peca, FILTRO_VAZIO, carregarCatalogo, filtroDaUrl, filtroParaUrl, filtrar, urlFoto } from "@/lib/catalogo-site";
import { type Veiculo, type VeiculoSalvo, lerVeiculoSalvo, resolverVeiculo, salvarVeiculo } from "@/lib/garagem";
import type { OpcaoFrete, ResultadoFrete } from "@/lib/frete";
import { LOJA, whatsappUrl } from "@/lib/loja";
import { mensagemPedido } from "@/lib/pedido";
import ScrollHero from "./scroll-hero";
import CatalogoLoja, { tituloDaPeca } from "./catalogo-loja";
import PecaDetalhe, { linkDaPeca } from "./peca-detalhe";
import SeletorVeiculo from "./seletor-veiculo";
import CalculoFrete from "./calculo-frete";
import { VitrineDepartamentos, VitrineVeiculo } from "./vitrines";
import StorefrontEditorial, { productTitles, productBenefits } from "./storefront-editorial";
import { StorefrontInstitucional, RodapeLoja } from "./storefront-institucional";
import "./storefront-redesign.css";
import "./storefront-polish.css";
import "./storefront-loja.css";
const StorefrontEditorialVariant = lazy(() => import("./storefront-editorial-variant"));

type Cart = Record<string, number>;
export type Linha = { id: string; quantity: number; nome: string; marca: string; image: string; priceCents: number; stock: number; integrado: boolean; link: string; peca?: Peca; product?: Product };
type Entrega = "retirada" | "entrega" | "combinar";
export type Dados = { nome: string; telefone: string; email: string; veiculo: string; entrega: Entrega; cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; pagamento: string; obs: string };
const CHAVE_CATALOGO = "c:";
const CHAVE_CARRINHO = "octopool-commerce-live-cart-v1";
const CHAVE_DADOS = "nl-dados-cliente-v1";

function lerDados(): Partial<Dados> {
  try { const d = JSON.parse(localStorage.getItem(CHAVE_DADOS) || "{}"); return d && typeof d === "object" ? d : {}; } catch { return {}; }
}

export default function Storefront() {
  const [editorialVariant] = useState(() => new URLSearchParams(window.location.search).get("visual") === "editorial");
  const storefrontHref = editorialVariant ? "/?visual=editorial" : "/";
  const [products, setProducts] = useState<Product[]>([]),
    [cart, setCart] = useState<Cart>({}),
    [cartOpen, setCartOpen] = useState(false),
    [detalhe, setDetalheEstado] = useState<Peca | null>(null),
    [detalheLive, setDetalheLive] = useState<Product | null>(null),
    [step, setStep] = useState<"cart" | "checkout" | "enviado" | "success">("cart"),
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
  const [veiculoSalvo, setVeiculoSalvo] = useState<VeiculoSalvo | null>(() => lerVeiculoSalvo());
  const [seletorAberto, setSeletorAberto] = useState(false);
  const [seletorMontadora, setSeletorMontadora] = useState(-1);
  const [frete, setFrete] = useState<ResultadoFrete | null>(null);
  const [opcaoFrete, setOpcaoFrete] = useState<OpcaoFrete | null>(null);
  const [ultimoPedido, setUltimoPedido] = useState<{ link: string; texto: string } | null>(null);
  const [dados, setDados] = useState<Dados>(() => ({ nome: "", telefone: "", email: "", veiculo: "", entrega: "retirada", cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", pagamento: LOJA.pagamentos[0], obs: "", ...lerDados() }));
  const attempt = useRef("");
  const live = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const veiculo: Veiculo | null = useMemo(() => (catalogo ? resolverVeiculo(catalogo, veiculoSalvo) : null), [catalogo, veiculoSalvo]);

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
  useEffect(() => { if (hydrated) try { localStorage.setItem(CHAVE_CARRINHO, JSON.stringify(cart)); } catch {} }, [cart, hydrated]);

  // URL: filtro do catálogo e peça aberta (?peca=), para compartilhar. Preserva ?visual=editorial.
  const escreverUrl = useCallback((f: Filtro, peca: string | null) => {
    try {
      const params = filtroParaUrl(f);
      if (editorialVariant) params.set("visual", "editorial");
      if (peca) params.set("peca", peca);
      const query = params.toString();
      history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
    } catch {}
  }, [editorialVariant]);
  const setFiltro = useCallback((proximo: Filtro) => { setFiltroEstado(proximo); escreverUrl(proximo, null); }, [escreverUrl]);
  const setDetalhe = useCallback((p: Peca | null) => { setDetalheEstado(p); escreverUrl(filtro, p?.id || null); }, [escreverUrl, filtro]);

  useEffect(() => {
    if (!catalogo) return;
    const params = new URLSearchParams(window.location.search);
    const peca = params.get("peca");
    if (peca && catalogo.porId.has(peca)) { setDetalheEstado(catalogo.porId.get(peca)!); return; }
    if (JSON.stringify(filtroDaUrl(window.location.search)) !== JSON.stringify(FILTRO_VAZIO) && !window.location.hash)
      document.getElementById("catalogo")?.scrollIntoView({ block: "start" });
  }, [catalogo]);

  const linhas: Linha[] = useMemo(() => Object.entries(cart).map(([id, quantity]) => {
    if (id.startsWith(CHAVE_CATALOGO)) {
      const peca = catalogo?.porId.get(id.slice(CHAVE_CATALOGO.length));
      if (!peca) return { id, quantity, nome: catalogo ? "Peça indisponível" : "Carregando peça…", marca: "", image: "", priceCents: 0, stock: 0, integrado: false, link: "" };
      return { id, quantity, nome: tituloDaPeca(peca), marca: peca.marca, image: urlFoto(catalogo!.meta, peca.foto), priceCents: peca.precoCents, stock: peca.disponivel, integrado: false, link: linkDaPeca(peca), peca };
    }
    const product = live.get(id);
    const peca = catalogo?.porExternalId.get(id);
    if (!product) return { id, quantity, nome: "Peça indisponível", marca: "", image: "", priceCents: 0, stock: 0, integrado: true, link: "" };
    return { id, quantity, nome: productTitles[id] || product.name, marca: product.brand, image: product.image, priceCents: product.priceCents, stock: product.stock, integrado: true, link: peca ? linkDaPeca(peca) : "", product };
  }), [cart, catalogo, live]);
  const subtotal = linhas.reduce((s, l) => s + l.priceCents * l.quantity, 0);
  const valorFrete = dados.entrega === "entrega" && opcaoFrete?.tipo === "entrega" ? opcaoFrete.valorCents : 0;
  const semPreco = linhas.some((l) => l.priceCents <= 0);
  const count = Object.values(cart).reduce((s, q) => s + q, 0);
  const todasIntegradas = linhas.length > 0 && linhas.every((l) => l.integrado && l.product);
  const pedidoOnline = ordersEnabled && todasIntegradas && !catalogError;

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
  function abrirCarrinho() { setStep("cart"); setError(""); setCartOpen(true); }
  function adicionarPeca(peca: Peca) {
    const atual = peca.externalId ? live.get(peca.externalId) : undefined;
    if (atual) { addLive(atual); return; }
    const id = CHAVE_CATALOGO + peca.id;
    change(id, (cart[id] || 0) + Math.max(1, Math.round(peca.quantidadeMinima) || 1));
    setDetalhe(null);
    abrirCarrinho();
  }
  function addLive(p: Product) {
    if (p.stock <= 0) return;
    change(p.id, Math.min((cart[p.id] || 0) + 1, p.stock));
    setDetalhe(null);
    setDetalheLive(null);
    abrirCarrinho();
  }
  function abrirProduto(p: Product) {
    const peca = catalogo?.porExternalId.get(p.id);
    if (peca) setDetalhe(peca); else setDetalheLive(p);
  }
  function atualizarDados(parte: Partial<Dados>) {
    attempt.current = "";
    setDados((prev) => {
      const next = { ...prev, ...parte };
      try { const { obs: _o, ...salvar } = next; localStorage.setItem(CHAVE_DADOS, JSON.stringify(salvar)); } catch {}
      return next;
    });
  }
  const irAoCatalogo = () => requestAnimationFrame(() => {
    const el = document.getElementById("catalogo");
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  });
  function explorarDepartamento(id: string) { setFiltro({ ...FILTRO_VAZIO, departamento: id }); irAoCatalogo(); }
  function exploreCategory(nextCategory: string) {
    const alvo = normalizeSearch(nextCategory);
    const dep = catalogo?.meta.departamentos.find((d) => normalizeSearch(d.nome).includes(alvo) || alvo.includes(normalizeSearch(d.nome).split(" ")[0]));
    explorarDepartamento(dep?.id || "");
  }
  function escolherVeiculo(montadora = -1) { setSeletorMontadora(montadora); setSeletorAberto(true); }
  function salvarCarro(v: VeiculoSalvo | null) {
    salvarVeiculo(v);
    setVeiculoSalvo(v);
    if (!catalogo) return;
    const resolvido = resolverVeiculo(catalogo, v);
    if (resolvido) {
      setFiltro({ ...filtro, montadora: resolvido.montadora, modelo: resolvido.modelo, ano: resolvido.ano });
      atualizarDados({ veiculo: resolvido.rotulo });
      if (!detalhe) irAoCatalogo();
    } else setFiltro({ ...filtro, montadora: -1, modelo: -1, ano: 0 });
  }
  function aoFrete(r: ResultadoFrete | null) {
    setFrete(r);
    if (r) {
      const e = r.endereco;
      atualizarDados({ cep: e.cep.replace(/^(\d{5})(\d{3})$/, "$1-$2"), logradouro: e.logradouro || dados.logradouro, bairro: e.bairro || dados.bairro, cidade: `${e.cidade}/${e.uf}` });
      const principal = r.opcoes[0];
      setOpcaoFrete(principal);
      atualizarDados({ entrega: principal.tipo });
    }
  }
  function escolherOpcao(o: OpcaoFrete) { setOpcaoFrete(o); atualizarDados({ entrega: o.tipo }); }

  function enviarWhatsApp(e?: React.FormEvent) {
    e?.preventDefault();
    const texto = mensagemPedido(linhas, dados, dados.entrega === "retirada" ? null : opcaoFrete, frete?.distanciaKm ?? null);
    const link = whatsappUrl(texto);
    window.open(link, "_blank", "noopener");
    setUltimoPedido({ link, texto });
    setCart({});
    setStep("enviado");
  }
  async function submitOnline() {
    if (loading || !pedidoOnline) return;
    const formEl = document.getElementById("checkout-form") as HTMLFormElement | null;
    if (formEl && !formEl.reportValidity()) return;
    if (!dados.email) { setError("Informe um e-mail para o pedido online."); return; }
    setLoading(true);
    setError("");
    attempt.current ||= crypto.randomUUID();
    const entregaTxt = dados.entrega === "retirada" ? "Retirada na loja" : `Entrega: ${[dados.logradouro, dados.numero, dados.complemento, dados.bairro, dados.cidade, dados.cep].filter(Boolean).join(", ")}${valorFrete ? ` (frete ${money(valorFrete)})` : ""}`;
    try {
      const r = await fetch("/api/public/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency: attempt.current, customerName: dados.nome, email: dados.email, phone: dados.telefone, vehicle: dados.veiculo.slice(0, 150),
          note: `${entregaTxt}. Pagamento: ${dados.pagamento}.${dados.obs ? ` ${dados.obs}` : ""}`.slice(0, 500),
          items: linhas.map((l) => ({ productId: l.id, quantity: l.quantity })),
        }),
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
  const precisaEndereco = dados.entrega !== "retirada";
  return (
    <div className={`nl-store${editorialVariant ? " nl-store-editorial" : ""}`}>
      <a className="nl-skip-link" href="#catalogo">Pular apresentação e ir ao catálogo</a>
      <header className="store-header wrap">
        <a href={storefrontHref} className="store-brand">
          <img src="/assets/logo.png" alt="" />
          <span>NOVA LEÕES<small>AUTOPEÇAS</small></span>
        </a>
        <form className="nl-header-busca" role="search" onSubmit={(e) => { e.preventDefault(); irAoCatalogo(); }}>
          <Search size={17} />
          <input aria-label="Buscar peça" placeholder="Buscar peça, marca ou carro" maxLength={120} value={filtro.q}
            onChange={(e) => setFiltro({ ...filtro, q: e.target.value })} onFocus={() => { if (!filtro.q) irAoCatalogo(); }} />
        </form>
        <button type="button" className={`nl-header-carro${veiculo ? " com-carro" : ""}`} onClick={() => escolherVeiculo()} aria-label={veiculo ? `Meu carro: ${veiculo.rotulo}. Trocar` : "Selecionar meu carro"}>
          <CarFront size={19} /><span>{veiculo ? veiculo.rotulo : "Meu carro"}</span>
        </button>
        <nav className="nl-header-nav" aria-label="Navegação principal"><a href="#catalogo">Peças</a><a href="#entrega">Entrega</a><a href="#quem-somos">Quem somos</a><a href="#contato">Contato</a></nav>
        <button className="cart-trigger" aria-label={`Meu pedido, ${count} ${count === 1 ? "peça" : "peças"}`} onClick={abrirCarrinho}>
          <ShoppingBag size={23} />
          <span>Meu pedido</span>
          <b>{count}</b>
        </button>
      </header>
      <ScrollHero products={products} onProduct={abrirProduto} />
      <div className="nl-value-strip"><div className="wrap"><span><CarFront size={21} /><span><b>A peça certa para o seu carro</b><small>Aplicação conferida pela equipe</small></span></span><span><Truck size={21} /><span><b>Entrega própria em Guarulhos</b><small>Frete calculado pelo CEP</small></span></span><span><ShieldCheck size={21} /><span><b>Desde {LOJA.fundacao} em Guarulhos</b><small>Peças com garantia do fabricante</small></span></span></div></div>
      <VitrineVeiculo catalogo={catalogo} veiculo={veiculo} onEscolher={() => escolherVeiculo()} onMontadora={(m) => escolherVeiculo(m)}
        onVerPecas={() => { if (veiculo) { setFiltro({ ...FILTRO_VAZIO, montadora: veiculo.montadora, modelo: veiculo.modelo, ano: veiculo.ano }); irAoCatalogo(); } }} />
      <main className="wrap">
        {editorialVariant && <Suspense fallback={null}><StorefrontEditorialVariant products={products} onExplore={exploreCategory} /></Suspense>}
        <VitrineDepartamentos catalogo={catalogo} onDepartamento={explorarDepartamento} />
        <section id="catalogo" className="catalog-section" tabIndex={-1}>
          <div className="section-heading">
            <div><p className="nl-kicker"><span /> {editorialVariant ? "DO CUIDADO À PEÇA" : "CATÁLOGO COMPLETO"}</p><h2>{editorialVariant ? <>Agora, encontre<br /><em>a sua peça.</em></> : <>Todas as peças<br /><em>da loja, aqui.</em></>}</h2></div>
            <p className="nl-catalog-intro">{catalogo ? <>{catalogo.meta.total.toLocaleString("pt-BR")} itens da Nova Leões, por departamento, marca ou carro.<br />A aplicação é conferida com você antes de separar a peça.</> : <>O catálogo da loja, por departamento, marca ou carro.<br />A aplicação é conferida com você antes de separar a peça.</>}</p>
          </div>
          <CatalogoLoja
            catalogo={catalogo} carregando={catalogoCarregando} erro={catalogoErro} live={live} filtro={filtro} veiculo={veiculo} onFiltro={setFiltro}
            onSelecionar={setDetalhe} onAdicionar={adicionarPeca} onTentarNovamente={carregar} onEscolherVeiculo={() => escolherVeiculo()}
          />
        </section>
        <StorefrontEditorial />
        <StorefrontInstitucional totalPecas={catalogo?.meta.total || 0} />
      </main>
      <RodapeLoja storefrontHref={storefrontHref} departamentos={catalogo?.meta.departamentos.filter((d) => d.n > 0) || []} onDepartamento={explorarDepartamento} />

      <a className={`nl-whats-flutuante${cartOpen || detalhe ? " oculto" : ""}`} href={contatoWhats} target="_blank" rel="noopener noreferrer" aria-label="Falar com a loja no WhatsApp">
        <MessageCircle size={24} /><span>Fale com a loja</span>
      </a>

      {catalogo && <SeletorVeiculo catalogo={catalogo} aberto={seletorAberto} inicial={veiculo} montadoraInicial={seletorMontadora} onFechar={() => setSeletorAberto(false)} onSalvar={salvarCarro} />}

      <Dialog open={!!detalhe || !!detalheLive} onOpenChange={(open) => { if (!open) { setDetalhe(null); setDetalheLive(null); } }}>
        <DialogContent className="product-dialog nl-product-dialog sm:max-w-[960px]">
          {detalhe && catalogo && <PecaDetalhe peca={detalhe} catalogo={catalogo} live={live} veiculo={veiculo} onAdicionar={adicionarPeca} onEscolherVeiculo={() => escolherVeiculo()}
            onWhatsApp={(p) => whatsappUrl(`Olá! Tenho interesse nesta peça:\n${tituloDaPeca(p)}${p.marca ? ` (${p.marca})` : ""}\n${linkDaPeca(p)}${veiculo ? `\nMeu carro: ${veiculo.rotulo}` : ""}\nTem disponível?`)} />}
          {!detalhe && detalheLive && (
            <>
              <div className="detail-photo"><span className="nl-detail-category">{detalheLive.category}</span>
                {detalheLive.image ? <img src={detalheLive.image} alt={detalheLive.name} /> : <Package size={64} />}
              </div>
              <div className="nl-detail-content">
                <p className="eyebrow">{detalheLive.brand}</p>
                <DialogTitle className="detail-title">{productTitles[detalheLive.id] || detalheLive.name}</DialogTitle>
                <DialogDescription className="detail-description">{productBenefits[detalheLive.id]} {detalheLive.description}</DialogDescription>
                <strong className="detail-price">{money(detalheLive.priceCents)}</strong>
                <p className="subtle">Valor confirmado pela loja no pedido</p>
                <button className="primary-button wide" disabled={detalheLive.stock <= 0} onClick={() => addLive(detalheLive)}>{detalheLive.stock > 0 ? "Adicionar ao pedido" : "Indisponível"}<ShoppingBag size={18} /></button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent className="cart-sheet nl-cart-sheet sm:max-w-[560px] w-full">
          <SheetHeader>
            <p className="nl-cart-eyebrow">{step === "cart" ? "1 · PEÇAS E FRETE" : step === "checkout" ? "2 · SEUS DADOS E ENTREGA" : "3 · PEDIDO ENVIADO"}</p>
            <SheetTitle>{step === "success" ? "Pedido aguardando aprovação" : step === "enviado" ? "Pedido enviado para a loja" : step === "checkout" ? "Finalizar pedido" : "Meu pedido"}</SheetTitle>
            <SheetDescription>{step === "enviado" || step === "success" ? "A equipe confere aplicação, valor e disponibilidade e responde por WhatsApp." : "Sem cobrança no site: você paga na retirada ou na entrega, depois da confirmação da loja."}</SheetDescription>
          </SheetHeader>

          {step === "success" && order ? (
            <div className="order-success">
              <span className="success-circle"><Check size={32} /></span>
              <h2>Pedido registrado, {order.customerName.split(" ")[0]}.</h2>
              <p>Seu pedido <strong>{order.number}</strong> foi salvo.</p>
              <div className="receipt-row"><span>Total solicitado</span><strong>{money(order.totalCents)}</strong></div>
              <p className="subtle">A loja confere aplicação, valor e disponibilidade antes de aprovar. Aguarde o contato da equipe.</p>
              <button className="text-button" onClick={() => setCartOpen(false)}>Continuar explorando a loja</button>
            </div>
          ) : step === "enviado" && ultimoPedido ? (
            <div className="order-success nl-enviado">
              <span className="success-circle"><MessageCircle size={30} /></span>
              <h2>Pedido pronto no WhatsApp{dados.nome ? `, ${dados.nome.split(" ")[0]}` : ""}.</h2>
              <p>Abrimos a conversa com a loja com o pedido completo. É só tocar em <b>enviar</b> no WhatsApp.</p>
              <a className="primary-button wide" href={ultimoPedido.link} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} /> Abrir o WhatsApp de novo</a>
              <details className="nl-enviado-texto"><summary>Ver o texto do pedido</summary><pre>{ultimoPedido.texto}</pre></details>
              <button className="text-button" onClick={() => { setStep("cart"); setCartOpen(false); }}>Continuar comprando</button>
            </div>
          ) : (
            <>
              <div className="cart-scroll">
                {linhas.length ? (
                  <>
                    {step === "cart" && linhas.map((l) => (
                      <div className="cart-line" key={l.id}>
                        {l.image ? <img src={l.image} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} /> : <Package />}
                        <div className="cart-line-main">
                          <h3>{l.nome}</h3>
                          <p>{l.marca || ""}</p>
                          <strong>{l.priceCents > 0 ? money(l.priceCents * l.quantity) : "Preço sob consulta"}</strong>
                          {!l.integrado && <small className="nl-cart-line-obs">{l.stock > 0 ? "Em estoque na loja" : "Sob encomenda · a loja confirma o prazo"}</small>}
                          <div className="quantity">
                            <button aria-label={`Diminuir ${l.nome}`} onClick={() => change(l.id, l.quantity - 1)}><Minus size={15} /></button>
                            <span>{l.quantity}</span>
                            <button aria-label={`Aumentar ${l.nome}`} disabled={l.quantity >= (l.integrado ? Math.min(20, l.stock) : 20)} onClick={() => change(l.id, l.quantity + 1)}><Plus size={15} /></button>
                          </div>
                        </div>
                        <button className="remove-line" aria-label={`Remover ${l.nome}`} onClick={() => change(l.id, 0)}><Trash2 size={17} /></button>
                      </div>
                    ))}
                    {step === "cart" && <CalculoFrete titulo="Entrega ou retirada" selecionada={opcaoFrete?.tipo ?? null} onResultado={aoFrete} onSelecionar={escolherOpcao} />}

                    {step === "checkout" && (
                      <form id="checkout-form" className="checkout-form nl-checkout" onSubmit={enviarWhatsApp}>
                        <div className="nl-checkout-resumo">{linhas.map((l) => <span key={l.id}>{l.quantity}× {l.nome}</span>)}<button type="button" onClick={() => setStep("cart")}>Editar</button></div>
                        <h3>Seus dados</h3>
                        <label>Nome completo<input autoComplete="name" required minLength={3} maxLength={100} value={dados.nome} onChange={(e) => atualizarDados({ nome: e.target.value })} placeholder="Seu nome" /></label>
                        <div className="form-two">
                          <label>WhatsApp / telefone<input type="tel" autoComplete="tel" required pattern="[0-9 \(\)\+\-]{10,22}" maxLength={22} value={dados.telefone} onChange={(e) => atualizarDados({ telefone: e.target.value })} placeholder="(11) 99999-9999" /></label>
                          <label>Carro <span>modelo, ano e motor</span><input maxLength={150} value={dados.veiculo} onChange={(e) => atualizarDados({ veiculo: e.target.value })} placeholder="Ex.: Uno 2010 1.0 Fire" /></label>
                        </div>
                        {pedidoOnline && <label>E-mail <span>para o pedido online</span><input type="email" autoComplete="email" maxLength={150} value={dados.email} onChange={(e) => atualizarDados({ email: e.target.value })} placeholder="voce@exemplo.com" /></label>}

                        <h3>Entrega</h3>
                        <div className="nl-entrega-opcoes" role="radiogroup" aria-label="Forma de entrega">
                          <label className={dados.entrega === "retirada" ? "ativo" : ""}><input type="radio" name="entrega" checked={dados.entrega === "retirada"} onChange={() => atualizarDados({ entrega: "retirada" })} /><b>Retirar na loja</b><small>{LOJA.endereco.logradouro}, {LOJA.endereco.numero} · Grátis</small></label>
                          <label className={dados.entrega !== "retirada" ? "ativo" : ""}><input type="radio" name="entrega" checked={dados.entrega !== "retirada"} onChange={() => atualizarDados({ entrega: opcaoFrete?.tipo === "entrega" ? "entrega" : "combinar" })} /><b>Receber no endereço</b><small>{opcaoFrete?.tipo === "entrega" ? `Motoboy da loja · ${money(opcaoFrete.valorCents)}` : frete ? "Fora do raio: frete combinado" : "Informe o CEP abaixo"}</small></label>
                        </div>
                        {precisaEndereco && (
                          <>
                            <CalculoFrete titulo="CEP de entrega" selecionada={opcaoFrete?.tipo === "retirada" ? null : opcaoFrete?.tipo ?? null} onResultado={aoFrete} />
                            <div className="form-two">
                              <label>Rua<input required autoComplete="address-line1" maxLength={120} value={dados.logradouro} onChange={(e) => atualizarDados({ logradouro: e.target.value })} /></label>
                              <label>Número<input required maxLength={12} value={dados.numero} onChange={(e) => atualizarDados({ numero: e.target.value })} /></label>
                            </div>
                            <div className="form-two">
                              <label>Complemento <span>opcional</span><input maxLength={60} value={dados.complemento} onChange={(e) => atualizarDados({ complemento: e.target.value })} placeholder="Oficina, sala, referência" /></label>
                              <label>Bairro<input required maxLength={60} value={dados.bairro} onChange={(e) => atualizarDados({ bairro: e.target.value })} /></label>
                            </div>
                          </>
                        )}

                        <h3>Pagamento <span className="nl-check-sub">na {dados.entrega === "retirada" ? "retirada" : "entrega"}, sem cobrança no site</span></h3>
                        <div className="nl-pagamentos" role="radiogroup" aria-label="Forma de pagamento">
                          {LOJA.pagamentos.map((p) => <label key={p} className={dados.pagamento === p ? "ativo" : ""}><input type="radio" name="pagamento" checked={dados.pagamento === p} onChange={() => atualizarDados({ pagamento: p })} />{p}</label>)}
                        </div>
                        <label>Observação <span>opcional</span><textarea maxLength={400} value={dados.obs} onChange={(e) => atualizarDados({ obs: e.target.value })} placeholder="Horário para entrega, código da peça antiga, dúvida…" /></label>
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
                  <div className="nl-totais">
                    <div><span>Subtotal ({count} {count === 1 ? "item" : "itens"})</span><strong>{money(subtotal)}</strong></div>
                    <div><span>Frete</span><strong>{dados.entrega === "retirada" ? "Grátis (retirada)" : valorFrete ? money(valorFrete) : "A combinar"}</strong></div>
                    <div className="nl-total"><span>Total{semPreco ? " parcial" : ""}</span><strong>{money(subtotal + valorFrete)}</strong></div>
                  </div>
                  {semPreco && <p className="subtle">Itens sem preço no site entram como "a consultar".</p>}
                  {error && <p role="alert" className="inline-error">{error}</p>}
                  {step === "cart" ? (
                    <button className="primary-button wide" onClick={() => { setError(""); setStep("checkout"); }}>Finalizar pedido <ArrowRight size={18} /></button>
                  ) : (
                    <>
                      <button type="submit" form="checkout-form" className="primary-button wide nl-botao-whats"><MessageCircle size={18} /> Enviar pedido pelo WhatsApp</button>
                      {pedidoOnline && (
                        <button type="button" className="nl-cart-whats" disabled={loading || linhas.some((l) => !l.product || l.quantity > l.product.stock)} onClick={submitOnline}>
                          {loading ? <LoaderCircle className="animate-spin" size={17} /> : <PackageCheck size={17} />} {loading ? "Enviando…" : "Enviar pelo site (aprovação online)"}
                        </button>
                      )}
                      <button className="text-button" onClick={() => setStep("cart")}>Voltar ao pedido</button>
                    </>
                  )}
                  <small>Pagamento na retirada ou entrega · Dúvidas: <a href={contatoWhats} target="_blank" rel="noopener noreferrer">{LOJA.telefone}</a></small>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
