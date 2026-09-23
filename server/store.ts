import { randomUUID } from "node:crypto";
import type { DocumentSnapshot, Transaction } from "@google-cloud/firestore";
import type { z } from "zod";
import { mapOrder, mapProduct, HttpError } from "../lib/commerce-server.js";
import { STORE, transitions, type Order, type Status, orderInput, productInput } from "../lib/commerce-contracts.js";
import type { Product } from "../lib/catalog.js";
import { keyId, requireScopedRow, type Row, type StoreContext } from "./types.js";

type OrderInput = z.infer<typeof orderInput>;
type ProductInput = z.infer<typeof productInput>;
type ApprovalInput = { revision: number; idempotency: string };

function reference(ctx: StoreContext, collection: string, id: string) {
  if (!id || id.length > 200 || id.includes("/") || id === "." || id === "..")
    throw new HttpError(404, "Registro não encontrado.");
  return ctx.ref.collection(collection).doc(id);
}

function data(ctx: StoreContext, snapshot: DocumentSnapshot, missing = "Registro não encontrado.") {
  if (!snapshot.exists) throw new HttpError(404, missing);
  const row = requireScopedRow(ctx, snapshot.data());
  if (row.id !== snapshot.id) throw new Error("STORE_RECORD_ID_MISMATCH");
  return row;
}

async function transactionSettings(ctx: StoreContext, tx: Transaction) {
  const snapshot = await tx.get(ctx.ref);
  if (!snapshot.exists) throw new HttpError(503, "Loja não configurada.");
  return requireScopedRow(ctx, snapshot.data());
}

function keyRow(ctx: StoreContext, kind: string, value: string, targetId: string): Row {
  return { owner: ctx.owner, store: STORE, kind, value, target_id: targetId };
}

function keyTarget(ctx: StoreContext, snapshot: DocumentSnapshot, kind: string, value: string): string | null {
  if (!snapshot.exists) return null;
  const row = requireScopedRow(ctx, snapshot.data());
  if (row.kind !== kind || row.value !== value || typeof row.target_id !== "string")
    throw new Error("INVALID_UNIQUENESS_RECORD");
  return row.target_id;
}

function event(ctx: StoreContext, orderId: string, status: string, now: string, actor: string, detail: string): Row {
  return { id: randomUUID(), owner: ctx.owner, store: STORE, order_id: orderId, status, created_at: now, actor, detail };
}

function writeEvent(ctx: StoreContext, tx: Transaction, row: Row) {
  tx.create(ctx.ref.collection("events").doc(row.id), row);
}

export async function getSettings(ctx: StoreContext): Promise<Row> {
  const snapshot = await ctx.ref.get();
  if (!snapshot.exists) throw new HttpError(503, "Loja não configurada.");
  return requireScopedRow(ctx, snapshot.data());
}

export async function listProducts(ctx: StoreContext): Promise<Product[]> {
  const snapshots = await ctx.ref.collection("products").get();
  const rows = snapshots.docs.map((snapshot) => data(ctx, snapshot));
  rows.sort((a, b) => Number(a._position ?? a.rowid ?? 0) - Number(b._position ?? b.rowid ?? 0) || String(a.id).localeCompare(String(b.id)));
  return rows.map(mapProduct);
}

export async function findOrderRow(ctx: StoreContext, id: string): Promise<Row> {
  return data(ctx, await reference(ctx, "orders", id).get(), "Pedido não encontrado.");
}

export async function findOrder(ctx: StoreContext, id: string): Promise<Order> {
  return mapOrder(await findOrderRow(ctx, id));
}

export async function listOrders(ctx: StoreContext): Promise<Order[]> {
  const rows = await ctx.ref.collection("orders").orderBy("created_at", "desc").limit(300).get();
  return rows.docs.map((snapshot) => mapOrder(data(ctx, snapshot)));
}

export async function listEvents(ctx: StoreContext, id: string) {
  await findOrderRow(ctx, id);
  const snapshots = await ctx.ref.collection("events").where("order_id", "==", id).get();
  return snapshots.docs.map((snapshot) => data(ctx, snapshot))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)))
    .map((row) => ({ status: row.status, createdAt: row.created_at, actor: row.actor ?? null, detail: row.detail ?? null }));
}

