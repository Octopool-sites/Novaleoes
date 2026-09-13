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
  useEffect(() => {
    let active = true;
    fetch("/api/auth/status").then(async response => {
      if (!response.ok) throw Error("Não foi possível conferir o acesso. Atualize a página.");
      const state = await response.json() as { configured: boolean; accessReady: boolean };
      if (active) setReady(state.configured && state.accessReady);
    }).catch(error => active && setError(error.message)).finally(() => active && setChecking(false));
    return () => { active = false; };
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !ready) return;
    setPending(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw Error(result.error || "Não foi possível entrar.");
      setPassword(""); onSignedIn();
    } catch (error) { setError(error instanceof Error ? error.message : "Falha de conexão. Tente novamente."); }
    finally { setPending(false); }
  }
  return <main className="commerce-login">
    <a href="/" className="login-back"><ArrowLeft size={16} /> Voltar para a loja</a>
    <section className="login-card" aria-labelledby="login-title">
      <div className="login-brand"><img src="/assets/logo.png" alt="" /><span>NOVA LEÕES<small>OCTOPOOL COMMERCE</small></span></div>
      <span className="login-icon"><LockKeyhole size={22} /></span>
      <h1 id="login-title">Acesso da equipe</h1>
      <p>Confira pedidos e aprove as vendas da loja.</p>
      {!checking && !ready && <p role="status" className="login-notice">Estamos finalizando a liberação dos responsáveis. Os pedidos continuam desativados.</p>}
      <form onSubmit={submit}>
        <label htmlFor="commerce-email">E-mail</label>
        <input id="commerce-email" type="email" autoComplete="username" required maxLength={200} value={email} onChange={event => setEmail(event.target.value)} placeholder="Seu e-mail de acesso" disabled={pending} />
        <label htmlFor="commerce-password">Senha</label>
        <input id="commerce-password" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={event => setPassword(event.target.value)} disabled={pending} />
        {error && <p role="alert" className="login-error">{error}</p>}
        <button className="login-submit" type="submit" disabled={checking || pending || !ready}>{pending || checking ? <><LoaderCircle size={18} className="animate-spin" /> {pending ? "Entrando…" : "Conferindo acesso…"}</> : "Entrar na gestão"}</button>
      </form>
      <p className="login-help">O acesso é liberado pelo administrador. Se precisar criar ou recuperar sua senha, fale com o responsável da loja.</p>
    </section>
    <p className="login-footer">Um ambiente da <strong>octopool</strong></p>
  </main>;
}
