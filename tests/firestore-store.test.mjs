import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { Firestore } from "@google-cloud/firestore";
import {
  submitOrder, approveOrderRecord, createProduct, updateProduct, changeLocalOrder,
  findOrder, listOrders, listEvents, listProducts, setIntegration, getSettings,
} from "../outputs/test-firestore-store.mjs";

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (host && !/^(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host))
  throw new Error("Firestore tests require a local emulator; remote databases are forbidden.");
const enabled = !!host;
const db = enabled ? new Firestore({ projectId: "demo-nova-leoes-store-tests" }) : null;
const fixtures = [];
const keyId = (kind, value) => `${kind}_${createHash("sha256").update(value).digest("hex")}`;
const run = (name, fn) => test(`Firestore store: ${name}`, { skip: !enabled }, fn);

async function fixture({ integrated = false, stock = 2, price = 1000 } = {}) {
  const owner = `test-${randomUUID()}`;
  const ref = db.doc(`commerce/staging/tenants/${owner}/stores/nova-leoes`);
  fixtures.push(ref);
  await ref.set({ owner, store: "nova-leoes", erp_access_enabled: 0, stock_integration_enabled: Number(integrated) });
  const ctx = { db, ref, owner, environment: "staging", env: { STORE_OWNER: owner } };
  await seedProduct(ctx, { id: "piece-1", sku: "SKU-1", stock, price_cents: price });
  return ctx;
}

async function seedProduct(ctx, patch) {
  const row = { owner: ctx.owner, store: "nova-leoes", id: patch.id, sku: patch.sku, name: "Peça de teste",
    brand: "Marca", category: "Motor", price_cents: 1000, stock: 2, image: "", description: "Teste isolado",
    published: 1, erp_version: -1, _position: 0, ...patch };
  const batch = db.batch();
  batch.create(ctx.ref.collection("products").doc(row.id), row);
  batch.create(ctx.ref.collection("keys").doc(keyId("sku", row.sku)), { owner: ctx.owner, store: "nova-leoes", kind: "sku", value: row.sku, target_id: row.id });
  await batch.commit();
}

function input(patch = {}) {
  return { idempotency: randomUUID(), customerName: "Cliente de teste", email: "customer@example.test",
    phone: "11999990000", vehicle: "Carro de teste", note: "", items: [{ productId: "piece-1", quantity: 1 }], ...patch };
}

function product(patch = {}) {
  return { name: "Outra peça", sku: "SKU-2", brand: "Marca", category: "Motor", priceCents: 2000,
    stock: 3, description: "Teste", published: true, ...patch };
}

const approval = (order, idempotency = randomUUID()) => ({ revision: order.revision, idempotency });
const actor = "operator@example.test";
const stockOf = async (ctx, id = "piece-1") => (await ctx.ref.collection("products").doc(id).get()).data().stock;

after(async () => {
  if (!db) return;
  for (const ref of fixtures) await db.recursiveDelete(ref);
  await db.terminate();
});

run("public intake and concurrent replay never reserve stock or create jobs", async () => {
  const ctx = await fixture({ integrated: true });
  const request = input();
  const results = await Promise.all(Array.from({ length: 4 }, () => submitOrder(ctx, request)));
  assert.equal(new Set(results.map(({ order }) => order.id)).size, 1);
  assert.equal(results.filter(({ replayed }) => !replayed).length, 1);
  const { order } = results[0];
  assert.equal(order.status, "AWAITING_APPROVAL");
  assert.equal(order.inventoryStatus, "UNRESERVED");
  assert.equal(order.inventoryMode, "erp");
  assert.equal(order.approvedBy, null);
  assert.equal(await stockOf(ctx), 2);
  assert.equal((await ctx.ref.collection("jobs").get()).size, 0);
  assert.equal((await listOrders(ctx)).length, 1);
  const events = await listEvents(ctx, order.id);
  assert.equal(events.length, 1);
  assert.equal(events[0].actor, "CUSTOMER");
  await assert.rejects(submitOrder(ctx, { ...request, note: "different payload" }), { status: 409 });
});

run("two approvals competing for the last piece only reserve it once", async () => {
  const ctx = await fixture({ stock: 1 });
  const first = (await submitOrder(ctx, input())).order;
  const second = (await submitOrder(ctx, input())).order;
  const catalog = await listProducts(ctx);
  const results = await Promise.allSettled([first, second].map((order) => approveOrderRecord(ctx, order.id, approval(order), actor, catalog)));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && result.reason.status === 409).length, 1);
  assert.equal(await stockOf(ctx), 0);
  const orders = await listOrders(ctx);
  assert.equal(orders.filter((order) => order.status === "CONFIRMED").length, 1);
  assert.equal(orders.filter((order) => order.status === "AWAITING_APPROVAL").length, 1);
});