export async function submitOrder(ctx: StoreContext, input: OrderInput): Promise<{ order: Order; replayed: boolean }> {
  const fingerprint = JSON.stringify({ ...input, idempotency: undefined, items: [...input.items].sort((a, b) => a.productId.localeCompare(b.productId)) });
  const id = randomUUID();
  const orderRef = reference(ctx, "orders", id);
  const keyRef = ctx.ref.collection("keys").doc(keyId("idempotency", input.idempotency));
  return ctx.db.runTransaction(async (tx) => {
    const settings = await transactionSettings(ctx, tx);
    const previousId = keyTarget(ctx, await tx.get(keyRef), "idempotency", input.idempotency);
    if (previousId) {
      const previous = data(ctx, await tx.get(reference(ctx, "orders", previousId)), "Pedido não encontrado.");
      if (previous.fingerprint !== fingerprint) throw new HttpError(409, "Esta tentativa já foi usada com outros dados.");
      return { order: mapOrder(previous), replayed: true };
    }
    const integrated = !!settings.stock_integration_enabled;
    if (ctx.env.REQUIRE_SHARED_STOCK === "1" && !integrated)
      throw new HttpError(503, "A loja está preparando o atendimento online. Tente novamente em breve.");
    const products = await tx.getAll(...input.items.map((item) => reference(ctx, "products", item.productId)));
    const items = input.items.map((item, i) => {
      const snapshot = products[i];
      const p = snapshot.exists ? mapProduct(data(ctx, snapshot)) : null;
      if (!p || !p.published || p.priceCents <= 0)
        throw new HttpError(400, "Uma peça não está mais disponível. Atualize o carrinho.");
      return { productId: p.id, name: p.name, sku: p.sku, image: p.image, quantity: item.quantity, priceCents: p.priceCents };
    });
    const now = new Date().toISOString();
    const row: Row = {
      id, owner: ctx.owner, store: STORE, idempotency: input.idempotency, fingerprint,
      number: `NL-${id.slice(0, 8).toUpperCase()}`, customer_name: input.customerName,
      email: input.email, phone: input.phone, vehicle: input.vehicle, note: input.note,
      items_json: JSON.stringify(items), total_cents: items.reduce((sum, item) => sum + item.quantity * item.priceCents, 0),
      status: "AWAITING_APPROVAL", created_at: now, updated_at: now, revision: 0,
      inventory_mode: integrated ? "erp" : "standalone", inventory_status: "UNRESERVED", erp_revision: 0,
      reservation_expires_at: null, approved_by: null, approved_at: null, approval_key: null,
    };
    // Both intake and mode changes write this guard. An integration toggle cannot
    // miss an order being created concurrently, including an empty-query race.
    tx.update(ctx.ref, { _order_guard: Number(settings._order_guard ?? 0) + 1 });
    tx.create(keyRef, keyRow(ctx, "idempotency", input.idempotency, id));
    tx.create(orderRef, row);
    writeEvent(ctx, tx, event(ctx, id, row.status, now, "CUSTOMER", "Pedido recebido; nenhum estoque reservado"));
    return { order: mapOrder(row), replayed: false };
  });
}

