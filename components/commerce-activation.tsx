import { useEffect, useState } from "react";
import { ArrowLeft, KeyRound, LoaderCircle } from "lucide-react";
import "./commerce-login.css";

export default function CommerceActivation() {
  const [invitation] = useState(() => {
    const fragment = new URLSearchParams(location.hash.slice(1));
    return { email: fragment.get("email") || "", tokenHash: fragment.get("token_hash") || "", type: fragment.get("type") || "" };
  });
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [consumed, setConsumed] = useState(false);
  const valid = /^[a-f0-9]{32,256}$/i.test(invitation.tokenHash) && ["invite", "recovery"].includes(invitation.type) && invitation.email.includes("@");

  useEffect(() => {
    // Fragments never reach the HTTP server. Remove the token from the address
    // bar/history after loading; it stays only in this page's component memory.
    history.replaceState(null, "", location.pathname);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || pending || consumed) return;
    if (password !== confirmation) { setError("As senhas precisam ser iguais."); return; }
    setPending(true); setError("");
    try {
      const response = await fetch("/api/auth/activate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...invitation, password }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        if ([400, 401].includes(response.status)) setConsumed(true);
        throw Error(result.error || "Não foi possível definir sua senha.");
      }
      setPassword(""); setConfirmation(""); location.assign("/gestao");
    } catch (error) { setError(error instanceof Error ? error.message : "Falha de conexão. Tente novamente."); }
    finally { setPending(false); }
  }

  return <main className="commerce-login">
    <a href="/gestao" className="login-back"><ArrowLeft size={16} /> Voltar para o acesso</a>
    <section className="login-card" aria-labelledby="activation-title">
      <div className="login-brand"><img src="/assets/logo.png" alt="" /><span>NOVA LEÕES<small>OCTOPOOL COMMERCE</small></span></div>
      <span className="login-icon"><KeyRound size={22} /></span>
      <h1 id="activation-title">Defina sua senha</h1>
      <p>Crie uma senha para acessar a gestão da loja.</p>
      {!valid ? <p role="alert" className="login-notice">Abra o link individual de primeiro acesso fornecido pelo administrador. Apenas informar um e-mail na tela de login não cria uma conta.</p> : <form onSubmit={submit}>
        <label htmlFor="activation-email">E-mail de acesso</label>
        <input id="activation-email" type="email" autoComplete="username" value={invitation.email} readOnly />
        <label htmlFor="activation-password">Nova senha</label>
        <input id="activation-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} disabled={pending || consumed} aria-describedby="password-guidance" />
        <p id="password-guidance" className="login-help">Use pelo menos 12 caracteres. Você pode usar uma frase fácil de lembrar.</p>
        <label htmlFor="activation-confirmation">Repita a senha</label>
        <input id="activation-confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={pending || consumed} />
        {error && <p role="alert" className="login-error">{error}</p>}
        <button type="submit" className="login-submit" disabled={pending || consumed}>{pending ? <><LoaderCircle size={18} className="animate-spin" /> Salvando…</> : "Salvar senha e entrar"}</button>
        <p className="login-help">Este link é individual e só pode ser usado uma vez. Não compartilhe sua senha.</p>
      </form>}
    </section>
    <p className="login-footer">Um ambiente da <strong>octopool</strong></p>
  </main>;
}
