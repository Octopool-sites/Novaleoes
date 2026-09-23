import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError, mapOrder } from "../lib/commerce-server.js";
import { STORE, transitions, type Order, type Status } from "../lib/commerce-contracts.js";
import { createErpStockClient, ErpStockError, type Reservation } from "../lib/erp-stock-client.js";
import type { Product } from "../lib/catalog.js";
import { keyId, requireScopedRow, type Row, type StoreContext } from "./types.js";

export type Job = {
  id: string; owner: string; store?: string; order_id: string; local_revision: number;
  action: string; payload: string; state: string;
};

const collection = (ctx: StoreContext, name: string) => ctx.ref.collection(name);
const pendingFor = (ctx: StoreContext, id: string) => collection(ctx, "jobs")
  .where("order_id", "==", id).where("state", "==", "PENDING")
  .orderBy("local_revision").limit(1);
const event = (ctx: StoreContext, id: string, status: string, now: string, extra: Row = {}) => ({
  id: randomUUID(), owner: ctx.owner, store: STORE, order_id: id, status, created_at: now, ...extra,
});

async function findOrder(ctx: StoreContext, id: string): Promise<Order> {
  const snapshot = await collection(ctx, "orders").doc(id).get();
  if (!snapshot.exists) throw new HttpError(404, "Pedido não encontrado.");
  const row = requireScopedRow(ctx, snapshot.data());
  if (row.id !== id) throw new Error("INVENTORY_ORDER_ID_MISMATCH");
  return mapOrder(row);
}

export function inventoryConfigured(ctx: StoreContext) {
  const c = ctx.env;
  return !!(c.COMMERCE_ERP_ORIGIN && c.COMMERCE_ERP_TOKEN && c.COMMERCE_ERP_OWNER === ctx.owner);
}

function client(ctx: StoreContext, sanitizeTransport = false) {
  if (!inventoryConfigured(ctx)) throw new HttpError(503, "A conexão de estoque precisa ser configurada para esta loja.");
  const transport: typeof fetch = sanitizeTransport ? async (input, init) => {
    try { return await fetch(input, init); }
    catch { throw new Error("CONNECTION_UNAVAILABLE"); }
  } : fetch;
  return createErpStockClient({ origin: ctx.env.COMMERCE_ERP_ORIGIN!, token: ctx.env.COMMERCE_ERP_TOKEN! }, transport);
}

export async function inventoryEnabled(ctx: StoreContext) {
  const snapshot = await ctx.ref.get();
  return snapshot.exists && !!requireScopedRow(ctx, snapshot.data()).stock_integration_enabled;
}

export async function inventoryHandshake(ctx: StoreContext, sanitizeTransport = false) {
  const data = await client(ctx, sanitizeTransport).inventory();
  if (data.ownerRef !== ctx.owner || data.storeKey !== STORE) throw new HttpError(403, "A credencial não pertence a esta loja.");
  return data;
}

async function verifiedClient(ctx: StoreContext) {
  await inventoryHandshake(ctx);
  return client(ctx);
}

export async function integratedCatalog(ctx: StoreContext, products: Product[]) {
  if (!await inventoryEnabled(ctx)) return products;
  const remote = await inventoryHandshake(ctx);
  const byId = new Map(remote.products.map(product => [product.externalId, product]));
  return products.map(product => {
    const current = byId.get(product.id);
    return { ...product, stock: current?.available ?? 0, priceCents: current?.priceCents ?? product.priceCents,
      published: product.published && !!current && current.priceCents > 0 };
  });
}

type InventorySnapshot = Awaited<ReturnType<typeof inventoryHandshake>>;

async function persistCatalogSnapshot(ctx: StoreContext, catalog: InventorySnapshot) {
  const persistedVersions = new Map<string, number>();
  const ids = new Set<string>();
  for (const product of catalog.products) {
    if (!product.externalId || product.externalId.includes("/") || [".", ".."].includes(product.externalId) || ids.has(product.externalId))
      throw new Error("INVALID_INVENTORY_PRODUCT_ID");
    ids.add(product.externalId);
  }
  // Only an existing local product may receive the authority's stock
  // snapshot. Missing remote IDs do not create or delete catalog records.
  for (let start = 0; start < catalog.products.length; start += 100) {
    const group = catalog.products.slice(start, start + 100);
    const persisted = await ctx.db.runTransaction(async tx => {
      const refs = group.map(product => collection(ctx, "products").doc(product.externalId));
      const snapshots = await tx.getAll(...refs);
      const versions: [string, number][] = [];
      snapshots.forEach((snapshot, index) => {
        if (!snapshot.exists) return;
        const row = requireScopedRow(ctx, snapshot.data()), product = group[index];
        if (row.id !== snapshot.id) throw new Error("INVENTORY_PRODUCT_ID_MISMATCH");
        if (Number(row.erp_version ?? -1) <= product.version) {
          if (Number(row.erp_version ?? -1) !== product.version || row.stock !== product.available || row.price_cents !== product.priceCents)
            tx.update(refs[index], { stock: product.available, price_cents: product.priceCents, erp_version: product.version });
          versions.push([product.externalId, product.version]);
        } else versions.push([product.externalId, Number(row.erp_version)]);
      });
      return versions;
    });
    for (const [id, version] of persisted) persistedVersions.set(id, version);
  }
  return persistedVersions;
}

