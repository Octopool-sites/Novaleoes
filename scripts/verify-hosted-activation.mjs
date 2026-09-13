import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const origin = 'https://octopool-commerce-nova-leoes-staging.nova-leoes-storefront.workers.dev';
const email = process.env.COMMERCE_QA_EMAIL;
const tokenHash = process.env.COMMERCE_QA_TOKEN_HASH;
if (!email?.endsWith('@example.invalid') || !/^[a-f0-9]{32,256}$/i.test(tokenHash || '')) throw Error('Dedicated QA invitation required');
const password = randomBytes(32).toString('base64url');
const cookies = new Map();
const evidence = [];
async function call(path, method = 'GET', body) {
  const response = await fetch(origin + path, {
    method, redirect: 'error',
    headers: { origin, 'content-type': 'application/json', cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  for (const cookie of response.headers.getSetCookie()) {
    assert.match(cookie, /^__Host-commerce-session/); assert.match(cookie, /Secure/i); assert.match(cookie, /HttpOnly/i);
    const pair = cookie.split(';')[0], index = pair.indexOf('='), name = pair.slice(0, index);
    if (/Max-Age=0/i.test(cookie)) cookies.delete(name); else cookies.set(name, pair.slice(index + 1));
  }
  return { status: response.status, data: await response.json() };
}
assert.equal((await call('/api/session')).status, 401);
const activation = await call('/api/auth/activate', 'POST', { email, tokenHash, type: 'invite', password });
assert.equal(activation.status, 200, JSON.stringify(activation)); assert.deepEqual(activation.data, { ok: true });
assert.ok(cookies.size); evidence.push('Real Supabase invitation sets a password and protected session');
const identity = await call('/api/session'); assert.equal(identity.status, 200); assert.equal(identity.data.email, email);
assert.equal((await call('/api/orders')).status, 200); evidence.push('Activated user accesses authorized management API');
const replay = await call('/api/auth/activate', 'POST', { email, tokenHash, type: 'invite', password: randomBytes(32).toString('base64url') });
assert.equal(replay.status, 401); assert.equal(cookies.size, 0); evidence.push('Consumed invite cannot reset password again and rejection clears session');
const login = await call('/api/auth/login', 'POST', { email, password }); assert.equal(login.status, 200, JSON.stringify(login));
evidence.push('Subsequent login works with the chosen password');
assert.equal((await call('/api/public/catalog')).data.ordersEnabled, false);
assert.equal((await call('/api/auth/logout', 'POST', {})).status, 200);
assert.equal((await call('/api/session')).status, 401); evidence.push('Logout verified; public orders remain disabled');
const result = { verifiedAt: new Date().toISOString(), origin, evidence, orderOrInventoryMutation: false };
writeFileSync('outputs/supabase-hosted-activation-verification.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
