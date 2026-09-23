/**
 * Nova Leoes infrastructure preparation. Dry-run is the default.
 * OAuth access token: GOOGLE_OAUTH_ACCESS_TOKEN (environment only).
 *
 * This script does not create keys, touch billing, provision WIF, write business
 * data, change existing databases, or deploy Vercel. It creates only an absent
 * Standard/native default database and a dedicated Firestore service account.
 *
 * References (checked 2026-09-23):
 * https://firebase.google.com/docs/admin/setup#initialize_the_sdk_in_non-google_environments
 * https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases/create
 * https://docs.cloud.google.com/iam/docs/reference/rest/v1/projects.serviceAccounts/create
 * https://docs.cloud.google.com/resource-manager/reference/rest/v1/projects/setIamPolicy
 * https://docs.cloud.google.com/service-usage/docs/reference/rest/v1/services/enable
 */
import { pathToFileURL } from 'node:url';

export const TARGET = Object.freeze({
  projectId: 'nova-leoes-commerce', projectNumber: '21188332383',
  location: 'southamerica-east1', databaseId: '(default)',
  accountId: 'commerce-vercel', role: 'roles/datastore.user',
});
const services = ['firestore.googleapis.com', 'iam.googleapis.com', 'cloudresourcemanager.googleapis.com'];
const origins = new Set(['https://firestore.googleapis.com', 'https://iam.googleapis.com',
  'https://cloudresourcemanager.googleapis.com', 'https://serviceusage.googleapis.com']);
const accountEmail = `${TARGET.accountId}@${TARGET.projectId}.iam.gserviceaccount.com`;
const projectUrl = `https://cloudresourcemanager.googleapis.com/v1/projects/${TARGET.projectId}`;
const databaseParent = `https://firestore.googleapis.com/v1/projects/${TARGET.projectId}/databases`;
const accountParent = `https://iam.googleapis.com/v1/projects/${TARGET.projectId}/serviceAccounts`;
const accountUrl = `${accountParent}/${encodeURIComponent(accountEmail)}`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

class ApiError extends Error {
  constructor(status, code, reason) {
    super(`GOOGLE_API_${status}_${code}${reason ? `_${reason}` : ''}`);
    this.status = status; this.code = code; this.reason = reason;
  }
}

export function addDatastoreBinding(policy) {
  // Preserve unrelated bindings, IAM conditions, audit configuration, version,
  // and etag. Never merge into a conditional binding or remove existing access.
  const copy = structuredClone(policy);
  copy.bindings ||= [];
  const member = `serviceAccount:${accountEmail}`;
  const existing = copy.bindings.find(binding => binding.role === TARGET.role && !binding.condition);
  if (existing?.members?.includes(member)) return { policy: copy, changed: false };
  if (existing) existing.members = [...(existing.members || []), member];
  else copy.bindings.push({ role: TARGET.role, members: [member] });
  return { policy: copy, changed: true };
}

function verifyDatabase(database) {
  if (database.name !== `projects/${TARGET.projectId}/databases/${TARGET.databaseId}` ||
      database.type !== 'FIRESTORE_NATIVE' ||
      (database.databaseEdition && database.databaseEdition !== 'STANDARD')) throw Error('EXISTING_DATABASE_REQUIRES_REVIEW');
  if (database.freeTier === false || database.pointInTimeRecoveryEnablement === 'POINT_IN_TIME_RECOVERY_ENABLED' || database.cmekConfig)
    throw Error('EXISTING_DATABASE_HAS_NONFREE_CONFIGURATION');
}

function verifyAccount(account) {
  if (account.email !== accountEmail || account.projectId !== TARGET.projectId || account.disabled)
    throw Error('EXISTING_SERVICE_ACCOUNT_REQUIRES_REVIEW');
}

