import { z } from "zod";
import { authClient, authConfigured, approverEmails, clearAuthCookies } from "./auth";
import { context } from "./context";
import { HttpError, readJson } from "../lib/commerce-server";

export function authStatus() {
  return Response.json({ configured: authConfigured(context().env), accessReady: approverEmails().length > 0 });
}

export async function login(request: Request) {
  const body = z.object({ email: z.string().trim().email().max(200), password: z.string().min(1).max(256) }).strict().parse(await readJson(request));
  const { env } = context();
  if (!authConfigured(env)) throw new HttpError(503, "O acesso da equipe está sendo preparado.");
  if (!env.AUTH_RATE_LIMITER) throw new HttpError(503, "O acesso está temporariamente indisponível.");
  const email = body.email.toLowerCase();
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const [byIp, byEmail] = await Promise.all([
    env.AUTH_RATE_LIMITER.limit({ key: `ip:${ip}` }),
    env.AUTH_RATE_LIMITER.limit({ key: `email:${email}` }),
  ]);
  if (!byIp.success || !byEmail.success) throw new HttpError(429, "Muitas tentativas. Aguarde um minuto e tente novamente.");
  const denied = () => new HttpError(401, "Não foi possível entrar. Confira seus dados e a liberação do seu acesso.");
  if (!approverEmails().includes(email)) throw denied();
  const client = authClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password: body.password });
  if (error || !data.user?.email_confirmed_at || data.user.role !== "authenticated" || data.user.is_anonymous || data.user.email?.toLowerCase() !== email) {
    console.warn("commerce-login-denied", { providerCode: error?.code || "IDENTITY_CHECK", providerStatus: error?.status || 0 });
    if (data.session) await client.auth.signOut({ scope: "local" });
    throw denied();
  }
  return Response.json({ ok: true });
}

export async function logout(request: Request) {
  z.object({}).strict().parse(await readJson(request));
  try { if (authConfigured(context().env)) await authClient().auth.signOut({ scope: "local" }); }
  finally { clearAuthCookies(); }
  return Response.json({ ok: true });
}

export async function activate(request: Request) {
  const body = z.object({
    email: z.string().trim().email().max(200),
    tokenHash: z.string().regex(/^[a-f0-9]{32,256}$/i),
    type: z.enum(["invite", "recovery"]),
    password: z.string().min(12).max(128),
  }).strict().parse(await readJson(request));
  const { env } = context();
  if (!authConfigured(env) || !env.AUTH_RATE_LIMITER) throw new HttpError(503, "O acesso está temporariamente indisponível.");
  const limited = await env.AUTH_RATE_LIMITER.limit({ key: `activation:${request.headers.get("cf-connecting-ip") || "unknown"}` });
  if (!limited.success) throw new HttpError(429, "Muitas tentativas. Aguarde um minuto e tente novamente.");
  const email = body.email.toLowerCase();
  const denied = () => new HttpError(401, "Este link expirou, já foi utilizado ou não tem acesso liberado. Peça um novo link ao administrador.");
  if (!approverEmails().includes(email)) throw denied();
  const client = authClient();
  let accepted = false;
  try {
    // The one-use token comes from an admin-generated invite/recovery link.
    // No service key is deployed and an arbitrary email cannot create an account.
    const { data, error } = await client.auth.verifyOtp({ token_hash: body.tokenHash, type: body.type });
    const user = data.user;
    if (error || !data.session || !user?.email_confirmed_at || user.role !== "authenticated" || user.is_anonymous || user.email?.toLowerCase() !== email) throw denied();
    const updated = await client.auth.updateUser({ password: body.password });
    if (updated.error || updated.data.user?.id !== user.id || updated.data.user?.email?.toLowerCase() !== email) {
      throw new HttpError(400, "Não foi possível salvar a senha. Peça um novo link ao administrador e use uma senha diferente com pelo menos 12 caracteres.");
    }
    accepted = true;
    return Response.json({ ok: true });
  } finally {
    if (!accepted) {
      try { await client.auth.signOut({ scope: "local" }); }
      finally { clearAuthCookies(); }
    }
  }
}
