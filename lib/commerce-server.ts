import { context } from "../worker/context";
import { operator } from "../worker/auth";
import { type Product } from "./catalog";
import { STORE, type Order } from "./commerce-contracts";
import { ZodError } from "zod";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function database() {
  const { env }=context();
  if (!env.DB)
    throw new HttpError(
      503,
      "A gestão está temporariamente indisponível. Tente novamente.",
    );
  return env.DB;
}
export async function owner() {
  const u = await operator();
  if (!u) throw new HttpError(401, "Entre no ambiente privado para continuar.");
  const tenant = context().env.STORE_OWNER;
  if (!tenant) throw new HttpError(503, "Loja não configurada.");
  return tenant;
}
export async function readJson(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "Envie os dados em JSON.");
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    throw new HttpError(403, "Origem da solicitação inválida.");
  if (Number(request.headers.get("content-length") || 0) > 24000)
    throw new HttpError(413, "Dados acima do limite.");
  const reader=request.body?.getReader();
  if(!reader)throw new HttpError(400,"Dados inválidos.");
  const chunks:Uint8Array[]=[];
  let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>24000){await reader.cancel();throw new HttpError(413,"Dados acima do limite.");}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const body=new TextDecoder().decode(bytes);
  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(400, "Dados inválidos.");
  }
}
export async function route(fn: () => Promise<Response>) {
  try {
    const original = await fn();
    const r = new Response(original.body, original);
    r.headers.set("Cache-Control", "no-store");
    return r;
  } catch (e) {
    if (e instanceof HttpError)
      return Response.json(
        { error: e.message },
        { status: e.status, headers: { "Cache-Control": "no-store" } },
      );
    if (e instanceof ZodError)
      return Response.json(
        {
          error: "Confira os campos do formulário.",
          fields: e.flatten().fieldErrors,
        },
        { status: 400 },
      );
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("commerce_products.stock"))
      return Response.json(
        {
          error:
            "O preço ou o estoque mudou. Atualize o carrinho e tente novamente.",
        },
        { status: 409 },
      );
    if (message.includes("UNIQUE constraint"))
      return Response.json(
        {
          error: "Este código já está cadastrado. Atualize e tente novamente.",
        },
        { status: 409 },
      );
    console.error("commerce-request-failed", message);
    return Response.json(
      {
        error:
          "Não foi possível concluir. Seus dados foram preservados; tente novamente.",
      },
      { status: 503 },
    );
  }
}
export function mapProduct(row: Record<string, unknown>): Product {
  return {
    id: String(row.id),
    sku: String(row.sku),
    name: String(row.name),
    brand: String(row.brand),
    category: String(row.category),
    priceCents: Number(row.price_cents),
    stock: Number(row.stock),
    image: String(row.image),
    description: String(row.description),
    published: !!row.published,
  };
}
export async function listProducts(user: string) {
  const result = await database()
    .prepare(
      "SELECT * FROM commerce_products WHERE owner=? AND store=? ORDER BY rowid",
    )
    .bind(user, STORE)
    .all<Record<string, unknown>>();
  return result.results.map(mapProduct);
}
// Explicit setup occurs on a user's first mutation; catalog GET never writes data.
export async function ensureCatalog(_user:string) { /* Catalogs are provisioned explicitly; no demo seeds on requests. */ }
export function mapOrder(r: Record<string, unknown>): Order {
  return {
    id: String(r.id),
    number: String(r.number),
    customerName: String(r.customer_name),
    email: String(r.email),
    phone: String(r.phone),
    vehicle: String(r.vehicle),
    note: String(r.note),
    items: JSON.parse(String(r.items_json)),
    totalCents: Number(r.total_cents),
    status: r.status as Order["status"],
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    revision: Number(r.revision),
    inventoryMode: (r.inventory_mode || "standalone") as Order["inventoryMode"],
    inventoryStatus: String(r.inventory_status || "LOCAL"),
    erpRevision: Number(r.erp_revision || 0),
    approvedBy: r.approved_by ? String(r.approved_by) : null,
    approvedAt: r.approved_at ? String(r.approved_at) : null,
    reservationExpiresAt: r.reservation_expires_at
      ? String(r.reservation_expires_at)
      : null,
  };
}
export async function findOrder(user: string, id: string) {
  const r = await database()
    .prepare("SELECT * FROM commerce_orders WHERE owner=? AND store=? AND id=?")
    .bind(user, STORE, id)
    .first<Record<string, unknown>>();
  if (!r) throw new HttpError(404, "Pedido não encontrado.");
  return mapOrder(r);
}
