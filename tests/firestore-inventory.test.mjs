import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { applyRemote, processInventoryJob, changeIntegratedOrder, recoverInventoryOrder, reconcileInventory, refreshCatalog } from '../outputs/test-firestore-inventory.mjs';

const emulator = process.env.FIRESTORE_EMULATOR_HOST || '';
if (emulator && !/^(127\.0\.0\.1|localhost):\d+$/.test(emulator)) throw Error('Firestore tests require a local emulator');
const enabled = !!emulator;
const db = enabled ? new Firestore({ projectId: 'demo-octopool-inventory' }) : null;
const scopes = [];
const originalFetch = globalThis.fetch;
after(async () => {
  globalThis.fetch = originalFetch;
  if (db) { for (const ref of scopes) await db.recursiveDelete(ref); await db.terminate(); }
});

async function fixture() {
  const owner = 'tenant-' + randomUUID();
  const ref = db.doc(`commerce/staging/tenants/${owner}/stores/nova-leoes`);
  scopes.push(ref);
  await ref.set({ owner, store: 'nova-leoes', stock_integration_enabled: 1, erp_access_enabled: 1 });
  const ctx = { db, ref, owner, environment: 'staging', env: { COMMERCE_ERP_ORIGIN: 'https://api.octopool.com.br', COMMERCE_ERP_OWNER: owner, COMMERCE_ERP_TOKEN: 'a'.repeat(64) } };
  const id = randomUUID(), jobId = randomUUID(), stamp = new Date().toISOString();
  const row = { id, owner, store: 'nova-leoes', number: 'NL-TEST', customer_name: 'Cliente Teste', email: 'test@example.invalid', phone: '11999999999', vehicle: '', note: '',
    items_json: JSON.stringify([{ productId: 'piece', name: 'Peça', sku: 'SKU', image: '', quantity: 1, priceCents: 1000 }]), total_cents: 1000,
    status: 'STOCK_PENDING', inventory_mode: 'erp', inventory_status: 'PENDING', revision: 1, erp_revision: 0,
    approved_by: 'approver@example.invalid', approved_at: stamp, approval_key: randomUUID(), created_at: stamp, updated_at: stamp };
  const job = { id: jobId, owner, store: 'nova-leoes', order_id: id, local_revision: 1, action: 'RESERVE',
    payload: JSON.stringify({ externalOrderId: id, items: [{ externalId: 'piece', quantity: 1, priceCents: 1000 }] }), state: 'PENDING', attempts: 0, created_at: stamp, updated_at: stamp };
  await ref.collection('orders').doc(id).set(row);
  await ref.collection('jobs').doc(jobId).set(job);
  await ref.collection('products').doc('piece').set({ owner, store: 'nova-leoes', id: 'piece', sku: 'SKU', price_cents: 1000, stock: 3, erp_version: 0 });
  let reservation = null, physical = 3, held = 0, dropComplete = false, inventoryOffline = false;
  const calls = [], commandKeys = new Map();
  let products = [{ externalId: 'piece', available: 3, priceCents: 1000, version: 1 }], events = [];
  const remote = (status, revision) => ({ externalOrderId: id, status, revision, expiresAt: new Date(Date.now() + 3600000).toISOString(), totalCents: 1000 });
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    assert.equal(url.origin, 'https://api.octopool.com.br');
    assert.equal(init.redirect, 'manual');
    const path = url.pathname.replace('/api/commerce-stock', ''), body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path, body, method: init.method || 'GET' });
    if (path === '/inventory') {
      if (inventoryOffline) throw Error('sensitive-provider-error-must-not-be-logged');
      return Response.json({ contract: 'octopool.stock.v1', ownerRef: owner, storeKey: 'nova-leoes', products });
    }
    if (path === '/maintenance') return Response.json({ ok: true });
    if (path === '/events') return Response.json({ events });
    if (path === '/events/ack') return Response.json({ ok: true });
    if (path === '/reservations') {
      if (!reservation) { reservation = remote('HELD', 1); held += 1; }
      return Response.json(reservation);
    }
    if (path === `/reservations/${id}/commands`) {
      if (!commandKeys.has(body.key)) {
        if (body.action === 'CONFIRM') reservation = remote('CONFIRMED', reservation.revision + 1);
        if (body.action === 'COMPLETE') { reservation = remote('COMPLETED', reservation.revision + 1); physical -= 1; held -= 1; }
        if (body.action === 'CANCEL') { reservation = remote('RELEASED', reservation.revision + 1); held -= 1; }
        commandKeys.set(body.key, reservation);
      }
      if (body.action === 'COMPLETE' && dropComplete) { dropComplete = false; throw Error('simulated lost response'); }
      return Response.json(commandKeys.get(body.key));
    }
    if (path === `/reservations/${id}` && reservation) return Response.json(reservation);
    throw Error(`Unexpected ERP request ${path}`);
  };
  return { ctx, id, job, row, calls, remote, orderRef: ref.collection('orders').doc(id), jobRef: ref.collection('jobs').doc(jobId),
    get physical() { return physical; }, get held() { return held; },
    set reservation(value) { reservation = value; }, set dropComplete(value) { dropComplete = value; },
    set products(value) { products = value; }, set events(value) { events = value; }, set inventoryOffline(value) { inventoryOffline = value; } };
}

