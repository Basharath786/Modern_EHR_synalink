import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Field, PasswordRules, passwordOk } from "../components/FormKit";
import { Eye, Key } from "../components/Icons";
import ThemeToggle from "../components/ThemeToggle";

const ERR = {
  id_error: "We couldn't find that ID. Check it and try again.",
  no_contact: "No mobile number or e-mail is registered for this account. Please contact your admin.",
  send_failed: "Could not send the code. Please try again later.",
  otp_expired: "The code expired or was tried too many times. Request a new code.",
  token_expired: "This step expired. Please start again.",
  weak_password: "The password does not meet the policy.",
  mismatch: "Passwords do not match.",
  missing_fields: "Please fill in all fields.",
};

// Replaces the legacy changepasssowrdallportal.html / set-password.html pages (first-time password after
// approval) and the forgot-password pages. Works for every role; the code goes to the registered e-mail / WhatsApp.
export default function SetPassword() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [id, setId] = useState((params.get("id") || "").toUpperCase());
  const [otp, setOtp] = useState(""); const [token, setToken] = useState("");
  const [pw, setPw] = useState(""); const [cf, setCf] = useState(""); const [show, setShow] = useState(false);
  const [sent, setSent] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  async function request(e) {
    e?.preventDefault(); setErr(""); setBusy(true);
    const { data } = await api("auth/set-password/request", { method: "POST", body: { permanentid: id.trim() } });
    setBusy(false);
    if (data.status === "code_sent") { setSent(data); setStep(1); setOtp(""); }
    else if (data.status === "too_soon") setErr(`Please wait ${data.retry_after} seconds before asking for another code.`);
    else setErr(data.message || ERR[data.status] || "Something went wrong. Please try again.");
  }
  async function verify(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    const { data } = await api("auth/set-password/verify", { method: "POST", body: { permanentid: id.trim(), otp } });
    setBusy(false);
    if (data.status === "verified") { setToken(data.token); setStep(2); }
    else if (data.status === "otp_invalid") setErr(`Incorrect code. ${data.attempts_left} attempt${data.attempts_left === 1 ? "" : "s"} left.`);
    else setErr(data.message || ERR[data.status] || "Could not verify the code.");
  }
  async function complete(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    const { data } = await api("auth/set-password/complete", { method: "POST", body: { permanentid: id.trim(), token, new_password: pw, confirm_password: cf } });
    setBusy(false);
    if (data.status === "password_set") nav("/login?reason=pwset");
    else { setErr(data.message || ERR[data.status] || "Could not set the password."); if (data.status === "token_expired") setStep(0); }
  }

  const first = sent ? sent.first_time : true;
  return (
    <div className="center-page">
      <div className="auth-top floating"><ThemeToggle /></div>
      <div className="auth-card wide">
        <span className="empty-icon"><Key /></span>
        <h2>{step === 2 ? "Choose your password" : sent && !first ? "Reset your password" : "Set your password"}</h2>
        <p className="muted">New hospital, doctor, receptionist, lab, pharmacy and admin accounts get their first password here after approval. Forgot your password? Use the same steps.</p>
        <ol className="stepper" style={{ margin: "14px 0" }}>
          {["Your ID", "Verify code", "New password"].map((s, i) => <li key={s} className={step === i ? "on" : step > i ? "done" : ""}><span>{step > i ? "✓" : i + 1}</span>{s}</li>)}
        </ol>
        {err && <div className="alert error" role="alert">{err}</div>}

        {step === 0 && <form onSubmit={request}>
          <Field label="Permanent ID"><input value={id} onChange={(e) => setId(e.target.value.toUpperCase())} placeholder="e.g. REC12345" autoFocus /></Field>
          <div className="row"><Link className="btn ghost" to="/login">Back to sign in</Link>
            <button className="btn primary" disabled={busy || !id.trim()}>{busy ? <span className="spinner" /> : "Send code"}</button></div>
        </form>}

        {step === 1 && <form onSubmit={verify}>
          <div className="alert info">We sent a 6-digit code{sent?.email ? ` to ${sent.email}` : ""}{sent?.email && sent?.mobile ? " and" : ""}{sent?.mobile ? ` to WhatsApp ${sent.mobile}` : ""}. It is valid for 5 minutes.</div>
          <Field label="Code"><input inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} autoFocus /></Field>
          <div className="row"><button type="button" className="btn ghost" disabled={busy} onClick={request}>Resend code</button>
            <button className="btn primary" disabled={busy || otp.length !== 6}>{busy ? <span className="spinner" /> : "Verify"}</button></div>
        </form>}

        {step === 2 && <form onSubmit={complete}>
          <p className="muted small">Account: <b>{id}</b></p>
          <Field label="New password"><div className="input-wrap"><input type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" autoFocus />
            <button type="button" className="icon-btn inline" onClick={() => setShow(!show)} aria-label="Show"><Eye off={show} /></button></div></Field>
          <PasswordRules value={pw} />
          <Field label="Confirm password" error={cf && cf !== pw ? "Passwords do not match" : ""}><input type={show ? "text" : "password"} value={cf} onChange={(e) => setCf(e.target.value)} autoComplete="new-password" /></Field>
          <div className="row"><button className="btn primary" disabled={busy || !passwordOk(pw) || pw !== cf}>{busy ? <span className="spinner" /> : "Save password"}</button></div>
        </form>}
      </div>
    </div>
  );
}
