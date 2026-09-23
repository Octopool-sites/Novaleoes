import { Firestore } from "@google-cloud/firestore";
import { createHash } from "node:crypto";
import type { RuntimeEnv } from "../worker/context.js";
import type { StoreContext } from "./types.js";

let firestore: Firestore | undefined;
export function getFirestore() {
  if (firestore) return firestore;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) throw Error("FIREBASE_PROJECT_REQUIRED");
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    if (process.env.VERCEL || !/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST)) throw Error("INVALID_EMULATOR");
    return firestore = new Firestore({ projectId });
  }
  if (process.env.VERCEL) {
    // Server-only secret, restricted to the dedicated Firestore service account.
    // Spark must not be upgraded merely to provision workload federation.
    let credentials;
    try { credentials = JSON.parse(process.env.FIRESTORE_SERVICE_ACCOUNT_JSON || ""); }
    catch { throw Error("FIRESTORE_IDENTITY_REQUIRED"); }
    if (credentials.type !== "service_account" || credentials.project_id !== projectId ||
        credentials.client_email !== `commerce-vercel@${projectId}.iam.gserviceaccount.com` ||
        typeof credentials.private_key !== "string" || !credentials.private_key.startsWith("-----BEGIN PRIVATE KEY-----"))
      throw Error("FIRESTORE_IDENTITY_REQUIRED");
    return firestore = new Firestore({ projectId, preferRest: true, credentials: {
      client_email: credentials.client_email, private_key: credentials.private_key,
    } });
  }
  // Local administration uses normal ADC. Keys never enter source or browser bundles.
  return firestore = new Firestore({ projectId, preferRest: true });
}

export function createStoreContext(env: RuntimeEnv): StoreContext {
  const environment = env.CATALOG_MODE === "production" ? "production" : "staging";
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(env.STORE_OWNER)) throw Error("STORE_OWNER_REQUIRED");
  // A Vercel preview must never obtain the production data namespace.
  if (process.env.VERCEL && environment === "production" && process.env.VERCEL_ENV !== "production") throw Error("PRODUCTION_PREVIEW_DENIED");
  const db = getFirestore();
  return { db, ref: db.doc(`commerce/${environment}/tenants/${env.STORE_OWNER}/stores/nova-leoes`), owner: env.STORE_OWNER, environment, env };
}

export function createRateLimiter(ctx: StoreContext, namespace: string, maximum: number) {
  return { async limit({ key }: { key: string }) {
    const salt = process.env.RATE_LIMIT_SALT;
    if (!salt || salt.length < 32) throw Error("RATE_LIMIT_NOT_CONFIGURED");
    const id = createHash("sha256").update(`${salt}:${namespace}:${key}`).digest("hex");
    const ref = ctx.ref.collection("rateLimits").doc(id);
    const window = Math.floor(Date.now() / 60_000);
    return ctx.db.runTransaction(async tx => {
      const previous = (await tx.get(ref)).data();
      const count = previous?.window === window ? Number(previous.count) : 0;
      if (count >= maximum) return { success: false };
      tx.set(ref, { window, count: count + 1, expiresAt: new Date((window + 2) * 60_000) });
      return { success: true };
    });
  } };
}
