import { z } from "zod";
import {
  route,
  owner,
  readJson,
  database,
  HttpError,
} from "@/lib/commerce-server";
import { STORE } from "@/lib/commerce-contracts";
import {
  inventoryConfigured,
  inventoryEnabled,
  inventoryHandshake,
  reconcileInventory,
} from "@/lib/commerce-inventory";
import { enableIntegrationSql } from "@/lib/inventory-sql";
export const dynamic = "force-dynamic";
export async function GET() {
  return route(async () => {
    const user = await owner(),
      db = database();
    const config = await db
      .prepare(
        "SELECT erp_access_enabled,stock_integration_enabled FROM commerce_settings WHERE owner=? AND store=?",
      )
      .bind(user, STORE)
      .first<{
        erp_access_enabled: number;
        stock_integration_enabled: number;
      }>();
    const pending = await db
      .prepare(
        "SELECT COUNT(*) as count FROM commerce_inventory_jobs WHERE owner=? AND store=? AND state='PENDING'",
      )
      .bind(user, STORE)
      .first<{ count: number }>();
    return Response.json({
      erpAccessEnabled: !!config?.erp_access_enabled,
      stockIntegrationEnabled: !!config?.stock_integration_enabled,
      configured: inventoryConfigured(user),
      mode: config?.stock_integration_enabled ? "erp" : "standalone",
      pending: pending?.count ?? 0,
    });
  });
}
export async function PUT(request: Request) {
  return route(async () => {
    const user = await owner(),
      db = database();
    const body = z
      .object({
        erpAccessEnabled: z.boolean().optional(),
        stockIntegrationEnabled: z.boolean().optional(),
      })
      .strict()
      .refine(
        (b) =>
          b.erpAccessEnabled !== undefined ||
          b.stockIntegrationEnabled !== undefined,
      )
      .parse(await readJson(request));
    if (
      body.stockIntegrationEnabled === false &&
      (await inventoryEnabled(user))
    )
      throw new HttpError(
        409,
        "Para desconectar, primeiro é necessário definir e conferir um estoque independente. A proteção atual foi mantida.",
      );
    if (
      body.stockIntegrationEnabled === true &&
      !(await inventoryEnabled(user))
    ) {
      await inventoryHandshake(user);
      const enabled = await db
        .prepare(enableIntegrationSql)
        .bind(user, STORE, user, STORE, user, STORE)
        .run();
      if (!enabled.meta.changes)
        throw new HttpError(
          409,
          "Conclua ou cancele os pedidos do estoque próprio antes de conectar o ERP.",
        );
    }
    if (body.erpAccessEnabled !== undefined)
      await db
        .prepare(
          "INSERT INTO commerce_settings(owner,store,erp_access_enabled) VALUES (?,?,?) ON CONFLICT(owner,store) DO UPDATE SET erp_access_enabled=excluded.erp_access_enabled",
        )
        .bind(user, STORE, Number(body.erpAccessEnabled))
        .run();
    if (body.stockIntegrationEnabled) await reconcileInventory(user);
    return Response.json({
      ok: true,
      syncConnected: await inventoryEnabled(user),
    });
  });
}
