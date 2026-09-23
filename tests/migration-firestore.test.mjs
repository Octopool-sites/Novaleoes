import { test } from "node:test";
import assert from "node:assert/strict";
import { canonical, inspectOrApply, parseOptions, prepareImport } from "../scripts/migrate-commerce-firestore.mjs";

const owner = "migration-fixture";
const store = "nova-leoes";
const now = "2026-09-23T01:00:00.000Z";
const options = { input: "fixture.json", project: "nova-leoes-commerce", environment: "staging", owner, apply: false };
const apply = { ...options, apply: true };
const clone = value => JSON.parse(JSON.stringify(value));
function fixture() {
  return {
    schemaVersion: 1, owner, store,
    tables: {
      commerce_products: [{ owner, store, id: "part", sku: "SKU-1", name: "Fixture", brand: "Fixture", category: "Motor", price_cents: 1000, stock: 5, image: "", description: "", published: 1, erp_version: 2 }],
      commerce_orders: [{ id: "order-one", owner, store, idempotency: "idempotency-one", fingerprint: "hash", number: "ONE", customer_name: "Fixture only", email: "fixture@example.invalid", phone: "00000000000", vehicle: "", note: "", items_json: JSON.stringify([{ productId: "part", name: "Fixture", sku: "SKU-1", image: "", quantity: 2, priceCents: 1000 }]), total_cents: 2000, status: "AWAITING_APPROVAL", created_at: now, updated_at: now, revision: 0, inventory_mode: "erp", inventory_status: "UNRESERVED", erp_revision: 0, reservation_expires_at: null, approved_by: null, approved_at: null, approval_key: null }],
      commerce_order_events: [{ id: "event-one", owner, store, order_id: "order-one", status: "AWAITING_APPROVAL", created_at: now, actor: null, detail: null }],
      commerce_settings: [{ owner, store, erp_access_enabled: 1, stock_integration_enabled: 1 }],
      commerce_inventory_jobs: [],
    },
  };
}
function legacyFixture() {
  const source = fixture();
  Object.assign(source.tables.commerce_orders[0], { status: "CANCELLED", inventory_status: "RELEASED", revision: 2 });
  source.tables.commerce_inventory_jobs.push({ id: "job-one", owner, store, order_id: "order-one", local_revision: 0, action: "RESERVE", payload: JSON.stringify({ externalOrderId: "order-one", items: [{ externalId: "part", quantity: 2, priceCents: 1000 }] }), state: "APPLIED", attempts: 1, last_error: null, created_at: now, updated_at: now });
  return source;
}
function rejectsExport(edit, code) {
  const source = fixture();
  edit(source);
  assert.throws(() => prepareImport(source, options), new RegExp(code));
}

// This adapter checks the transaction contract without opening credentials,
// network sockets, emulator endpoints, D1 databases, or production fixtures.
function fakeDb(seed = new Map()) {
  const data = new Map([...seed].map(([path, value]) => [path, clone(value)]));
  const ref = path => ({ path, collection: name => ({ path: `${path}/${name}`, limit: limit => ({ query: `${path}/${name}`, limit }), doc: id => ref(`${path}/${name}/${id}`) }) });
  return {
    data, doc: ref,
    async runTransaction(callback) {
      const writes = [];
      let writing = false;
      const transaction = {
        async get(reference) {
          assert.equal(writing, false, "all destination reads must happen before writes");
          if (reference.query) {
            const docs = [...data].filter(([path]) => path.startsWith(`${reference.query}/`) && path.slice(reference.query.length + 1).split("/").length === 1)
              .slice(0, reference.limit).map(([path, value]) => ({ ref: ref(path), data: () => clone(value) }));
            return { size: docs.length, docs };
          }
          return { exists: data.has(reference.path), data: () => clone(data.get(reference.path)) };
        },
        create(reference, value) {
          writing = true;
          assert(!data.has(reference.path), "existing documents must not be overwritten");
          writes.push([reference.path, value]);
        },
        update(reference, value) {
          writing = true;
          writes.push([reference.path, { ...data.get(reference.path), ...value }]);
        },
      };
      const result = await callback(transaction);
      for (const [path, value] of writes) data.set(path, clone(value));
      return result;
    },
  };
}

