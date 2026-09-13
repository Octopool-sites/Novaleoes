import { z } from "zod";
import { authClient, authConfigured, approverEmails } from "./auth";
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
  if (authConfigured(context().env)) await authClient().auth.signOut({ scope: "local" });
  return Response.json({ ok: true });
}
