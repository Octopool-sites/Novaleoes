import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import { requestContext, type RuntimeEnv } from "../worker/context.js";
import { authConfigured, approverEmails, operator, withAuthCookies } from "../worker/auth.js";
import { authStatus, login, logout, recoverPassword, activate } from "../worker/auth-routes.js";
import { readJson, route, HttpError } from "../lib/commerce-server.js";
import { orderInput, productInput } from "../lib/commerce-contracts.js";
import { createStoreContext, createRateLimiter } from "./firestore.js";
import * as store from "./store.js";
import * as inventory from "./inventory.js";
import type { StoreContext } from "./types.js";

export function runtimeEnv(): RuntimeEnv {
  return {
    STORE_OWNER: process.env.STORE_OWNER || "",
    COMMERCE_AUTH_PROVIDER: "firebase",
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,
    COMMERCE_APPROVERS: process.env.COMMERCE_APPROVERS,
    COMMERCE_LOGIN_ALIASES: process.env.COMMERCE_LOGIN_ALIASES,
    CATALOG_MODE: process.env.CATALOG_MODE,
    PUBLIC_ORDERS_ENABLED: process.env.PUBLIC_ORDERS_ENABLED,
    REQUIRE_SHARED_STOCK: process.env.REQUIRE_SHARED_STOCK,
    COMMERCE_ERP_ORIGIN: process.env.COMMERCE_ERP_ORIGIN,
    COMMERCE_ERP_TOKEN: process.env.COMMERCE_ERP_TOKEN,
    COMMERCE_ERP_OWNER: process.env.COMMERCE_ERP_OWNER,
  };
}

function requestForRuntime(request: Request) {
  const url = new URL(request.url);
  const allowed = new Set((process.env.COMMERCE_ALLOWED_ORIGINS || "").split(",").filter(Boolean));
  if (process.env.VERCEL_URL) allowed.add(`https://${process.env.VERCEL_URL}`);
  if (!allowed.has(url.origin)) throw new HttpError(403, "Endereço de acesso não autorizado.");
  // Vercel owns x-forwarded-for. Never accept a caller-supplied Cloudflare header.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const headers = new Headers(request.headers);
  headers.delete("cf-connecting-ip");
  headers.set("cf-connecting-ip", isIP(ip) ? ip : "unknown");
  return new Request(request, { headers });
}

async function intakeEnabled(ctx: StoreContext) {
  const env = ctx.env;
  if (process.env.COMMERCE_READ_ONLY === "1" || env.PUBLIC_ORDERS_ENABLED !== "1" ||
      !authConfigured(env) || !approverEmails().length) return false;
  if (env.REQUIRE_SHARED_STOCK === "1" &&
      (!inventory.inventoryConfigured(ctx) || !await inventory.inventoryEnabled(ctx))) return false;
  return true;
}

function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const value = request.headers.get("authorization") || "";
  const actual = Buffer.from(value), expected = Buffer.from(`Bearer ${secret}`);
  return !!secret && secret.length >= 32 && actual.length === expected.length &&
    timingSafeEqual(actual, expected);
}

// The dashboard polls every 15 seconds. A shared lease bounds retries to one
// reconciliation per minute across operators; all jobs already require approval.
async function reconcileIfDue(ctx: StoreContext) {
  if (process.env.COMMERCE_READ_ONLY === "1") return;
  const lease = ctx.ref.collection("maintenance").doc("reconcile");
  const now = Date.now();
  const acquired = await ctx.db.runTransaction(async tx => {
    const current = (await tx.get(lease)).data();
    if (Number(current?.nextAt || 0) > now) return false;
    tx.set(lease, { nextAt: now + 60_000 });
    return true;
  });
  if (acquired) {
    try { await inventory.reconcileInventory(ctx); }
    catch { console.warn("commerce-reconciliation-pending"); }
  }
}

