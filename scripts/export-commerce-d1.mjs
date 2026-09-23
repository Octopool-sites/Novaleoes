import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

// Read-only snapshot of this tenant. Live writers must be frozen before the
// final cutover export; ordinary exports remain useful as preflight backups.
const environment = process.argv[2];
if (!["production", "staging"].includes(environment)) throw Error("Explicit production/staging environment required");
const owner = environment === "production" ? "cmr9m6jgi001lx34fzpaeyrzn" : "nova-leoes-staging";
const tables = ["commerce_products", "commerce_orders", "commerce_order_events", "commerce_settings", "commerce_inventory_jobs"];
const command = tables.map(table => `SELECT * FROM ${table} WHERE owner='${owner}' AND store='nova-leoes'${table === "commerce_settings" ? "" : table === "commerce_products" ? " ORDER BY rowid" : " ORDER BY id"};`).join("\n");
let result;
try {
  result = JSON.parse(execFileSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "d1", "execute",
    `octopool-commerce-nova-leoes-${environment}`, "--remote", "--env", environment, "--command", command, "--json"],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }));
} catch { throw Error("D1 read-only export failed; no snapshot saved"); }
if (!Array.isArray(result) || result.length !== tables.length || result.some(item => !item.success || !Array.isArray(item.results)))
  throw Error("Unexpected D1 export format");
const data = { schemaVersion: 1, owner, store: "nova-leoes", tables: Object.fromEntries(tables.map((table, index) => [table, result[index].results])) };
const content = JSON.stringify(data, null, 2);
const folder = path.resolve("backups", "migration");
await mkdir(folder, { recursive: true });
const file = path.join(folder, `d1-${environment}-${new Date().toISOString().replaceAll(":", "-")}.json`);
await writeFile(file, content, { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ file, environment, counts: Object.fromEntries(tables.map(table => [table, data.tables[table].length])), sha256: createHash("sha256").update(content).digest("hex"), requiresIndependentFreezeCheck: true }));
