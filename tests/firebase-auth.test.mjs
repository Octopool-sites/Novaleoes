import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import worker from '../outputs/test-worker.mjs';

const project = 'nova-leoes-auth-fixture';
const email = 'approver@example.invalid';
const issuer = `https://securetoken.google.com/${project}`;
const originalFetch = globalThis.fetch;
let privateKey, jwk, idToken, account, calls, redirect, offline, sentMessages, refreshToken;
const now = () => Math.floor(Date.now() / 1000);

async function token(overrides = {}, signer = privateKey) {
  return new SignJWT({ email, email_verified: true, auth_time: now() - 10, firebase: { sign_in_provider: 'password' },
    iss: issuer, aud: project, sub: 'operator-firebase', iat: now(), exp: now() + 3600, ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'fixture-google-key' }).sign(signer);
}

before(async () => {
  const pair = await generateKeyPair('RS256'); privateKey = pair.privateKey;
  jwk = { ...await exportJWK(pair.publicKey), kid: 'fixture-google-key', alg: 'RS256', use: 'sig' };
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    assert.equal(init.redirect, 'manual');
    if (redirect) return new Response(null, { status: 302, headers: { location: 'https://attacker.invalid/' } });
    if (offline) throw Error('provider unavailable');
    if (url === 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com') return Response.json({ keys: [jwk] });
    if (url.startsWith('https://securetoken.googleapis.com/v1/token?key=')) {
      const body = new URLSearchParams(init.body);
      assert.equal(body.get('grant_type'), 'refresh_token');
      if (body.get('refresh_token') !== 'fixture-refresh') return Response.json({ error: { message: 'INVALID_REFRESH_TOKEN' } }, { status: 400 });
      return Response.json({ id_token: refreshToken, refresh_token: 'fixture-refresh-new', user_id: 'operator-firebase', project_id: '123456789' });
    }
    assert.ok(url.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:'), `Unexpected network call ${url}`);
    const body = JSON.parse(init.body);
    if (url.includes('accounts:signInWithPassword')) {
      if (body.password !== 'correct-password' || body.email !== email) return Response.json({ error: { message: 'INVALID_LOGIN_CREDENTIALS' } }, { status: 400 });
      return Response.json({ idToken, refreshToken: 'fixture-refresh', email, localId: 'operator-firebase' });
    }
    if (url.includes('accounts:lookup')) return Response.json({ users: account ? [account] : [] });
    if (url.includes('accounts:sendOobCode')) { sentMessages.push(body); return Response.json({ email }); }
    throw Error('Unexpected provider endpoint');
  };
});
beforeEach(async () => {
  calls = []; sentMessages = []; redirect = false; offline = false;
  idToken = await token(); refreshToken = await token();
  account = { localId: 'operator-firebase', email, emailVerified: true, validSince: '0', disabled: false };
});
after(() => { globalThis.fetch = originalFetch; });

class Statement {
  constructor(db, sql, values = []) { this.db = db; this.sql = sql; this.values = values; }
  bind(...values) { return new Statement(this.db, this.sql, values); }
  async first() { return this.db.prepare(this.sql).get(...this.values) || null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.values), success: true }; }
  async run() { const result = this.db.prepare(this.sql).run(...this.values); return { success: true, meta: { changes: Number(result.changes) } }; }
}
function fixture() {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0000_flawless_tarantula.sql', '0001_lame_obadiah_stane.sql', '0002_manual_approval.sql']) db.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
  db.prepare("INSERT INTO commerce_products(owner,store,id,sku,name,brand,category,price_cents,stock,image,description,published) VALUES('tenant-a','nova-leoes','piece','SKU','Peça','Marca','Motor',1000,3,'','',1)").run();
  const env = {
    DB: { prepare: sql => new Statement(db, sql), async batch(statements) { db.exec('BEGIN'); try { const results = []; for (const statement of statements) results.push(await statement.run()); db.exec('COMMIT'); return results; } catch (error) { db.exec('ROLLBACK'); throw error; } } },
    ASSETS: { fetch: async () => new Response('asset') }, STORE_OWNER: 'tenant-a',
    COMMERCE_AUTH_PROVIDER: 'firebase', FIREBASE_PROJECT_ID: project, FIREBASE_API_KEY: 'AIza' + 'a'.repeat(35),
    COMMERCE_APPROVERS: email, AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) },
    PUBLIC_ORDERS_ENABLED: '1', ORDER_RATE_LIMITER: { limit: async () => ({ success: true }) },
    // Explicitly configured legacy provider must never receive fallback calls.
    SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  };
  const call = async (path, method = 'GET', body, cookie = '', extra = {}) => {
    const response = await worker.fetch(new Request('https://shop.example.invalid' + path, {
      method, headers: { origin: 'https://shop.example.invalid', 'content-type': 'application/json', cookie, ...extra },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }), env, {});
    return { status: response.status, body: await response.json(), cookies: response.headers.getSetCookie(), headers: response.headers };
  };
  return { env, db, call };
}
const cookies = (tokenValue = idToken, refresh = 'fixture-refresh') => `__Host-commerce-session-firebase-id=${tokenValue}; __Host-commerce-session-firebase-refresh=${refresh}`;
const loginInput = () => ({ email, password: 'correct-password' });