const plainOrder = row => ({ id: row.id, totalCents: row.total_cents, status: row.status, revision: row.revision,
  inventoryMode: row.inventory_mode, inventoryStatus: row.inventory_status, erpRevision: row.erp_revision, approvedBy: row.approved_by });

test('Firestore inventory refuses a durable reserve job without approval before calling the ERP', { skip: !enabled }, async () => {
  const f = await fixture();
  await f.orderRef.update({ approved_by: null, approved_at: null });
  await assert.rejects(processInventoryJob(f.ctx, f.job), error => error.status === 403);
  assert.deepEqual(f.calls, []);
  assert.equal((await f.jobRef.get()).data().attempts, 0);
});

test('Firestore reserve is durable and replay-safe, with physical stock changed only on pickup', { skip: !enabled }, async () => {
  const f = await fixture();
  await processInventoryJob(f.ctx, f.job);
  const approved = (await f.orderRef.get()).data();
  assert.equal(approved.status, 'CONFIRMED');
  assert.equal((await f.jobRef.get()).data().state, 'APPLIED');
  assert.equal(f.physical, 3); assert.equal(f.held, 1);
  const calls = f.calls.length;
  await processInventoryJob(f.ctx, { ...f.job, payload: '{}', state: 'PENDING' });
  assert.equal(f.calls.length, calls);
  await f.orderRef.update({ status: 'READY' });
  const ready = plainOrder((await f.orderRef.get()).data());
  const completed = await changeIntegratedOrder(f.ctx, ready, 'COMPLETED', 'approver@example.invalid');
  assert.equal(completed.status, 'COMPLETED'); assert.equal(f.physical, 2); assert.equal(f.held, 0);
  const jobs = await f.ctx.ref.collection('jobs').get();
  assert.equal(jobs.size, 2);
});

test('Firestore lost completion response stays pending and recovers with the same command key', { skip: !enabled }, async () => {
  const f = await fixture();
  await processInventoryJob(f.ctx, f.job);
  await f.orderRef.update({ status: 'READY' });
  f.dropComplete = true;
  const pending = await changeIntegratedOrder(f.ctx, plainOrder((await f.orderRef.get()).data()), 'COMPLETED', 'approver@example.invalid');
  assert.equal(pending.inventoryStatus, 'PENDING'); assert.equal(f.physical, 2);
  const recovered = await recoverInventoryOrder(f.ctx, f.id);
  assert.equal(recovered.status, 'COMPLETED'); assert.equal(f.physical, 2);
  const requests = f.calls.filter(call => call.body?.action === 'COMPLETE');
  assert.equal(requests.length, 2); assert.equal(requests[0].body.key, requests[1].body.key);
});

