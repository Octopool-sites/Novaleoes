import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Deliberately conservative: this pilot fits one transaction. Never split an
// import into partially committed batches when these limits are exceeded.
const MAX_DOCUMENTS = 450;
const MAX_BYTES = 6 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 900 * 1024;
const STORE = "nova-leoes";
const TABLES = {
  commerce_products: "products",
  commerce_orders: "orders",
  commerce_order_events: "events",
  commerce_settings: null,
  commerce_inventory_jobs: "jobs",
};
const FIELDS = {
  commerce_products: "owner store id sku name brand category price_cents stock image description published erp_version",
  commerce_orders: "id owner store idempotency fingerprint number customer_name email phone vehicle note items_json total_cents status created_at updated_at revision inventory_mode inventory_status erp_revision reservation_expires_at approved_by approved_at approval_key",
  commerce_order_events: "id owner store order_id status created_at actor detail",
  commerce_settings: "owner store erp_access_enabled stock_integration_enabled",
  commerce_inventory_jobs: "id owner store order_id local_revision action payload state attempts last_error created_at updated_at",
};
const NULLABLE = new Set(["reservation_expires_at", "approved_by", "approved_at", "approval_key", "actor", "detail", "last_error"]);
const NUMERIC = new Set(["price_cents", "stock", "published", "erp_version", "total_cents", "revision", "erp_revision", "erp_access_enabled", "stock_integration_enabled", "local_revision", "attempts", "_position"]);
const STATUS = new Set(["AWAITING_APPROVAL", "STOCK_PENDING", "STOCK_REJECTED", "EXPIRED", "NEW", "CONFIRMED", "PACKING", "READY", "COMPLETED", "CANCELLED"]);
const TERMINAL = new Set(["COMPLETED", "CANCELLED"]);
const COLLECTIONS = ["products", "orders", "events", "jobs", "keys"];

class MigrationError extends Error {
  constructor(code) { super(code); this.name = "MigrationError"; }
}
function requireCondition(condition, code) { if (!condition) throw new MigrationError(code); }
function plain(value) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function docId(value) {
  return typeof value === "string" && value.length > 0 && Buffer.byteLength(value) <= 1500 && !/[\/\u0000-\u001f\u007f]/u.test(value) && ![".", ".."].includes(value) && !/^__.*__$/u.test(value);
}
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (plain(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const digest = value => createHash("sha256").update(value).digest("hex");
const keyId = (kind, value) => `${kind}_${digest(value)}`;

export function parseOptions(args) {
  const options = { apply: false, checkRemote: false };
  const flags = new Map([["--input", "input"], ["--project", "project"], ["--environment", "environment"], ["--owner", "owner"]]);
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--apply" || flag === "--check-remote") {
      const key = flag === "--apply" ? "apply" : "checkRemote";
      requireCondition(!options[key], "DUPLICATE_FLAG");
      options[key] = true;
    } else {
      requireCondition(flags.has(flag), "UNKNOWN_FLAG");
      const key = flags.get(flag);
      requireCondition(!Object.hasOwn(options, key), "DUPLICATE_FLAG");
      const value = args[++i];
      requireCondition(typeof value === "string" && value.length > 0 && !value.startsWith("--"), "MISSING_FLAG_VALUE");
      options[key] = value;
    }
  }
  requireCondition(typeof options.input === "string", "INPUT_REQUIRED");
  requireCondition(options.project === "nova-leoes-commerce", "PROJECT_SCOPE_MISMATCH");
  requireCondition(["production", "staging"].includes(options.environment), "ENVIRONMENT_REQUIRED");
  requireCondition(docId(options.owner), "OWNER_REQUIRED");
  return options;
}