test('Firebase login creates only HttpOnly host cookies and authenticates a private request', async () => {
  const f = fixture();
  assert.deepEqual((await f.call('/api/auth/status')).body, { configured: true, accessReady: true, passwordRecovery: true });
  const result = await f.call('/api/auth/login', 'POST', loginInput());
  assert.equal(result.status, 200); assert.deepEqual(result.body, { ok: true }); assert.equal(result.cookies.length, 2);
  assert.ok(result.cookies.every(cookie => cookie.startsWith('__Host-') && cookie.includes('Secure') && cookie.includes('HttpOnly') && cookie.includes('SameSite=Lax') && !cookie.includes('Domain=')));
  assert.match(result.headers.get('cache-control'), /no-store/);
  const session = await f.call('/api/session', 'GET', undefined, result.cookies.map(cookie => cookie.split(';')[0]).join('; '));
  assert.equal(session.status, 200); assert.equal(session.body.email, email);
  assert.ok(calls.every(url => !url.includes('supabase')));
});

test('Firebase denies wrong password, unauthorized address, CSRF and missing rate limiter', async () => {
  const f = fixture();
  assert.equal((await f.call('/api/auth/login', 'POST', { ...loginInput(), password: 'wrong' })).status, 401);
  calls = [];
  assert.equal((await f.call('/api/auth/login', 'POST', { ...loginInput(), email: 'other@example.invalid' })).status, 401);
  assert.deepEqual(calls, []);
  assert.equal((await f.call('/api/auth/login', 'POST', loginInput(), '', { origin: 'https://attacker.invalid' })).status, 403);
  f.env.AUTH_RATE_LIMITER = undefined;
  assert.equal((await f.call('/api/auth/login', 'POST', loginInput())).status, 503);
});

test('Firebase verifies signature, exact project, password provider and authentication age', async () => {
  const f = fixture(); const attacker = await generateKeyPair('RS256');
  for (const rejected of [
    await token({}, attacker.privateKey), await token({ aud: 'another-project' }), await token({ iss: 'https://attacker.invalid' }),
    await token({ firebase: { sign_in_provider: 'anonymous' } }), await token({ auth_time: now() - 8 * 86400 }),
    await token({ iat: now() + 60 }), await token({ auth_time: now() + 60 }),
  ]) assert.equal((await f.call('/api/session', 'GET', undefined, cookies(rejected))).status, 401);
});

test('Firebase rejects changed, disabled, deleted, unverified and revoked accounts immediately', async () => {
  const f = fixture();
  for (const change of [{ email: 'other@example.invalid' }, { localId: 'other-user' }, { emailVerified: false }, { disabled: true }, { validSince: String(now()) }]) {
    const previous = account; account = { ...previous, ...change };
    assert.equal((await f.call('/api/session', 'GET', undefined, cookies())).status, 401);
    account = previous;
  }
  account = null;
  assert.equal((await f.call('/api/session', 'GET', undefined, cookies())).status, 401);
  f.env.COMMERCE_APPROVERS = 'other@example.invalid';
  assert.equal((await f.call('/api/session', 'GET', undefined, cookies())).status, 401);
});

test('expired Firebase ID tokens refresh server-side without returning tokens in JSON', async () => {
  const f = fixture(); const expired = await token({ exp: now() - 30 });
  const response = await f.call('/api/session', 'GET', undefined, cookies(expired));
  assert.equal(response.status, 200); assert.equal(response.cookies.length, 2);
  assert.ok(!JSON.stringify(response.body).includes(refreshToken));
  assert.ok(calls.some(url => url.includes('securetoken.googleapis.com')));
  refreshToken = await token({ aud: 'another-project' });
  assert.equal((await f.call('/api/session', 'GET', undefined, cookies(expired))).status, 401);
});