test("migration defaults to local dry-run without an apply flag", () => {
  assert.equal(parseOptions(["--input", "fixture.json", "--project", options.project, "--environment", "staging", "--owner", owner]).apply, false);
});
test("migration refuses an unrelated project", () => {
  assert.throws(() => parseOptions(["--input", "fixture.json", "--project", "other", "--environment", "staging", "--owner", owner]), /PROJECT_SCOPE_MISMATCH/);
});
test("migration refuses duplicate flags", () => {
  assert.throws(() => parseOptions(["--apply", "--apply"]), /DUPLICATE_FLAG/);
});
test("migration prepares all rows plus unique keys and no business writes", () => {
  const source = fixture();
  const before = canonical(source);
  const plan = prepareImport(source, options);
  assert.equal(plan.documents.size, 6);
  assert.equal(plan.counts.keys, 2);
  assert.equal(canonical(source), before);
});
test("migration refuses another export owner", () => rejectsExport(value => { value.owner = "foreign"; }, "EXPORT_SCOPE_MISMATCH"));
test("migration refuses a cross-tenant row", () => rejectsExport(value => { value.tables.commerce_products[0].owner = "foreign"; }, "ROW_SCOPE_MISMATCH"));
test("migration refuses duplicate SKUs", () => rejectsExport(value => { value.tables.commerce_products.push({ ...value.tables.commerce_products[0], id: "second" }); }, "DUPLICATE_DOCUMENT_OR_UNIQUE_KEY"));
test("migration refuses duplicate order idempotency keys", () => rejectsExport(value => { value.tables.commerce_orders.push({ ...value.tables.commerce_orders[0], id: "order-two" }); }, "DUPLICATE_DOCUMENT_OR_UNIQUE_KEY"));
test("migration refuses orphan events", () => rejectsExport(value => { value.tables.commerce_order_events[0].order_id = "missing"; }, "INVALID_EVENT_REFERENCE"));
test("migration refuses a document path embedded in an ID", () => rejectsExport(value => { value.tables.commerce_products[0].id = "../unsafe"; }, "INVALID_DOCUMENT_ID"));
test("migration refuses mismatched order totals", () => rejectsExport(value => { value.tables.commerce_orders[0].total_cents = 1; }, "ORDER_TOTAL_MISMATCH"));
test("migration refuses partially recorded approval", () => rejectsExport(value => { value.tables.commerce_orders[0].approved_by = "not-approved"; }, "INCOMPLETE_APPROVAL"));
test("migration refuses negative stock", () => rejectsExport(value => { value.tables.commerce_products[0].stock = -1; }, "NEGATIVE_OR_UNSAFE_NUMBER"));
test("migration refuses an oversized document before connecting", () => rejectsExport(value => { value.tables.commerce_products[0].description = "x".repeat(925000); }, "DOCUMENT_TOO_LARGE"));
test("migration refuses unknown columns rather than silently discard them", () => rejectsExport(value => { value.tables.commerce_products[0].unexpected = "x"; }, "ROW_COLUMNS_MISMATCH"));
test("migration preserves legacy terminal reservations and reports their count", () => {
  const source = legacyFixture();
  const plan = prepareImport(source, options);
  assert.equal(plan.warnings.legacyTerminalJobs, 1);
  assert.equal(plan.warnings.legacyTerminalOrders, 1);
  assert.deepEqual(plan.documents.get(`${plan.root}/jobs/job-one`), source.tables.commerce_inventory_jobs[0]);
  assert.equal(plan.documents.get(`${plan.root}/orders/order-one`).approved_by, null);
});
test("migration never imports an active reservation without approval", () => {
  const source = legacyFixture();
  Object.assign(source.tables.commerce_inventory_jobs[0], { state: "PENDING", local_revision: 1 });
  assert.throws(() => prepareImport(source, options), /RESERVATION_REQUIRES_APPROVAL/);
});
test("migration destination comparison performs zero writes", async () => {
  const db = fakeDb();
  const result = await inspectOrApply(db, prepareImport(fixture(), options), options);
  assert.equal(result.written, 0);
  assert.equal(db.data.size, 0);
});
test("migration creates a complete small snapshot and separate manifest together", async () => {
  const db = fakeDb();
  const plan = prepareImport(fixture(), options);
  const result = await inspectOrApply(db, plan, apply);
  assert.equal(result.written, 7);
  assert.equal(db.data.size, 7);
  assert.equal(db.data.get(`${plan.root}/migrations/${plan.hash}`).snapshot_sha256, plan.hash);
  assert.equal(db.data.get(`${plan.root}/orders/order-one`).imported_at, undefined);
});
test("migration replay writes nothing", async () => {
  const db = fakeDb();
  const plan = prepareImport(fixture(), options);
  await inspectOrApply(db, plan, apply);
  const before = canonical([...db.data]);
  assert.equal((await inspectOrApply(db, plan, apply)).written, 0);
  assert.equal(canonical([...db.data]), before);
});
test("migration preserves a valid destination order guard", async () => {
  const plan = prepareImport(fixture(), options);
  const db = fakeDb(plan.documents);
  db.data.get(plan.root)._order_guard = 42;
  await inspectOrApply(db, plan, apply);
  assert.equal(db.data.get(plan.root)._order_guard, 42);
});
test("migration refuses divergent business data without changing any document", async () => {
  const plan = prepareImport(fixture(), options);
  const db = fakeDb(plan.documents);
  db.data.get(`${plan.root}/products/part`).stock = 3;
  const before = canonical([...db.data]);
  await assert.rejects(inspectOrApply(db, plan, apply), /DESTINATION_DATA_DIVERGES/);
  assert.equal(canonical([...db.data]), before);
});
test("migration refuses data absent from the export without deleting it", async () => {
  const plan = prepareImport(fixture(), options);
  const db = fakeDb(plan.documents);
  db.data.set(`${plan.root}/orders/unexported`, { owner, store });
  const before = canonical([...db.data]);
  await assert.rejects(inspectOrApply(db, plan, apply), /DESTINATION_DATA_DIVERGES/);
  assert.equal(canonical([...db.data]), before);
});
test("migration initializes a missing guard on an otherwise identical store", async () => {
  const plan = prepareImport(fixture(), options);
  const db = fakeDb(plan.documents);
  delete db.data.get(plan.root)._order_guard;
  const result = await inspectOrApply(db, plan, apply);
  assert.equal(db.data.get(plan.root)._order_guard, 0);
  assert.equal(result.written, 2);
});
test("migration derives product positions from export order without changing rows", () => {
  const source = fixture();
  source.tables.commerce_products.push({ ...source.tables.commerce_products[0], id: "another", sku: "SKU-2" });
  const plan = prepareImport(source, options);
  assert.equal(plan.documents.get(`${plan.root}/products/part`)._position, 0);
  assert.equal(plan.documents.get(`${plan.root}/products/another`)._position, 1);
  assert.equal(source.tables.commerce_products[0]._position, undefined);
});
test("migration preserves explicitly supplied valid product positions", () => {
  const source = fixture();
  source.tables.commerce_products[0]._position = 12;
  const plan = prepareImport(source, options);
  assert.equal(plan.documents.get(`${plan.root}/products/part`)._position, 12);
  assert.equal(plan.automaticPositions.size, 0);
});
test("migration refuses invalid product positions in the export", () => {
  for (const invalid of [-1, 0.5, "0", null, Number.MAX_SAFE_INTEGER + 1]) {
    const source = fixture();
    source.tables.commerce_products[0]._position = invalid;
    assert.throws(() => prepareImport(source, options), /INVALID_COLUMN_TYPE|NEGATIVE_OR_UNSAFE_NUMBER/);
  }
});
test("migration preserves destination ordering when the export has no position", async () => {
  const plan = prepareImport(fixture(), options);
  const db = fakeDb(plan.documents);
  db.data.get(`${plan.root}/products/part`)._position = 15;
  await inspectOrApply(db, plan, apply);
  assert.equal(db.data.get(`${plan.root}/products/part`)._position, 15);
  assert.equal((await inspectOrApply(db, plan, apply)).written, 0);
});
test("migration initializes missing destination positions without rewriting business fields", async () => {
  const plan = prepareImport(fixture(), options);
  const db = fakeDb(plan.documents);
  delete db.data.get(`${plan.root}/products/part`)._position;
  const result = await inspectOrApply(db, plan, apply);
  assert.deepEqual(db.data.get(`${plan.root}/products/part`), plan.documents.get(`${plan.root}/products/part`));
  assert.equal(result.written, 2);
});
test("migration refuses invalid destination positions", async () => {
  const plan = prepareImport(fixture(), options);
  const db = fakeDb(plan.documents);
  db.data.get(`${plan.root}/products/part`)._position = -2;
  const before = canonical([...db.data]);
  await assert.rejects(inspectOrApply(db, plan, apply), /INVALID_DESTINATION_PRODUCT_POSITION/);
  assert.equal(canonical([...db.data]), before);
});
test("migration refuses a conflicting explicit position", async () => {
  const source = fixture();
  source.tables.commerce_products[0]._position = 2;
  const plan = prepareImport(source, options);
  const db = fakeDb(plan.documents);
  db.data.get(`${plan.root}/products/part`)._position = 3;
  await assert.rejects(inspectOrApply(db, plan, apply), /DESTINATION_DATA_DIVERGES/);
});
test("migration still refuses divergent stock when presentation metadata is absent", async () => {
  const plan = prepareImport(fixture(), options);
  const db = fakeDb(plan.documents);
  delete db.data.get(`${plan.root}/products/part`)._position;
  db.data.get(`${plan.root}/products/part`).stock = 3;
  const before = canonical([...db.data]);
  await assert.rejects(inspectOrApply(db, plan, apply), /DESTINATION_DATA_DIVERGES/);
  assert.equal(canonical([...db.data]), before);
});
