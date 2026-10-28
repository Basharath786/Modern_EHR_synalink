import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Check, Dot, Eye, Key } from "../components/Icons";
import ThemeToggle from "../components/ThemeToggle";

const RULES = [
  ["8–32 characters (super admin: max 15)", (p) => p.length >= 8 && p.length <= 32],
  ["One uppercase letter", (p) => /[A-Z]/.test(p)],
  ["One lowercase letter", (p) => /[a-z]/.test(p)],
  ["One number", (p) => /[0-9]/.test(p)],
  ["One special character", (p) => /[^A-Za-z0-9]/.test(p)],
];
const ERRORS = {
  wrong_current_password: "Current password is incorrect.",
  same_password: "New password must be different from the current one.",
  weak_password: "New password does not meet the policy.",
  mismatch: "New password and confirmation do not match.",
};

export default function ChangePassword() {
  const { user, isTemp, signOut } = useAuth();
  const nav = useNavigate();
  const [cur, setCur] = useState(""); const [nw, setNw] = useState(""); const [cf, setCf] = useState("");
  const [show, setShow] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  const passed = RULES.filter(([, t]) => t(nw)).length;
  const strength = ["", "Weak", "Weak", "Fair", "Good", "Strong"][passed];
  const valid = passed === RULES.length && nw === cf && cur;

  async function submit(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    const { data } = await api(user.role === "SUPER_ADMIN" ? "superadmin/change-password" : "auth/change-password", { method: "POST", body: { current_password: cur, new_password: nw, confirm_password: cf } });
    setBusy(false);
    if (data.status === "password_changed") { signOut(); nav("/login?reason=pwchanged"); }
    else setErr(ERRORS[data.status] || "Could not change password.");
  }

  return (
    <div className="center-page">
      <div className="auth-top floating"><ThemeToggle /></div>
      <form className="auth-card wide" onSubmit={submit}>
        <span className="empty-icon"><Key /></span>
        <h2>{isTemp ? "Set your new password" : "Change password"}</h2>
        <p className="muted">{isTemp ? `Welcome ${user.name}. Your temporary password must be replaced before you continue.` : "Choose a strong password you don't use elsewhere."}</p>
        {err && <div className="alert error">{err}</div>}

        <label className="field"><span>{isTemp ? "Temporary password" : "Current password"}</span>
          <input type={show ? "text" : "password"} value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></label>
        <label className="field"><span>New password</span>
          <div className="input-wrap"><input type={show ? "text" : "password"} value={nw} onChange={(e) => setNw(e.target.value)} autoComplete="new-password" />
            <button type="button" className="icon-btn inline" onClick={() => setShow(!show)} aria-label="Show"><Eye off={show} /></button></div></label>

        <div className="meter"><i style={{ width: `${(passed / 5) * 100}%` }} data-level={passed} /></div>
        <p className="meter-label">{strength}</p>
        <ul className="rules">{RULES.map(([t, f]) => <li key={t} className={f(nw) ? "ok" : ""}>{f(nw) ? <Check /> : <Dot />} {t}</li>)}</ul>

        <label className="field"><span>Confirm new password</span>
          <input type={show ? "text" : "password"} value={cf} onChange={(e) => setCf(e.target.value)} autoComplete="new-password" />
          {cf && nw !== cf && <small className="err-text">Passwords do not match</small>}</label>

        <div className="row">
          {!isTemp && <button type="button" className="btn ghost" onClick={() => nav("/app")}>Cancel</button>}
          {isTemp && <button type="button" className="btn ghost" onClick={() => { signOut(); nav("/login"); }}>Back to sign in</button>}
          <button className="btn primary" disabled={!valid || busy}>{busy ? <span className="spinner" /> : "Update password"}</button>
        </div>
      </form>
    </div>
  );
}
