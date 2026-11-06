import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { Badge } from "../../components/ui";
import { FileInput } from "../../components/FormKit";
import { Pulse } from "../../components/Icons";
import ThemeToggle from "../../components/ThemeToggle";

const MSG = { not_found: "Temporary ID not found.", too_soon: "Please wait before requesting another code.", not_allowed: "This profile cannot be updated right now.", expired: "The code expired. Request a new one.",
  max_attempts: "Too many wrong attempts. Request a new code.", no_code: "Request a verification code first.", not_verified: "Please verify the code again.", send_failed: "Could not send the code. Try again." };
const PHASE = { under_validation: "Your profile is under validation. Please reach out to one of the validation centres (hospital or reception) to get it validated.",
  blocked: "Your profile has been blocked while validating. We will inform you about the next process soon.", no_action: "Nothing to update right now. Your hospital will contact you if anything is needed." };

// Legacy profile-status.html + profile-update.html ("Profile update for temporary user")
export default function TempProfileUpdate() {
  const [sp] = useSearchParams(); const [tid, setTid] = useState((sp.get("id") || "").toUpperCase());
  const [info, setInfo] = useState(null); const [step, setStep] = useState("id"); const [code, setCode] = useState(""); const [token, setToken] = useState("");
  const [aadhaar, setAadhaar] = useState(""); const [file, setFile] = useState(null); const [err, setErr] = useState(""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false); const [wait, setWait] = useState(0);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);
  const fail = (d) => setErr((d.errors && Object.values(d.errors)[0]) || d.message || MSG[d.status] || "Something went wrong.");

  async function check(e) { e?.preventDefault(); setErr(""); setBusy(true); const { data } = await api("public/temp-profile/status", { method: "POST", body: { temp_id: tid } }); setBusy(false);
    if (data.status === "ok") { setInfo(data); setStep("status"); } else fail(data); }
  async function sendCode() { setErr(""); setBusy(true); const { data } = await api("public/temp-profile/code", { method: "POST", body: { temp_id: tid } }); setBusy(false);
    if (data.status === "code_sent") { setStep("code"); setWait(30); setCode(""); } else { if (data.status === "too_soon") setWait(data.retry_after); fail(data); } }
  async function verify(e) { e.preventDefault(); setErr(""); setBusy(true); const { data } = await api("public/temp-profile/verify", { method: "POST", body: { temp_id: tid, code } }); setBusy(false);
    if (data.status === "verified") { setToken(data.token); setStep("upload"); } else { setCode(""); setErr(data.status === "not_matched" ? `Wrong code. Attempts left: ${data.attempts_left}` : MSG[data.status] || "Verification failed."); } }
  async function upload(e) { e.preventDefault(); setErr(""); setBusy(true); const fd = new FormData(); fd.append("temp_id", tid); fd.append("token", token); fd.append("govtidno", aadhaar); if (file) fd.append("govtidfile", file);
    const { data } = await api("public/temp-profile/update", { method: "POST", body: fd }); setBusy(false);
    if (data.status === "updated") { setOk(`Profile updated. Chances left: ${data.chances_left}. Your hospital will validate the new proof.`); setStep("done"); } else fail(data); }

  return (
    <div className="center-page"><div className="auth-top floating"><ThemeToggle /></div>
      <div className="auth-card wide">
        <div className="brand" style={{ marginBottom: 12 }}><span className="brand-mark"><Pulse /></span><div><b>Cobalt</b><small>Profile update for temporary user</small></div></div>
        {err && <div className="alert error" role="alert">{err}</div>}
        {step === "id" && <form onSubmit={check}><label className="field"><span>Temporary ID</span><input value={tid} onChange={(e) => setTid(e.target.value.toUpperCase())} autoFocus placeholder="e.g. TEMP12345" /></label>
          <button className="btn primary block" disabled={!tid.trim() || busy}>{busy ? <span className="spinner" /> : "Check status"}</button></form>}
        {step === "status" && info && <div>
          <h3>Hello {info.first_name}</h3>
          <dl className="kv"><div><dt>Status</dt><dd><Badge tone={info.profile_status === "HOLD" ? "amber" : info.profile_status === "REJECTED" ? "red" : "gray"}>{info.profile_status}</Badge></dd></div>
            <div><dt>Times put on hold</dt><dd>{info.hold_attempt}</dd></div><div><dt>Chances left to upload proof</dt><dd>{info.chances_left} <small className="muted">(max 3)</small></dd></div></dl>
          {info.reason_for_hold && <div className="alert info">Reason: {info.reason_for_hold}</div>}
          {info.phase === "can_update" ? <div className="row"><button className="btn primary" disabled={busy} onClick={sendCode}>{busy ? <span className="spinner" /> : "Send verification code"}</button></div> : <div className="alert info">{PHASE[info.phase]}</div>}</div>}
        {step === "code" && <form onSubmit={verify}><p className="muted">Enter the verification code sent to your registered e-mail. It is valid for 5 minutes (3 tries).</p>
          <label className="field"><span>Verification code</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={5} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></label>
          <button className="btn primary block" disabled={code.length !== 5 || busy}>{busy ? <span className="spinner" /> : "Verify"}</button>
          <div className="row spread"><button type="button" className="link" disabled={wait > 0} onClick={sendCode}>{wait > 0 ? `Resend in ${wait}s` : "Resend code"}</button></div></form>}
        {step === "upload" && <form onSubmit={upload}><label className="field"><span>Aadhaar number</span><input inputMode="numeric" maxLength={12} value={aadhaar} onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, ""))} /></label>
          <FileInput label="Upload Aadhaar file" file={file} onFile={setFile} /><button className="btn primary block" disabled={aadhaar.length !== 12 || !file || busy}>{busy ? <span className="spinner" /> : "Submit"}</button></form>}
        {step === "done" && <div style={{ textAlign: "center" }}><span className="empty-icon ok">✓</span><p>{ok}</p></div>}
        <div className="row" style={{ justifyContent: "center" }}><Link className="link small" to="/login">Back to sign in</Link></div>
      </div></div>
  );
}
