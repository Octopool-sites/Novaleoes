import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { Firestore } from "@google-cloud/firestore";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { handleApi } from "../outputs/test-firestore-handler.mjs";

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (host && !/^(?:127\.0\.0\.1|localhost):\d+$/.test(host))
  throw Error("Handler tests require a local Firestore emulator; remote databases are forbidden.");
const enabled = !!host;
const project = "demo-nova-leoes-handler-tests";
const origin = "https://shop.example.invalid";
const email = "operator@example.invalid";
const uid = "handler-operator";
const db = enabled ? new Firestore({ projectId: project }) : null;
const originalFetch = globalThis.fetch;
const environmentKeys = ["STORE_OWNER", "FIREBASE_PROJECT_ID", "FIREBASE_API_KEY", "COMMERCE_APPROVERS", "COMMERCE_LOGIN_ALIASES",
  "CATALOG_MODE", "PUBLIC_ORDERS_ENABLED", "REQUIRE_SHARED_STOCK", "COMMERCE_ERP_ORIGIN", "COMMERCE_ERP_TOKEN", "COMMERCE_ERP_OWNER",
  "COMMERCE_ALLOWED_ORIGINS", "COMMERCE_READ_ONLY", "RATE_LIMIT_SALT", "CRON_SECRET", "VERCEL", "VERCEL_ENV", "VERCEL_URL"];
const originalEnvironment = new Map(environmentKeys.map(key => [key, process.env[key]]));
const scopes = [];
let privateKey, jwk, idToken, account, providerCalls, erpCalls, erpOffline, reservations, commandKeys, activeOwner;
const epoch = () => Math.floor(Date.now() / 1000);
const run = (name, fn) => test(`Firestore handler: ${name}`, { skip: !enabled }, fn);
const keyId = (kind, value) => `${kind}_${createHash("sha256").update(value).digest("hex")}`;

async function token(overrides = {}) {
  return new SignJWT({ email, email_verified: false, auth_time: epoch() - 10, firebase: { sign_in_provider: "password" },
    iss: `https://securetoken.google.com/${project}`, aud: project, sub: uid, iat: epoch(), exp: epoch() + 3600, ...overrides })
    .setProtectedHeader({ alg: "RS256", kid: "handler-fixture-key" }).sign(privateKey);
}

before(async () => {
  if (!enabled) return;
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  jwk = { ...await exportJWK(pair.publicKey), kid: "handler-fixture-key", alg: "RS256", use: "sig" };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    // Only the isolated local emulator may bypass these explicit provider mocks.
    if (url.host === host) return originalFetch(input, init);
    assert.equal(init.redirect, "manual");
    if (url.href === "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com") {
      providerCalls.push(url.href);
      return Response.json({ keys: [jwk] });
    }
    if (url.origin === "https://identitytoolkit.googleapis.com") {
      providerCalls.push(url.href);
      const body = JSON.parse(init.body);
      if (url.pathname.endsWith("accounts:lookup")) return Response.json({ users: account ? [account] : [] });
      if (url.pathname.endsWith("accounts:signInWithPassword")) {
        if (body.email !== email || body.password !== "correct-fixture-password")
          return Response.json({ error: { message: "INVALID_LOGIN_CREDENTIALS" } }, { status: 400 });
        return Response.json({ idToken, refreshToken: "handler-fixture-refresh", email, localId: uid });
      }
      throw Error(`Unexpected Firebase endpoint ${url.pathname}`);
    }
    assert.equal(url.origin, "https://api.octopool.com.br", "Unexpected external network call");
    const path = url.pathname.replace("/api/commerce-stock", "");
    const body = init.body ? JSON.parse(init.body) : null;
    erpCalls.push({ path, method: init.method || "GET", body });
    if (erpOffline) throw Error("simulated ERP outage");
    if (path === "/inventory") return Response.json({ contract: "octopool.stock.v1", ownerRef: activeOwner, storeKey: "nova-leoes",
      products: [{ externalId: "piece", available: 3, priceCents: 1000, version: 1 }] });
    if (path === "/maintenance") return Response.json({ ok: true });
    if (path === "/events") return Response.json({ events: [] });
    if (path === "/reservations") {
      if (!reservations.has(body.externalOrderId)) reservations.set(body.externalOrderId, {
        externalOrderId: body.externalOrderId, status: "HELD", revision: 1,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(), totalCents: 1000,
      });
      return Response.json(reservations.get(body.externalOrderId));
    }
    const command = path.match(/^\/reservations\/([^/]+)\/commands$/);
    if (command) {
      if (!commandKeys.has(body.key)) {
        const previous = reservations.get(command[1]);
        assert.ok(previous);
        assert.equal(body.revision, previous.revision);
        const status = { CONFIRM: "CONFIRMED", COMPLETE: "COMPLETED", CANCEL: "RELEASED" }[body.action];
        assert.ok(status);
        const current = { ...previous, status, revision: previous.revision + 1 };
        commandKeys.set(body.key, current);
        reservations.set(command[1], current);
      }
      return Response.json(commandKeys.get(body.key));
    }
    const reservation = path.match(/^\/reservations\/([^/]+)$/);
    if (reservation && reservations.has(reservation[1])) return Response.json(reservations.get(reservation[1]));
    throw Error(`Unexpected ERP endpoint ${path}`);
  };
});

