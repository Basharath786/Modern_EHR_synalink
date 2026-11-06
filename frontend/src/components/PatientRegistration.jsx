import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Field, FileInput, GeoFields, digits, useForm } from "./FormKit";
import { Badge } from "./ui";

const DISEASES = ["Heart Attack", "Diabetes", "Dwarfism", "Cretinism", "Kidney Disease", "Blood Disorders", "Lung Disease", "High Blood Pressure", "Asthma", "High Cholestrol", "Cancer",
  "Stroke", "Genetic Birth Disorder", "Dementia", "Alzeihmers", "Anemia", "Heart Defect", "Spinal Defect"];
const HISTORY = [
  ["family_history", "Family history", DISEASES],
  ["past_history", "Past history", [...DISEASES, "Liver Disorders", "Surgeries"]],
  ["drug_history", "Drug history", ["Allergies", "Opiods", "Cocaine", "Heroin", "LSD", "PCP", "Marijuana"]],
  ["social_history", "Social history", ["Long Standing Medication", "Alcohol", "Smoking"]],
];
const BLOOD = ["A +ve", "A -ve", "B +ve", "B -ve", "O +ve", "O -ve", "AB +ve", "AB -ve"];
const blank = { fname: "", mname: "", lname: "", dob: "", gender: "", marital: "", bloodgroup: "", insurance: "", address: "", country: "India", state: "", city: "", zipcode: "",
  mobno: "", hphone: "", emergencycontact: "", email: "", govtidtype: "", govtidno: "" };
const OTP_MSG = { otp_invalid: "Invalid or expired OTP.", max_attempts: "Maximum attempts exceeded. Please request a new OTP.", too_soon: "Please wait before requesting another OTP.",
  not_found: "No pending registration was found for this mobile number.", send_failed: "Failed to send OTP. Please check the mobile number and email." };

