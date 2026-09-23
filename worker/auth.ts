import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { context, type RuntimeEnv } from "./context.js";
import { firebaseConfigured, firebaseOperator } from "./firebase-auth.js";

export const SESSION_COOKIE = "__Host-commerce-session";
export type Operator = { userId: string; email: string; displayName: string; fullName: string | null };
const identities = new WeakMap<Request, Promise<Operator | null>>();
const clients = new WeakMap<Request, ReturnType<typeof createServerClient>>();

export function authProvider(env: RuntimeEnv): "firebase" | "supabase" | null {
  // Existing deployments keep their provider until the explicit cutover. Never
  // fall back to a second provider after a failed login or a provider outage.
  const provider = env.COMMERCE_AUTH_PROVIDER || "supabase";
  return provider === "firebase" || provider === "supabase" ? provider : null;
}

export function authConfigured(env: RuntimeEnv) {
  if (authProvider(env) === "firebase") return firebaseConfigured(env);
  if (authProvider(env) !== "supabase") return false;
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_")) return false;
    const url = new URL(env.SUPABASE_URL);
    return url.protocol === "https:" && /^[a-z]{20}\.supabase\.co$/.test(url.hostname) && !url.port && url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password;
  } catch { return false; }
}

export function approverEmails() {
  return (context().env.COMMERCE_APPROVERS || "").split(",").map(email => email.trim().toLowerCase()).filter(Boolean);
}

export function authClient() {
  const current = context();
  const { request, env } = current;
  if (authProvider(env) !== "supabase" || !authConfigured(env)) throw Error("AUTH_NOT_CONFIGURED");
  let client = clients.get(request);
  if (client) return client;
  const cookies = new Map(parseCookieHeader(request.headers.get("cookie") || "").map(cookie => [cookie.name, cookie.value]));
  client = createServerClient(env.SUPABASE_URL!, env.SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: { name: SESSION_COOKIE, path: "/", secure: true, httpOnly: true, sameSite: "lax", maxAge: 7 * 24 * 3600 },
    global: { fetch: async (input, init) => {
      // Workers rejects redirect:"error". Manual mode also prevents credentials
      // from following an unexpected redirect to another origin.
      const response = await fetch(input, { ...init, redirect: "manual", signal: AbortSignal.timeout(8000) });
      if (response.status >= 300 && response.status < 400) throw Error("AUTH_REDIRECT_REFUSED");
      return response;
    } },
    cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: (changes, headers) => {
        for (const { name, value, options } of changes) {
          cookies.set(name, value);
          (current.authCookies ||= []).push(serializeCookieHeader(name, value, { ...options, path: "/", domain: undefined, secure: true, httpOnly: true, sameSite: "lax" }));
        }
        current.authHeaders = { ...current.authHeaders, ...headers };
      },
    },
  });
  clients.set(request, client);
  return client;
}

export function operator(): Promise<Operator | null> {
  const request = context().request;
  let result = identities.get(request);
  if (!result) { result = verifyOperator(); identities.set(request, result); }
  return result;
}

async function verifyOperator(): Promise<Operator | null> {
  const { env, request } = context();
  if (!authConfigured(env) || !approverEmails().length) return null;
  if (authProvider(env) === "firebase") return firebaseOperator(approverEmails());
  const cookie = request.headers.get("cookie") || "";
  if (!cookie.includes(SESSION_COOKIE) || cookie.length > 24000) return null;
  try {
    // getUser checks the session with the configured Auth server. Never authorize
    // from getSession(), cookie contents, browser headers or editable metadata.
    const { data: { user }, error } = await authClient().auth.getUser();
    if (error || !user || user.role !== "authenticated" || user.is_anonymous || !user.email_confirmed_at || !user.email) return null;
    const email = user.email.toLowerCase();
    if (!approverEmails().includes(email)) return null;
    return { userId: user.id, email, displayName: email, fullName: null };
  } catch { return null; }
}

export function withAuthCookies(response: Response) {
  const current = context();
  if (!current.authCookies?.length) return response;
  const result = new Response(response.body, response);
  for (const cookie of current.authCookies) result.headers.append("Set-Cookie", cookie);
  for (const [key, value] of Object.entries(current.authHeaders || {})) result.headers.set(key, value);
  result.headers.set("Cache-Control", "private, no-store, max-age=0");
  return result;
}

export function clearAuthCookies() {
  const current = context();
  const names = new Set([SESSION_COOKIE]);
  for (const cookie of parseCookieHeader(current.request.headers.get("cookie") || "")) names.add(cookie.name);
  for (const cookie of current.authCookies || []) names.add(cookie.split("=", 1)[0]);
  current.authCookies = [...names].filter(name => name === SESSION_COOKIE || name.startsWith(SESSION_COOKIE + ".") || name.startsWith(SESSION_COOKIE + "-")).map(name =>
    serializeCookieHeader(name, "", { path: "/", secure: true, httpOnly: true, sameSite: "lax", maxAge: 0, expires: new Date(0) })
  );
}