beforeEach(async () => {
  if (!enabled) return;
  providerCalls = []; erpCalls = []; erpOffline = false; reservations = new Map(); commandKeys = new Map();
  account = { localId: uid, email, emailVerified: false, validSince: "0", disabled: false };
  idToken = await token();
  for (const name of environmentKeys) delete process.env[name];
  Object.assign(process.env, { FIREBASE_PROJECT_ID: project, FIREBASE_API_KEY: "AIza" + "a".repeat(35),
    COMMERCE_APPROVERS: email, COMMERCE_LOGIN_ALIASES: JSON.stringify({ [email]: uid }), CATALOG_MODE: "staging",
    PUBLIC_ORDERS_ENABLED: "1", COMMERCE_ALLOWED_ORIGINS: origin, RATE_LIMIT_SALT: "fixture-salt-".repeat(4),
    CRON_SECRET: "fixture-cron-".repeat(4) });
});

after(async () => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of originalEnvironment) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  if (db) {
    for (const ref of scopes) await db.recursiveDelete(ref);
    await db.terminate();
  }
});

async function fixture({ integrated = false } = {}) {
  activeOwner = `handler-${randomUUID()}`;
  process.env.STORE_OWNER = activeOwner;
  if (integrated) Object.assign(process.env, { REQUIRE_SHARED_STOCK: "1", COMMERCE_ERP_ORIGIN: "https://api.octopool.com.br",
    COMMERCE_ERP_TOKEN: "a".repeat(64), COMMERCE_ERP_OWNER: activeOwner });
  const ref = db.doc(`commerce/staging/tenants/${activeOwner}/stores/nova-leoes`);
  scopes.push(ref);
  const batch = db.batch();
  batch.create(ref, { owner: activeOwner, store: "nova-leoes", erp_access_enabled: Number(integrated), stock_integration_enabled: Number(integrated) });
  batch.create(ref.collection("products").doc("piece"), { owner: activeOwner, store: "nova-leoes", id: "piece", sku: "SKU", name: "Peça de teste",
    brand: "Marca", category: "Motor", price_cents: 1000, stock: 3, image: "", description: "Teste", published: 1, erp_version: -1 });
  batch.create(ref.collection("keys").doc(keyId("sku", "SKU")), { owner: activeOwner, store: "nova-leoes", kind: "sku", value: "SKU", target_id: "piece" });
  await batch.commit();
  return { ref, call };
}