function validateRow(table, row, owner) {
  requireCondition(plain(row), "INVALID_ROW");
  const fields = FIELDS[table].split(" ");
  if (table === "commerce_products" && Object.hasOwn(row, "_position")) fields.push("_position");
  requireCondition(Object.keys(row).length === fields.length && fields.every(field => Object.hasOwn(row, field)), "ROW_COLUMNS_MISMATCH");
  requireCondition(row.owner === owner && row.store === STORE, "ROW_SCOPE_MISMATCH");
  for (const field of fields) {
    if (row[field] === null && NULLABLE.has(field)) continue;
    requireCondition(NUMERIC.has(field) ? Number.isSafeInteger(row[field]) : typeof row[field] === "string", "INVALID_COLUMN_TYPE");
    if (NUMERIC.has(field)) requireCondition(row[field] >= (field === "erp_version" ? -1 : 0), "NEGATIVE_OR_UNSAFE_NUMBER");
    if (["published", "erp_access_enabled", "stock_integration_enabled"].includes(field)) requireCondition([0, 1].includes(row[field]), "INVALID_BOOLEAN");
  }
  if (table !== "commerce_settings") requireCondition(docId(row.id), "INVALID_DOCUMENT_ID");
  if ("order_id" in row) requireCondition(docId(row.order_id), "INVALID_ORDER_REFERENCE");
  for (const field of ["created_at", "updated_at", "approved_at", "reservation_expires_at"]) {
    if (row[field] !== undefined && row[field] !== null) requireCondition(typeof row[field] === "string" && Number.isFinite(Date.parse(row[field])), "INVALID_TIMESTAMP");
  }
  requireCondition(Buffer.byteLength(canonical(row)) <= MAX_DOCUMENT_BYTES, "DOCUMENT_TOO_LARGE");
}

function parsedObject(value, code) {
  let parsed;
  try { parsed = JSON.parse(value); } catch { throw new MigrationError(code); }
  return parsed;
}