// Public visitors may refresh a cached catalog, never process an order. The
// durable lease limits ERP reads to one attempt per five minutes per store.
export async function refreshCatalog(ctx: StoreContext): Promise<void> {
  if (process.env.COMMERCE_READ_ONLY === "1" || !inventoryConfigured(ctx)) return;
  const lease = collection(ctx, "maintenance").doc("catalog-refresh");
  const attemptId = randomUUID(), now = Date.now();
  try {
    const acquired = await ctx.db.runTransaction(async tx => {
      const settings = await tx.get(ctx.ref);
      if (process.env.COMMERCE_READ_ONLY === "1" || !settings.exists || !requireScopedRow(ctx, settings.data()).stock_integration_enabled) return false;
      const previous = await tx.get(lease);
      const current = previous.exists ? requireScopedRow(ctx, previous.data()) : undefined;
      if (Number(current?.nextAt || 0) > now) return false;
      tx.set(lease, { owner: ctx.owner, store: STORE, attempt_id: attemptId, attempted_at: now, nextAt: now + 5 * 60_000 }, { merge: true });
      return true;
    });
    if (!acquired || process.env.COMMERCE_READ_ONLY === "1") return;
    const catalog = await inventoryHandshake(ctx, true);
    if (process.env.COMMERCE_READ_ONLY === "1") return;
    await persistCatalogSnapshot(ctx, catalog);
    await ctx.db.runTransaction(async tx => {
      const current = requireScopedRow(ctx, (await tx.get(lease)).data());
      if (process.env.COMMERCE_READ_ONLY !== "1" && current.attempt_id === attemptId)
        tx.update(lease, { last_success_at: Date.now() });
    });
  } catch {
    // Keep the last durable copy and the retry window. Never log provider bodies,
    // customer data, credentials, or arbitrary external error text here.
    console.warn("commerce-catalog-refresh-pending");
  }
}

function localStatus(remote: Reservation, current: Order): Status {
  if (remote.status === "HELD") return "STOCK_PENDING";
  if (remote.status === "CONFIRMED") return ["PACKING", "READY"].includes(current.status) ? current.status : "CONFIRMED";
  if (remote.status === "EXPIRED") return "EXPIRED";
  return remote.status === "COMPLETED" ? "COMPLETED" : "CANCELLED";
}

function matchingReservation(order: Order, remote: Reservation) {
  if (remote.externalOrderId !== order.id || remote.totalCents !== order.totalCents)
    throw new HttpError(503, "O pedido precisa de conferência antes de continuar.");
}

// The ERP call has already finished. Only durable local changes run in a
// Firestore transaction; a retry can never repeat an external stock command.
export async function applyRemote(ctx: StoreContext, order: Order, remote: Reservation, jobId?: string) {
  matchingReservation(order, remote);
  const orderRef = collection(ctx, "orders").doc(order.id);
  const jobRef = jobId ? collection(ctx, "jobs").doc(jobId) : null;
  await ctx.db.runTransaction(async tx => {
    const currentSnapshot = await tx.get(orderRef);
    const jobSnapshot = jobRef ? await tx.get(jobRef) : null;
    const row = requireScopedRow(ctx, currentSnapshot.data());
    if (row.id !== order.id) throw new Error("INVENTORY_ORDER_ID_MISMATCH");
    const current = mapOrder(row);
    matchingReservation(current, remote);
    if (current.inventoryMode !== "erp") throw new HttpError(409, "A configuração de estoque mudou. Atualize o pedido.");
    const job = jobSnapshot?.exists ? requireScopedRow(ctx, jobSnapshot.data()) : null;
    if (job && job.order_id !== order.id) throw new Error("INVENTORY_JOB_ORDER_MISMATCH");
    const now = new Date().toISOString(), status = localStatus(remote, current);
    if (remote.revision >= current.erpRevision! &&
      (current.status !== status || current.inventoryStatus !== remote.status || current.erpRevision !== remote.revision)) {
      tx.update(orderRef, { status, inventory_status: remote.status, erp_revision: remote.revision,
        reservation_expires_at: remote.expiresAt, updated_at: now, revision: current.revision + 1 });
      const audit = event(ctx, order.id, status, now);
      tx.create(collection(ctx, "events").doc(audit.id), audit);
    }
    if (jobRef && job?.state === "PENDING") tx.update(jobRef, { state: "APPLIED", last_error: null, updated_at: now });
  });
}

