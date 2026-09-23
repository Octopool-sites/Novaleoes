import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TARGET, provision, addDatastoreBinding } from '../scripts/provision-vercel-firestore.mjs';

const env = { GOOGLE_OAUTH_ACCESS_TOKEN: 'fixture-oauth-token-not-a-real-credential' };
const email = `${TARGET.accountId}@${TARGET.projectId}.iam.gserviceaccount.com`;
function fixture({ otherDatabase = false, disabledApis = false } = {}) {
  const calls = [], output = [];
  let database = otherDatabase ? { name: `projects/${TARGET.projectId}/databases/other`, freeTier: true } : null;
  let account = null;
  let policy = { version: 3, etag: 'etag-current', bindings: [{ role: 'roles/viewer', members: ['user:existing@example.invalid'],
    condition: { title: 'preserved', expression: 'true' } }], auditConfigs: [{ service: 'allServices', auditLogConfigs: [{ logType: 'ADMIN_READ' }] }] };
  const enabled = new Set(disabledApis ? [] : ['firestore.googleapis.com', 'iam.googleapis.com', 'cloudresourcemanager.googleapis.com']);
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url), body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ url, method: options.method, body });
    assert.equal(options.headers.Authorization, `Bearer ${env.GOOGLE_OAUTH_ACCESS_TOKEN}`);
    assert.equal(options.redirect, 'manual');
    const response = (value, status = 200) => Response.json(value, { status });
    if (parsed.hostname === 'serviceusage.googleapis.com') {
      if (parsed.pathname.startsWith('/v1/operations/')) {
        const service = parsed.pathname.slice('/v1/operations/'.length);
        enabled.add(service);
        return response({ name: `operations/${service}`, done: true, response: {} });
      }
      const service = parsed.pathname.split('/').at(-1).replace(':enable', '');
      if (parsed.pathname.endsWith(':enable')) return response({ name: `operations/${service}`, done: false });
      return response({ state: enabled.has(service) ? 'ENABLED' : 'DISABLED' });
    }
    if (parsed.hostname === 'cloudresourcemanager.googleapis.com') {
      if (parsed.pathname.endsWith(':getIamPolicy')) return response(policy);
      if (parsed.pathname.endsWith(':setIamPolicy')) { assert.equal(body.policy.etag, policy.etag); policy = body.policy; return response(policy); }
      return response({ projectId: TARGET.projectId, projectNumber: TARGET.projectNumber, lifecycleState: 'ACTIVE' });
    }
    if (parsed.hostname === 'firestore.googleapis.com') {
      if (options.method === 'POST') {
        assert.equal(body.databaseEdition, 'STANDARD');
        assert.equal(body.pointInTimeRecoveryEnablement, 'POINT_IN_TIME_RECOVERY_DISABLED');
        assert.equal(parsed.searchParams.get('databaseId'), '(default)');
        database = { ...body, name: `projects/${TARGET.projectId}/databases/(default)`, freeTier: true };
        return response({ name: `projects/${TARGET.projectId}/databases/(default)/operations/create`, done: true, response: database });
      }
      if (parsed.pathname.endsWith('/databases')) return response({ databases: database ? [database] : [] });
      return response(database);
    }
    if (parsed.hostname === 'iam.googleapis.com') {
      if (options.method === 'POST') {
        assert.equal(body.accountId, TARGET.accountId);
        account = { email, projectId: TARGET.projectId, disabled: false };
        return response(account);
      }
      return account ? response(account) : response({ error: { status: 'NOT_FOUND' } }, 404);
    }
    throw Error('Unexpected provider');
  };
  return { calls, output, get policy() { return policy; }, options: { env, fetchImpl, log: line => output.push(line), pause: async () => {} } };
}

test('Firestore provisioning defaults to read-only and never prints its OAuth credential', async () => {
  const f = fixture();
  const report = await provision(f.options);
  assert.equal(report.mode, 'dry-run');
  assert.ok(f.calls.every(call => call.method === 'GET' || call.url.endsWith(':getIamPolicy')));
  assert.equal(JSON.stringify(f.output).includes(env.GOOGLE_OAUTH_ACCESS_TOKEN), false);
  assert.equal(report.keysCreated, 0); assert.equal(report.billingChanged, false);
});

test('Firestore provisioning applies only the free default database, dedicated account and additive IAM grant', async () => {
  const f = fixture({ disabledApis: true });
  const report = await provision({ ...f.options, apply: true });
  assert.equal(report.database.freeTier, true);
  assert.ok(f.calls.some(call => call.url.includes('/v1/operations/')));
  assert.equal(f.policy.etag, 'etag-current');
  assert.equal(f.policy.version, 3);
  assert.deepEqual(f.policy.bindings[0].condition, { title: 'preserved', expression: 'true' });
  assert.equal(f.policy.auditConfigs[0].service, 'allServices');
  assert.deepEqual(f.policy.bindings.find(binding => binding.role === TARGET.role).members, [`serviceAccount:${email}`]);
  assert.ok(f.calls.every(call => !/billing|workloadIdentity|\/keys(?:\/|:|$)/.test(call.url)));
  const again = await provision({ ...f.options, apply: true });
  assert.ok(again.actions.some(action => action.action === 'grant-datastore-user' && action.state === 'already-granted'));
  assert.equal(f.calls.filter(call => call.url.endsWith(':setIamPolicy')).length, 1);
});

test('Firestore provisioning refuses a second database before any mutation', async () => {
  const f = fixture({ otherDatabase: true });
  await assert.rejects(provision({ ...f.options, apply: true }), /OTHER_DATABASE_EXISTS_NO_FREE_DEFAULT_CREATION/);
  assert.ok(f.calls.every(call => call.method === 'GET'));
});

test('Firestore IAM grant preserves a conditional role instead of broadening that binding', () => {
  const policy = { version: 3, etag: 'etag', bindings: [{ role: TARGET.role, members: ['user:existing@example.invalid'], condition: { expression: 'false' } }] };
  const result = addDatastoreBinding(policy);
  assert.deepEqual(result.policy.bindings[0], policy.bindings[0]);
  assert.equal(result.policy.bindings.length, 2);
  assert.equal(policy.bindings.length, 1);
});