// Legacy register/patient-registration.html (SELF) and reception/patient-register.html (desk) + patient-otp-verification.html
// desk = receptionist / hospital registers a walk-in patient: only name, date of birth, gender and mobile are required.
export default function PatientRegistration({ desk = false, onAnother }) {
  const form = useForm(blank); const { f, errors, setErrors, bind } = form;
  const [hist, setHist] = useState({ family_history: [], past_history: [], drug_history: [], social_history: [] });
  const [file, setFile] = useState(null); const [step, setStep] = useState("form"); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [info, setInfo] = useState(null); const [otp, setOtp] = useState(""); const [wait, setWait] = useState(0); const [done, setDone] = useState(null); const [left, setLeft] = useState(null);
  const star = desk ? "" : " *";
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);

  const toggle = (key, v) => setHist((h) => {
    const cur = h[key]; if (v === "None") return { ...h, [key]: cur.includes("None") ? [] : ["None"] };
    const next = cur.filter((x) => x !== "None"); return { ...h, [key]: next.includes(v) ? next.filter((x) => x !== v) : [...next, v] };
  });
  async function submit(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    const fd = new FormData(); Object.entries(f).forEach(([k, v]) => fd.append(k, v)); Object.entries(hist).forEach(([k, v]) => fd.append(k, v.join(","))); if (file) fd.append("govtidfile", file);
    const { data } = await api(desk ? "desk/register-patient" : "public/register/patient", { method: "POST", body: fd }); setBusy(false);
    if (data.status === "otp_sent") { setInfo(data); setWait(data.resend_after || 30); setStep("otp"); setOtp(""); setLeft(null); }
    else if (data.status === "too_soon") { setWait(data.retry_after); setErr(OTP_MSG.too_soon); }
    else if (data.errors) { setErrors(data.errors); setErr("Please correct the highlighted fields."); }
    else setErr(OTP_MSG[data.status] || data.message || "Registration failed. Please try again.");
  }
  async function verify(e) {
    e.preventDefault(); setBusy(true); setErr("");
    const { data } = await api("public/register/patient/verify", { method: "POST", body: { mobno: f.mobno, otp } }); setBusy(false);
    if (data.status === "registered") setDone(data);
    else { setOtp(""); setLeft(data.attempts_left ?? null); setErr(data.status === "otp_invalid" ? `Invalid or expired OTP.${data.attempts_left !== undefined ? ` Attempts remaining: ${data.attempts_left}` : ""}` : OTP_MSG[data.status] || data.message || "Verification failed."); }
  }
  async function resend() {
    setErr(""); const { data } = await api("public/register/patient/resend", { method: "POST", body: { mobno: f.mobno } });
    if (data.status === "otp_sent") { setWait(data.resend_after || 30); setInfo(data); setLeft(null); setOtp(""); } else if (data.status === "too_soon") setWait(data.retry_after); else setErr(OTP_MSG[data.status] || "Could not resend the OTP.");
  }

  if (done) return (
    <div className="auth-card wide" style={{ margin: "0 auto", textAlign: "center" }}>
      <span className="empty-icon ok">✓</span><h2>{desk ? "Patient registered" : "Registration successful"}</h2>
      <p className="muted">{f.fname} {f.lname}'s Permanent ID is <b style={{ fontSize: "1.3rem" }}>{done.permanentid}</b></p>
      {desk ? <p className="muted small">The patient must set a password with the code sent to their mobile / e-mail (Login → Set my password). Validate the patient's ID proof in Patient Validation.</p>
        : <p className="muted small">A confirmation was sent to {f.email}. Your hospital will validate your ID proof. Choose your password to sign in.</p>}
      <div className="row" style={{ justifyContent: "center" }}>
        {desk ? <><button className="btn ghost" onClick={onAnother}>Register another patient</button><Link className="btn primary" to="/app/patient-validation">Patient validation</Link></>
          : <><Link className="btn ghost" to="/login">Sign in</Link><Link className="btn primary" to={`/set-password?id=${done.permanentid}`}>Set my password</Link></>}</div>
    </div>);

  if (step === "otp") return (
    <form className="auth-card" style={{ margin: "0 auto" }} onSubmit={verify}>
      <h2>Verify mobile number</h2>
      <p className="muted">{desk ? "Ask the patient for" : "Enter"} the 6-digit OTP sent to <b>{info?.mobile}</b> (and e-mail). It is valid for 10 minutes.</p>
      {err && <div className="alert error" role="alert">{err}</div>}
      <label className="field"><span>OTP{left !== null && <small className="muted"> · {left} attempt(s) left</small>}</span>
        <input inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="6-digit OTP" /></label>
      <button className="btn primary block" disabled={otp.length !== 6 || busy}>{busy ? <span className="spinner" /> : "Verify & register"}</button>
      <div className="row spread"><button type="button" className="link" disabled={wait > 0} onClick={resend}>{wait > 0 ? `Resend in ${wait}s` : "Resend OTP"}</button>
        <button type="button" className="link" onClick={() => { setStep("form"); setErr(""); }}>Edit details</button></div>
    </form>);

  return (
    <form className="card stack" onSubmit={submit} noValidate>
      <h2>{desk ? "Register a patient" : "Patient registration"}</h2>
      {desk && <p className="muted small">Only name, date of birth, gender and mobile number are mandatory. The patient receives an OTP on that mobile number.</p>}
      {err && <div className="alert error">{err}</div>}
      <p className="label tight">Personal details</p>
      <div className="filters">
        <Field label="First name *" error={errors.fname}><input maxLength={45} {...bind("fname", (v) => v.replace(/[^A-Za-z ]/g, ""))} /></Field>
        <Field label="Middle name" error={errors.mname}><input maxLength={45} {...bind("mname", (v) => v.replace(/[^A-Za-z]/g, ""))} /></Field>
        <Field label="Last name *" error={errors.lname}><input maxLength={45} {...bind("lname", (v) => v.replace(/[^A-Za-z]/g, ""))} /></Field>
        <Field label="Date of birth *" error={errors.dob}><input type="date" max={new Date().toISOString().slice(0, 10)} {...bind("dob")} /></Field>
        <Field label="Gender *" error={errors.gender}><select {...bind("gender")}><option value="">Select</option>{["Male", "Female", "Other"].map((g) => <option key={g}>{g}</option>)}</select></Field>
        <Field label={`Marital status${star}`} error={errors.marital}><select {...bind("marital")}><option value="">Select</option>{["Single", "Married", "Widowed", "Divorced"].map((g) => <option key={g}>{g}</option>)}</select></Field>
        <Field label="Blood group" error={errors.bloodgroup}><select {...bind("bloodgroup")}><option value="">Select</option>{BLOOD.map((g) => <option key={g}>{g}</option>)}</select></Field>
        <Field label="Insurance provider" error={errors.insurance}><input maxLength={40} {...bind("insurance")} /></Field>
      </div>
      <p className="label">Address &amp; contact</p>
      <div className="filters">
        <Field label={`Address${star}`} error={errors.address}><input maxLength={60} {...bind("address")} /></Field>
        <GeoFields form={form} />
        <Field label="Mobile number *" hint="OTP goes here" error={errors.mobno}><input inputMode="numeric" {...bind("mobno", digits(10))} /></Field>
        <Field label="Alternate mobile number" error={errors.hphone}><input inputMode="numeric" {...bind("hphone", digits(10))} /></Field>
        <Field label={`Emergency mobile number${star}`} error={errors.emergencycontact}><input inputMode="numeric" {...bind("emergencycontact", digits(10))} /></Field>
        <Field label={`Email ID${star}`} error={errors.email}><input maxLength={40} {...bind("email")} /></Field>
      </div>
      <p className="label">Government ID {desk && <small className="muted">(optional — can be added later)</small>}</p>
      <div className="filters">
        <Field label={`Govt ID type${star}`} error={errors.govtidtype}><select {...bind("govtidtype")}><option value="">Select</option><option>Aadhaar Card</option></select></Field>
        <Field label={`Govt ID number${star}`} error={errors.govtidno}><input inputMode="numeric" {...bind("govtidno", digits(12))} /></Field>
        <FileInput label="ID proof" required={!desk} error={errors.govtidfile} file={file} onFile={setFile} />
      </div>
      <p className="label">Medical history <small className="muted">(optional)</small></p>
      {HISTORY.map(([key, title, options]) => (
        <div key={key}><p className="small" style={{ fontWeight: 600, margin: "10px 0 6px" }}>{title} {errors[key] && <small className="err-text">{errors[key]}</small>}</p>
          <div className="chips">{["None", ...options].map((o) => <button type="button" key={o} className={`chip-btn ${hist[key].includes(o) ? "on" : ""}`} onClick={() => toggle(key, o)}>{o}</button>)}</div></div>))}
      <div className="row"><button type="button" className="btn ghost" onClick={() => { form.reset(); setHist({ family_history: [], past_history: [], drug_history: [], social_history: [] }); setFile(null); setErr(""); }}>Reset</button>
        <button className="btn primary" disabled={busy}>{busy ? <span className="spinner" /> : "Register & send OTP"}</button></div>
    </form>
  );
}
