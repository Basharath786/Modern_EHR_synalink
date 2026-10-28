import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Field, FileInput, digits, letters, useForm } from "../../components/FormKit";
import { Pulse } from "../../components/Icons";
import ThemeToggle from "../../components/ThemeToggle";

const blank = { fullname: "", empid: "", organizationname: "", workphone: "", mobno: "", workemail: "", address: "", govtidtype: "", govtidno: "" };

// Legacy internal-admin-register.html (v1/register ADMIN -> internal_admin_temp, approved by the super admin)
export default function AdminRegister() {
  const form = useForm(blank); const { f, errors, setErrors, bind } = form;
  const [file, setFile] = useState(null); const [busy, setBusy] = useState(false); const [done, setDone] = useState(""); const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    const fd = new FormData(); Object.entries(f).forEach(([k, v]) => fd.append(k, v)); if (file) fd.append("govtidfile", file);
    const { data } = await api("public/register/internal-admin", { method: "POST", body: fd });
    setBusy(false);
    if (data.status === "registered") setDone(data.message);
    else if (data.errors) { setErrors(data.errors); setErr("Please correct the highlighted fields."); }
    else setErr("Registration failed. Please try again.");
  }
  if (done) return (<div className="center-page"><div className="auth-card wide"><h2>Thank you</h2><div className="alert info">{done}</div>
    <p className="muted">After approval you receive your Permanent ID (ADMIN…) and a link to set your password.</p>
    <div className="row"><Link className="btn primary" to="/login">Go to sign in</Link></div></div></div>);
  return (
    <div className="content" style={{ maxWidth: 900, margin: "0 auto" }}>
      <div className="toolbar"><div className="brand"><span className="brand-mark"><Pulse /></span><div><b>Cobalt</b><small>Internal admin sign-up</small></div></div>
        <div className="row"><ThemeToggle /><Link className="btn ghost" to="/login">Sign in</Link></div></div>
      <form className="card stack" onSubmit={submit} noValidate>
        <h2>Internal admin registration</h2>
        {err && <div className="alert error">{err}</div>}
        <div className="filters">
          <Field label="Full name *" error={errors.fullname}><input maxLength={50} {...bind("fullname", letters)} /></Field>
          <Field label="Employee ID *" hint="6 digits" error={errors.empid}><input inputMode="numeric" {...bind("empid", digits(6))} /></Field>
          <Field label="Organization name *" error={errors.organizationname}><input maxLength={40} {...bind("organizationname")} /></Field>
          <Field label="Work phone (landline) *" hint="11 digits" error={errors.workphone}><input inputMode="numeric" {...bind("workphone", digits(11))} /></Field>
          <Field label="Alternate number (mobile) *" error={errors.mobno}><input inputMode="numeric" {...bind("mobno", digits(10))} /></Field>
          <Field label="Work email *" error={errors.workemail}><input maxLength={40} {...bind("workemail")} /></Field>
          <Field label="Address *" error={errors.address}><input maxLength={60} {...bind("address")} /></Field>
          <Field label="Govt ID proof *" error={errors.govtidtype}><select {...bind("govtidtype")}><option value="">Select</option><option>Aadhaar Card</option></select></Field>
          <Field label="Govt ID number *" error={errors.govtidno}><input inputMode="numeric" {...bind("govtidno", digits(12))} /></Field>
          <FileInput label="ID proof" error={errors.govtidfile} file={file} onFile={setFile} />
        </div>
        <div className="row"><button type="button" className="btn ghost" onClick={() => { form.reset(); setFile(null); }}>Reset</button>
          <button className="btn primary" disabled={busy}>{busy ? <span className="spinner" /> : "Register"}</button></div>
      </form>
    </div>
  );
}