export async function approveOrderRecord(
  ctx: StoreContext, id: string, body: ApprovalInput, actorEmail: string, validatedCatalog: Product[],
): Promise<{ order: Order; job?: Row; replayed: boolean }> {
  if (!actorEmail) throw new HttpError(403, "Responsável não identificado.");
  const orderRef = reference(ctx, "orders", id);
  const approvalRef = ctx.ref.collection("keys").doc(keyId("approval", body.idempotency));
  const jobId = randomUUID();
  return ctx.db.runTransaction(async (tx) => {
    const settings = await transactionSettings(ctx, tx);
    const row = data(ctx, await tx.get(orderRef), "Pedido não encontrado.");
    const approvedId = keyTarget(ctx, await tx.get(approvalRef), "approval", body.idempotency);
    if (approvedId && approvedId !== id) throw new HttpError(409, "Esta aprovação já foi usada em outro pedido.");
    if (row.approval_key === body.idempotency) {
      if (row.approved_by !== actorEmail) throw new HttpError(403, "Aprovação pertence a outro responsável.");
      return { order: mapOrder(row), replayed: true };
    }
    if (approvedId || row.status !== "AWAITING_APPROVAL" || row.revision !== body.revision || row.approved_by || row.approved_at)
      throw new HttpError(409, "O pedido mudou ou já foi aprovado. Atualize antes de continuar.");
    const integrated = !!settings.stock_integration_enabled;
    if (integrated !== (row.inventory_mode === "erp"))
      throw new HttpError(409, "A configuração de estoque mudou. Confira este pedido antes de aprovar.");
    const order = mapOrder(row);
    const productRefs = order.items.map((item) => reference(ctx, "products", item.productId));
    const productSnapshots = await tx.getAll(...productRefs);
    const nextRevision = Number(row.revision) + 1;
    const revisionValue = `${id}:${nextRevision}`;
    const revisionRef = ctx.ref.collection("keys").doc(keyId("job-revision", revisionValue));
    if (integrated && keyTarget(ctx, await tx.get(revisionRef), "job-revision", revisionValue))
      throw new HttpError(409, "O pedido já tem uma operação de estoque. Atualize antes de continuar.");
    const products = productSnapshots.map((snapshot) => snapshot.exists ? mapProduct(data(ctx, snapshot)) : null);
    for (let i = 0; i < order.items.length; i++) {
      const item = order.items[i], local = products[i];
      const available = integrated ? validatedCatalog.find((p) => p.id === item.productId) : local;
      if (!local?.published || !available?.published || available.stock < item.quantity)
        throw new HttpError(409, `Estoque insuficiente para ${item.name}. Nenhuma reserva foi realizada.`);
      if (local.priceCents !== item.priceCents || available.priceCents !== item.priceCents)
        throw new HttpError(409, `O preço de ${item.name} mudou. Confirme o novo valor com o cliente e solicite um novo pedido.`);
    }
    const now = new Date().toISOString();
    const updated: Row = { ...row, status: integrated ? "STOCK_PENDING" : "CONFIRMED", approved_by: actorEmail,
      approved_at: now, approval_key: body.idempotency, inventory_status: integrated ? "PENDING" : "LOCAL_RESERVED",
      updated_at: now, revision: nextRevision };
    let job: Row | undefined;
    if (integrated) {
      job = { id: jobId, owner: ctx.owner, store: STORE, order_id: id, local_revision: nextRevision,
        action: "RESERVE", payload: JSON.stringify({ externalOrderId: id, items: order.items.map((item) => ({ externalId: item.productId, quantity: item.quantity, priceCents: item.priceCents })) }),
        state: "PENDING", attempts: 0, last_error: null, created_at: now, updated_at: now };
      tx.create(ctx.ref.collection("jobs").doc(jobId), job);
      tx.create(revisionRef, keyRow(ctx, "job-revision", revisionValue, jobId));
    } else {
      for (let i = 0; i < order.items.length; i++)
        tx.update(productRefs[i], { stock: products[i]!.stock - order.items[i].quantity });
    }
    tx.create(approvalRef, keyRow(ctx, "approval", body.idempotency, id));
    tx.set(orderRef, updated);
    writeEvent(ctx, tx, event(ctx, id, updated.status, now, actorEmail, "Venda aprovada manualmente"));
    return { order: mapOrder(updated), ...(job ? { job } : {}), replayed: false };
  });
}

function productRow(ctx: StoreContext, id: string, p: ProductInput): Row {
  return { owner: ctx.owner, store: STORE, id, sku: p.sku, name: p.name, brand: p.brand, category: p.category,
    price_cents: p.priceCents, stock: p.stock, description: p.description, published: Number(p.published) };
}

export async function createProduct(ctx: StoreContext, p: ProductInput): Promise<{ id: string }> {
  const id = randomUUID();
  await ctx.db.runTransaction(async (tx) => {
    const settings = await transactionSettings(ctx, tx);
    if (settings.stock_integration_enabled) throw new HttpError(409, "Cadastre e vincule a peça no ERP antes de publicá-la.");
    const skuRef = ctx.ref.collection("keys").doc(keyId("sku", p.sku));
    if (keyTarget(ctx, await tx.get(skuRef), "sku", p.sku)) throw new HttpError(409, "Este código já está cadastrado. Atualize e tente novamente.");
    tx.create(skuRef, keyRow(ctx, "sku", p.sku, id));
    tx.create(reference(ctx, "products", id), { ...productRow(ctx, id, p), image: "", erp_version: -1, _position: Date.now() });
  });
  return { id };
}

export async function updateProduct(ctx: StoreContext, id: string, p: ProductInput & { expectedStock: number; expectedPriceCents: number }): Promise<{ ok: true }> {
  await ctx.db.runTransaction(async (tx) => {
    const settings = await transactionSettings(ctx, tx);
    if (settings.stock_integration_enabled) throw new HttpError(409, "Com o estoque integrado, altere preços e quantidades no ERP.");
    const productRef = reference(ctx, "products", id);
    const snapshot = await tx.get(productRef);
    if (!snapshot.exists) throw new HttpError(409, "Preço ou estoque mudou. Recarregue a peça antes de salvar.");
    const previous = data(ctx, snapshot);
    if (previous.stock !== p.expectedStock || previous.price_cents !== p.expectedPriceCents)
      throw new HttpError(409, "Preço ou estoque mudou. Recarregue a peça antes de salvar.");
    const skuRef = ctx.ref.collection("keys").doc(keyId("sku", p.sku));
    const previousSkuRef = ctx.ref.collection("keys").doc(keyId("sku", previous.sku));
    const currentSkuId = keyTarget(ctx, await tx.get(skuRef), "sku", p.sku);
    const previousSkuId = p.sku === previous.sku ? currentSkuId : keyTarget(ctx, await tx.get(previousSkuRef), "sku", previous.sku);
    if (currentSkuId && currentSkuId !== id) throw new HttpError(409, "Este código já está cadastrado. Atualize e tente novamente.");
    if (previousSkuId && previousSkuId !== id) throw new Error("INVALID_SKU_OWNERSHIP");
    if (previous.sku !== p.sku && previousSkuId) tx.delete(previousSkuRef);
    tx.set(skuRef, keyRow(ctx, "sku", p.sku, id));
    tx.update(productRef, productRow(ctx, id, p));
  });
  return { ok: true };
}

