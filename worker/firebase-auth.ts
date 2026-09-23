import { parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { createRemoteJWKSet, customFetch, errors, jwtVerify, type JWTPayload } from "jose";
import { context, type RuntimeEnv } from "./context.js";
import type { Operator } from "./auth.js";
import { firebaseLoginAliases } from "./auth-aliases.js";

const ID_COOKIE = "__Host-commerce-session-firebase-id";
const REFRESH_COOKIE = "__Host-commerce-session-firebase-refresh";
const MAX_SESSION_SECONDS = 7 * 24 * 3600;
const GOOGLE_KEYS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const keySet = createRemoteJWKSet(new URL(GOOGLE_KEYS), {
  [customFetch]: (url, options) => safeFetch(url, options),
  timeoutDuration: 8000,
});

export class FirebaseAuthError extends Error {
  constructor(public code: string) { super(code); }
}

// Fixed provider origins; no client/environment supplied authentication URL and
// no redirect forwarding passwords, tokens or recovery details to another host.
async function safeFetch(url: string, options: RequestInit) {
  try {
    const response = await fetch(url, { ...options, redirect: "manual", signal: AbortSignal.timeout(8000) });
    if (response.status >= 300 && response.status < 400) throw new FirebaseAuthError("PROVIDER_UNAVAILABLE");
    return response;
  } catch { throw new FirebaseAuthError("PROVIDER_UNAVAILABLE"); }
}

export function firebaseConfigured(env: RuntimeEnv) {
  return /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(env.FIREBASE_PROJECT_ID || "") &&
    /^AIza[A-Za-z0-9_-]{35}$/.test(env.FIREBASE_API_KEY || "") && firebaseLoginAliases(env) !== null;
}

async function providerRequest<T>(action: string, body: Record<string, unknown>, refresh = false): Promise<T> {
  const { env } = context();
  if (!firebaseConfigured(env)) throw new FirebaseAuthError("NOT_CONFIGURED");
  const url = refresh
    ? `https://securetoken.googleapis.com/v1/token?key=${env.FIREBASE_API_KEY}`
    : `https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${env.FIREBASE_API_KEY}`;
  const response = await safeFetch(url, {
    method: "POST",
    headers: { "Content-Type": refresh ? "application/x-www-form-urlencoded" : "application/json", "X-Firebase-Locale": "pt-BR" },
    body: refresh ? new URLSearchParams(body as Record<string, string>).toString() : JSON.stringify(body),
  });
  let data: unknown;
  try { data = await response.json(); } catch { throw new FirebaseAuthError("PROVIDER_UNAVAILABLE"); }
  if (!response.ok) {
    const message = (data as { error?: { message?: string } })?.error?.message;
    // Never log provider bodies; they can contain submitted addresses or tokens.
    const code = typeof message === "string" ? message.split(" : ")[0] : "PROVIDER_UNAVAILABLE";
    throw new FirebaseAuthError(response.status >= 500 ? "PROVIDER_UNAVAILABLE" : code);
  }
  if (!data || typeof data !== "object") throw new FirebaseAuthError("PROVIDER_UNAVAILABLE");
  return data as T;
}

type Account = { localId?: string; email?: string; emailVerified?: boolean; disabled?: boolean; validSince?: string };
type VerifiedIdentity = { operator: Operator; payload: JWTPayload; verified: boolean; internalAlias: boolean };

async function verifiedIdentity(idToken: string, allowed: string[], allowUnverified = false): Promise<VerifiedIdentity> {
  const { env } = context();
  const aliases = firebaseLoginAliases(env);
  if (!aliases) throw new FirebaseAuthError("NOT_CONFIGURED");
  const project = env.FIREBASE_PROJECT_ID!;
  const { payload } = await jwtVerify(idToken, keySet, {
    algorithms: ["RS256"], issuer: `https://securetoken.google.com/${project}`, audience: project,
    requiredClaims: ["sub", "iat", "exp", "auth_time", "email", "firebase"], clockTolerance: 5,
  });
  const now = Math.floor(Date.now() / 1000);
  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
  const firebase = payload.firebase as { sign_in_provider?: string } | undefined;
  if (!payload.sub || payload.sub.length > 128 || !email || !allowed.includes(email) ||
      firebase?.sign_in_provider !== "password" || typeof payload.auth_time !== "number" ||
      payload.auth_time > now + 5 || payload.auth_time < now - MAX_SESSION_SECONDS ||
      typeof payload.iat !== "number" || payload.iat > now + 5) throw new FirebaseAuthError("IDENTITY_DENIED");
  const aliasUid = aliases.get(email);
  // Enforce the binding even if the alias is later marked verified at Firebase.
  // Deleting/recreating an account must never inherit an internal login's access.
  if (aliasUid !== undefined && aliasUid !== payload.sub) throw new FirebaseAuthError("IDENTITY_DENIED");
  // The live lookup enforces disabled/deleted accounts and revocation after a
  // password reset. A signed JWT alone could remain valid until its expiry.
  const { users } = await providerRequest<{ users?: Account[] }>("lookup", { idToken });
  const user = users?.length === 1 ? users[0] : null;
  const validSince = Number(user?.validSince || 0);
  if (!user || user.disabled || user.localId !== payload.sub || user.email?.toLowerCase() !== email ||
      !Number.isFinite(validSince) || payload.auth_time < validSince) throw new FirebaseAuthError("IDENTITY_DENIED");
  const verified = payload.email_verified === true && user.emailVerified === true;
  const internalAlias = aliasUid !== undefined;
  if (!verified && !internalAlias && !allowUnverified) throw new FirebaseAuthError("EMAIL_NOT_VERIFIED");
  return { operator: { userId: payload.sub, email, displayName: email, fullName: null }, payload, verified, internalAlias };
}

function writeSession(idToken: string, refreshToken: string, payload: JWTPayload) {
  if (idToken.length > 3800 || !refreshToken || refreshToken.length > 3800) throw new FirebaseAuthError("INVALID_SESSION");
  const maxAge = Math.max(0, Math.floor(Number(payload.auth_time) + MAX_SESSION_SECONDS - Date.now() / 1000));
  for (const [name, value] of [[ID_COOKIE, idToken], [REFRESH_COOKIE, refreshToken]]) {
    (context().authCookies ||= []).push(serializeCookieHeader(name, value, {
      path: "/", secure: true, httpOnly: true, sameSite: "lax", maxAge,
    }));
  }
}

export async function firebaseLogin(email: string, password: string, allowed: string[]) {
  const data = await providerRequest<{ idToken?: string; refreshToken?: string; localId?: string; email?: string }>(
    "signInWithPassword", { email, password, returnSecureToken: true },
  );
  if (!data.idToken || !data.refreshToken || data.email?.toLowerCase() !== email) throw new FirebaseAuthError("IDENTITY_DENIED");
  const identity = await verifiedIdentity(data.idToken, allowed, true);
  if (identity.operator.email !== email || identity.operator.userId !== data.localId) throw new FirebaseAuthError("IDENTITY_DENIED");
  if (!identity.verified && !identity.internalAlias) {
    await providerRequest("sendOobCode", { requestType: "VERIFY_EMAIL", idToken: data.idToken });
    throw new FirebaseAuthError("VERIFICATION_SENT");
  }
  writeSession(data.idToken, data.refreshToken, identity.payload);
}

export async function firebaseOperator(allowed: string[]): Promise<Operator | null> {
  const cookie = context().request.headers.get("cookie") || "";
  if (cookie.length > 24000) return null;
  const cookies = new Map(parseCookieHeader(cookie).map(item => [item.name, item.value]));
  const idToken = cookies.get(ID_COOKIE), refreshToken = cookies.get(REFRESH_COOKIE);
  if (!idToken || idToken.length > 3800) return null;
  try { return (await verifiedIdentity(idToken, allowed)).operator; }
  catch (error) {
    // Refresh only an otherwise expired ID token, never a token with an invalid
    // signature, wrong project, removed permission or revoked account.
    if (!(error instanceof errors.JWTExpired) || !refreshToken || refreshToken.length > 3800) return null;
    try {
      const data = await providerRequest<{ id_token?: string; refresh_token?: string; user_id?: string }>(
        "", { grant_type: "refresh_token", refresh_token: refreshToken }, true,
      );
      if (!data.id_token || !data.refresh_token) return null;
      const identity = await verifiedIdentity(data.id_token, allowed);
      if (identity.operator.userId !== data.user_id) return null;
      writeSession(data.id_token, data.refresh_token, identity.payload);
      return identity.operator;
    } catch { return null; }
  }
}

export async function firebasePasswordReset(email: string) {
  const aliases = firebaseLoginAliases(context().env);
  if (!aliases) throw new FirebaseAuthError("NOT_CONFIGURED");
  // Internal logins have no mailbox. Recovery is performed by the administrator;
  // never send a reset link to an address that may later belong to someone else.
  if (aliases.has(email.toLowerCase())) return;
  // Firebase's hosted action handler consumes the one-use code and applies its
  // password policy. No recovery token is returned to this app or the browser.
  await providerRequest("sendOobCode", { requestType: "PASSWORD_RESET", email });
}
