import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { Field, FileInput, GeoFields, PasswordRules, digits, passwordOk, useForm } from "../../components/FormKit";
import { Pulse } from "../../components/Icons";
import ThemeToggle from "../../components/ThemeToggle";
import { PageHead } from "../../components/ui";

const BLOOD = ["A +ve", "A -ve", "B +ve", "B -ve", "O +ve", "O -ve", "AB +ve", "AB -ve"];
const blank = { fname: "", mname: "", lname: "", dob: "", gender: "", marital: "", bloodgroup: "", insurance_provider: "", address: "", country: "India", state: "", city: "",
  zipcode: "", mobno: "", hphone: "", emergencycontact: "", email: "", govtidtype: "", govtidno: "" };
const nameOnly = (v) => v.replace(/[^A-Za-z]/g, "");

// Shared by the public sign-up (register/patient-registration.html -> patient-otp-verification.html ->
// patient-set-password.html) and reception "Register Patient" (reception/patient-register.html).
export function PatientRegFlow({ desk, onDone }) {
  const base = desk ? "desk/register-patient" : "public/register/patient";
  const form = useForm(blank); const { f, errors, setErrors, bind } = form;
  const [file, setFile] = useState(null); const [step, setStep] = useState(0); const [sent, setSent] = useState(null);
  const [otp, setOtp] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [info, setInfo] = useState("");
  const [result, setResult] = useState(null); const [pw, setPw] = useState(""); const [cf, setCf] = useState("");
  const age = useMemo(() => { if (!f.dob) return ""; const d = new Date(f.dob), t = new Date(); return t.getFullYear() - d.getFullYear() - ((t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) ? 1 : 0); }, [f.dob]);
  const req = desk ? "" : " *";

  async function start(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    const fd = new FormData(); Object.entries(f).forEach(([k, v]) => fd.append(k, v)); if (file) fd.append("govtidfile", file);
    const { data } = await api(base, { method: "POST", body: fd }); if (data?.status === "cancelled_by_user") { if (typeof setBusy === "function") setBusy(false); return; } setBusy(false);
    if (data.status === "otp_sent") { setSent(data); setStep(1); setOtp(""); setInfo(`A 6-digit OTP was sent to WhatsApp ${data.mobile}${f.email ? " and to the e-mail" : ""}. It is valid for 10 minutes.`); }
    else if (data.errors) { setErrors(data.errors); setErr("Please correct the highlighted fields."); }
    else setErr(data.message || "Registration failed. Please try again.");
  }
  async function resend() {
    setErr(""); const { data } = await api(`${base}/resend`, { method: "POST", body: { temp_id: sent.temp_id } }); if (data?.status === "cancelled_by_user") { if (typeof setBusy === "function") setBusy(false); return; }
    if (data.status === "otp_sent") setInfo("A new OTP was sent."); else if (data.status === "too_soon") setErr(`Please wait ${data.retry_after} seconds.`); else setErr("Could not resend the OTP.");
  }
  async function verify(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    const { data } = await api(`${base}/verify`, { method: "POST", body: { temp_id: sent.temp_id, otp } }); if (data?.status === "cancelled_by_user") { if (typeof setBusy === "function") setBusy(false); return; } setBusy(false);
    if (data.status === "registered") { setResult(data); setInfo(""); if (desk) { setStep(3); onDone?.(data); } else setStep(2); }
    else if (data.status === "otp_invalid") setErr(`Invalid OTP. ${data.attempts_left} attempt(s) left.`);
    else if (data.status === "otp_expired") setErr("OTP expired or too many attempts. Request a new OTP.");
    else setErr(data.message || data.errors?.mobno || "OTP verification failed.");
  }
  async function savePw(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    const { data } = await api("auth/set-password/complete", { method: "POST", body: { permanentid: result.permanentid, token: result.token, new_password: pw, confirm_password: cf } }); if (data?.status === "cancelled_by_user") { if (typeof setBusy === "function") setBusy(false); return; }
    setBusy(false);
    if (data.status === "password_set") setStep(3); else setErr(data.message || "Could not save the password.");
  }

  return (
    <div className="stack">
      <ol className="stepper">{["Details", "Verify OTP", ...(desk ? [] : ["Set password"]), "Done"].map((s, i) => { const idx = desk && i === 2 ? 3 : i; return <li key={s} className={step === idx ? "on" : step > idx ? "done" : ""}><span>{step > idx ? "✓" : i + 1}</span>{s}</li>; })}</ol>
      {err && <div className="alert error">{err}</div>}{info && <div className="alert info">{info}</div>}
      {step === 0 && <form className="card stack" onSubmit={start} noValidate>
        <p className="label tight">Personal details</p>
        <div className="filters">
          <Field label="First name *" error={errors.fname}><input maxLength={45} {...bind("fname", (v) => v.replace(/[^A-Za-z ]/g, ""))} /></Field>
          <Field label="Middle name" error={errors.mname}><input maxLength={45} {...bind("mname", nameOnly)} /></Field>
          <Field label="Last name *" error={errors.lname}><input maxLength={45} {...bind("lname", nameOnly)} /></Field>
          <Field label="Date of birth *" hint={age !== "" ? `Age ${age}` : ""} error={errors.dob}><input type="date" max={new Date().toISOString().slice(0, 10)} {...bind("dob")} /></Field>
          <Field label="Gender *" error={errors.gender}><select {...bind("gender")}><option value="">Select</option>{["Male", "Female", "Other"].map((g) => <option key={g}>{g}</option>)}</select></Field>
          <Field label={`Marital status${req}`} error={errors.marital}><select {...bind("marital")}><option value="">Select</option>{["Single", "Married", "Widowed", "Divorced"].map((g) => <option key={g}>{g}</option>)}</select></Field>
          <Field label="Blood group" error={errors.bloodgroup}><select {...bind("bloodgroup")}><option value="">Select</option>{BLOOD.map((g) => <option key={g}>{g}</option>)}</select></Field>
          <Field label="Medical insurance provider" error={errors.insurance_provider}><input maxLength={40} {...bind("insurance_provider")} /></Field>
        </div>
        <p className="label">Address &amp; contact</p>
        <div className="filters">
          <Field label={`Address${req}`} error={errors.address}><input maxLength={60} {...bind("address")} /></Field>
          <GeoFields form={form} optional={desk} />
          <Field label="Mobile no. * (OTP)" error={errors.mobno}><input inputMode="numeric" {...bind("mobno", digits(10))} /></Field>
          <Field label="Alternate mobile no." error={errors.hphone}><input inputMode="numeric" {...bind("hphone", digits(10))} /></Field>
          <Field label={`Emergency mobile no.${req}`} error={errors.emergencycontact}><input inputMode="numeric" {...bind("emergencycontact", digits(10))} /></Field>
          <Field label={`Email${req}`} error={errors.email}><input maxLength={40} {...bind("email")} /></Field>
        </div>
        <p className="label">Identity</p>
        <div className="filters">
          <Field label={`Govt ID type${req}`} error={errors.govtidtype}><select {...bind("govtidtype")}><option value="">Select</option><option>Aadhaar Card</option></select></Field>
          <Field label={`Govt ID number${req}`} error={errors.govtidno}><input inputMode="numeric" {...bind("govtidno", digits(12))} /></Field>
          <FileInput label="ID proof" required={!desk} error={errors.govtidfile} file={file} onFile={setFile} />
        </div>
        {desk && <p className="muted small">At the desk only name, date of birth, gender and mobile number are mandatory. The patient confirms the mobile number with the OTP.</p>}
        <div className="row"><button type="button" className="btn ghost" onClick={() => { form.reset(); setFile(null); }}>Reset</button>
          <button className="btn primary" disabled={busy}>{busy ? <span className="spinner" /> : "Send OTP"}</button></div>
      </form>}
      {step === 1 && <form className="card stack" onSubmit={verify} style={{ maxWidth: 480 }}>
        <Field label="OTP"><input inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} autoFocus /></Field>
        <div className="row"><button type="button" className="btn ghost" onClick={() => setStep(0)}>Edit details</button><button type="button" className="btn ghost" onClick={resend}>Resend OTP</button>
          <button className="btn primary" disabled={busy || otp.length !== 6}>{busy ? <span className="spinner" /> : "Verify"}</button></div>
      </form>}
      {step === 2 && <form className="card stack" onSubmit={savePw} style={{ maxWidth: 480 }}>
        <div className="alert info">Your Permanent ID is <b>{result.permanentid}</b>. Choose a password to finish.</div>
        <Field label="New password"><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
        <PasswordRules value={pw} />
        <Field label="Confirm password" error={cf && cf !== pw ? "Passwords do not match" : ""}><input type="password" value={cf} onChange={(e) => setCf(e.target.value)} autoComplete="new-password" /></Field>
        <div className="row"><button className="btn primary" disabled={busy || !passwordOk(pw) || pw !== cf}>Save password</button></div>
      </form>}
      {step === 3 && !desk && <div className="card stack"><h3>Registration complete</h3>
        <p>Your Permanent ID is <b>{result.permanentid}</b>. Sign in with it and your new password. Visit any Cobalt hospital with your Govt ID to get your ID validated — that unlocks case sheets and medical records.</p>
        <div className="row"><Link className="btn primary" to="/login">Go to sign in</Link></div></div>}
    </div>
  );
}

