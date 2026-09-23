import { createHash } from "node:crypto";
import type { Firestore, DocumentReference } from "@google-cloud/firestore";
import type { RuntimeEnv } from "../worker/context.js";

export type Row = Record<string, any>;
export type StoreContext = {
  db: Firestore;
  ref: DocumentReference;
  owner: string;
  environment: "production" | "staging";
  env: RuntimeEnv;
};

export const keyId = (kind: string, value: string) =>
  `${kind}_${createHash("sha256").update(value).digest("hex")}`;

export function requireScopedRow(ctx: StoreContext, row: Row | undefined): Row {
  if (!row || row.owner !== ctx.owner || row.store !== "nova-leoes") throw new Error("STORE_SCOPE_MISMATCH");
  return row;
}