async function call(path, { method = "GET", body, authenticated = false, headers = {}, urlOrigin = origin } = {}) {
  const response = await handleApi(new Request(urlOrigin + path, { method,
    headers: { origin, "content-type": "application/json", "x-forwarded-for": "198.51.100.10", ...(authenticated ? { cookie: `__Host-commerce-session-firebase-id=${idToken}` } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }));
  return { status: response.status, body: await response.json(), cookies: response.headers.getSetCookie(), headers: response.headers };
}

function orderInput() {
  return { idempotency: randomUUID(), customerName: "Cliente de teste", email: "customer@example.test", phone: "11999990000",
    vehicle: "Veículo de teste", note: "", items: [{ productId: "piece", quantity: 1 }] };
}

async function snapshot(ref) {
  const rows = { settings: (await ref.get()).data() };
  for (const collection of ["orders", "products", "events", "jobs", "keys", "maintenance"])
    rows[collection] = Object.fromEntries((await ref.collection(collection).get()).docs.map(doc => [doc.id, doc.data()]));
  return rows;
}

run("public catalog stays accessible while private routes and unsupported origins are denied", async () => {
  await fixture();
  const catalog = await call("/api/public/catalog");
  assert.equal(catalog.status, 200);
  assert.equal(catalog.body.ordersEnabled, true);
  assert.equal(catalog.body.requiresApproval, true);
  assert.equal(catalog.body.products.length, 1);
  for (const path of ["/api/session", "/api/orders", "/api/manage/catalog", "/api/integration"])
    assert.equal((await call(path)).status, 401);
  const badOrigin = await call("/api/public/catalog", { urlOrigin: "https://attacker.invalid" });
  assert.equal(badOrigin.status, 403);
  assert.match(catalog.headers.get("cache-control"), /no-store/);
  assert.deepEqual(providerCalls, []);
  assert.deepEqual(erpCalls, []);
});

run("a Firebase internal alias logs in with host cookies and its live account remains authoritative", async () => {
  await fixture();
  assert.deepEqual((await call("/api/auth/status")).body, { configured: true, accessReady: true, passwordRecovery: false });
  const login = await call("/api/auth/login", { method: "POST", body: { email, password: "correct-fixture-password" } });
  assert.equal(login.status, 200);
  assert.deepEqual(login.body, { ok: true });
  assert.equal(login.cookies.length, 2);
  assert.ok(login.cookies.every(cookie => cookie.startsWith("__Host-") && cookie.includes("HttpOnly") && cookie.includes("Secure") && cookie.includes("SameSite=Lax") && !cookie.includes("Domain=")));
  const session = await call("/api/session", { headers: { cookie: login.cookies.map(cookie => cookie.split(";")[0]).join("; ") } });
  assert.equal(session.status, 200);
  assert.equal(session.body.email, email);
  assert.equal(session.body.environment, "staging");
  account.disabled = true;
  assert.equal((await call("/api/session", { authenticated: true })).status, 401);
  assert.ok(providerCalls.every(url => !url.includes("sendOobCode")));
});

run("public submissions and replay await approval without ERP calls or stock movement", async () => {
  const { ref } = await fixture({ integrated: true });
  const body = orderInput();
  const created = await call("/api/public/orders", { method: "POST", body });
  assert.equal(created.status, 201);
  assert.equal(created.body.order.status, "AWAITING_APPROVAL");
  assert.equal(created.body.order.inventoryStatus, "UNRESERVED");
  const replay = await call("/api/public/orders", { method: "POST", body });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.order.id, created.body.order.id);
  assert.equal(replay.body.replayed, true);
  assert.equal((await ref.collection("orders").get()).size, 1);
  assert.equal((await ref.collection("events").get()).size, 1);
  assert.equal((await ref.collection("jobs").get()).size, 0);
  assert.equal((await ref.collection("products").doc("piece").get()).data().stock, 3);
  assert.deepEqual(erpCalls, []);
  assert.deepEqual(providerCalls, []);
});

run("public catalog returns the refreshed Firestore snapshot and reuses it within the lease", async () => {
  const { ref } = await fixture({ integrated: true });
  await ref.collection("products").doc("piece").update({ stock: 0, price_cents: 500, erp_version: 0 });
  const first = await call("/api/public/catalog");
  assert.equal(first.status, 200);
  assert.equal(first.body.products[0].stock, 3);
  assert.equal(first.body.products[0].priceCents, 1000);
  const second = await call("/api/public/catalog");
  assert.equal(second.status, 200);
  assert.deepEqual(second.body.products, first.body.products);
  assert.deepEqual(erpCalls.map(call => [call.method, call.path]), [["GET", "/inventory"]]);
  assert.equal((await ref.collection("orders").get()).size, 0);
  assert.equal((await ref.collection("jobs").get()).size, 0);
  assert.deepEqual(providerCalls, []);
});

run("CSRF cannot create a public order or approve a private one", async () => {
  const { ref } = await fixture();
  const denied = await call("/api/public/orders", { method: "POST", body: orderInput(), headers: { origin: "https://attacker.invalid" } });
  assert.equal(denied.status, 403);
  assert.equal((await ref.collection("orders").get()).size, 0);
  const created = await call("/api/public/orders", { method: "POST", body: orderInput() });
  const path = `/api/orders/${created.body.order.id}`;
  const approval = await call(`${path}/approve`, { method: "POST", authenticated: true, body: { revision: 0, idempotency: randomUUID() }, headers: { origin: "https://attacker.invalid" } });
  assert.equal(approval.status, 403);
  const bypass = await call(path, { method: "PATCH", authenticated: true, body: { status: "CONFIRMED", revision: 0 } });
  assert.equal(bypass.status, 409);
  assert.equal((await ref.collection("orders").doc(created.body.order.id).get()).data().status, "AWAITING_APPROVAL");
  assert.equal((await ref.collection("products").doc("piece").get()).data().stock, 3);
});

run("approval reserves once and a replay remains readable during an ERP outage", async () => {
  const { ref } = await fixture({ integrated: true });
  const created = await call("/api/public/orders", { method: "POST", body: orderInput() });
  const path = `/api/orders/${created.body.order.id}/approve`;
  const body = { revision: 0, idempotency: randomUUID() };
  const approved = await call(path, { method: "POST", body, authenticated: true });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.order.status, "CONFIRMED");
  assert.equal(approved.body.order.approvedBy, email);
  const replay = await call(path, { method: "POST", body, authenticated: true });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(erpCalls.filter(call => call.path === "/reservations").length, 1);
  assert.equal(erpCalls.filter(call => call.path.endsWith("/commands")).length, 1);
  assert.equal((await ref.collection("jobs").get()).size, 1);
  assert.equal((await ref.collection("products").doc("piece").get()).data().stock, 3);
  erpOffline = true;
  const replayOffline = await call(path, { method: "POST", body, authenticated: true });
  assert.equal(replayOffline.status, 200);
  assert.equal(replayOffline.body.replayed, true);
  assert.equal(replayOffline.body.order.status, "CONFIRMED");
});

