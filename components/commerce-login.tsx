import { useEffect, useState } from "react";
import { ArrowLeft, LoaderCircle, LockKeyhole } from "lucide-react";
import "./commerce-login.css";

export default function CommerceLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/auth/status").then(async response => {
      if (!response.ok) throw Error("Não foi possível conferir o acesso. Atualize a página.");
      const state = await response.json() as { configured: boolean; accessReady: boolean; passwordRecovery?: boolean };
      if (active) { setReady(state.configured && state.accessReady); setRecoveryAvailable(!!state.passwordRecovery); }
    }).catch(error => active && setError(error.message)).finally(() => active && setChecking(false));
    return () => { active = false; };
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !ready) return;
    setPending(true); setError(""); setNotice("");
    try {
      const response = await fetch(recovering ? "/api/auth/recover" : "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(recovering ? { email } : { email, password }) });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw Error(result.error || "Não foi possível entrar.");
      if (recovering) { setNotice(result.message || "Confira sua caixa de entrada para continuar."); return; }
      setPassword(""); onSignedIn();
    } catch (error) { setError(error instanceof Error ? error.message : "Falha de conexão. Tente novamente."); }
    finally { setPending(false); }
  }
  return <main className="commerce-login">
    <a href="/" className="login-back"><ArrowLeft size={16} /> Voltar para a loja</a>
    <section className="login-card" aria-labelledby="login-title">
      <div className="login-brand"><img src="/assets/logo.png" alt="" /><span>NOVA LEÕES<small>OCTOPOOL COMMERCE</small></span></div>
      <span className="login-icon"><LockKeyhole size={22} /></span>
      <h1 id="login-title">{recovering ? "Recupere seu acesso" : "Acesso da equipe"}</h1>
      <p>{recovering ? "Receba um link por e-mail para definir uma nova senha." : "Confira pedidos e aprove as vendas da loja."}</p>
      {!checking && !ready && <p role="status" className="login-notice">Estamos finalizando a liberação do acesso da equipe. Tente novamente mais tarde.</p>}
      <form onSubmit={submit}>
        <label htmlFor="commerce-email">E-mail</label>
        <input id="commerce-email" type="email" autoComplete="username" required maxLength={200} value={email} onChange={event => setEmail(event.target.value)} placeholder="Seu e-mail de acesso" disabled={pending} />
        {!recovering && <><label htmlFor="commerce-password">Senha</label>
        <input id="commerce-password" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={event => setPassword(event.target.value)} disabled={pending} /></>}
        {error && <p role="alert" className="login-error">{error}</p>}
        {notice && <p role="status" className="login-notice">{notice}</p>}
        <button className="login-submit" type="submit" disabled={checking || pending || !ready}>{pending || checking ? <><LoaderCircle size={18} className="animate-spin" /> {pending ? (recovering ? "Solicitando link…" : "Entrando…") : "Conferindo acesso…"}</> : (recovering ? "Enviar link por e-mail" : "Entrar na gestão")}</button>
        {recoveryAvailable && <button className="login-back" type="button" disabled={pending} onClick={() => { setRecovering(!recovering); setError(""); setNotice(""); setPassword(""); }}>{recovering ? "Voltar para entrar" : "Esqueci minha senha"}</button>}
      </form>
      <p className="login-help">{recoveryAvailable ? "Primeiro acesso? Após a liberação pelo administrador, use Esqueci minha senha para definir sua senha. Apenas a equipe autorizada pode entrar." : "Primeiro acesso? Abra seu link individual para definir a senha. Digitar um e-mail aqui não cria uma conta. Para receber um novo link, fale com o administrador."}</p>
    </section>
    <p className="login-footer">Um ambiente da <strong>octopool</strong></p>
  </main>;
}
