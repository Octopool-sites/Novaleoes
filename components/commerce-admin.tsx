"use client";
import { useCallback, useEffect, useState, useRef } from "react";
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Users,
  Link2,
  ArrowUpRight,
  ArrowRight,
  RefreshCw,
  Search,
  Plus,
  Check,
  Clock3,
  Store,
  Download,
  LoaderCircle,
  Mail,
  Phone,
  CarFront,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
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
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Toaster, toast } from "sonner";
import { money, type Product } from "@/lib/catalog";
import {
  statuses,
  transitions,
  normalizeSearch,
  type Order,
  type Status,
} from "@/lib/commerce-contracts";
type View = "overview" | "orders" | "catalog" | "customers" | "integration";
const navigation = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "orders", label: "Pedidos", icon: ShoppingBag },
  { id: "catalog", label: "Catálogo", icon: Package },
  { id: "customers", label: "Clientes", icon: Users },
  { id: "integration", label: "Conexão com o ERP", icon: Link2 },
] as const;
const date = (d: string) =>
  new Date(d).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });
const day = (d: string) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(
    new Date(d),
  );
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const b = (await r.json()) as T & { error?: string };
  if (!r.ok) throw Error(b.error || "Não foi possível carregar os dados.");
  return b;
}
function Badge({ status }: { status: Status }) {
  return (
    <span className={`status-badge status-${status}`}>{statuses[status]}</span>
  );
}
function Nav({ view, setView }: { view: View; setView: (v: View) => void }) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenu>
      {navigation.map((n) => (
        <SidebarMenuItem key={n.id}>
          <SidebarMenuButton
            isActive={view === n.id}
            onClick={() => {
              setView(n.id);
              setOpenMobile(false);
            }}
            className="commerce-nav-button"
          >
            <n.icon />
            <span>{n.label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
const blankProduct: Product = {
  id: "",
  sku: "",
  name: "",
  brand: "",
  category: "Acessórios",
  priceCents: 0,
  stock: 0,
  image: "",
  description: "",
  published: false,
};
export default function CommerceAdmin({ name }: { name: string }) {
  const [approval, setApproval] = useState(false);
  const approvalAttempt=useRef<Record<string,string>>({});
  const [view, setView] = useState<View>("overview"),
    [orders, setOrders] = useState<Order[]>([]),
    [products, setProducts] = useState<Product[]>([]),
    [erpEnabled, setErpEnabled] = useState(false),
    [stockLink, setStockLink] = useState({
      stockIntegrationEnabled: false,
      configured: false,
      pending: 0,
    }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("ALL"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [selected, setSelected] = useState<Order | null>(null),
    [events, setEvents] = useState<{ status: Status; createdAt: string; actor?:string; detail?:string }[]>([]),
    [edit, setEdit] = useState<Product | null>(null),
    [editOriginal, setEditOriginal] = useState<Product | null>(null),
    [cancel, setCancel] = useState(false),
    [sheetError, setSheetError] = useState("");
  const [customer, setCustomer] = useState<string | null>(null);
  const refreshing = useRef(false);
  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const [o, c] = await Promise.all([
        api<{ orders: Order[] }>("/api/orders"),
        api<{
          erpAccessEnabled: boolean;
          stockIntegrationEnabled: boolean;
          configured: boolean;
          pending: number;
        }>("/api/integration"),
      ]);
      setOrders(o.orders);
      setErpEnabled(c.erpAccessEnabled);
      setStockLink(c);
      setLoading(false);
      let message = "";
      try {
        await api("/api/integration/reconcile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
      } catch {
        message =
          "A comunicação com o estoque está indisponível. Seus pedidos continuam salvos.";
      }
      const updated = await api<{ orders: Order[] }>("/api/orders");
      setOrders(updated.orders);
      setSelected((current) =>
        current
          ? updated.orders.find((o) => o.id === current.id) || current
          : null,
      );
      try {
        const p = await api<{ products: Product[] }>("/api/manage/catalog");
        setProducts(p.products);
      } catch {
        message =
          "Não foi possível consultar o estoque. Os pedidos continuam disponíveis.";
      }
      setError(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      refreshing.current = false;
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function openOrder(o: Order) {
    setSelected(o);
    setEvents([]);
    setSheetError("");
    try {
      const r = await api<{ order: Order; events: typeof events }>(
        `/api/orders/${o.id}`,
      );
      setSelected(r.order);
      setEvents(r.events);
    } catch (e) {
      setSheetError((e as Error).message);
    }
  }
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("pedido");
    if (id) {
      setView("orders");
      api<{ order: Order; events: typeof events }>(
        `/api/orders/${encodeURIComponent(id)}`,
      )
        .then((r) => {
          setSelected(r.order);
          setEvents(r.events);
        })
        .catch((e) => setError(e.message));
    }
  }, []);
  const active = orders.filter(
      (o) =>
        !["CANCELLED", "EXPIRED", "STOCK_REJECTED", "STOCK_PENDING"].includes(
          o.status,
        ),
    ),
    pending = orders.filter((o) => o.status === "AWAITING_APPROVAL");
  const filtered = orders.filter(
    (o) =>
      (status === "ALL" || o.status === status) &&
      (!from || day(o.createdAt) >= from) &&
      (!to || day(o.createdAt) <= to) &&
      normalizeSearch(`${o.number} ${o.customerName} ${o.email}`).includes(
        normalizeSearch(query),
      ),
  );
  const customers = Object.values(
    orders.reduce<
      Record<
        string,
        {
          name: string;
          email: string;
          phone: string;
          orders: number;
          total: number;
          last: string;
        }
      >
    >((acc, o) => {
      const key = o.email.toLowerCase();
      const existing = acc[key];
      acc[key] = {
        name: existing?.name || o.customerName,
        email: key,
        phone: existing?.phone || o.phone,
        orders: (existing?.orders || 0) + 1,
        total:
          (existing?.total || 0) +
          (["CANCELLED", "EXPIRED", "STOCK_REJECTED", "STOCK_PENDING"].includes(
            o.status,
          )
            ? 0
            : o.totalCents),
        last: existing?.last || o.createdAt,
      };
      return acc;
    }, {}),
  );
  async function changeStatus(next: Status) {
    if (!selected) return;
    setBusy(true);
    setSheetError("");
    try {
      const r = await api<{ order: Order }>(`/api/orders/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next, revision: selected.revision }),
      });
      setSelected(r.order);
      r.order.inventoryStatus === "PENDING"
        ? toast.info("Aguardando confirmação do estoque.")
        : toast.success(`Pedido ${statuses[r.order.status].toLowerCase()}.`);
      await refresh();
      await openOrder(r.order);
    } catch (e) {
      setSheetError((e as Error).message);
    } finally {
      setBusy(false);
      setCancel(false);
    }
  }
  async function approveSelected() {
    if(!selected||busy)return; setBusy(true);setSheetError("");
    const key=`${selected.id}:${selected.revision}`;approvalAttempt.current[key] ||= crypto.randomUUID();
    try { const r=await api<{order:Order}>(`/api/orders/${selected.id}/approve`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({revision:selected.revision,idempotency:approvalAttempt.current[key]})});
      toast.success(r.order.inventoryStatus === "PENDING" ? "Aprovação registrada. Aguardando confirmação do estoque." : "Venda aprovada e peças reservadas.");setApproval(false);await refresh();await openOrder(r.order);
    } catch(e){setSheetError((e as Error).message);setApproval(false);}finally{setBusy(false);}
  }
  async function saveProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setBusy(true);
    setSheetError("");
    const payload = {
      sku: edit.sku,
      name: edit.name,
      brand: edit.brand,
      category: edit.category,
      priceCents: edit.priceCents,
      stock: edit.stock,
      description: edit.description,
      published: edit.published,
      ...(edit.id
        ? {
            expectedStock: editOriginal?.stock,
            expectedPriceCents: editOriginal?.priceCents,
          }
        : {}),
    };
    try {
      await api(
        edit.id ? `/api/manage/catalog/${edit.id}` : "/api/manage/catalog",
        {
          method: edit.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      setEdit(null);
      toast.success("Peça salva no catálogo.");
      await refresh();
    } catch (e) {
      setSheetError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggleErp(enabled: boolean) {
    setBusy(true);
    try {
      await api("/api/integration", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ erpAccessEnabled: enabled }),
      });
      setErpEnabled(enabled);
      toast.success(
        enabled ? "Atalho do ERP habilitado." : "Atalho do ERP desabilitado.",
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function connectStock() {
    setBusy(true);
    try {
      await api("/api/integration", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockIntegrationEnabled: true }),
      });
      toast.success("Estoque conectado ao ERP.");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportOrder() {
    if (!selected) return;
    try {
      const r = await fetch(`/api/orders/${selected.id}/export`);
      if (!r.ok) throw Error("Falha ao exportar o pedido.");
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selected.number}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setSheetError((e as Error).message);
    }
  }
  function ordersTable(list: Order[]) {
    return list.length ? (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pedido</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Recebido em</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>
              <span className="sr-only">Abrir</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((o) => (
            <TableRow key={o.id}>
              <TableCell>
                <button className="order-number" onClick={() => openOrder(o)}>
                  {o.number}
                </button>
                <small className="table-caption">Loja online</small>
              </TableCell>
              <TableCell>
                {o.customerName}
                <small className="table-caption">
                  {o.items.reduce((s, i) => s + i.quantity, 0)} itens
                </small>
              </TableCell>
              <TableCell>{date(o.createdAt)}</TableCell>
              <TableCell>
                <Badge status={o.status} />
              </TableCell>
              <TableCell className="text-right font-semibold">
                {money(o.totalCents)}
              </TableCell>
              <TableCell>
                <button
                  className="icon-button"
                  aria-label={`Abrir pedido ${o.number}`}
                  onClick={() => openOrder(o)}
                >
                  <ChevronRight size={18} />
                </button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    ) : (
      <div className="empty-state">
        <ShoppingBag size={36} />
        <h3>
          {orders.length
            ? "Nenhum pedido neste filtro"
            : "Tudo pronto para o primeiro pedido."}
        </h3>
        <p>
          {orders.length
            ? "Ajuste a busca, o período ou a situação."
            : "Os pedidos enviados pela loja aparecerão aqui aguardando aprovação."}
        </p>
        <a className="secondary-button" href="/">
          Ir para a loja <ArrowUpRight size={16} />
        </a>
      </div>
    );
  }
  return (
    <SidebarProvider className="commerce-admin">
      <Toaster richColors />
      <Sidebar className="commerce-sidebar">
        <SidebarHeader>
          <a className="octopool-brand" href="/gestao">
            octopool<span>commerce</span>
          </a>
          <div className="sidebar-store">
            <img src="/assets/logo.png" alt="" />
            <div>
              <b>Nova Leões</b>
              <small>Autopeças · loja piloto</small>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent className="px-3 pt-5">
          <p className="sidebar-label">SUA OPERAÇÃO ONLINE</p>
          <Nav
            view={view}
            setView={(v) => {
              setView(v);
              setQuery("");
            }}
          />
        </SidebarContent>
        <SidebarFooter>
          <a className="sidebar-store-link" href="/">
            Ver minha loja <ArrowUpRight size={17} />
          </a>
          {erpEnabled && (
            <a
              className="sidebar-store-link"
              href="https://app.octopool.com.br"
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir ERP <ArrowUpRight size={17} />
            </a>
          )}
          <div className="sandbox-label">
            <ShieldCheck size={16} />
            Ambiente de validação
          </div>
          <p className="sidebar-user" title={name}>
            {name}
          </p>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="admin-topbar">
          <div>
            <SidebarTrigger />
            <span>Commerce</span>
            <ChevronRight size={14} />
            <b>{navigation.find((n) => n.id === view)?.label}</b>
          </div>
          <span className="pilot-badge">PILOTO · SEM COBRANÇA</span>
        </header>
        <main className="admin-main">
          <div className="admin-heading">
            <div>
              <p className="eyebrow">NOVA LEÕES AUTOPEÇAS</p>
              <h1>
                {view === "overview"
                  ? "Sua loja, em movimento."
                  : navigation.find((n) => n.id === view)?.label}
              </h1>
              <p>
                {view === "overview"
                  ? "Uma visão simples do que acontece no seu e-commerce."
                  : view === "orders"
                    ? "Do primeiro contato à retirada. Cada pedido em seu lugar."
                    : view === "catalog"
                      ? "Você escolhe o que aparece na sua loja."
                      : view === "customers"
                        ? "Os clientes que chegaram pela sua loja online."
                        : "Dois produtos independentes. Você escolhe quando conectar."}
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="secondary-button"
                onClick={() => {
                  setLoading(true);
                  void refresh();
                }}
                disabled={loading}
              >
                <RefreshCw
                  size={16}
                  className={loading ? "animate-spin" : ""}
                />
                <span>Atualizar</span>
              </button>
              {view === "catalog" ? (
                <button
                  className="purple-button"
                  disabled={stockLink.stockIntegrationEnabled}
                  onClick={() => {
                    setEdit({ ...blankProduct });
                    setEditOriginal(null);
                    setSheetError("");
                  }}
                >
                  <Plus size={17} />
                  Nova peça
                </button>
              ) : (
                <a className="purple-button" href="/">
                  Ver loja <ArrowUpRight size={17} />
                </a>
              )}
            </div>
          </div>
          {error && (
            <div className="inline-error" role="alert">
              {error}
              <button onClick={refresh}>Tentar novamente</button>
            </div>
          )}
          {loading && !orders.length && !products.length ? (
            <div className="empty-state">
              <LoaderCircle className="animate-spin" size={30} />
              <p>Carregando sua operação…</p>
            </div>
          ) : (
            <>
              {view === "overview" && (
                <>
                  <div className="kpi-grid">
                    <article>
                      <span>
                        Pedidos recebidos <ShoppingBag size={18} />
                      </span>
                      <strong>{orders.length}</strong>
                      <small>Pedidos recebidos pela loja</small>
                    </article>
                    <article>
                      <span>
                        Aguardando confirmação <Clock3 size={18} />
                      </span>
                      <strong>{pending.length}</strong>
                      <small>
                        {pending.length
                          ? "Precisam da sua atenção"
                          : "Tudo em dia por aqui"}
                      </small>
                    </article>
                    <article>
                      <span>
                        Valor em pedidos <span>R$</span>
                      </span>
                      <strong>
                        {money(active.reduce((s, o) => s + o.totalCents, 0))}
                      </strong>
                      <small>Demonstrativo · exclui cancelados</small>
                    </article>
                    <article>
                      <span>
                        Peças publicadas <Package size={18} />
                      </span>
                      <strong>
                        {products.filter((p) => p.published).length}
                        <em> / {products.length}</em>
                      </strong>
                      <small>Disponíveis na vitrine</small>
                    </article>
                  </div>
                  <div className="admin-two-col">
                    <section className="admin-card orders-card">
                      <div className="card-heading">
                        <div>
                          <h2>Últimos pedidos</h2>
                          <p>Chegam direto da sua loja online.</p>
                        </div>
                        <button onClick={() => setView("orders")}>
                          Ver todos <ArrowRight size={15} />
                        </button>
                      </div>
                      {ordersTable(orders.slice(0, 5))}
                    </section>
                    <section className="admin-card operation-card">
                      <div className="card-heading">
                        <div>
                          <h2>Seu fluxo de pedidos</h2>
                          <p>Uma etapa de cada vez.</p>
                        </div>
                      </div>
                      {(
                        [
                          "AWAITING_APPROVAL",
                          "NEW",
                          "CONFIRMED",
                          "PACKING",
                          "READY",
                          "COMPLETED",
                        ] as Status[]
                      ).map((s, i) => (
                        <button
                          className="workflow-row"
                          key={s}
                          onClick={() => {
                            setView("orders");
                            setStatus(s);
                          }}
                        >
                          <span className="workflow-step">{i + 1}</span>
                          <span>{statuses[s]}</span>
                          <b>{orders.filter((o) => o.status === s).length}</b>
                          <ChevronRight size={15} />
                        </button>
                      ))}
                      <div className="flow-note">
                        <Check size={15} />
                        Pedidos salvos no e-commerce.
                      </div>
                    </section>
                  </div>
                  <div className="integration-summary">
                    <div className="integration-icon">
                      <Link2 size={24} />
                    </div>
                    <div>
                      <h3>Seu e-commerce funciona por conta própria.</h3>
                      <p>
                        O ERP Octopool pode ser conectado quando a operação
                        estiver pronta.
                      </p>
                    </div>
                    <button onClick={() => setView("integration")}>
                      Ver conexão <ArrowRight size={17} />
                    </button>
                  </div>
                </>
              )}
              {view === "orders" && (
                <section className="admin-card">
                  <div className="order-filters">
                    <label className="admin-search">
                      <Search size={18} />
                      <input
                        placeholder="Buscar pedido ou cliente"
                        aria-label="Buscar pedido ou cliente"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <label>
                      Situação
                      <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">
                            Todas as situações
                          </SelectItem>
                          {Object.entries(statuses).map(([k, v]) => (
                            <SelectItem key={k} value={k}>
                              {v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                    <label>
                      De
                      <input
                        type="date"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                      />
                    </label>
                    <label>
                      Até
                      <input
                        type="date"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                      />
                    </label>
                  </div>
                  {from && to && from > to && (
                    <p className="inline-error">
                      A data final precisa ser igual ou posterior à inicial.
                    </p>
                  )}
                  {ordersTable(filtered)}
                  <div className="table-footer">
                    {filtered.length} pedidos · últimos 300 registros · horários
                    de Brasília
                  </div>
                </section>
              )}
              {view === "catalog" && (
                <section className="admin-card">
                  <div className="card-heading">
                    <div>
                      <h2>Catálogo da loja</h2>
                      <p>
                        {stockLink.stockIntegrationEnabled
                          ? "Preços e disponibilidade consultados no ERP. As alterações são feitas por lá."
                          : "Estoque próprio do Commerce. As peças são reservadas somente após a aprovação da venda."}
                      </p>
                    </div>
                    <label className="admin-search">
                      <Search size={17} />
                      <input
                        aria-label="Buscar peça no catálogo"
                        placeholder="Buscar peça ou código"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Peça</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Preço</TableHead>
                        <TableHead>Disponível</TableHead>
                        <TableHead>Na loja</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products
                        .filter((p) =>
                          normalizeSearch(`${p.name} ${p.sku}`).includes(
                            normalizeSearch(query),
                          ),
                        )
                        .map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>
                              <div className="catalog-name">
                                {p.image ? (
                                  <img src={p.image} alt="" />
                                ) : (
                                  <Package size={30} />
                                )}
                                <div>
                                  <b>{p.name}</b>
                                  <small>
                                    {p.brand} · {p.sku}
                                  </small>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>{p.category}</TableCell>
                            <TableCell>{money(p.priceCents)}</TableCell>
                            <TableCell>{p.stock} un.</TableCell>
                            <TableCell>
                              <span
                                className={`status-badge ${p.published ? "status-COMPLETED" : "status-CANCELLED"}`}
                              >
                                {p.published ? "Publicada" : "Oculta"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <button
                                className="edit-button"
                                disabled={stockLink.stockIntegrationEnabled}
                                title={
                                  stockLink.stockIntegrationEnabled
                                    ? "Altere preço e estoque no ERP"
                                    : undefined
                                }
                                onClick={() => {
                                  setEdit({ ...p });
                                  setEditOriginal({ ...p });
                                  setSheetError("");
                                }}
                              >
                                Editar
                              </button>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </section>
              )}
              {view === "customers" && (
                <section className="admin-card">
                  <div className="card-heading">
                    <div>
                      <h2>Clientes do e-commerce</h2>
                      <p>
                        Contatos originados nos últimos 300 pedidos da loja.
                      </p>
                    </div>
                    <label className="admin-search">
                      <Search size={17} />
                      <input
                        aria-label="Buscar cliente"
                        placeholder="Buscar cliente ou e-mail"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                  </div>
                  {customers.length ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Contato</TableHead>
                          <TableHead>Pedidos</TableHead>
                          <TableHead>Último pedido</TableHead>
                          <TableHead>Total em pedidos</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customers
                          .filter((c) =>
                            normalizeSearch(`${c.name} ${c.email}`).includes(
                              normalizeSearch(query),
                            ),
                          )
                          .map((c) => (
                            <TableRow key={c.email}>
                              <TableCell>
                                <button
                                  className="order-number"
                                  onClick={() => setCustomer(c.email)}
                                >
                                  {c.name}
                                </button>
                              </TableCell>
                              <TableCell>
                                {c.email}
                                <small className="table-caption">
                                  {c.phone}
                                </small>
                              </TableCell>
                              <TableCell>{c.orders}</TableCell>
                              <TableCell>{date(c.last)}</TableCell>
                              <TableCell>{money(c.total)}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="empty-state">
                      <Users size={38} />
                      <h3>Os primeiros clientes chegam com os pedidos.</h3>
                      <p>Os contatos ficam organizados aqui automaticamente.</p>
                    </div>
                  )}
                </section>
              )}
              {view === "integration" && (
                <div className="integration-page">
                  <section className="admin-card integration-main">
                    <div className="integration-diagram">
                      <div>
                        <Store />
                        <b>Loja Nova Leões</b>
                        <small>Vitrine e pedidos</small>
                      </div>
                      <ArrowRight />
                      <div className="selected-system">
                        <ShoppingBag />
                        <b>Octopool Commerce</b>
                        <small>Gestão do e-commerce</small>
                      </div>
                      <span className="optional-connector">
                        opcional
                        <br />
                        ········
                      </span>
                      <div>
                        <LayoutDashboard />
                        <b>Octopool ERP</b>
                        <small>Estoque da loja física</small>
                      </div>
                    </div>
                    <div className="integration-copy">
                      <span className="status-badge status-NEW">
                        {stockLink.stockIntegrationEnabled
                          ? "Estoque integrado"
                          : "Estoque independente"}
                      </span>
                      <h2>Uma peça. Um saldo disponível.</h2>
                      <p>
                        {stockLink.stockIntegrationEnabled
                          ? "Balcão e loja online consultam o mesmo estoque. A confirmação depende da reserva no ERP."
                          : "O Commerce funciona sozinho. A conexão opcional faz o ERP controlar a disponibilidade das peças vinculadas."}
                      </p>
                      <div className="setting-row">
                        <div>
                          <b>Mostrar acesso ao ERP</b>
                          <p>Exibe “Abrir ERP” no menu desta área.</p>
                        </div>
                        <Switch
                          checked={erpEnabled}
                          disabled={busy}
                          onCheckedChange={toggleErp}
                          aria-label="Mostrar acesso ao ERP"
                        />
                      </div>
                      <div className="connection-next">
                        <h3>
                          {stockLink.stockIntegrationEnabled
                            ? "Comunicação de estoque"
                            : "Conectar estoque"}
                        </h3>
                        <p>
                          {stockLink.stockIntegrationEnabled
                            ? stockLink.pending
                              ? stockLink.pending +
                                " operação(ões) aguardando comunicação. As tentativas serão retomadas com o mesmo identificador."
                              : "Nenhuma operação pendente de comunicação."
                            : stockLink.configured
                              ? "A conexão está configurada. Encerre os pedidos do estoque próprio antes de alterar o modo."
                              : "A conexão precisa ser configurada e as peças conferidas antes da ativação."}
                        </p>
                        {!stockLink.stockIntegrationEnabled && (
                          <button
                            className="purple-button"
                            disabled={busy || !stockLink.configured}
                            onClick={connectStock}
                          >
                            Conectar estoque ao ERP
                          </button>
                        )}
                        {stockLink.stockIntegrationEnabled && (
                          <button
                            className="secondary-button"
                            disabled={busy}
                            onClick={() => refresh()}
                          >
                            Conferir comunicação
                          </button>
                        )}
                        <ul>
                          <li>
                            Reserva ao receber o pedido; baixa na retirada.
                          </li>
                          <li>Cancelamento libera a reserva uma única vez.</li>
                          <li>Sem resposta do ERP, a confirmação aguarda.</li>
                        </ul>
                      </div>
                    </div>
                  </section>
                  <section className="admin-card integration-principles">
                    <h2>Uma conexão sob controle.</h2>
                    <p>
                      <Check />
                      Vínculo exclusivo da empresa.
                    </p>
                    <p>
                      <Check />
                      Ativação começa desligada.
                    </p>
                    <p>
                      <Check />
                      Histórico preservado nos dois sistemas.
                    </p>
                    <p>
                      <Check />
                      Pagamentos e emissão fiscal são etapas próprias.
                    </p>
                  </section>
                </div>
              )}
            </>
          )}
        </main>
        <footer className="admin-footer">
          Octopool Commerce · Piloto Nova Leões{" "}
          <span>Catálogo, pedidos e clientes em um ambiente próprio.</span>
        </footer>
      </SidebarInset>
      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="order-sheet sm:max-w-[620px] w-full">
          <SheetHeader>
            <SheetTitle>{selected?.number}</SheetTitle>
            <SheetDescription>
              Pedido da loja online · Nova Leões
            </SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="order-detail-scroll">
              <div className="order-detail-status">
                <Badge status={selected.status} />
                <span>{date(selected.createdAt)}</span>
              </div>
              {selected.status === "AWAITING_APPROVAL" && <div className="inline-notice">Pedido aguardando sua conferência. Nenhuma peça foi reservada ou baixada.</div>}
              {selected.approvedBy && <div className="inline-notice">Aprovação registrada por {selected.approvedBy}{selected.approvedAt ? ` em ${date(selected.approvedAt)}` : ""}.</div>}
              {selected.inventoryMode === "erp" && selected.status !== "AWAITING_APPROVAL" && (
                <div className="inline-notice">
                  {selected.inventoryStatus === "PENDING"
                    ? "A comunicação está pendente. O pedido será conferido antes de avançar."
                    : selected.status === "NEW"
                      ? "Peças reservadas no ERP. Confirme o pedido antes do vencimento."
                      : "Este pedido usa o estoque compartilhado com o ERP."}
                  {selected.status === "NEW" &&
                    selected.reservationExpiresAt && (
                      <p>Reserva até {date(selected.reservationExpiresAt)}.</p>
                    )}
                  <button
                    className="text-button"
                    onClick={() => openOrder(selected)}
                  >
                    Conferir estoque do pedido
                  </button>
                </div>
              )}
              <section className="detail-block">
                <h3>Cliente</h3>
                <b>{selected.customerName}</b>
                <p>
                  <Mail size={15} />
                  {selected.email}
                </p>
                <p>
                  <Phone size={15} />
                  {selected.phone}
                </p>
                {selected.vehicle && (
                  <p>
                    <CarFront size={15} />
                    {selected.vehicle}
                  </p>
                )}
                {selected.note && (
                  <div className="customer-note">{selected.note}</div>
                )}
              </section>
              <section className="detail-block">
                <h3>Peças do pedido</h3>
                {selected.items.map((i) => (
                  <div className="order-item" key={i.productId}>
                    {i.image ? <img src={i.image} alt="" /> : <Package />}
                    <div>
                      <b>{i.name}</b>
                      <small>
                        {i.sku} · {i.quantity} × {money(i.priceCents)}
                      </small>
                    </div>
                    <strong>{money(i.priceCents * i.quantity)}</strong>
                  </div>
                ))}
                <div className="receipt-row">
                  <span>Total do pedido</span>
                  <strong>{money(selected.totalCents)}</strong>
                </div>
              </section>
              <section className="detail-block">
                <h3>Histórico</h3>
                {events.map((e, i) => (
                  <div className="timeline-event" key={`${e.createdAt}-${i}`}>
                    <span />
                    <div>
                      <b>{statuses[e.status]}</b>
                      <small>{date(e.createdAt)}</small>
                      {e.actor && <small>{e.actor === "CUSTOMER" ? "Solicitação do cliente" : e.actor}</small>}
                      {e.detail && <small>{e.detail}</small>}
                    </div>
                  </div>
                ))}
              </section>
              {sheetError && (
                <p className="inline-error" role="alert">
                  {sheetError}
                </p>
              )}
              <div className="order-actions">
                {transitions[selected.status]
                  .filter((s) => s !== "CANCELLED")
                  .map((s) => (
                    <button
                      key={s}
                      disabled={busy || selected.inventoryStatus === "PENDING"}
                      className="purple-button wide"
                      onClick={() => selected.status === "AWAITING_APPROVAL" ? setApproval(true) : changeStatus(s)}
                    >
                      {busy ? (
                        <LoaderCircle className="animate-spin" size={18} />
                      ) : (
                        <Check size={18} />
                      )}
                      {selected.status === "AWAITING_APPROVAL" ? "Aprovar venda" : `Marcar como ${statuses[s].toLowerCase()}`}
                    </button>
                  ))}
                <button className="secondary-button wide" onClick={exportOrder}>
                  <Download size={17} />
                  Exportar pedido
                </button>
                {transitions[selected.status].includes("CANCELLED") && (
                  <button
                    className="danger-text"
                    disabled={busy || selected.inventoryStatus === "PENDING"}
                    onClick={() => setCancel(true)}
                  >
                    Cancelar pedido
                  </button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
      <AlertDialog open={approval} onOpenChange={setApproval}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Aprovar esta venda?</AlertDialogTitle><AlertDialogDescription>Confira cliente, peças, quantidades e total. A aprovação será registrada em seu nome e iniciará a reserva de estoque. A baixa definitiva ocorrerá ao concluir a retirada.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Conferir novamente</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={approveSelected}>Aprovar e reservar peças</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={cancel} onOpenChange={setCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar este pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              {selected?.inventoryMode === "erp"
                ? "A reserva será liberada no ERP. O histórico será preservado nos dois sistemas."
                : "As quantidades reservadas voltarão ao estoque do Commerce. O histórico será preservado."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter pedido</AlertDialogCancel>
            <AlertDialogAction onClick={() => changeStatus("CANCELLED")}>
              Cancelar pedido
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent className="edit-product-dialog sm:max-w-[630px]">
          <DialogTitle>{edit?.id ? "Editar peça" : "Nova peça"}</DialogTitle>
          <DialogDescription>
            Catálogo do e-commerce. Confira os dados antes de publicar.
          </DialogDescription>
          {edit && (
            <form className="checkout-form" onSubmit={saveProduct}>
              <label>
                Nome da peça
                <input
                  required
                  minLength={3}
                  maxLength={140}
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                />
              </label>
              <div className="form-two">
                <label>
                  Código
                  <input
                    required
                    maxLength={40}
                    value={edit.sku}
                    onChange={(e) => setEdit({ ...edit, sku: e.target.value })}
                  />
                </label>
                <label>
                  Marca
                  <input
                    required
                    maxLength={80}
                    value={edit.brand}
                    onChange={(e) =>
                      setEdit({ ...edit, brand: e.target.value })
                    }
                  />
                </label>
              </div>
              <label>
                Categoria
                <input
                  required
                  maxLength={50}
                  value={edit.category}
                  onChange={(e) =>
                    setEdit({ ...edit, category: e.target.value })
                  }
                />
              </label>
              <div className="form-two">
                <label>
                  Preço (R$)
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="1000000"
                    required
                    value={edit.priceCents / 100 || ""}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        priceCents: Math.round(Number(e.target.value) * 100),
                      })
                    }
                  />
                </label>
                <label>
                  Quantidade disponível
                  <input
                    type="number"
                    min="0"
                    max="100000"
                    step="1"
                    required
                    value={edit.stock}
                    onChange={(e) =>
                      setEdit({ ...edit, stock: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <label>
                Descrição
                <textarea
                  maxLength={1500}
                  value={edit.description}
                  onChange={(e) =>
                    setEdit({ ...edit, description: e.target.value })
                  }
                />
              </label>
              <div className="setting-row">
                <div>
                  <b>Publicar na loja</b>
                  <p>Peças ocultas ficam apenas na gestão.</p>
                </div>
                <Switch
                  checked={edit.published}
                  onCheckedChange={(v) => setEdit({ ...edit, published: v })}
                  aria-label="Publicar peça na loja"
                />
              </div>
              {sheetError && (
                <p role="alert" className="inline-error">
                  {sheetError}
                </p>
              )}
              <button className="purple-button wide" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="animate-spin" size={17} />
                ) : (
                  <Check size={17} />
                )}
                Salvar peça
              </button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!customer} onOpenChange={(v) => !v && setCustomer(null)}>
        <DialogContent className="sm:max-w-[850px]">
          <DialogTitle>Pedidos do cliente</DialogTitle>
          <DialogDescription>{customer}</DialogDescription>
          {ordersTable(
            orders.filter((o) => o.email.toLowerCase() === customer),
          )}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