export async function handleApi(originalRequest: Request): Promise<Response> {
  return route(async () => {
    const request = requestForRuntime(originalRequest);
    const env = runtimeEnv();
    const ctx = createStoreContext(env);
    env.AUTH_RATE_LIMITER = createRateLimiter(ctx, "auth", 5);
    env.ORDER_RATE_LIMITER = createRateLimiter(ctx, "orders", 10);
    return requestContext.run({ request, env }, async () => withAuthCookies(await route(async () => {
      const { pathname } = new URL(request.url), method = request.method;
      if (pathname === "/api/auth/status" && method === "GET") return authStatus();
      if (pathname === "/api/auth/login" && method === "POST") return login(request);
      if (pathname === "/api/auth/logout" && method === "POST") return logout(request);
      if (pathname === "/api/auth/recover" && method === "POST") return recoverPassword(request);
      if (pathname === "/api/auth/activate" && method === "POST") return activate(request);
      if (pathname === "/api/public/catalog" && method === "GET") {
        if (process.env.COMMERCE_READ_ONLY !== "1") await inventory.refreshCatalog(ctx);
        return Response.json({
          products: (await store.listProducts(ctx)).filter(p => p.published), requiresApproval: true,
          ordersEnabled: await intakeEnabled(ctx),
        });
      }
      if (pathname === "/api/maintenance" && method === "GET") {
        if (!cronAuthorized(request)) throw new HttpError(401, "Acesso não autorizado.");
        if (process.env.COMMERCE_READ_ONLY === "1") throw new HttpError(503, "Operação em manutenção.");
        const result = await inventory.reconcileInventory(ctx);
        // Bounded removal of expired rate buckets; this is not customer data.
        const expired = await ctx.ref.collection("rateLimits").where("expiresAt", "<", new Date()).limit(200).get();
        if (expired.size) { const batch = ctx.db.batch(); expired.docs.forEach(doc => batch.delete(doc.ref)); await batch.commit(); }
        return Response.json({ ok: true, ...result });
      }
      if (pathname === "/api/public/orders" && method === "POST") {
        if (!await intakeEnabled(ctx)) throw new HttpError(503, "A loja está preparando o atendimento online. Tente novamente em breve.");
        if (!(await env.ORDER_RATE_LIMITER!.limit({ key: request.headers.get("cf-connecting-ip") || "unknown" })).success)
          throw new HttpError(429, "Muitas tentativas. Aguarde um minuto antes de reenviar.");
        const result = await store.submitOrder(ctx, orderInput.parse(await readJson(request)));
        return Response.json({ ...result, message: "Pedido recebido. A loja vai conferir e aprovar sua solicitação antes de reservar as peças." }, { status: result.replayed ? 200 : 201 });
      }
      const actor = await operator();
      if (!actor) throw new HttpError(401, "Entre com seu login da equipe para continuar.");
      if (pathname === "/api/session" && method === "GET") return Response.json({ name: actor.displayName, email: actor.email, role: "APPROVER", environment: ctx.environment });
      if (process.env.COMMERCE_READ_ONLY === "1" && method !== "GET") throw new HttpError(503, "Operação em manutenção. Seus dados foram preservados.");
      if (pathname === "/api/orders" && method === "GET") { await reconcileIfDue(ctx); return Response.json({ orders: await store.listOrders(ctx) }); }
      const approval = pathname.match(/^\/api\/orders\/([a-zA-Z0-9-]+)\/approve$/);
      if (approval && method === "POST") {
        const input = z.object({ revision: z.number().int().nonnegative(), idempotency: z.string().uuid() }).strict().parse(await readJson(request));
        const current = await store.findOrderRow(ctx, approval[1]);
        // Resolve a replay/conflict before contacting the ERP. The transaction
        // remains authoritative if the order changes while we fetch the catalog.
        const needsCatalog = current.approval_key !== input.idempotency && current.status === "AWAITING_APPROVAL" &&
          current.revision === input.revision && !current.approved_by && !current.approved_at;
        const catalog = needsCatalog ? await inventory.integratedCatalog(ctx, await store.listProducts(ctx)) : [];
        const result = await store.approveOrderRecord(ctx, approval[1], input, actor.email, catalog);
        if (result.job) await inventory.processInventoryJob(ctx, result.job as inventory.Job);
        const order = result.replayed ? await inventory.recoverInventoryOrder(ctx, approval[1]) : await store.findOrder(ctx, approval[1]);
        return Response.json({ order, replayed: result.replayed }, { status: order.inventoryStatus === "PENDING" ? 202 : 200 });
      }
      const exported = pathname.match(/^\/api\/orders\/([a-zA-Z0-9-]+)\/export$/);
      if (exported && method === "GET") {
        const order = await store.findOrder(ctx, exported[1]);
        return Response.json({ schemaVersion: "octopool.commerce.order.v1", eventId: `${order.id}:${order.revision}`, eventType: "order.snapshot", source: { product: "commerce", store: "nova-leoes" }, order }, { headers: { "Content-Disposition": `attachment; filename="${order.number}.json"` } });
      }
      const selected = pathname.match(/^\/api\/orders\/([a-zA-Z0-9-]+)$/);
      if (selected) {
        if (method === "GET") return Response.json({ order: process.env.COMMERCE_READ_ONLY === "1" ? await store.findOrder(ctx, selected[1]) : await inventory.recoverInventoryOrder(ctx, selected[1]), events: await store.listEvents(ctx, selected[1]) });
        if (method === "PATCH") {
          const input = z.object({ status: z.enum(["CONFIRMED", "PACKING", "READY", "COMPLETED", "CANCELLED"]), revision: z.number().int().nonnegative() }).strict().parse(await readJson(request));
          const current = await store.findOrder(ctx, selected[1]);
          if (current.revision !== input.revision) throw new HttpError(409, "O pedido mudou. Atualize antes de continuar.");
          const unreserved = ["AWAITING_APPROVAL", "STOCK_REJECTED", "EXPIRED"].includes(current.status);
          const order = current.inventoryMode === "erp" && !unreserved
            ? await inventory.changeIntegratedOrder(ctx, current, input.status, actor.email)
            : await store.changeLocalOrder(ctx, selected[1], input.status, input.revision, actor.email);
          return Response.json({ order }, { status: order.inventoryStatus === "PENDING" ? 202 : 200 });
        }
      }
      if (pathname === "/api/manage/catalog") {
        if (method === "GET") return Response.json({ products: await inventory.integratedCatalog(ctx, await store.listProducts(ctx)) });
        if (method === "POST") return Response.json(await store.createProduct(ctx, productInput.parse(await readJson(request))), { status: 201 });
      }
      const piece = pathname.match(/^\/api\/manage\/catalog\/([a-zA-Z0-9-]+)$/);
      if (piece && method === "PUT") return Response.json(await store.updateProduct(ctx, piece[1], productInput.extend({ expectedStock: z.number().int(), expectedPriceCents: z.number().int() }).parse(await readJson(request))));
      if (pathname === "/api/integration") {
        if (method === "GET") {
          const config = await store.getSettings(ctx);
          const pending = await ctx.ref.collection("jobs").where("state", "==", "PENDING").count().get();
          return Response.json({ erpAccessEnabled: !!config.erp_access_enabled, stockIntegrationEnabled: !!config.stock_integration_enabled, configured: inventory.inventoryConfigured(ctx), mode: config.stock_integration_enabled ? "erp" : "standalone", pending: pending.data().count });
        }
        if (method === "PUT") {
          const input = z.object({ erpAccessEnabled: z.boolean().optional(), stockIntegrationEnabled: z.boolean().optional() }).strict().refine(v => v.erpAccessEnabled !== undefined || v.stockIntegrationEnabled !== undefined).parse(await readJson(request));
          if (input.stockIntegrationEnabled) await inventory.inventoryHandshake(ctx);
          const result = await store.setIntegration(ctx, input);
          if (input.stockIntegrationEnabled) await inventory.reconcileInventory(ctx);
          return Response.json(result);
        }
      }
      if (pathname === "/api/integration/reconcile" && method === "POST") {
        z.object({}).strict().parse(await readJson(request));
        return Response.json({ ok: true, ...await inventory.reconcileInventory(ctx) });
      }
      throw new HttpError(404, "Endereço não encontrado.");
    })));
  });
}
