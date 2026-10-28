import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Shield } from "../components/Icons";
import ThemeToggle from "../components/ThemeToggle";

const MSG = {
  otp_invalid: "That code is incorrect or expired.",
  max_attempts: "Too many attempts. Please request a new code.",
  send_failed: "We couldn't send the code. Please try again shortly.",
  mobile_required: "No mobile number is registered on this account. Contact your hospital.",
  too_soon: "Please wait a moment before requesting another code.",
};

export default function OtpVerify() {
  const { user, signIn, signOut } = useAuth();
  const nav = useNavigate();
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [mobile, setMobile] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0); const [sending, setSending] = useState(false);
  const refs = useRef([]); const sentOnce = useRef(false);

  async function send() {
    setSending(true); setErr("");
    const { data } = await api("patient/otp/send", { method: "POST", body: {} });
    setSending(false);
    if (data.status === "otp_sent") { setMobile(data.mobile); setWait(data.resend_after); }
    else if (data.status === "too_soon") setWait(data.retry_after);
    else setErr(MSG[data.status] || "Could not send the code.");
  }
  useEffect(() => { if (!sentOnce.current) { sentOnce.current = true; send(); } }, []);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);

  const code = digits.join("");
  function setAt(i, v) {
    const d = v.replace(/\D/g, "");
    if (!d) { const n = [...digits]; n[i] = ""; setDigits(n); return; }
    const n = [...digits];
    d.split("").slice(0, 6 - i).forEach((ch, k) => (n[i + k] = ch));
    setDigits(n);
    refs.current[Math.min(i + d.length, 5)]?.focus();
  }
  async function verify(e) {
    e.preventDefault(); setBusy(true); setErr("");
    const { data } = await api("patient/otp/verify", { method: "POST", body: { otp: code } });
    setBusy(false);
    if (data.status === "success") { signIn(data.token, data.user); nav("/app"); }
    else {
      setDigits(["", "", "", "", "", ""]); refs.current[0]?.focus();
      setErr((MSG[data.status] || "Verification failed.") + (data.attempts_left !== undefined ? ` ${data.attempts_left} attempt(s) left.` : ""));
    }
  }

  return (
    <div className="center-page">
      <div className="auth-top floating"><ThemeToggle /></div>
      <form className="auth-card" onSubmit={verify}>
        <span className="empty-icon"><Shield /></span>
        <h2>Verify it's you</h2>
        <p className="muted">Hi {user?.name}. We sent a 6-digit code {mobile ? <>to <b>{mobile}</b></> : "to your registered mobile number"}. It is valid for 10 minutes.</p>
        {err && <div className="alert error" role="alert">{err}</div>}
        <div className="otp-row">
          {digits.map((d, i) => (
            <input key={i} ref={(el) => (refs.current[i] = el)} value={d} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              aria-label={`Digit ${i + 1}`} autoFocus={i === 0} onChange={(e) => setAt(i, e.target.value)}
              onKeyDown={(e) => e.key === "Backspace" && !digits[i] && i > 0 && refs.current[i - 1]?.focus()} />
          ))}
        </div>
        <button className="btn primary block" disabled={code.length !== 6 || busy}>{busy ? <span className="spinner" /> : "Verify & continue"}</button>
        <div className="row spread">
          <button type="button" className="link" disabled={wait > 0 || sending} onClick={send}>{wait > 0 ? `Resend in ${wait}s` : sending ? "Sending…" : "Resend code"}</button>
          <button type="button" className="link" onClick={() => { signOut(); nav("/login"); }}>Use a different account</button>
        </div>
      </form>
    </div>
  );
}
