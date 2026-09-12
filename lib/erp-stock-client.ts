import { z } from "zod";

export const reservationSchema = z.object({
  externalOrderId: z.string(),
  status: z.enum([
    "HELD",
    "CONFIRMED",
    "COMPLETED",
    "RELEASED",
    "EXPIRED",
    "RETURNED",
  ]),
  revision: z.number().int().nonnegative(),
  expiresAt: z.string().datetime(),
  totalCents: z.number().int().nonnegative(),
});
export type Reservation = z.infer<typeof reservationSchema>;
export const inventorySchema = z.object({
  contract: z.literal("octopool.stock.v1"),
  storeKey: z.string(),
  ownerRef: z.string(),
  products: z
    .array(
      z.object({
        externalId: z.string(),
        available: z.number().int().nonnegative(),
        priceCents: z.number().int().nonnegative(),
        version: z.number().int().nonnegative(),
      }),
    )
    .max(1000),
});
export class ErpStockError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export function createErpStockClient(
  config: { origin: string; token: string; allowLocal?: boolean },
  transport: typeof fetch = fetch,
) {
  const origin = new URL(config.origin);
  const local =
    config.allowLocal && ["127.0.0.1", "localhost"].includes(origin.hostname);
  if (
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    !["http:", "https:"].includes(origin.protocol) ||
    (!local &&
      (origin.protocol !== "https:" ||
        origin.hostname !== "api.octopool.com.br")) ||
    !/^[a-f0-9]{64}$/.test(config.token)
  )
    throw new ErpStockError(503, "INVALID_CONFIGURATION");
  async function call(path: string, body?: unknown) {
    let r: Response;
    try {
      r = await transport(`${origin.origin}/api/commerce-stock${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "manual",
        signal: AbortSignal.timeout(7000),
      });
    } catch (error) {
      console.warn(
        "erp-stock-transport",
        error instanceof Error ? error.message : "fetch failed",
      );
      throw new ErpStockError(503, "CONNECTION_UNAVAILABLE");
    }
    if (!r.ok) {
      const data = (await r.json().catch(() => ({}))) as { code?: string };
      throw new ErpStockError(r.status, data.code || "STOCK_UNAVAILABLE");
    }
    return r.json();
  }
  return {
    call,
    inventory: async () => inventorySchema.parse(await call("/inventory")),
    reserve: async (body: unknown) =>
      reservationSchema.parse(await call("/reservations", body)),
    get: async (id: string) =>
      reservationSchema.parse(
        await call(`/reservations/${encodeURIComponent(id)}`),
      ),
    command: async (id: string, body: unknown) =>
      reservationSchema.parse(
        await call(`/reservations/${encodeURIComponent(id)}/commands`, body),
      ),
  };
}
