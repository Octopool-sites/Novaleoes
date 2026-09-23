import { z } from "zod";
import type { RuntimeEnv } from "./context";

const aliasEmail = z.string().email().max(200);
const aliasUid = /^[A-Za-z0-9_-]{1,128}$/;

// This is an explicit exception for pre-provisioned internal logins without a
// mailbox. It never grants a role: the normal approver allowlist still applies.
// Invalid configuration fails closed rather than dropping the UID binding.
export function firebaseLoginAliases(env: RuntimeEnv): ReadonlyMap<string, string> | null {
  if (env.COMMERCE_LOGIN_ALIASES === undefined) return new Map();
  if (!env.COMMERCE_LOGIN_ALIASES || env.COMMERCE_LOGIN_ALIASES.length > 24000) return null;
  try {
    const input: unknown = JSON.parse(env.COMMERCE_LOGIN_ALIASES);
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const aliases = new Map<string, string>();
    const uids = new Set<string>();
    for (const [key, uid] of Object.entries(input)) {
      const email = key.toLowerCase();
      if (!aliasEmail.safeParse(email).success || aliases.has(email) ||
          typeof uid !== "string" || !aliasUid.test(uid) || uids.has(uid)) return null;
      aliases.set(email, uid);
      uids.add(uid);
    }
    return aliases;
  } catch { return null; }
}