export function prepareImport(source, options) {
  requireCondition(options.project === "nova-leoes-commerce" && ["production", "staging"].includes(options.environment) && docId(options.owner), "INVALID_TARGET_SCOPE");
  requireCondition(plain(source) && source.schemaVersion === 1 && Object.keys(source).sort().join(",") === "owner,schemaVersion,store,tables", "INVALID_EXPORT_SCHEMA");
  requireCondition(source.owner === options.owner && source.store === STORE, "EXPORT_SCOPE_MISMATCH");
  requireCondition(plain(source.tables) && Object.keys(source.tables).sort().join(",") === Object.keys(TABLES).sort().join(","), "EXPORT_TABLES_MISMATCH");
  let rowCount = 0;
  for (const table of Object.keys(TABLES)) {
    requireCondition(Array.isArray(source.tables[table]), "INVALID_TABLE");
    rowCount += source.tables[table].length;
    requireCondition(rowCount <= MAX_DOCUMENTS, "CONTROLLED_BATCH_PLAN_REQUIRED");
    for (const row of source.tables[table]) validateRow(table, row, options.owner);
  }
  requireCondition(source.tables.commerce_settings.length === 1, "EXACTLY_ONE_SETTINGS_ROW_REQUIRED");
  const documents = new Map();
  const automaticPositions = new Set();
  const root = `commerce/${options.environment}/tenants/${options.owner}/stores/${STORE}`;
  function add(path, data) {
    requireCondition(!documents.has(path), "DUPLICATE_DOCUMENT_OR_UNIQUE_KEY");
    documents.set(path, data);
  }
  function addKey(kind, value, targetId) {
    requireCondition(typeof value === "string" && value.length > 0, "INVALID_UNIQUE_KEY");
    add(`${root}/keys/${keyId(kind, value)}`, { owner: options.owner, store: STORE, kind, value, target_id: targetId });
  }
  add(root, { ...source.tables.commerce_settings[0], _order_guard: 0 });
  for (const [table, collection] of Object.entries(TABLES)) {
    if (collection) for (const [index, row] of source.tables[table].entries()) {
      const path = `${root}/${collection}/${row.id}`;
      if (table === "commerce_products") {
        if (!Object.hasOwn(row, "_position")) automaticPositions.add(path);
        add(path, { ...row, _position: row._position ?? index });
      } else add(path, row);
    }
  }
  const products = new Map(source.tables.commerce_products.map(row => [row.id, row]));
  const orders = new Map(source.tables.commerce_orders.map(row => [row.id, row]));
  for (const row of products.values()) {
    addKey("sku", row.sku, row.id);
  }
  const legacyTerminalOrders = new Set();
  for (const row of orders.values()) {
    requireCondition(STATUS.has(row.status), "INVALID_ORDER_STATUS");
    requireCondition(["erp", "standalone"].includes(row.inventory_mode), "INVALID_INVENTORY_MODE");
    requireCondition(["LOCAL", "UNRESERVED", "PENDING", "HELD", "CONFIRMED", "COMPLETED", "CANCELLED", "EXPIRED", "REJECTED", "RELEASED", "RETURNED"].includes(row.inventory_status), "INVALID_INVENTORY_STATUS");
    const approval = [row.approved_by, row.approved_at, row.approval_key];
    requireCondition(approval.every(value => value === null) || approval.every(value => typeof value === "string" && value.length > 0), "INCOMPLETE_APPROVAL");
    if (row.status === "AWAITING_APPROVAL") requireCondition(approval.every(value => value === null) && row.inventory_status === "UNRESERVED", "UNAPPROVED_ORDER_HAS_INVENTORY");
    if (!row.approved_by && !["AWAITING_APPROVAL", "NEW"].includes(row.status)) {
      requireCondition(TERMINAL.has(row.status), "ACTIVE_ORDER_MISSING_APPROVAL");
      if (row.status === "COMPLETED" || row.inventory_status !== "UNRESERVED") legacyTerminalOrders.add(row.id);
    }
    const items = parsedObject(row.items_json, "INVALID_ORDER_ITEMS_JSON");
    requireCondition(Array.isArray(items) && items.length > 0 && items.length <= 30, "INVALID_ORDER_ITEMS");
    const itemIds = new Set();
    let total = 0;
    for (const item of items) {
      requireCondition(plain(item) && products.has(item.productId) && !itemIds.has(item.productId), "INVALID_PRODUCT_REFERENCE");
      requireCondition(Number.isSafeInteger(item.quantity) && item.quantity > 0 && Number.isSafeInteger(item.priceCents) && item.priceCents > 0, "INVALID_ORDER_ITEM_AMOUNT");
      requireCondition(["name", "sku", "image"].every(field => typeof item[field] === "string"), "INVALID_ORDER_ITEM_SNAPSHOT");
      itemIds.add(item.productId);
      total += item.quantity * item.priceCents;
    }
    requireCondition(Number.isSafeInteger(total) && total === row.total_cents, "ORDER_TOTAL_MISMATCH");
    addKey("idempotency", row.idempotency, row.id);
    if (row.approval_key !== null) addKey("approval", row.approval_key, row.id);
  }
  for (const row of source.tables.commerce_order_events) {
    requireCondition(orders.has(row.order_id) && STATUS.has(row.status), "INVALID_EVENT_REFERENCE_OR_STATUS");
  }
  let legacyTerminalJobs = 0;
  for (const row of source.tables.commerce_inventory_jobs) {
    const order = orders.get(row.order_id);
    requireCondition(order && order.inventory_mode === "erp", "INVALID_JOB_ORDER_REFERENCE");
    requireCondition(["PENDING", "APPLIED", "FAILED"].includes(row.state), "INVALID_JOB_STATE");
    requireCondition(["RESERVE", "CONFIRM", "COMPLETE", "CANCEL"].includes(row.action), "INVALID_JOB_ACTION");
    requireCondition(row.local_revision <= order.revision && (row.local_revision > 0 || (row.state !== "PENDING" && TERMINAL.has(order.status))), "INVALID_JOB_REVISION");
    const payload = parsedObject(row.payload, "INVALID_JOB_PAYLOAD_JSON");
    requireCondition(plain(payload), "INVALID_JOB_PAYLOAD");
    if (row.action === "RESERVE") {
      requireCondition(payload.externalOrderId === order.id && Array.isArray(payload.items) && payload.items.length > 0, "INVALID_RESERVATION_PAYLOAD");
      const expectedItems = parsedObject(order.items_json, "INVALID_ORDER_ITEMS_JSON").map(item => ({ externalId: item.productId, quantity: item.quantity, priceCents: item.priceCents }));
      requireCondition(canonical(payload.items) === canonical(expectedItems), "RESERVATION_ITEMS_MISMATCH");
      if (!order.approved_by || !order.approved_at || !order.approval_key) {
        requireCondition(row.state !== "PENDING" && TERMINAL.has(order.status), "RESERVATION_REQUIRES_APPROVAL");
        legacyTerminalJobs++;
      }
      if (row.state === "PENDING") requireCondition(order.status === "STOCK_PENDING", "PENDING_RESERVATION_STATUS_MISMATCH");
    } else {
      requireCondition(payload.key === row.id && payload.action === row.action && Number.isSafeInteger(payload.revision) && payload.revision >= 0, "INVALID_COMMAND_PAYLOAD");
    }
    if (row.state === "PENDING") requireCondition(!TERMINAL.has(order.status), "PENDING_JOB_FOR_TERMINAL_ORDER");
    addKey("job-revision", `${row.order_id}:${row.local_revision}`, row.id);
  }
  const ordered = [...documents].sort(([a], [b]) => a.localeCompare(b));
  const payload = canonical(ordered);
  requireCondition(documents.size + 1 <= MAX_DOCUMENTS && Buffer.byteLength(payload) <= MAX_BYTES, "CONTROLLED_BATCH_PLAN_REQUIRED");
  for (const [path, data] of documents) requireCondition(Buffer.byteLength(path) + Buffer.byteLength(canonical(data)) <= MAX_DOCUMENT_BYTES, "DOCUMENT_TOO_LARGE");
  return {
    root, documents, automaticPositions,
    hash: digest(payload),
    counts: { ...Object.fromEntries(Object.entries(source.tables).map(([table, rows]) => [table, rows.length])), keys: documents.size - rowCount, documents: documents.size },
    warnings: { legacyTerminalOrders: legacyTerminalOrders.size, legacyTerminalJobs },
  };
}

