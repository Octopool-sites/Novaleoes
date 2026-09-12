import { route,owner,database,mapOrder } from "@/lib/commerce-server";
import {STORE} from "@/lib/commerce-contracts";
export async function GET() {
  return route(async () => {
    const user = await owner();
    const result = await database()
      .prepare(
        "SELECT * FROM commerce_orders WHERE owner=? AND store=? ORDER BY created_at DESC LIMIT 300",
      )
      .bind(user, STORE)
      .all<Record<string, unknown>>();
    return Response.json({ orders: result.results.map(mapOrder) });
  });
}
