import { route, owner, readJson } from "@/lib/commerce-server";
import { reconcileInventory } from "@/lib/commerce-inventory";
import { z } from "zod";
export async function POST(request: Request) {
  return route(async () => {
    const user = await owner();
    z.object({})
      .strict()
      .parse(await readJson(request));
    return Response.json(await reconcileInventory(user));
  });
}
