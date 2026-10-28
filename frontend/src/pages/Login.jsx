import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { STATUS_MESSAGES } from "../roles";
import { Eye, Lock, Pulse, Shield } from "../components/Icons";
import ThemeToggle from "../components/ThemeToggle";

const PREFIXES = [["ADMIN", "Internal Admin"], ["PHST", "Pharmacy Staff"], ["PHAR", "Pharmacy"], ["LBST", "Lab Staff"], ["LAB", "Lab"], ["HOS", "Hospital"], ["DOC", "Doctor"], ["REC", "Receptionist"], ["NUR", "Nurse"], ["PAT", "Patient"]];

export default function Login() {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [needSet, setNeedSet] = useState("");
  const [params] = useSearchParams();
  const { signIn } = useAuth();
  const nav = useNavigate();

  const roleLabel = useMemo(() => PREFIXES.find(([p]) => id.toUpperCase().startsWith(p))?.[1], [id]);
  const notice = params.get("reason") === "session" ? "Your session expired. Please sign in again." : params.get("reason") === "idle" ? "You were signed out after 15 minutes of inactivity." : params.get("reason") === "pwchanged" ? "Password updated. Sign in with your new password." : params.get("reason") === "pwset" ? "Password saved. You can sign in now." : "";

  async function submit(e) {
    e.preventDefault();
    setErr(""); setInfo(""); setNeedSet(""); setBusy(true);
    const { data } = await api("auth/login", { method: "POST", body: { permanentid: id.trim(), password: pw } });
    setBusy(false);
    if (data.status === "success") { signIn(data.token, data.user); nav("/app"); }
    else if (data.status === "temp_password") { signIn(data.token, data.user, "change_password"); nav("/change-password"); }
    else if (data.status === "otp_required") { signIn(data.token, data.user, "otp"); nav("/verify-otp"); }
    else if (data.status === "password_not_set") setNeedSet(data.permanentid);
    else setErr(STATUS_MESSAGES[data.status] || "Something went wrong. Please try again.");
  }

  return (
    <div className="auth">
      <section className="auth-hero">
        <div className="brand light"><span className="brand-mark"><Pulse /></span><div><b>Cobalt</b><small>Electronic Health Records</small></div></div>
        <div className="hero-copy">
          <h1>Care that stays connected.</h1>
          <p>One secure workspace for patients, doctors, hospitals, labs and pharmacies.</p>
          <ul>
            <li><Shield /> Encrypted credentials &amp; account lockout</li>
            <li><Lock /> Role-based access for every portal</li>
          </ul>
        </div>
        <small className="foot">© Cobalt EHR</small>
      </section>

      <section className="auth-panel">
        <div className="auth-top"><ThemeToggle /></div>
        <form className="auth-card" onSubmit={submit} noValidate>
          <h2>Welcome back</h2>
          <p className="muted">Sign in with your Cobalt ID</p>

          {notice && <div className="alert info">{notice}</div>}
          {err && <div className="alert error" role="alert">{err}</div>}
          {info && <div className="alert info">{info}</div>}
          {needSet && <div className="alert info">This account has no password yet. After approval you set it once with a code sent to your registered e-mail / WhatsApp.
            <div className="row" style={{ justifyContent: "flex-start" }}><Link className="btn primary sm" to={`/set-password?id=${needSet}`}>Set my password</Link></div></div>}

          <label className="field">
            <span>User ID {roleLabel && <em className="chip">{roleLabel}</em>}</span>
            <input value={id} onChange={(e) => setId(e.target.value.toUpperCase())} placeholder="e.g. DOC12345" autoComplete="username" autoFocus />
          </label>

          <label className="field">
            <span>Password</span>
            <div className="input-wrap">
              <input type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
              <button type="button" className="icon-btn inline" onClick={() => setShow(!show)} aria-label="Show password"><Eye off={show} /></button>
            </div>
          </label>

          <button className="btn primary block" disabled={busy || !id || !pw}>{busy ? <span className="spinner" /> : "Sign in"}</button>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <Link className="link small" to={`/set-password${id ? `?id=${id}` : ""}`}>Forgot / set password?</Link>
            <Link className="link small" to="/super-admin">Super admin</Link>
          </div>
          <p className="muted small" style={{ textAlign: "center" }}>New here? <Link className="link" to="/register/hospital">Register a hospital</Link> · <Link className="link" to="/register/internal-admin">Internal admin sign-up</Link></p>
        </form>
      </section>
    </div>
  );
}