test('Firestore remote application is monotonic and preserves packing without duplicate audit events', { skip: !enabled }, async () => {
  const f = await fixture();
  await f.orderRef.update({ status: 'PACKING', inventory_status: 'CONFIRMED', erp_revision: 4 });
  const order = plainOrder((await f.orderRef.get()).data());
  await applyRemote(f.ctx, order, f.remote('HELD', 1));
  await applyRemote(f.ctx, order, f.remote('CONFIRMED', 4));
  assert.equal((await f.orderRef.get()).data().status, 'PACKING');
  assert.equal((await f.ctx.ref.collection('events').get()).size, 0);
  await Promise.all([applyRemote(f.ctx, order, f.remote('CONFIRMED', 5)), applyRemote(f.ctx, order, f.remote('CONFIRMED', 6))]);
  const latest = (await f.orderRef.get()).data();
  assert.equal(latest.status, 'PACKING'); assert.equal(latest.erp_revision, 6);
  await assert.rejects(applyRemote(f.ctx, order, { ...f.remote('COMPLETED', 7), totalCents: 2000 }), error => error.status === 503);
  await assert.rejects(applyRemote({ ...f.ctx, owner: 'other' }, order, f.remote('COMPLETED', 7)), /STORE_SCOPE_MISMATCH/);
  assert.equal((await f.orderRef.get()).data().erp_revision, 6);
});

test('Firestore concurrent pickup commands cannot create two jobs for the same order revision', { skip: !enabled }, async () => {
  const f = await fixture();
  await processInventoryJob(f.ctx, f.job);
  await f.orderRef.update({ status: 'READY' });
  const order = plainOrder((await f.orderRef.get()).data());
  const results = await Promise.allSettled([
    changeIntegratedOrder(f.ctx, order, 'COMPLETED', 'approver@example.invalid'),
    changeIntegratedOrder(f.ctx, order, 'COMPLETED', 'approver@example.invalid'),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await f.ctx.ref.collection('jobs').get()).size, 2);
  assert.equal(f.physical, 2);
});

test('Firestore reconciliation acknowledges only durable product versions and never regresses stock snapshots', { skip: !enabled }, async () => {
  const f = await fixture();
  await f.jobRef.update({ state: 'APPLIED' });
  await f.ctx.ref.collection('products').doc('piece').update({ erp_version: 5, stock: 2 });
  f.products = [{ externalId: 'piece', available: 3, priceCents: 1000, version: 4 }, { externalId: 'missing', available: 8, priceCents: 300, version: 1 }];
  f.events = [{ id: 'copied', externalId: 'piece', version: 4, available: 3 }, { id: 'future', externalId: 'piece', version: 6, available: 1 }, { id: 'not-copied', externalId: 'missing', version: 1, available: 8 }];
  const result = await reconcileInventory(f.ctx);
  assert.deepEqual(result, { pending: { count: 0 } });
  assert.equal((await f.ctx.ref.collection('products').doc('piece').get()).data().stock, 2);
  assert.deepEqual(f.calls.find(call => call.path === '/events/ack')?.body, { ids: ['copied'] });
});

test('Firestore concurrent public catalog visitors share a five-minute refresh lease', { skip: !enabled }, async () => {
  const f = await fixture();
  f.products = [{ externalId: 'piece', available: 2, priceCents: 1200, version: 2 }];
  const started = Date.now();
  await Promise.all(Array.from({ length: 5 }, () => refreshCatalog(f.ctx)));
  assert.deepEqual(f.calls.map(call => [call.method, call.path]), [['GET', '/inventory']]);
  const product = (await f.ctx.ref.collection('products').doc('piece').get()).data();
  assert.equal(product.stock, 2); assert.equal(product.price_cents, 1200); assert.equal(product.erp_version, 2);
  const lease = (await f.ctx.ref.collection('maintenance').doc('catalog-refresh').get()).data();
  assert.equal(lease.nextAt - lease.attempted_at, 5 * 60_000);
  assert.ok(lease.last_success_at >= started);
  await refreshCatalog(f.ctx);
  assert.equal(f.calls.length, 1);
});

test('Firestore public catalog refresh calls only inventory GET and never processes an approved pending job', { skip: !enabled }, async () => {
  const f = await fixture();
  const orderBefore = (await f.orderRef.get()).data(), jobBefore = (await f.jobRef.get()).data(), settingsBefore = (await f.ctx.ref.get()).data();
  await refreshCatalog(f.ctx);
  assert.deepEqual(f.calls, [{ method: 'GET', path: '/inventory', body: null }]);
  assert.deepEqual((await f.orderRef.get()).data(), orderBefore);
  assert.deepEqual((await f.jobRef.get()).data(), jobBefore);
  assert.deepEqual((await f.ctx.ref.get()).data(), settingsBefore);
  assert.equal((await f.ctx.ref.collection('events').get()).size, 0);
  assert.equal(f.physical, 3); assert.equal(f.held, 0);
});