test('unverified Firebase login sends confirmation and grants no session', async () => {
  const f = fixture(); idToken = await token({ email_verified: false }); account.emailVerified = false;
  const response = await f.call('/api/auth/login', 'POST', loginInput());
  assert.equal(response.status, 403); assert.equal(response.cookies.length, 0);
  assert.equal(sentMessages.length, 1); assert.equal(sentMessages[0].requestType, 'VERIFY_EMAIL');
  assert.ok(!JSON.stringify(response.body).includes(idToken));
});

test('a pre-provisioned internal alias uses its exact UID without verifying or emailing a fictional mailbox', async () => {
  const f = fixture();
  f.env.COMMERCE_LOGIN_ALIASES = JSON.stringify({ [email]: 'operator-firebase' });
  idToken = await token({ email_verified: false }); account.emailVerified = false;
  assert.deepEqual((await f.call('/api/auth/status')).body, { configured: true, accessReady: true, passwordRecovery: false });
  const login = await f.call('/api/auth/login', 'POST', loginInput());
  assert.equal(login.status, 200); assert.equal(login.cookies.length, 2);
  const session = await f.call('/api/session', 'GET', undefined, cookies());
  assert.equal(session.status, 200); assert.equal(session.body.email, email);
  assert.equal(account.emailVerified, false);
  assert.deepEqual(sentMessages, []);
  assert.ok(calls.every(url => !url.includes('accounts:update') && !url.includes('accounts:signUp')));
});

test('internal alias UID binding cannot be bypassed by verified email or a recreated account', async () => {
  const f = fixture(); f.env.COMMERCE_LOGIN_ALIASES = JSON.stringify({ [email]: 'original-user-uid' });
  for (const verified of [false, true]) {
    idToken = await token({ email_verified: verified }); account.emailVerified = verified;
    const login = await f.call('/api/auth/login', 'POST', loginInput());
    assert.equal(login.status, 401); assert.equal(login.cookies.length, 0);
    assert.equal((await f.call('/api/session', 'GET', undefined, cookies())).status, 401);
  }
  assert.deepEqual(sentMessages, []);
});

test('unmapped addresses still require verified email when another internal alias is configured', async () => {
  const f = fixture(); f.env.COMMERCE_LOGIN_ALIASES = JSON.stringify({ 'internal@example.invalid': 'internal-user-uid' });
  idToken = await token({ email_verified: false }); account.emailVerified = false;
  assert.equal((await f.call('/api/auth/login', 'POST', loginInput())).status, 403);
  assert.equal((await f.call('/api/session', 'GET', undefined, cookies())).status, 401);
  assert.deepEqual(sentMessages, [{ requestType: 'VERIFY_EMAIL', idToken }]);
  idToken = await token(); account.emailVerified = true;
  assert.equal((await f.call('/api/auth/login', 'POST', loginInput())).status, 200);
  assert.equal((await f.call('/api/session', 'GET', undefined, cookies())).status, 200);
});

test('internal aliases still require the allowlist, password provider, live account and non-revoked session', async () => {
  const f = fixture(); f.env.COMMERCE_LOGIN_ALIASES = JSON.stringify({ [email]: 'operator-firebase' });
  idToken = await token({ email_verified: false }); account.emailVerified = false;
  for (const change of [{ disabled: true }, { validSince: String(now()) }, { localId: 'different-user' }, { email: 'changed@example.invalid' }]) {
    const previous = account; account = { ...previous, ...change };
    assert.equal((await f.call('/api/session', 'GET', undefined, cookies())).status, 401);
    account = previous;
  }
  for (const change of [{ firebase: { sign_in_provider: 'google.com' } }, { aud: 'other-project' }, { auth_time: now() - 8 * 86400 }]) {
    const invalid = await token({ email_verified: false, ...change });
    assert.equal((await f.call('/api/session', 'GET', undefined, cookies(invalid))).status, 401);
  }
  account = null;
  assert.equal((await f.call('/api/session', 'GET', undefined, cookies())).status, 401);
  f.env.COMMERCE_APPROVERS = 'different@example.invalid'; calls = [];
  assert.equal((await f.call('/api/session', 'GET', undefined, cookies())).status, 401);
  assert.equal((await f.call('/api/auth/login', 'POST', loginInput())).status, 401);
  assert.deepEqual(calls, []); assert.deepEqual(sentMessages, []);
});

