import { context } from "../worker/context";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  const {env}=context();
  if (!env.DB) {
    throw new Error(
      "Configure o binding D1 DB do ambiente Cloudflare antes de iniciar."
    );
  }

  return drizzle(env.DB, { schema });
}