export default function PatientRegister() {
  return (
    <div className="content" style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="toolbar"><div className="brand"><span className="brand-mark"><Pulse /></span><div><b>Cobalt</b><small>Patient sign-up</small></div></div>
        <div className="row"><ThemeToggle /><Link className="btn ghost" to="/login">Sign in</Link></div></div>
      <h2>Create your patient account</h2>
      <PatientRegFlow />
    </div>
  );
}

// Reception / hospital "Register Patient"
export function DeskRegisterPatient() {
  const nav = useNavigate();
  const [done, setDone] = useState(null); const [msg, setMsg] = useState(null); const [k, setK] = useState(0);
  async function validate() {
    const { data } = await api(`desk/patients/${done.permanentid}/validate`, { method: "POST", body: {} }); if (data?.status === "cancelled_by_user") { if (typeof setBusy === "function") setBusy(false); return; }
    setMsg({ ok: data.status === "validated", text: data.message || "Could not validate." });
  }
  return (
    <div className="stack">
      <PageHead title="Register patient" subtitle="The patient confirms the mobile number with an OTP. A set-password link is e-mailed after registration." />
      {done && <div className="card stack"><div className="alert info">Registered — Permanent ID <b>{done.permanentid}</b>.</div>
        {msg && <div className={`alert ${msg.ok ? "info" : "error"}`}>{msg.text}</div>}
        <div className="row" style={{ justifyContent: "flex-start" }}><button className="btn primary sm" onClick={validate}>Validate ID now (Govt ID checked)</button>
          <button className="btn ghost sm" onClick={() => nav("/app/book")}>Book appointment</button>
          <button className="btn ghost sm" onClick={() => { setDone(null); setMsg(null); setK(k + 1); }}>Register another</button></div></div>}
      {!done && <PatientRegFlow key={k} desk onDone={setDone} />}
    </div>
  );
}