test('internal aliases refresh only while their UID binding remains authorized', async () => {
  const f = fixture(); f.env.COMMERCE_LOGIN_ALIASES = JSON.stringify({ [email]: 'operator-firebase' });
  account.emailVerified = false; refreshToken = await token({ email_verified: false });
  const expired = await token({ email_verified: false, exp: now() - 30 });
  const refreshed = await f.call('/api/session', 'GET', undefined, cookies(expired));
  assert.equal(refreshed.status, 200); assert.equal(refreshed.cookies.length, 2);
  f.env.COMMERCE_LOGIN_ALIASES = JSON.stringify({ [email]: 'replacement-user-uid' });
  const denied = await f.call('/api/session', 'GET', undefined, cookies(expired));
  assert.equal(denied.status, 401); assert.equal(denied.cookies.length, 0);
  assert.deepEqual(sentMessages, []);
});

test('invalid alias configuration disables auth and order intake without provider calls', async () => {
  const f = fixture();
  for (const aliases of [
    '', '{', 'null', '[]', '"invalid"',
    JSON.stringify({ [email]: '' }), JSON.stringify({ [email]: 'uid with spaces' }),
    JSON.stringify({ [email]: 'uid/with/path' }), JSON.stringify({ [email]: 'a'.repeat(129) }),
    JSON.stringify({ [email]: 42 }), JSON.stringify({ 'not-an-email': 'operator-firebase' }),
    JSON.stringify({ [email]: 'operator-firebase', [email.toUpperCase()]: 'another-uid' }),
    JSON.stringify({ [email]: 'operator-firebase', 'other@example.invalid': 'operator-firebase' }),
  ]) {
    f.env.COMMERCE_LOGIN_ALIASES = aliases;
    assert.deepEqual((await f.call('/api/auth/status')).body, { configured: false, accessReady: true, passwordRecovery: false });
    assert.equal((await f.call('/api/auth/login', 'POST', loginInput())).status, 503);
    assert.equal((await f.call('/api/auth/recover', 'POST', { email })).status, 503);
    assert.equal((await f.call('/api/session', 'GET', undefined, cookies())).status, 401);
    assert.equal((await f.call('/api/public/catalog')).body.ordersEnabled, false);
  }
  assert.deepEqual(calls, []);
});

test('recovery skips aliases and remains available for real addresses in a mixed allowlist', async () => {
  const f = fixture(); const realEmail = 'real-mailbox@example.invalid';
  f.env.COMMERCE_LOGIN_ALIASES = JSON.stringify({ [email]: 'operator-firebase' });
  offline = true;
  const internal = await f.call('/api/auth/recover', 'POST', { email });
  const unknown = await f.call('/api/auth/recover', 'POST', { email: 'unknown@example.invalid' });
  assert.equal(internal.status, 200); assert.deepEqual(internal.body, unknown.body);
  assert.equal((await f.call('/api/auth/status')).body.passwordRecovery, false);
  assert.deepEqual(calls, []); assert.deepEqual(sentMessages, []);
  const activation = await f.call('/api/auth/activate', 'POST', { email, tokenHash: 'a'.repeat(64), type: 'recovery', password: 'new-password-fixture' });
  assert.equal(activation.status, 410); assert.match(activation.body.error, /administrador/);
  assert.doesNotMatch(activation.body.error, /Esqueci minha senha/);
  offline = false; f.env.COMMERCE_APPROVERS = `${email},${realEmail}`;
  assert.equal((await f.call('/api/auth/status')).body.passwordRecovery, true);
  const real = await f.call('/api/auth/recover', 'POST', { email: realEmail });
  assert.equal(real.status, 200); assert.deepEqual(real.body, internal.body);
  assert.deepEqual(sentMessages, [{ requestType: 'PASSWORD_RESET', email: realEmail }]);
  f.env.AUTH_RATE_LIMITER = { limit: async () => ({ success: false }) };
  assert.equal((await f.call('/api/auth/recover', 'POST', { email })).status, 429);
  assert.equal(sentMessages.length, 1);
});

