import { z } from "zod";
import { authClient, authConfigured, authProvider, approverEmails, clearAuthCookies } from "./auth.js";
import { context } from "./context.js";
import { HttpError, readJson } from "../lib/commerce-server.js";
import { firebaseLogin, firebasePasswordReset, FirebaseAuthError } from "./firebase-auth.js";
import { firebaseLoginAliases } from "./auth-aliases.js";

function passwordRecoveryAvailable() {
  const { env } = context();
  const aliases = firebaseLoginAliases(env);
  return authConfigured(env) && authProvider(env) === "firebase" &&
    approverEmails().some(email => !aliases?.has(email));
}

export function authStatus() {
  const configured = authConfigured(context().env);
  return Response.json({ configured, accessReady: approverEmails().length > 0, passwordRecovery: passwordRecoveryAvailable() });
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
  if (authProvider(env) === "firebase") {
    try { await firebaseLogin(email, body.password, approverEmails()); }
    catch (error) {
      if (error instanceof FirebaseAuthError && error.code === "VERIFICATION_SENT") {
        throw new HttpError(403, "Enviamos um link para confirmar seu e-mail. Abra sua caixa de entrada e confirme antes de entrar.");
      }
      if (error instanceof FirebaseAuthError && ["PROVIDER_UNAVAILABLE", "TOO_MANY_ATTEMPTS_TRY_LATER", "QUOTA_EXCEEDED"].includes(error.code)) {
        throw new HttpError(503, "O acesso está temporariamente indisponível. Aguarde um pouco e tente novamente.");
      }
      throw denied();
    }
    return Response.json({ ok: true });
  }
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
  try { if (authProvider(context().env) === "supabase" && authConfigured(context().env)) await authClient().auth.signOut({ scope: "local" }); }
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
  if (authProvider(env) === "firebase") throw new HttpError(410, passwordRecoveryAvailable()
    ? "Para acessos com e-mail, use Esqueci minha senha na tela de acesso. Para logins internos, fale com o administrador."
    : "Para definir ou recuperar a senha do seu login interno, fale com o administrador.");
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

export async function recoverPassword(request: Request) {
  const body = z.object({ email: z.string().trim().email().max(200) }).strict().parse(await readJson(request));
  const { env } = context();
  if (authProvider(env) !== "firebase" || !authConfigured(env) || !env.AUTH_RATE_LIMITER) {
    throw new HttpError(503, "A recuperação de senha ainda não está disponível. Fale com o administrador.");
  }
  const email = body.email.toLowerCase();
  const [byIp, byEmail] = await Promise.all([
    env.AUTH_RATE_LIMITER.limit({ key: `recovery-ip:${request.headers.get("cf-connecting-ip") || "unknown"}` }),
    env.AUTH_RATE_LIMITER.limit({ key: `recovery-email:${email}` }),
  ]);
  if (!byIp.success || !byEmail.success) throw new HttpError(429, "Muitas tentativas. Aguarde um minuto e tente novamente.");
  if (approverEmails().includes(email)) {
    try { await firebasePasswordReset(email); }
    catch (error) {
      if (!(error instanceof FirebaseAuthError) || !["EMAIL_NOT_FOUND", "USER_NOT_FOUND", "USER_DISABLED"].includes(error.code)) {
        throw new HttpError(503, "Não foi possível solicitar o e-mail agora. Aguarde um pouco e tente novamente.");
      }
    }
  }
  // Same response for unauthorized, missing, internal and permitted accounts.
  return Response.json({ ok: true, message: "Se este acesso permitir recuperação por e-mail, você receberá um link para definir uma nova senha. Confira também o spam. Para logins internos, fale com o administrador." });
}
