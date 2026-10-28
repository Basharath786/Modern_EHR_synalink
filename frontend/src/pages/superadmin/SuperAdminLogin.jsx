import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { Field, PasswordRules, passwordOk } from "../../components/FormKit";
import { Eye, Shield } from "../../components/Icons";
import ThemeToggle from "../../components/ThemeToggle";

const ERR = { id_error: "This is not the super admin ID.", password_error: "Incorrect password. The 3rd wrong attempt locks the account.",
  locked_account: "Account locked after 3 wrong passwords. Use “Forgot password” to reset it.", password_not_set: "No password yet. Complete the first-time setup.",
  expired: "The verification code expired. Request a new one.", "not matched": "Incorrect verification code.", null: "Request a verification code first.",
  weak_password: "8-15 characters with upper and lower case letters, a number and a special character.", mismatch: "Passwords do not match.",
  already_configured: "The super admin is already set up. Please sign in." };

// Legacy super-admin/*.html: first-time setup (ID check -> code -> password), login, forgot password.
export default function SuperAdminLogin() {
  const { signIn } = useAuth(); const nav = useNavigate();
  const [mode, setMode] = useState("login");          // login | setup | reset
  const [step, setStep] = useState(0);
  const [configured, setConfigured] = useState(true);
  const [sid, setSid] = useState(""); const [pw, setPw] = useState(""); const [cf, setCf] = useState(""); const [code, setCode] = useState(""); const [tok, setTok] = useState("");
  const [show, setShow] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [info, setInfo] = useState("");
  useEffect(() => { api("superadmin/status").then(({ data }) => { setConfigured(!!data.configured); if (!data.configured) setMode("setup"); }); }, []);
  const go = (m) => { setMode(m); setStep(0); setErr(""); setInfo(""); setPw(""); setCf(""); setCode(""); };
  const call = async (path, body, headers) => { setErr(""); setBusy(true); const r = await api(path, { method: "POST", body, headers }); setBusy(false); return r.data; };

  async function login(e) {
    e.preventDefault(); const d = await call("superadmin/login", { super_admin_id: sid.trim(), password: pw });
    if (d.status === "success") { signIn(d.token, d.user); nav("/app"); } else setErr(ERR[d.status] || "Could not sign in.");
  }
  async function sendCode(e) {
    e?.preventDefault(); const d = await call(mode === "setup" ? "superadmin/setup" : "superadmin/code/send", { super_admin_id: sid.trim() });
    if (d.status === "code_sent") { setStep(1); setInfo("A 4-digit verification code was sent to the super admin e-mail. It is valid for 5 minutes."); } else setErr(d.message || ERR[d.status] || "Could not send the code.");
  }
  async function check(e) {
    e.preventDefault(); const d = await call("superadmin/code/check", { super_admin_id: sid.trim(), verification_code: code });
    if (d.status === "matched") { setTok(d.token); setStep(2); setInfo(""); } else setErr(ERR[d.status] || "Incorrect code.");
  }
  async function save(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    const res = await fetch("/api/v1/superadmin/password", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` }, body: JSON.stringify({ password: pw, confirm_password: cf }) });
    const d = await res.json().catch(() => ({})); setBusy(false);
    if (d.status === "password_set") { setConfigured(true); go("login"); setInfo("Password saved. Sign in now."); } else setErr(d.message || ERR[d.status] || "Could not save the password.");
  }

  return (
    <div className="center-page">
      <div className="auth-top floating"><ThemeToggle /></div>
      <div className="auth-card wide">
        <span className="empty-icon"><Shield /></span>
        <h2>{mode === "login" ? "Super admin sign in" : mode === "setup" ? "Super admin first-time setup" : "Reset super admin password"}</h2>
        {err && <div className="alert error">{err}</div>}{info && <div className="alert info">{info}</div>}
        {mode === "login" && <form onSubmit={login}>
          <Field label="Super admin ID (e-mail)"><input value={sid} onChange={(e) => setSid(e.target.value)} autoFocus autoComplete="username" /></Field>
          <Field label="Password"><div className="input-wrap"><input type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
            <button type="button" className="icon-btn inline" onClick={() => setShow(!show)} aria-label="Show"><Eye off={show} /></button></div></Field>
          <button className="btn primary block" disabled={busy || !sid || !pw}>{busy ? <span className="spinner" /> : "Sign in"}</button>
          <div className="row" style={{ justifyContent: "space-between" }}><button type="button" className="link small" onClick={() => go("reset")}>Forgot password?</button>
            {!configured && <button type="button" className="link small" onClick={() => go("setup")}>First-time setup</button>}<Link className="link small" to="/login">User sign in</Link></div>
        </form>}
        {mode !== "login" && step === 0 && <form onSubmit={sendCode}>
          <Field label="Super admin ID (e-mail)"><input value={sid} onChange={(e) => setSid(e.target.value)} autoFocus /></Field>
          <div className="row"><button type="button" className="btn ghost" onClick={() => go("login")}>Back</button><button className="btn primary" disabled={busy || !sid}>{busy ? <span className="spinner" /> : "Send verification code"}</button></div></form>}
        {mode !== "login" && step === 1 && <form onSubmit={check}>
          <Field label="Verification code"><input inputMode="numeric" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus /></Field>
          <div className="row"><button type="button" className="btn ghost" onClick={sendCode} disabled={busy}>Resend</button><button className="btn primary" disabled={busy || code.length !== 4}>Verify</button></div></form>}
        {mode !== "login" && step === 2 && <form onSubmit={save}>
          <Field label="New password"><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></Field>
          <PasswordRules value={pw} max={15} />
          <Field label="Confirm password" error={cf && cf !== pw ? "Passwords do not match" : ""}><input type="password" value={cf} onChange={(e) => setCf(e.target.value)} /></Field>
          <div className="row"><button className="btn primary" disabled={busy || !passwordOk(pw, 15) || pw !== cf}>Save password</button></div></form>}
      </div>
    </div>
  );
}