export async function inspectOrApply(db, plan, options) {
  const rootRef = db.doc(plan.root);
  const manifestRef = rootRef.collection("migrations").doc(plan.hash);
  const manifestData = { schema_version: 1, snapshot_sha256: plan.hash, counts: plan.counts, warnings: plan.warnings };
  return db.runTransaction(async transaction => {
    // All reads precede all writes. Reading each collection also rejects an
    // incomplete export against an already populated destination.
    const currentRoot = await transaction.get(rootRef);
    const current = new Map();
    if (currentRoot.exists) current.set(plan.root, currentRoot.data());
    for (const collection of COLLECTIONS) {
      const snapshot = await transaction.get(rootRef.collection(collection).limit(MAX_DOCUMENTS + 1));
      requireCondition(snapshot.size <= MAX_DOCUMENTS, "DESTINATION_TOO_LARGE");
      for (const document of snapshot.docs) current.set(document.ref.path, document.data());
    }
    const manifest = await transaction.get(manifestRef);
    const desired = new Map(plan.documents);
    const initializePositions = [];
    if (currentRoot.exists && Object.hasOwn(currentRoot.data(), "_order_guard")) {
      const guard = currentRoot.data()._order_guard;
      requireCondition(Number.isSafeInteger(guard) && guard >= 0, "INVALID_DESTINATION_ORDER_GUARD");
      desired.set(plan.root, { ...desired.get(plan.root), _order_guard: guard });
    }
    // Older imported roots may have no guard; adding zero is the only permitted
    // change to an otherwise identical existing business document.
    const initializeGuard = currentRoot.exists && !Object.hasOwn(currentRoot.data(), "_order_guard");
    if (initializeGuard) current.set(plan.root, { ...current.get(plan.root), _order_guard: 0 });
    for (const [path, data] of current) {
      if (!path.startsWith(`${plan.root}/products/`) || !desired.has(path)) continue;
      if (Object.hasOwn(data, "_position")) {
        requireCondition(Number.isSafeInteger(data._position) && data._position >= 0, "INVALID_DESTINATION_PRODUCT_POSITION");
        // An old D1 export has no presentation position. Preserve an existing
        // valid one rather than reorder an already imported catalog on replay.
        if (plan.automaticPositions.has(path)) desired.set(path, { ...desired.get(path), _position: data._position });
      } else {
        const position = desired.get(path)._position;
        current.set(path, { ...data, _position: position });
        initializePositions.push([path, position]);
      }
    }
    for (const [path, data] of current) requireCondition(desired.has(path) && canonical(desired.get(path)) === canonical(data), "DESTINATION_DATA_DIVERGES");
    if (manifest.exists) {
      const { imported_at, ...data } = manifest.data();
      requireCondition(typeof imported_at === "string" && canonical(data) === canonical(manifestData), "MIGRATION_MANIFEST_DIVERGES");
    }
    const missing = [...desired].filter(([path]) => !current.has(path));
    if (options.apply) {
      for (const [path, data] of missing) transaction.create(db.doc(path), data);
      if (initializeGuard) transaction.update(rootRef, { _order_guard: 0 });
      for (const [path, position] of initializePositions) transaction.update(db.doc(path), { _position: position });
      if (!manifest.exists) transaction.create(manifestRef, { ...manifestData, imported_at: new Date().toISOString() });
    }
    return { existing: current.size, missing: missing.length, written: options.apply ? missing.length + Number(initializeGuard) + initializePositions.length + Number(!manifest.exists) : 0 };
  }, options.apply ? { maxAttempts: 3 } : { readOnly: true });
}