async function updatePendingJob(ctx: StoreContext, id: string, patch: Row) {
  const ref = collection(ctx, "jobs").doc(id);
  await ctx.db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return;
    const row = requireScopedRow(ctx, snapshot.data());
    if (row.state === "PENDING") tx.update(ref, { ...patch, updated_at: new Date().toISOString() });
  });
}

export async function processInventoryJob(ctx: StoreContext, input: Job) {
  // Re-read the actual job instead of trusting a caller's cached payload/state.
  const jobRef = collection(ctx, "jobs").doc(input.id);
  const job = await ctx.db.runTransaction(async tx => {
    const jobSnapshot = await tx.get(jobRef);
    if (!jobSnapshot.exists) return null;
    const current = requireScopedRow(ctx, jobSnapshot.data());
    if (current.id !== jobSnapshot.id) throw new Error("INVENTORY_JOB_ID_MISMATCH");
    if (current.state !== "PENDING") return null;
    const orderSnapshot = await tx.get(collection(ctx, "orders").doc(current.order_id));
    const order = requireScopedRow(ctx, orderSnapshot.data());
    if (order.id !== current.order_id) throw new Error("INVENTORY_ORDER_ID_MISMATCH");
    if (order.inventory_mode !== "erp" || !order.approved_by || !order.approved_at)
      throw new HttpError(403, "Este pedido ainda precisa de aprovação.");
    if (!["RESERVE", "CONFIRM", "COMPLETE", "CANCEL"].includes(current.action)) throw new Error("INVALID_INVENTORY_ACTION");
    tx.update(jobRef, { attempts: Number(current.attempts || 0) + 1, updated_at: new Date().toISOString() });
    return current as Job;
  });
  if (!job) return;
  let reserving = false;
  try {
    const erp = await verifiedClient(ctx), payload = JSON.parse(job.payload);
    if (job.action === "RESERVE" ? payload.externalOrderId !== job.order_id : payload.key !== job.id || payload.action !== job.action)
      throw new Error("INVALID_INVENTORY_PAYLOAD");
    reserving = job.action === "RESERVE";
    const remote = job.action === "RESERVE" ? await erp.reserve(payload) : await erp.command(job.order_id, payload);
    reserving = false;
    let current = await erp.get(job.order_id);
    if (job.action === "RESERVE" && current.status === "HELD") {
      await erp.command(job.order_id, { key: job.id, action: "CONFIRM", revision: current.revision });
      current = await erp.get(job.order_id);
    }
    await applyRemote(ctx, await findOrder(ctx, job.order_id), current.revision >= remote.revision ? current : remote, job.id);
  } catch (error) {
    const code = error instanceof ErpStockError ? error.code : "CONNECTION_UNAVAILABLE";
    if (error instanceof ErpStockError && [400, 409].includes(error.status) && code !== "IDEMPOTENCY_CONFLICT") {
      if (job.action === "RESERVE" && reserving) {
        const orderRef = collection(ctx, "orders").doc(job.order_id);
        await ctx.db.runTransaction(async tx => {
          const [orderSnapshot, jobSnapshot] = await tx.getAll(orderRef, jobRef);
          const row = requireScopedRow(ctx, orderSnapshot.data()), latestJob = requireScopedRow(ctx, jobSnapshot.data());
          if (latestJob.state !== "PENDING") return;
          const now = new Date().toISOString();
          if (row.status === "STOCK_PENDING") tx.update(orderRef, { status: "STOCK_REJECTED", inventory_status: "REJECTED",
            revision: Number(row.revision) + 1, updated_at: now });
          tx.update(jobRef, { state: "FAILED", last_error: code, updated_at: now });
        });
      } else if (job.action !== "RESERVE") {
        try {
          await applyRemote(ctx, await findOrder(ctx, job.order_id), await (await verifiedClient(ctx)).get(job.order_id));
          await updatePendingJob(ctx, job.id, { state: "FAILED", last_error: code });
        } catch { /* The durable pending operation remains recoverable. */ }
      }
    }
    await updatePendingJob(ctx, job.id, { last_error: code });
  }
}

