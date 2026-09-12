import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { readFileSync } from "node:fs";
// Strip parameter properties for Node's native TS loader; execute real client.
const src = ts
  .transpileModule(
    readFileSync(
      new URL("../lib/erp-stock-client.ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    },
  )
  .outputText.replace(
    'from "zod"',
    `from ${JSON.stringify(new URL("../node_modules/zod/index.js", import.meta.url).href)}`,
  );
const { createErpStockClient, ErpStockError } = await import(
  `data:text/javascript;base64,${Buffer.from(src).toString("base64")}`
);
const config = { origin: "https://api.octopool.com.br", token: "a".repeat(64) };
test("credentials only go to approved host without following redirects", async () => {
  let options;
  const c = createErpStockClient(config, async (_url, o) => {
    options = o;
    return Response.json({ ok: true });
  });
  await c.call("/maintenance", {});
  assert.equal(options.redirect, "manual");
  assert.equal(options.headers.Authorization, `Bearer ${config.token}`);
  assert.equal(options.headers.Origin, undefined);
  for (const origin of [
    "https://attacker.invalid",
    "http://api.octopool.com.br",
    "https://api.octopool.com.br@attacker.invalid",
    "http://127.0.0.1:3020",
  ])
    assert.throws(
      () => createErpStockClient({ ...config, origin }),
      ErpStockError,
    );
});
test("redirect is refused without forwarding credentials", async () => {
  const c = createErpStockClient(
    config,
    async () =>
      new Response(null, {
        status: 302,
        headers: { Location: "https://attacker.invalid" },
      }),
  );
  await assert.rejects(c.inventory(), (e) => e.status === 302);
});
test("network failure stays uncertain instead of returning fake stock", async () => {
  const c = createErpStockClient(config, async () => {
    throw new TypeError("offline");
  });
  await assert.rejects(
    c.inventory(),
    (e) => e.status === 503 && e.code === "CONNECTION_UNAVAILABLE",
  );
});
test("invalid inventory response is rejected", async () => {
  const c = createErpStockClient(config, async () =>
    Response.json({ products: [{ available: -1 }] }),
  );
  await assert.rejects(c.inventory());
});
test("stock conflict remains distinct from unavailable transport", async () => {
  const c = createErpStockClient(config, async () =>
    Response.json({ code: "OUT_OF_STOCK" }, { status: 409 }),
  );
  await assert.rejects(
    c.reserve({}),
    (e) => e.status === 409 && e.code === "OUT_OF_STOCK",
  );
});

test("compatible additive ERP changes are accepted without changing Commerce", async () => {
  const client = createErpStockClient(config, async () => Response.json({
    contract: "octopool.stock.v1", storeKey: "nova-leoes", ownerRef: "owner",
    products: [], futureOptionalField: "does not affect the contract",
  }));
  assert.equal((await client.inventory()).contract, "octopool.stock.v1");
});

test("unknown stock contract is rejected before Commerce can promise availability", async () => {
  for (const contract of [undefined, "octopool.stock.v2"]) {
    const client = createErpStockClient(config, async () => Response.json({
      contract, storeKey: "nova-leoes", ownerRef: "owner", products: [],
    }));
    await assert.rejects(client.inventory());
  }
});