export async function provision({ apply = false, env = process.env, fetchImpl = fetch, log = console.log, pause = wait } = {}) {
  const token = env.GOOGLE_OAUTH_ACCESS_TOKEN;
  if (typeof token !== 'string' || token.length < 20 || /\s/.test(token)) throw Error('GOOGLE_OAUTH_ACCESS_TOKEN_REQUIRED');
  const report = { mode: apply ? 'apply' : 'dry-run', project: TARGET.projectId, actions: [], warnings: [],
    serviceAccount: accountEmail, billingChanged: false, keysCreated: 0, workloadIdentityCreated: false };
  const record = (action, state) => { report.actions.push({ action, state }); log(JSON.stringify({ action, state })); };

  async function request(url, { method = 'GET', body, mutation = false, missing = false } = {}) {
    const parsed = new URL(url);
    if (!origins.has(parsed.origin) || parsed.username || parsed.password || parsed.hash ||
        /\/keys(?:\/|:|$)|workloadIdentity|billing|:generateAccessToken|:generateIdToken|:sign/i.test(parsed.pathname)) throw Error('UNEXPECTED_API_TARGET');
    if (mutation && !apply) throw Error('DRY_RUN_MUTATION_REFUSED');
    if (method !== 'GET' && !mutation && !parsed.pathname.endsWith(':getIamPolicy')) throw Error('UNCLASSIFIED_API_MUTATION');
    let response;
    try {
      response = await fetchImpl(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual', signal: AbortSignal.timeout(30000) });
    } catch { throw Error('GOOGLE_API_NETWORK_ERROR'); }
    if (response.status >= 300 && response.status < 400) throw Error('GOOGLE_API_REDIRECT_REFUSED');
    const value = await response.json().catch(() => ({}));
    if (missing && response.status === 404) return null;
    if (!response.ok) {
      // Do not print response bodies, submitted policies, or any token value.
      const clean = value => typeof value === 'string' && /^[A-Z0-9_]{1,100}$/.test(value) ? value : 'UNKNOWN';
      throw new ApiError(response.status, clean(value?.error?.status), clean(value?.error?.details?.find(item => item?.reason)?.reason));
    }
    return value;
  }

  async function operation(origin, result) {
    if (!result?.name || !(result.name.startsWith('operations/') || result.name.includes('/operations/'))) {
      if (result?.done && result.error) throw new ApiError(500, 'OPERATION_FAILED', 'UNKNOWN');
      return result;
    }
    // Operation names are provider-generated relative resource names. Keep the
    // polling origin fixed, preventing token forwarding to a returned URL.
    if (!/^[a-zA-Z0-9_()./-]+$/.test(result.name) || result.name.includes('..')) throw Error('INVALID_OPERATION_NAME');
    let state = result;
    const deadline = Date.now() + 180000;
    while (!state.done) {
      if (Date.now() >= deadline) throw Error('GOOGLE_OPERATION_PENDING_RERUN_DRY_RUN');
      await pause(1500);
      state = await request(`${origin}/v1/${result.name}`);
    }
    if (state.error) throw new ApiError(Number(state.error.code) || 500, 'OPERATION_FAILED', 'UNKNOWN');
    return state.response;
  }

  const project = await request(projectUrl);
  if (project.projectId !== TARGET.projectId || String(project.projectNumber) !== TARGET.projectNumber || project.lifecycleState !== 'ACTIVE')
    throw Error('PROJECT_IDENTITY_MISMATCH');
  record('verify-project', 'confirmed');

  const apiStates = new Map();
  for (const service of services) {
    const result = await request(`https://serviceusage.googleapis.com/v1/projects/${TARGET.projectNumber}/services/${service}`);
    apiStates.set(service, result.state === 'ENABLED');
  }
  const existingDatabases = apiStates.get('firestore.googleapis.com') ? await request(databaseParent) : null;
  if (existingDatabases?.unreachable?.length) throw Error('DATABASE_INVENTORY_INCOMPLETE');
  const databases = existingDatabases?.databases || [];
  let database = databases.find(item => item.name === `projects/${TARGET.projectId}/databases/${TARGET.databaseId}`) || null;
  if (database) verifyDatabase(database);
  // The first database gets the free quota. Never create an additional database
  // when a different one exists, even if a billing account was linked elsewhere.
  if (!database && databases.length) throw Error('OTHER_DATABASE_EXISTS_NO_FREE_DEFAULT_CREATION');
  let account = apiStates.get('iam.googleapis.com') ? await request(accountUrl, { missing: true }) : null;
  if (account) verifyAccount(account);
  const policyBody = { options: { requestedPolicyVersion: 3 } };
  let policy = apiStates.get('cloudresourcemanager.googleapis.com')
    ? await request(`${projectUrl}:getIamPolicy`, { method: 'POST', body: policyBody }) : null;

  if (!apply) {
    for (const [service, enabled] of apiStates) record(`enable:${service}`, enabled ? 'already-enabled' : 'would-enable');
    record('create-default-database', database ? 'already-exists' : 'would-create-standard-native');
    record('create-service-account', account ? 'already-exists' : 'would-create');
    record('grant-datastore-user', policy && !addDatastoreBinding(policy).changed ? 'already-granted' : 'would-add-preserving-policy');
    if (!existingDatabases) report.warnings.push('Database inspection requires enabling the Firestore API first; apply will recheck before creation.');
    if (database && database.locationId !== TARGET.location) report.warnings.push(`Existing location ${database.locationId} will be preserved.`);
    return report;
  }

  for (const [service, enabled] of apiStates) {
    if (!enabled) {
      const result = await request(`https://serviceusage.googleapis.com/v1/projects/${TARGET.projectNumber}/services/${service}:enable`,
        { method: 'POST', body: {}, mutation: true });
      await operation('https://serviceusage.googleapis.com', result);
      record(`enable:${service}`, 'enabled');
    }
  }
  // Re-read after API enablement and before creation, including first-database
  // eligibility. A concurrent create must not silently change the database used.
  const refreshed = await request(databaseParent);
  if (refreshed.unreachable?.length) throw Error('DATABASE_INVENTORY_INCOMPLETE');
  const currentDatabases = refreshed.databases || [];
  database = currentDatabases.find(item => item.name === `projects/${TARGET.projectId}/databases/${TARGET.databaseId}`) || null;
  if (!database && currentDatabases.length) throw Error('OTHER_DATABASE_EXISTS_NO_FREE_DEFAULT_CREATION');
  if (!database) {
    try {
      await operation('https://firestore.googleapis.com', await request(`${databaseParent}?databaseId=${encodeURIComponent(TARGET.databaseId)}`,
        { method: 'POST', mutation: true, body: { locationId: TARGET.location, type: 'FIRESTORE_NATIVE', databaseEdition: 'STANDARD',
          concurrencyMode: 'PESSIMISTIC', appEngineIntegrationMode: 'DISABLED',
          pointInTimeRecoveryEnablement: 'POINT_IN_TIME_RECOVERY_DISABLED', deleteProtectionState: 'DELETE_PROTECTION_ENABLED' } }));
      record('create-default-database', 'created');
    } catch (error) { if (!(error instanceof ApiError && error.status === 409)) throw error; }
    database = await request(`${databaseParent}/${encodeURIComponent(TARGET.databaseId)}`);
  }
  verifyDatabase(database);
  record('verify-default-database', 'confirmed');
  if (database.locationId !== TARGET.location) report.warnings.push(`Existing location ${database.locationId} was preserved.`);

  account = await request(accountUrl, { missing: true });
  if (!account) {
    try {
      account = await request(accountParent, { method: 'POST', mutation: true,
        body: { accountId: TARGET.accountId, serviceAccount: { displayName: 'Nova Leoes Commerce Vercel',
          description: 'Firestore access for the dedicated Nova Leoes Commerce backend. No Firebase Auth administration.' } } });
      record('create-service-account', 'created');
    } catch (error) { if (!(error instanceof ApiError && error.status === 409)) throw error; }
    account = await request(accountUrl);
  }
  verifyAccount(account);

  for (let attempt = 0; attempt < 3; attempt++) {
    policy = await request(`${projectUrl}:getIamPolicy`, { method: 'POST', body: policyBody });
    if (!policy.etag) throw Error('IAM_POLICY_ETAG_REQUIRED');
    const result = addDatastoreBinding(policy);
    if (!result.changed) { record('grant-datastore-user', 'already-granted'); break; }
    try {
      await request(`${projectUrl}:setIamPolicy`, { method: 'POST', mutation: true, body: { policy: result.policy } });
      record('grant-datastore-user', 'granted-preserving-existing-policy');
      break;
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 409) || attempt === 2) throw error;
      await pause(300 * (attempt + 1));
    }
  }
  const confirmedPolicy = await request(`${projectUrl}:getIamPolicy`, { method: 'POST', body: policyBody });
  if (addDatastoreBinding(confirmedPolicy).changed) throw Error('SERVICE_ACCOUNT_GRANT_NOT_CONFIRMED');
  record('verify-service-account-access', 'confirmed');
  report.database = { name: database.name, location: database.locationId, freeTier: database.freeTier ?? null };
  report.warnings.push('No credential was created. Configure the dedicated service-account credential separately in the server secret store.');
  return report;
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direct) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: node scripts/provision-vercel-firestore.mjs [--dry-run | --apply]\nOAuth token is read only from GOOGLE_OAUTH_ACCESS_TOKEN. Default is read-only. No billing, keys, WIF or business-data changes.');
  } else if (args.some(arg => !['--apply', '--dry-run'].includes(arg)) || (args.includes('--apply') && args.includes('--dry-run'))) {
    console.error('INVALID_ARGUMENTS'); process.exitCode = 1;
  } else {
    provision({ apply: args.includes('--apply') }).then(report => console.log(JSON.stringify(report, null, 2)))
      .catch(error => { console.error(error instanceof Error ? error.message : 'PROVISION_FAILED'); process.exitCode = 1; });
  }
}