test('Firestore public catalog refresh preserves a newer durable version and ignores unknown products', { skip: !enabled }, async () => {
  const f = await fixture();
  const productRef = f.ctx.ref.collection('products').doc('piece');
  await productRef.update({ stock: 1, price_cents: 1700, erp_version: 8 });
  const before = await productRef.get();
  f.products = [{ externalId: 'piece', available: 3, priceCents: 1000, version: 6 }, { externalId: 'unknown', available: 10, priceCents: 1000, version: 1 }];
  await refreshCatalog(f.ctx);
  const after = await productRef.get();
  assert.deepEqual(after.data(), before.data());
  assert.ok(after.updateTime.isEqual(before.updateTime));
  assert.equal((await f.ctx.ref.collection('products').get()).size, 1);
});

test('Firestore public catalog refresh skips product writes when the version and snapshot are unchanged', { skip: !enabled }, async () => {
  const f = await fixture();
  const productRef = f.ctx.ref.collection('products').doc('piece');
  await productRef.update({ erp_version: 1 });
  const before = await productRef.get();
  await refreshCatalog(f.ctx);
  assert.ok((await productRef.get()).updateTime.isEqual(before.updateTime));
  await f.ctx.ref.collection('maintenance').doc('catalog-refresh').update({ nextAt: 0 });
  await refreshCatalog(f.ctx);
  assert.equal(f.calls.length, 2);
  assert.ok((await productRef.get()).updateTime.isEqual(before.updateTime));
});

test('Firestore public catalog outage preserves the last snapshot, limits retries, and sanitizes logs', { skip: !enabled }, async () => {
  const f = await fixture();
  const productRef = f.ctx.ref.collection('products').doc('piece');
  const before = await productRef.get();
  const warnings = [], originalWarn = console.warn;
  f.inventoryOffline = true;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    await refreshCatalog(f.ctx);
    await refreshCatalog(f.ctx);
    assert.equal(f.calls.length, 1);
    assert.ok((await productRef.get()).updateTime.isEqual(before.updateTime));
    const leaseRef = f.ctx.ref.collection('maintenance').doc('catalog-refresh');
    assert.equal((await leaseRef.get()).data().last_success_at, undefined);
    assert.ok(warnings.includes('commerce-catalog-refresh-pending'));
    assert.ok(warnings.every(warning => !warning.includes('sensitive-provider-error')));
    await leaseRef.update({ nextAt: 0 });
    f.inventoryOffline = false;
    await refreshCatalog(f.ctx);
    assert.equal(f.calls.length, 2);
    assert.ok((await leaseRef.get()).data().last_success_at);
  } finally { console.warn = originalWarn; }
});

test('Firestore public refresh is inert in read-only mode, standalone mode, or without scoped ERP credentials', { skip: !enabled }, async () => {
  const f = await fixture();
  const productRef = f.ctx.ref.collection('products').doc('piece');
  const before = await productRef.get();
  const previous = process.env.COMMERCE_READ_ONLY;
  process.env.COMMERCE_READ_ONLY = '1';
  try { await refreshCatalog(f.ctx); }
  finally { if (previous === undefined) delete process.env.COMMERCE_READ_ONLY; else process.env.COMMERCE_READ_ONLY = previous; }
  await refreshCatalog({ ...f.ctx, env: { ...f.ctx.env, COMMERCE_ERP_OWNER: 'different-tenant' } });
  await f.ctx.ref.update({ stock_integration_enabled: 0 });
  await refreshCatalog(f.ctx);
  assert.deepEqual(f.calls, []);
  assert.equal((await f.ctx.ref.collection('maintenance').get()).size, 0);
  assert.ok((await productRef.get()).updateTime.isEqual(before.updateTime));
  assert.equal((await f.jobRef.get()).data().attempts, 0);
});
