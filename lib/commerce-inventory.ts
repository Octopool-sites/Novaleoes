import { context } from "../worker/context";
import { z } from "zod";
import { database, findOrder, HttpError } from "./commerce-server";
import {
  STORE,
  type Order,
  type OrderItem,
  orderInput,
} from "./commerce-contracts";
import {
  createErpStockClient,
  ErpStockError,
  type Reservation,
} from "./erp-stock-client";
import type { Product } from "./catalog";

type Runtime = {
  COMMERCE_ERP_ORIGIN?: string;
  COMMERCE_ERP_TOKEN?: string;
  COMMERCE_ERP_OWNER?: string;
  COMMERCE_ERP_ALLOW_LOCAL?: string;
};
const config = () => context().env as Runtime;
export function inventoryConfigured(user: string) {
  const c = config();
  return !!(
    c.COMMERCE_ERP_ORIGIN &&
    c.COMMERCE_ERP_TOKEN &&
    c.COMMERCE_ERP_OWNER === user
  );
}
function client(user: string) {
  const c = config();
  if (!inventoryConfigured(user))
    throw new HttpError(
      503,
      "A conexão de estoque precisa ser configurada para esta loja.",
    );
  return createErpStockClient({
    origin: c.COMMERCE_ERP_ORIGIN!,
    token: c.COMMERCE_ERP_TOKEN!,
    allowLocal: c.COMMERCE_ERP_ALLOW_LOCAL === "1",
  });
}
export async function inventoryEnabled(user: string) {
  const s = await database()
    .prepare(
      "SELECT stock_integration_enabled FROM commerce_settings WHERE owner=? AND store=?",
    )
    .bind(user, STORE)
    .first<{ stock_integration_enabled: number }>();
  return !!s?.stock_integration_enabled;
}
export async function inventoryHandshake(user: string) {
  const data = await client(user).inventory();
  if (data.ownerRef !== user || data.storeKey !== STORE)
    throw new HttpError(403, "A credencial não pertence a esta loja.");
  return data;
}
async function verifiedClient(user: string) {
  await inventoryHandshake(user);
  return client(user);
}
export async function integratedCatalog(user: string, products: Product[]) {
  if (!(await inventoryEnabled(user))) return products;
  const remote = await inventoryHandshake(user);
  const byId = new Map(remote.products.map((p) => [p.externalId, p]));
  return products.map((p) => {
    const r = byId.get(p.id);
    return {
      ...p,
      stock: r?.available ?? 0,
      priceCents: r?.priceCents ?? p.priceCents,
      published: p.published && !!r && r.priceCents > 0,
    };
  });
}
type Job = {
  id: string;
  owner: string;
  order_id: string;
  local_revision: number;
  action: string;
  payload: string;
  state: string;
};
function localStatus(remote: Reservation, current: Order) {
  if (remote.status === "HELD") return "STOCK_PENDING";
  if (remote.status === "CONFIRMED")
    return ["PACKING", "READY"].includes(current.status)
      ? current.status
      : "CONFIRMED";
  if (remote.status === "EXPIRED") return "EXPIRED";
  return remote.status === "COMPLETED" ? "COMPLETED" : "CANCELLED";
}
async function applyRemote(
  user: string,
  order: Order,
  remote: Reservation,
  jobId?: string,
) {
  if (
    remote.externalOrderId !== order.id ||
    remote.totalCents !== order.totalCents
  )
    throw new HttpError(
      503,
      "O pedido precisa de conferência antes de continuar.",
    );
  const db = database(),
    now = new Date().toISOString(),
    status = localStatus(remote, order);
  const statements = [
    db
      .prepare(
        "UPDATE commerce_orders SET status=CASE WHEN ?='CONFIRMED' AND status IN ('PACKING','READY') THEN status ELSE ? END,inventory_status=?,erp_revision=?,reservation_expires_at=?,updated_at=?,revision=revision+1 WHERE owner=? AND store=? AND id=? AND inventory_mode='erp' AND erp_revision<=? AND ((status<>? AND NOT(?='CONFIRMED' AND status IN ('PACKING','READY'))) OR inventory_status<>? OR erp_revision<>?)",
      )
      .bind(
        remote.status,
        status,
        remote.status,
        remote.revision,
        remote.expiresAt,
        now,
        user,
        STORE,
        order.id,
        remote.revision,
        status,
        remote.status,
        remote.status,
        remote.revision,
      ),
    db
      .prepare(
        "INSERT INTO commerce_order_events(id,owner,store,order_id,status,created_at) SELECT ?,?,?,?,?,? WHERE changes()>0",
      )
      .bind(crypto.randomUUID(), user, STORE, order.id, status, now),
  ];
  if (jobId)
    statements.push(
      db
        .prepare(
          "UPDATE commerce_inventory_jobs SET state='APPLIED',last_error=NULL,updated_at=? WHERE id=? AND owner=? AND store=? AND state='PENDING'",
        )
        .bind(now, jobId, user, STORE),
    );
  await db.batch(statements);
}
export async function processInventoryJob(user: string, job: Job) {
  const db = database(),
    now = new Date().toISOString();
  if (job.state !== "PENDING") return;
  const approvedOrder = await findOrder(user, job.order_id);
  if (job.action === "RESERVE" && !approvedOrder.approvedBy) throw new HttpError(403, "Este pedido ainda precisa de aprovação.");
  await db
    .prepare(
      "UPDATE commerce_inventory_jobs SET attempts=attempts+1,updated_at=? WHERE id=? AND owner=? AND store=? AND state='PENDING'",
    )
    .bind(now, job.id, user, STORE)
    .run();
  let reserving = false;
  try {
    const erp = await verifiedClient(user),
      payload = JSON.parse(job.payload);
    reserving = job.action === "RESERVE";
    const remote =
      job.action === "RESERVE"
        ? await erp.reserve(payload)
        : await erp.command(job.order_id, payload);
    reserving = false;
    // Uma resposta repetida pode ser antiga; consultar o estado atual impede regressao.
    let current = await erp.get(job.order_id);
    if(job.action === "RESERVE" && current.status === "HELD") {
      await erp.command(job.order_id, { key: job.id, action: "CONFIRM", revision: current.revision });
      current = await erp.get(job.order_id);
    }
    await applyRemote(
      user,
      await findOrder(user, job.order_id),
      current.revision >= remote.revision ? current : remote,
      job.id,
    );
  } catch (error) {
    const code =
      error instanceof ErpStockError ? error.code : "CONNECTION_UNAVAILABLE";
    if (
      error instanceof ErpStockError &&
      [400, 409].includes(error.status) &&
      code !== "IDEMPOTENCY_CONFLICT"
    ) {
      if (job.action === "RESERVE" && reserving) {
        await db.batch([
          db
            .prepare(
              "UPDATE commerce_orders SET status='STOCK_REJECTED',inventory_status='REJECTED',revision=revision+1,updated_at=? WHERE owner=? AND store=? AND id=? AND status='STOCK_PENDING'",
            )
            .bind(now, user, STORE, job.order_id),
          db
            .prepare(
              "UPDATE commerce_inventory_jobs SET state='FAILED',last_error=?,updated_at=? WHERE owner=? AND store=? AND id=? AND state='PENDING'",
            )
            .bind(code, now, user, STORE, job.id),
        ]);
      } else if (job.action !== "RESERVE") {
        // Conflito de revisao ou expiracao: recuperar a autoridade, nunca inventar saldo.
        try {
          await applyRemote(
            user,
            await findOrder(user, job.order_id),
            await (await verifiedClient(user)).get(job.order_id),
          );
          await db
            .prepare(
              "UPDATE commerce_inventory_jobs SET state='FAILED',last_error=?,updated_at=? WHERE owner=? AND store=? AND id=? AND state='PENDING'",
            )
            .bind(code, now, user, STORE, job.id)
            .run();
        } catch {
          /* continua pendente para recuperar depois */
        }
      }
    }
    await db
      .prepare(
        "UPDATE commerce_inventory_jobs SET last_error=?,updated_at=? WHERE owner=? AND store=? AND id=? AND state='PENDING'",
      )
      .bind(code, now, user, STORE, job.id)
      .run();
  }
}
export async function recoverInventoryOrder(user: string, id: string) {
  const jobs = await database()
    .prepare(
      "SELECT * FROM commerce_inventory_jobs WHERE owner=? AND store=? AND order_id=? AND state='PENDING' ORDER BY local_revision LIMIT 1",
    )
    .bind(user, STORE, id)
    .all<Job>();
  for (const job of jobs.results) await processInventoryJob(user, job);
  const order = await findOrder(user, id);
  const pending = await database()
    .prepare(
      "SELECT id FROM commerce_inventory_jobs WHERE owner=? AND store=? AND order_id=? AND state='PENDING' LIMIT 1",
    )
    .bind(user, STORE, id)
    .first();
  if (
    !pending &&
    order.inventoryMode === "erp" &&
    ![
      "COMPLETED",
      "CANCELLED",
      "STOCK_REJECTED",
      "EXPIRED",
      "STOCK_PENDING",
      "AWAITING_APPROVAL",
    ].includes(order.status)
  ) {
    try {
      await applyRemote(
        user,
        order,
        await (await verifiedClient(user)).get(id),
      );
    } catch {
      /* preserva o ultimo estado confirmado; comandos continuam fechados em falha */
    }
  }
  return findOrder(user, id);
}
export async function changeIntegratedOrder(
  user: string,
  order: Order,
  next: string,
  actor: string,
) {
  const db = database(),
    now = new Date().toISOString();
  const pending = await db
    .prepare(
      "SELECT id FROM commerce_inventory_jobs WHERE owner=? AND store=? AND order_id=? AND state='PENDING'",
    )
    .bind(user, STORE, order.id)
    .first();
  if (pending)
    throw new HttpError(
      409,
      "Aguardando confirmação do estoque. Atualize o pedido.",
    );
  // Toda mudanca valida a autoridade, inclusive avancos locais de separacao.
  const remote = await (await verifiedClient(user)).get(order.id);
  if (
    remote.revision !== order.erpRevision ||
    remote.status !== order.inventoryStatus
  ) {
    await applyRemote(user, order, remote);
    throw new HttpError(409, "A reserva mudou. Atualize o pedido.");
  }
  const action =
    next === "CONFIRMED"
      ? "CONFIRM"
      : next === "COMPLETED"
        ? "COMPLETE"
        : next === "CANCELLED"
          ? "CANCEL"
          : null;
  if (!action) {
    const result = await db.batch([
      db
        .prepare(
          "UPDATE commerce_orders SET status=?,revision=revision+1,updated_at=? WHERE owner=? AND store=? AND id=? AND revision=? AND inventory_status='CONFIRMED'",
        )
        .bind(next, now, user, STORE, order.id, order.revision),
      db
        .prepare(
          "INSERT INTO commerce_order_events(id,owner,store,order_id,status,created_at,actor,detail) SELECT ?,?,?,?,?,?,?,? WHERE changes()>0",
        )
        .bind(crypto.randomUUID(), user, STORE, order.id, next, now, actor, "Atualização pelo responsável"),
    ]);
    if (result[0].meta.changes !== 1)
      throw new HttpError(409, "O pedido mudou. Atualize antes de continuar.");
    return findOrder(user, order.id);
  }
  const jobId = crypto.randomUUID(),
    payload = JSON.stringify({ key: jobId, action, revision: remote.revision });
  await db.batch([
    db
      .prepare(
        "INSERT INTO commerce_inventory_jobs(id,owner,store,order_id,local_revision,action,payload,state,created_at,updated_at) SELECT ?,owner,store,id,revision,?,?,'PENDING',?,? FROM commerce_orders WHERE owner=? AND store=? AND id=? AND revision=?",
      )
      .bind(
        jobId,
        action,
        payload,
        now,
        now,
        user,
        STORE,
        order.id,
        order.revision,
      ),
    db
      .prepare(
        "UPDATE commerce_orders SET inventory_status='PENDING' WHERE owner=? AND store=? AND id=? AND revision=? AND EXISTS(SELECT 1 FROM commerce_inventory_jobs WHERE id=?)",
      )
      .bind(user, STORE, order.id, order.revision, jobId),
  ]);
  const job = await db
    .prepare(
      "SELECT * FROM commerce_inventory_jobs WHERE id=? AND owner=? AND store=?",
    )
    .bind(jobId, user, STORE)
    .first<Job>();
  if (!job)
    throw new HttpError(409, "O pedido mudou. Atualize antes de continuar.");
  await db.prepare("INSERT INTO commerce_order_events(id,owner,store,order_id,status,created_at,actor,detail) VALUES(?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),user,STORE,order.id,order.status,now,actor,`Solicitou ${action}`).run();
  await processInventoryJob(user, job);
  return findOrder(user, order.id);
}
export async function reconcileInventory(user: string) {
  const db = database();
  const jobs = await db
    .prepare(
      "SELECT * FROM commerce_inventory_jobs WHERE owner=? AND store=? AND state='PENDING' ORDER BY created_at LIMIT 5",
    )
    .bind(user, STORE)
    .all<Job>();
  for (const job of jobs.results) await processInventoryJob(user, job);
  if (await inventoryEnabled(user)) {
    const erp = await verifiedClient(user);
    await erp.call("/maintenance", {});
    const catalog = await inventoryHandshake(user);
    if (catalog.products.length)
      await db.batch(
        catalog.products.map((p) =>
          db
            .prepare(
              "UPDATE commerce_products SET stock=?,price_cents=?,erp_version=? WHERE owner=? AND store=? AND id=? AND erp_version<=?",
            )
            .bind(
              p.available,
              p.priceCents,
              p.version,
              user,
              STORE,
              p.externalId,
              p.version,
            ),
        ),
      );
    // Reconhecimento ocorre depois da copia duravel. Eventos repetidos e fora de
    // ordem sao resolvidos pela versao do snapshot, nao pela ordem de entrega.
    const events = z
      .object({
        events: z.array(
          z.object({
            id: z.string(),
            externalId: z.string(),
            version: z.number(),
            available: z.number(),
          }),
        ),
      })
      .parse(await erp.call("/events"));
    const versions = new Map(
      catalog.products.map((p) => [p.externalId, p.version]),
    );
    const ids = events.events
      .filter((e) => (versions.get(e.externalId) ?? -1) >= e.version)
      .map((e) => e.id);
    if (ids.length) await erp.call("/events/ack", { ids });
  }
  return {
    pending: await db
      .prepare(
        "SELECT COUNT(*) AS count FROM commerce_inventory_jobs WHERE owner=? AND store=? AND state='PENDING'",
      )
      .bind(user, STORE)
      .first<{ count: number }>(),
  };
}