run("read-only mode does not recover pending jobs, write orders, or acquire maintenance leases", async () => {
  const { ref } = await fixture({ integrated: true });
  const created = await call("/api/public/orders", { method: "POST", body: orderInput() });
  const id = created.body.order.id, stamp = new Date().toISOString(), jobId = randomUUID();
  const batch = db.batch();
  batch.update(ref.collection("orders").doc(id), { status: "STOCK_PENDING", inventory_status: "PENDING", revision: 1,
    approved_by: email, approved_at: stamp, approval_key: randomUUID() });
  batch.create(ref.collection("jobs").doc(jobId), { id: jobId, owner: activeOwner, store: "nova-leoes", order_id: id, local_revision: 1,
    action: "RESERVE", payload: JSON.stringify({ externalOrderId: id, items: [{ externalId: "piece", quantity: 1, priceCents: 1000 }] }),
    state: "PENDING", attempts: 0, created_at: stamp, updated_at: stamp });
  await batch.commit();
  process.env.COMMERCE_READ_ONLY = "1";
  const before = await snapshot(ref);
  assert.equal((await call("/api/orders", { authenticated: true })).status, 200);
  const detail = await call(`/api/orders/${id}`, { authenticated: true });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.order.status, "STOCK_PENDING");
  assert.equal((await call(`/api/orders/${id}/approve`, { authenticated: true, method: "POST", body: { revision: 1, idempotency: randomUUID() } })).status, 503);
  assert.equal((await call("/api/public/orders", { method: "POST", body: orderInput() })).status, 503);
  assert.equal((await call("/api/maintenance", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })).status, 503);
  assert.equal((await call("/api/public/catalog")).body.ordersEnabled, false);
  assert.deepEqual(await snapshot(ref), before);
  assert.deepEqual(erpCalls, []);
});

run("forged Cloudflare IP headers cannot bypass the Vercel rate bucket", async () => {
  const { ref } = await fixture();
  const request = orderInput(), originalNow = Date.now, fixedNow = Date.now();
  Date.now = () => fixedNow;
  try {
    for (let n = 0; n < 10; n++) {
      const response = await call("/api/public/orders", { method: "POST", body: request,
        headers: { "cf-connecting-ip": `203.0.113.${n + 1}`, "x-forwarded-for": "198.51.100.200" } });
      assert.equal(response.status, n ? 200 : 201);
    }
    const denied = await call("/api/public/orders", { method: "POST", body: request,
      headers: { "cf-connecting-ip": "203.0.113.250", "x-forwarded-for": "198.51.100.200" } });
    assert.equal(denied.status, 429);
    const buckets = await ref.collection("rateLimits").get();
    assert.equal(buckets.size, 1);
    assert.equal(buckets.docs[0].data().count, 10);
    assert.equal((await ref.collection("orders").get()).size, 1);
  } finally { Date.now = originalNow; }
});