test('recovery is origin checked, rate limited, allowlisted and does not reveal account existence', async () => {
  const f = fixture();
  const allowed = await f.call('/api/auth/recover', 'POST', { email });
  const unknown = await f.call('/api/auth/recover', 'POST', { email: 'unknown@example.invalid' });
  assert.equal(allowed.status, 200); assert.deepEqual(allowed.body, unknown.body);
  assert.deepEqual(sentMessages, [{ requestType: 'PASSWORD_RESET', email }]);
  assert.equal(allowed.cookies.length, 0); assert.match(allowed.headers.get('cache-control'), /no-store/);
  assert.equal((await f.call('/api/auth/recover', 'POST', { email }, '', { origin: 'https://attacker.invalid' })).status, 403);
  f.env.AUTH_RATE_LIMITER = { limit: async () => ({ success: false }) };
  assert.equal((await f.call('/api/auth/recover', 'POST', { email })).status, 429);
  assert.equal(sentMessages.length, 1);
});

test('provider outage and redirects fail closed without calling Supabase or the ERP', async () => {
  const f = fixture();
  for (const scenario of ['redirect', 'offline']) {
    redirect = scenario === 'redirect'; offline = scenario === 'offline';
    const result = await f.call('/api/auth/login', 'POST', loginInput());
    assert.equal(result.status, 503); assert.equal(result.cookies.length, 0);
    assert.equal((await f.call('/api/session', 'GET', undefined, cookies())).status, 401);
    assert.equal((await f.call('/api/auth/recover', 'POST', { email })).status, 503);
  }
  assert.ok(calls.every(url => url.startsWith('https://identitytoolkit.googleapis.com/') || url.startsWith('https://www.googleapis.com/')));
});

test('Firebase logout clears legacy and Firebase cookies even with provider unavailable', async () => {
  const f = fixture(); offline = true;
  const response = await f.call('/api/auth/logout', 'POST', {}, cookies() + '; __Host-commerce-session.0=old');
  assert.equal(response.status, 200); assert.ok(response.cookies.length >= 4);
  assert.ok(response.cookies.every(cookie => cookie.includes('Max-Age=0')));
  assert.equal(calls.length, 0);
});

test('invalid provider configuration cannot silently use legacy Auth or accept public orders', async () => {
  const f = fixture();
  for (const change of [{ COMMERCE_AUTH_PROVIDER: 'unknown' }, { COMMERCE_AUTH_PROVIDER: 'firebase', FIREBASE_PROJECT_ID: 'https://attacker.invalid' }, { FIREBASE_PROJECT_ID: project, FIREBASE_API_KEY: '' }]) {
    Object.assign(f.env, change);
    assert.equal((await f.call('/api/auth/status')).body.configured, false);
    assert.equal((await f.call('/api/session', 'GET', undefined, cookies())).status, 401);
    assert.equal((await f.call('/api/public/catalog')).body.ordersEnabled, false);
  }
  assert.deepEqual(calls, []);
});

test('public orders remain pending and unreserved under Firebase auth until an operator approves', async () => {
  const f = fixture();
  const input = { idempotency: crypto.randomUUID(), customerName: 'Teste Firebase', email: 'customer@example.invalid', phone: '11999999999', vehicle: '', note: '', items: [{ productId: 'piece', quantity: 1 }] };
  const created = await f.call('/api/public/orders', 'POST', input);
  assert.equal(created.status, 201); assert.equal(created.body.order.status, 'AWAITING_APPROVAL');
  assert.equal(created.body.order.inventoryStatus, 'UNRESERVED'); assert.equal(calls.length, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM commerce_inventory_jobs').get().n, 0);
  assert.equal(f.db.prepare('SELECT stock FROM commerce_products').get().stock, 3);
  const approval = { revision: 0, idempotency: crypto.randomUUID() };
  const denied = await f.call(`/api/orders/${created.body.order.id}/approve`, 'POST', approval);
  assert.equal(denied.status, 401);
  const approved = await f.call(`/api/orders/${created.body.order.id}/approve`, 'POST', approval, cookies());
  assert.equal(approved.status, 200); assert.equal(approved.body.order.approvedBy, email);
  assert.equal(f.db.prepare('SELECT stock FROM commerce_products').get().stock, 2);
  const replayed = await f.call(`/api/orders/${created.body.order.id}/approve`, 'POST', approval, cookies());
  assert.equal(replayed.status, 200); assert.equal(replayed.body.replayed, true);
  assert.equal(f.db.prepare('SELECT stock FROM commerce_products').get().stock, 2);
});