run("approval replay is bound to its operator and does not reserve twice", async () => {
  const ctx = await fixture();
  const order = (await submitOrder(ctx, input())).order;
  const body = approval(order), catalog = await listProducts(ctx);
  const results = await Promise.all([approveOrderRecord(ctx, order.id, body, actor, catalog), approveOrderRecord(ctx, order.id, body, actor, catalog)]);
  assert.equal(results.filter((result) => result.replayed).length, 1);
  assert.equal(await stockOf(ctx), 1);
  assert.equal((await listEvents(ctx, order.id)).length, 2);
  await assert.rejects(approveOrderRecord(ctx, order.id, body, "other@example.test", catalog), { status: 403 });
  const another = (await submitOrder(ctx, input())).order;
  await assert.rejects(approveOrderRecord(ctx, another.id, { revision: 0, idempotency: body.idempotency }, actor, catalog), { status: 409 });
});

run("approval rechecks persisted prices, publication, and all items before writing", async () => {
  const ctx = await fixture({ stock: 4 });
  await seedProduct(ctx, { id: "piece-2", sku: "SKU-2", stock: 1 });
  const order = (await submitOrder(ctx, input({ items: [{ productId: "piece-1", quantity: 2 }, { productId: "piece-2", quantity: 1 }] }))).order;
  const staleCatalog = await listProducts(ctx);
  await ctx.ref.collection("products").doc("piece-2").update({ price_cents: 1100 });
  await assert.rejects(approveOrderRecord(ctx, order.id, approval(order), actor, staleCatalog), { status: 409 });
  assert.equal(await stockOf(ctx), 4);
  assert.equal((await findOrder(ctx, order.id)).revision, 0);
  await ctx.ref.collection("products").doc("piece-2").update({ price_cents: 1000, published: 0 });
  await assert.rejects(approveOrderRecord(ctx, order.id, approval(order), actor, staleCatalog), { status: 409 });
  assert.equal(await stockOf(ctx), 4);
  assert.equal((await listEvents(ctx, order.id)).length, 1);
});

run("integrated approval atomically stores operator and durable reservation job", async () => {
  const ctx = await fixture({ integrated: true, stock: 4 });
  const order = (await submitOrder(ctx, input())).order;
  const catalog = await listProducts(ctx), body = approval(order);
  const result = await approveOrderRecord(ctx, order.id, body, actor, catalog);
  assert.equal(result.order.status, "STOCK_PENDING");
  assert.equal(result.order.inventoryStatus, "PENDING");
  assert.equal(result.order.approvedBy, actor);
  assert.ok(result.order.approvedAt);
  assert.equal(result.order.revision, 1);
  assert.equal(result.job.action, "RESERVE");
  assert.equal(result.job.local_revision, 1);
  assert.deepEqual(JSON.parse(result.job.payload), { externalOrderId: order.id, items: [{ externalId: "piece-1", quantity: 1, priceCents: 1000 }] });
  const durableJob = (await ctx.ref.collection("jobs").doc(result.job.id).get()).data();
  assert.deepEqual(durableJob, result.job);
  assert.equal(await stockOf(ctx), 4);
  await approveOrderRecord(ctx, order.id, body, actor, catalog);
  assert.equal((await ctx.ref.collection("jobs").get()).size, 1);
});

run("integrated approval rejects changed ERP availability and price without creating a job", async () => {
  const ctx = await fixture({ integrated: true });
  const order = (await submitOrder(ctx, input())).order;
  const catalog = await listProducts(ctx);
  await assert.rejects(approveOrderRecord(ctx, order.id, approval(order), actor, catalog.map((p) => ({ ...p, stock: 0 }))), { status: 409 });
  await assert.rejects(approveOrderRecord(ctx, order.id, approval(order), actor, catalog.map((p) => ({ ...p, priceCents: 2000 }))), { status: 409 });
  assert.equal((await ctx.ref.collection("jobs").get()).size, 0);
  assert.equal((await findOrder(ctx, order.id)).approvedBy, null);
});