export async function recoverInventoryOrder(ctx: StoreContext, id: string) {
  const jobs = await pendingFor(ctx, id).get();
  for (const snapshot of jobs.docs) await processInventoryJob(ctx, requireScopedRow(ctx, snapshot.data()) as Job);
  const order = await findOrder(ctx, id), pending = await pendingFor(ctx, id).get();
  if (pending.empty && order.inventoryMode === "erp" &&
    !["COMPLETED", "CANCELLED", "STOCK_REJECTED", "EXPIRED", "STOCK_PENDING", "AWAITING_APPROVAL"].includes(order.status)) {
    try { await applyRemote(ctx, order, await (await verifiedClient(ctx)).get(id)); }
    catch { /* Preserve the last confirmed state; changes still verify the ERP. */ }
  }
  return findOrder(ctx, id);
}

export async function changeIntegratedOrder(ctx: StoreContext, order: Order, next: string, actor: string) {
  if (!transitions[order.status].includes(next as Status) || order.status === "AWAITING_APPROVAL" || !order.approvedBy)
    throw new HttpError(409, "Esta mudança de situação não é permitida.");
  if (!(await pendingFor(ctx, order.id).get()).empty) throw new HttpError(409, "Aguardando confirmação do estoque. Atualize o pedido.");
  const remote = await (await verifiedClient(ctx)).get(order.id);
  matchingReservation(order, remote);
  if (remote.revision !== order.erpRevision || remote.status !== order.inventoryStatus) {
    await applyRemote(ctx, order, remote);
    throw new HttpError(409, "A reserva mudou. Atualize o pedido.");
  }
  const action = next === "CONFIRMED" ? "CONFIRM" : next === "COMPLETED" ? "COMPLETE" : next === "CANCELLED" ? "CANCEL" : null;
  const orderRef = collection(ctx, "orders").doc(order.id), jobId = randomUUID();
  const keyRef = collection(ctx, "keys").doc(keyId("job-revision", `${order.id}:${order.revision}`));
  const now = new Date().toISOString();
  const job: Job & Row = { id: jobId, owner: ctx.owner, store: STORE, order_id: order.id, local_revision: order.revision,
    action: action || "", payload: JSON.stringify({ key: jobId, action, revision: remote.revision }), state: "PENDING",
    attempts: 0, last_error: null, created_at: now, updated_at: now };
  await ctx.db.runTransaction(async tx => {
    const currentSnapshot = await tx.get(orderRef), pending = await tx.get(pendingFor(ctx, order.id));
    const existingKey = action ? await tx.get(keyRef) : null;
    const row = requireScopedRow(ctx, currentSnapshot.data());
    if (row.revision !== order.revision || row.status !== order.status || row.inventory_mode !== "erp" ||
      !row.approved_by || !row.approved_at || row.erp_revision !== remote.revision || row.inventory_status !== remote.status ||
      !pending.empty || existingKey?.exists) throw new HttpError(409, "O pedido mudou. Atualize antes de continuar.");
    if (!action) {
      if (row.inventory_status !== "CONFIRMED") throw new HttpError(409, "A reserva mudou. Atualize o pedido.");
      tx.update(orderRef, { status: next, revision: order.revision + 1, updated_at: now });
    } else {
      tx.create(collection(ctx, "jobs").doc(jobId), job);
      tx.create(keyRef, { owner: ctx.owner, store: STORE, kind: "job-revision", value: `${order.id}:${order.revision}`,
        target_id: jobId, job_id: jobId, order_id: order.id, local_revision: order.revision });
      tx.update(orderRef, { inventory_status: "PENDING" });
    }
    const audit = event(ctx, order.id, action ? order.status : next, now,
      { actor, detail: action ? `Solicitou ${action}` : "Atualização pelo responsável" });
    tx.create(collection(ctx, "events").doc(audit.id), audit);
  });
  if (action) await processInventoryJob(ctx, job);
  return findOrder(ctx, order.id);
}

export async function reconcileInventory(ctx: StoreContext) {
  const jobs = await collection(ctx, "jobs").where("state", "==", "PENDING").orderBy("created_at").limit(5).get();
  for (const snapshot of jobs.docs) await processInventoryJob(ctx, requireScopedRow(ctx, snapshot.data()) as Job);
  if (await inventoryEnabled(ctx)) {
    const erp = await verifiedClient(ctx);
    await erp.call("/maintenance", {});
    const catalog = await inventoryHandshake(ctx);
    const persistedVersions = await persistCatalogSnapshot(ctx, catalog);
    const events = z.object({ events: z.array(z.object({ id: z.string(), externalId: z.string(),
      version: z.number().int().nonnegative(), available: z.number().int().nonnegative() })).max(1000) }).parse(await erp.call("/events"));
    const ids = events.events.filter(item => (persistedVersions.get(item.externalId) ?? -1) >= item.version).map(item => item.id);
    if (ids.length) await erp.call("/events/ack", { ids });
  }
  const pending = await collection(ctx, "jobs").where("state", "==", "PENDING").count().get();
  return { pending: { count: pending.data().count } };
}