export async function firestoreClient(project) {
  const { Firestore } = await import("@google-cloud/firestore");
  const token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  let auth;
  if (token) {
    const { GoogleAuth, OAuth2Client } = await import("google-auth-library");
    const authClient = new OAuth2Client();
    authClient.setCredentials({ access_token: token });
    // Both Firestore's generated client and gax accept a GoogleAuth instance.
    // Wrapping preserves getProjectId/getClient across REST and gRPC transports.
    auth = new GoogleAuth({ projectId: project, authClient });
  }
  return new Firestore({ projectId: project, databaseId: "(default)", preferRest: true, ...(auth ? { auth } : {}) });
}

export async function main(args = process.argv.slice(2)) {
  let db;
  try {
    const options = parseOptions(args);
    requireCondition((await stat(options.input)).size <= MAX_BYTES, "INPUT_FILE_TOO_LARGE");
    const content = (await readFile(options.input, "utf8")).replace(/^\uFEFF/u, "");
    requireCondition(Buffer.byteLength(content) <= MAX_BYTES, "INPUT_FILE_TOO_LARGE");
    const source = parsedObject(content, "INVALID_EXPORT_JSON");
    const plan = prepareImport(source, options);
    let destination;
    if (options.apply || options.checkRemote) {
      requireCondition(!process.env.FIRESTORE_EMULATOR_HOST, "REMOTE_IMPORT_REJECTS_EMULATOR_OVERRIDE");
      db = await firestoreClient(options.project);
      destination = await inspectOrApply(db, plan, options);
    }
    console.log(JSON.stringify({ mode: options.apply ? "applied" : options.checkRemote ? "remote-check" : "local-dry-run", counts: plan.counts, warnings: plan.warnings, snapshotSha256: plan.hash, ...(destination ? { destination } : {}) }));
    return 0;
  } catch (error) {
    // Provider errors can include request bodies or credentials. Only known
    // validation codes and safe numeric RPC codes may reach terminal output.
    const code = error instanceof MigrationError ? error.message : "MIGRATION_FAILED";
    const providerCode = Number.isInteger(error?.code) ? error.code : undefined;
    console.error(JSON.stringify({ error: code, ...(providerCode === undefined ? {} : { providerCode }) }));
    return 1;
  } finally {
    if (db) await db.terminate().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