run("concurrent cancellation releases one reservation once and unapproved cancellation releases none", async () => {
  const ctx = await fixture();
  const draft = (await submitOrder(ctx, input())).order;
  await changeLocalOrder(ctx, draft.id, "CANCELLED", 0, actor);
  assert.equal(await stockOf(ctx), 2);
  const another = (await submitOrder(ctx, input())).order;
  const { order } = await approveOrderRecord(ctx, another.id, approval(another), actor, await listProducts(ctx));
  const results = await Promise.allSettled([changeLocalOrder(ctx, order.id, "CANCELLED", order.revision, actor), changeLocalOrder(ctx, order.id, "CANCELLED", order.revision, actor)]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(await stockOf(ctx), 2);
  assert.equal((await findOrder(ctx, order.id)).inventoryStatus, "LOCAL_RELEASED");
  assert.equal((await listEvents(ctx, order.id)).length, 3);
});

run("local flow requires approval and completes without a second stock deduction", async () => {
  const ctx = await fixture();
  const order = (await submitOrder(ctx, input())).order;
  await assert.rejects(changeLocalOrder(ctx, order.id, "CONFIRMED", 0, actor), { status: 409 });
  let current = (await approveOrderRecord(ctx, order.id, approval(order), actor, await listProducts(ctx))).order;
  current = await changeLocalOrder(ctx, order.id, "PACKING", current.revision, actor);
  current = await changeLocalOrder(ctx, order.id, "READY", current.revision, actor);
  current = await changeLocalOrder(ctx, order.id, "COMPLETED", current.revision, actor);
  assert.equal(current.inventoryStatus, "LOCAL_COMPLETED");
  assert.equal(await stockOf(ctx), 1);
  await assert.rejects(changeLocalOrder(ctx, order.id, "CANCELLED", current.revision, actor), { status: 409 });
});

run("product SKU uniqueness and optimistic stock editing survive concurrent writes", async () => {
  const ctx = await fixture();
  const sameSku = await Promise.allSettled([createProduct(ctx, product()), createProduct(ctx, product())]);
  assert.equal(sameSku.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(sameSku.filter((result) => result.status === "rejected" && result.reason.status === 409).length, 1);
  const edits = await Promise.allSettled([5, 8].map((stock) => updateProduct(ctx, "piece-1", product({ sku: "SKU-1", stock, expectedStock: 2, expectedPriceCents: 1000 }))));
  assert.equal(edits.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(edits.filter((result) => result.status === "rejected" && result.reason.status === 409).length, 1);
});

run("integrated product mutations and local updates of approved ERP orders are closed", async () => {
  const ctx = await fixture({ integrated: true });
  await assert.rejects(createProduct(ctx, product()), { status: 409 });
  await assert.rejects(updateProduct(ctx, "piece-1", product({ expectedStock: 2, expectedPriceCents: 1000 })), { status: 409 });
  const order = (await submitOrder(ctx, input())).order;
  await approveOrderRecord(ctx, order.id, approval(order), actor, await listProducts(ctx));
  await ctx.ref.collection("orders").doc(order.id).update({ status: "CONFIRMED", inventory_status: "CONFIRMED", revision: 2 });
  await assert.rejects(changeLocalOrder(ctx, order.id, "PACKING", 2, actor), { status: 409 });
});

run("switching integration cannot race past an open standalone order", async () => {
  const ctx = await fixture();
  const results = await Promise.allSettled([submitOrder(ctx, input()), setIntegration(ctx, { stockIntegrationEnabled: true })]);
  assert.equal(results[0].status, "fulfilled");
  const settings = await getSettings(ctx), orders = await listOrders(ctx);
  if (settings.stock_integration_enabled) {
    assert.equal(results[1].status, "fulfilled");
    assert.equal(orders[0].inventoryMode, "erp");
    await assert.rejects(setIntegration(ctx, { stockIntegrationEnabled: false }), { status: 409 });
  } else {
    assert.equal(results[1].status, "rejected");
    assert.equal(orders[0].inventoryMode, "standalone");
    await changeLocalOrder(ctx, orders[0].id, "CANCELLED", 0, actor);
    assert.equal((await setIntegration(ctx, { stockIntegrationEnabled: true, erpAccessEnabled: true })).syncConnected, true);
  }
});

run("scope checks reject foreign rows and document paths", async () => {
  const ctx = await fixture();
  const order = (await submitOrder(ctx, input())).order;
  await assert.rejects(findOrder(ctx, "orders/foreign"), { status: 404 });
  await ctx.ref.collection("orders").doc(order.id).update({ owner: "different-tenant" });
  await assert.rejects(findOrder(ctx, order.id), /STORE_SCOPE_MISMATCH/);
  await assert.rejects(approveOrderRecord(ctx, order.id, approval(order), actor, await listProducts(ctx)), /STORE_SCOPE_MISMATCH/);
  assert.equal(await stockOf(ctx), 2);
});
