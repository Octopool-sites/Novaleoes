import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker from "../worker/retired.ts";

const source = "https://nova-leoes-storefront.nova-leoes-storefront.workers.dev";
const destination = "https://nova-leoes-preview.vercel.app";
const retired = { RETIRED_DESTINATION: destination };
const call = (path, env = {}, method = "GET", extra = {}) => worker.fetch(new Request(source + path, { method, ...extra }), env);

test("retired worker freezes all API methods with 503 and never redirects mutations", async () => {
  for (const method of ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const response = await call("/api/orders", {}, method);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("Retry-After"), "300");
    assert.equal(response.headers.get("Location"), null);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    if (method === "HEAD") assert.equal(await response.text(), "");
    else assert.ok((await response.json()).error);
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
    assert.equal((await call("/gestao", {}, method)).status, 503);
});

test("retired worker presents a short maintenance page and a bodyless HEAD", async () => {
  const page = await call("/?visual=editorial");
  assert.equal(page.status, 503);
  assert.match(page.headers.get("Content-Type"), /^text\/html/);
  assert.match(await page.text(), /Estamos atualizando a loja/);
  assert.equal(page.headers.get("Retry-After"), "300");
  assert.equal(await (await call("/gestao", {}, "HEAD")).text(), "");
});

test("retired worker returns 410 for every old API and all mutations after cutover", async () => {
  for (const method of ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    for (const path of ["/api", "/api/orders", "/api/auth/login", "/api/maintenance", "//api/orders", "/%61pi%2Forders", "/api%252Forders", "/%61pi%255Corders"]) {
      const response = await call(path, retired, method);
      assert.equal(response.status, 410, `${method} ${path}`);
      assert.equal(response.headers.get("Location"), null);
      assert.equal(response.headers.get("Retry-After"), null);
    }
  }
  const response = await call("/gestao?visual=editorial", retired, "POST", {
    body: "password=private-fixture", headers: { authorization: "Bearer fixture-private-token", cookie: "session=fixture-private-cookie" },
  });
  assert.equal(response.status, 410);
  assert.equal(response.headers.get("Location"), null);
  assert.doesNotMatch(await response.text(), /private-fixture|fixture-private/);
});

test("retired worker preserves frontend path and query only on the exact Vercel origin", async () => {
  for (const method of ["GET", "HEAD"]) {
    const response = await call("/gestao?visual=editorial&next=%2Fcatalogo", retired, method, {
      headers: { authorization: "Bearer fixture-private-token", cookie: "__Host-commerce-session=fixture-private-cookie" },
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("Location"), destination + "/gestao?visual=editorial&next=%2Fcatalogo");
    assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
    assert.equal(response.headers.get("Set-Cookie"), null);
    assert.equal(response.headers.get("Authorization"), null);
    assert.equal(await response.text(), "");
  }
  const deceptivePath = await call("//attacker.invalid/steal?visual=editorial", retired);
  assert.equal(new URL(deceptivePath.headers.get("Location")).origin, destination);
});

test("retired worker fails closed for destinations with alternate hosts or credentials", async () => {
  for (const value of [undefined, "", "http://nova-leoes-preview.vercel.app", destination + "/", destination + "/gestao",
    destination + "?next=1", destination + ".attacker.invalid", "https://attacker.invalid", "https://user:secret@nova-leoes-preview.vercel.app"])
    assert.equal((await call("/", { RETIRED_DESTINATION: value })).status, 503);
});

test("retired worker never calls a network service and queued cron invocations are inert", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw Error("Retired worker cannot call external services"); };
  try {
    await call("/", retired);
    await call("/api/orders", retired, "POST");
    await call("/api/maintenance", {});
    await worker.scheduled();
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("retirement configuration is explicit, disconnected, and starts frozen", async () => {
  const config = JSON.parse(await readFile(new URL("../wrangler.retired.jsonc", import.meta.url), "utf8"));
  assert.equal(config.main, "worker/retired.ts");
  assert.equal(config.account_id, "472249d0e533f9d5c2084f4168cb71ed");
  assert.equal(config.env.production.name, "nova-leoes-storefront");
  assert.equal(config.env.staging.name, "octopool-commerce-nova-leoes-staging");
  assert.equal(config.workers_dev, false);
  for (const scope of [config, config.env.staging, config.env.production]) {
    assert.deepEqual(scope.triggers.crons, []);
    assert.equal(scope.vars.RETIRED_DESTINATION, "");
    assert.equal(scope.assets, undefined);
    assert.equal(scope.d1_databases, undefined);
    assert.equal(scope.ratelimits, undefined);
    assert.equal(scope.preview_urls, false);
  }
});