export async function changeLocalOrder(ctx: StoreContext, id: string, next: Status, revision: number, actorEmail: string): Promise<Order> {
  if (!actorEmail) throw new HttpError(403, "Responsável não identificado.");
  return ctx.db.runTransaction(async (tx) => {
    await transactionSettings(ctx, tx);
    const orderRef = reference(ctx, "orders", id);
    const row = data(ctx, await tx.get(orderRef), "Pedido não encontrado.");
    const order = mapOrder(row);
    if (order.revision !== revision) throw new HttpError(409, "O pedido mudou. Atualize antes de continuar.");
    if (order.status === "AWAITING_APPROVAL" && next !== "CANCELLED") throw new HttpError(409, "Use Aprovar venda para conferir e reservar as peças.");
    if (!transitions[order.status]?.includes(next)) throw new HttpError(409, "Esta mudança de situação não é permitida.");
    const unreserved = ["AWAITING_APPROVAL", "STOCK_REJECTED", "EXPIRED"].includes(order.status);
    if (!unreserved && !order.approvedBy) throw new HttpError(409, "Não há aprovação registrada para este pedido.");
    if (!unreserved && order.inventoryMode === "erp") throw new HttpError(409, "Este pedido precisa da confirmação do estoque integrado.");
    const release = next === "CANCELLED" && !unreserved && order.inventoryStatus === "LOCAL_RESERVED";
    const productRefs = release ? order.items.map((item) => reference(ctx, "products", item.productId)) : [];
    const products = productRefs.length ? (await tx.getAll(...productRefs)).map((snapshot) => data(ctx, snapshot, "Uma peça precisa de conferência antes de cancelar.")) : [];
    const now = new Date().toISOString();
    const updated = { ...row, status: next, inventory_status: release ? "LOCAL_RELEASED" : next === "COMPLETED" ? "LOCAL_COMPLETED" : row.inventory_status,
      updated_at: now, revision: revision + 1 };
    for (let i = 0; i < products.length; i++) tx.update(productRefs[i], { stock: Number(products[i].stock) + order.items[i].quantity });
    tx.set(orderRef, updated);
    writeEvent(ctx, tx, event(ctx, id, next, now, actorEmail, unreserved ? "Encerrado sem reserva ou movimentação de estoque" : "Atualização pelo responsável"));
    return mapOrder(updated);
  });
}

export async function setIntegration(ctx: StoreContext, body: { erpAccessEnabled?: boolean; stockIntegrationEnabled?: boolean }): Promise<{ ok: true; syncConnected: boolean }> {
  return ctx.db.runTransaction(async (tx) => {
    const settings = await transactionSettings(ctx, tx);
    if (body.stockIntegrationEnabled === false && settings.stock_integration_enabled)
      throw new HttpError(409, "Para desconectar, primeiro é necessário definir e conferir um estoque independente. A proteção atual foi mantida.");
    if (body.stockIntegrationEnabled === true && !settings.stock_integration_enabled) {
      const orders = await tx.get(ctx.ref.collection("orders").where("inventory_mode", "==", "standalone"));
      if (orders.docs.some((snapshot) => !["COMPLETED", "CANCELLED"].includes(data(ctx, snapshot).status)))
        throw new HttpError(409, "Conclua ou cancele os pedidos do estoque próprio antes de conectar o ERP.");
    }
    const updates: Row = { _order_guard: Number(settings._order_guard ?? 0) + 1 };
    if (body.erpAccessEnabled !== undefined) updates.erp_access_enabled = Number(body.erpAccessEnabled);
    if (body.stockIntegrationEnabled !== undefined) updates.stock_integration_enabled = Number(body.stockIntegrationEnabled);
    tx.update(ctx.ref, updates);
    return { ok: true, syncConnected: !!(updates.stock_integration_enabled ?? settings.stock_integration_enabled) };
  });
}
