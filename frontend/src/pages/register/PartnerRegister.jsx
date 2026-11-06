import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Field, FileInput, GeoFields, digits, letters, upper, useForm } from "../../components/FormKit";
import { Pulse } from "../../components/Icons";
import ThemeToggle from "../../components/ThemeToggle";

const BASE = { accreditation: "", category: "", land_phone: "", civilno: "", insurance_provider: "", address: "", country: "India", state: "", city: "", zipcode: "", administration_no: "",
  contact_person_name: "", contact_person_phone: "", contact_person_email: "", pan_no: "" };
const BLANK = { lab: { ...BASE, labname: "", technicians: "", assigneddoctors: "", labemail: "" }, pharmacy: { ...BASE, pharmacy_name: "", no_of_pharmacist: "", pharmacy_email: "" } };

// Legacy register/lab-registration.html + lab-reg.js and register/pharmacy-registration.html + pharma-reg.js
export default function PartnerRegister({ kind }) {
  const lab = kind === "lab"; const form = useForm(BLANK[kind]); const { f, errors, setErrors, bind } = form;
  const [specs, setSpecs] = useState([]); const [all, setAll] = useState([]); const [files, setFiles] = useState({});
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(null); const [err, setErr] = useState("");
  useEffect(() => { if (lab) api("public/lab-specialities").then(({ data }) => setAll(data.specialities || [])); }, [lab]);

  async function submit(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    const fd = new FormData(); Object.entries(f).forEach(([k, v]) => fd.append(k, v)); specs.forEach((s) => fd.append("specialities", s)); Object.entries(files).forEach(([k, v]) => v && fd.append(k, v));
    const { data } = await api(`public/register/${kind}`, { method: "POST", body: fd }); setBusy(false);
    if (data.status === "registered") setDone(data); else if (data.errors) { setErrors(data.errors); setErr("Please correct the highlighted fields."); } else setErr("Registration failed. Please try again.");
  }
  if (done) return (
    <div className="center-page"><div className="auth-card wide"><h2>Registration successful</h2><div className="alert info">{done.message}</div>
      <p className="muted">Keep your Permanent ID <b>{done.permanentid}</b>. After the Cobalt internal admin approves the {lab ? "laboratory" : "pharmacy"} you will get an e-mail to set your password.</p>
      <div className="row"><Link className="btn primary" to="/login">Go to sign in</Link></div></div></div>);
  const name = lab ? "labname" : "pharmacy_name"; const email = lab ? "labemail" : "pharmacy_email";
  return (
    <div className="content" style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="toolbar"><div className="brand"><span className="brand-mark"><Pulse /></span><div><b>Cobalt</b><small>{lab ? "Laboratory" : "Pharmacy"} registration</small></div></div>
        <div className="row"><ThemeToggle /><Link className="btn ghost" to="/login">Sign in</Link></div></div>
      <form className="card stack" onSubmit={submit} noValidate>
        <h2>Register your {lab ? "laboratory" : "pharmacy"}</h2>
        {err && <div className="alert error">{err}</div>}
        <p className="label tight">{lab ? "Laboratory" : "Pharmacy"} details</p>
        <div className="filters">
          <Field label={`${lab ? "Lab" : "Pharmacy"} name *`} error={errors[name]}><input maxLength={45} {...bind(name)} /></Field>
          <Field label="Accreditation no. *" hint="letters, numbers, -" error={errors.accreditation}><input maxLength={11} {...bind("accreditation", upper(11))} /></Field>
          {lab ? <>
            <Field label="No. of technicians *" error={errors.technicians}><input inputMode="numeric" {...bind("technicians", digits(2))} /></Field>
            <Field label="No. of doctors *" error={errors.assigneddoctors}><input inputMode="numeric" {...bind("assigneddoctors", digits(2))} /></Field></>
            : <Field label="No. of pharmacists *" error={errors.no_of_pharmacist}><input inputMode="numeric" {...bind("no_of_pharmacist", digits(3))} /></Field>}
          <Field label="Private / Govt *" error={errors.category}><select {...bind("category")}><option value="">Select</option><option>Private</option><option>Government</option></select></Field>
          <Field label={lab ? "Civil regn. / CIN no. *" : "D.L. no. *"} error={errors.civilno}><input maxLength={lab ? 21 : 25} {...bind("civilno", (v) => v.toUpperCase().replace(/[^A-Z0-9/ .-]/g, ""))} /></Field>
          <Field label="Medical insurance provider" error={errors.insurance_provider}><input maxLength={45} {...bind("insurance_provider")} /></Field>
        </div>
        <p className="label">Address &amp; contact</p>
        <div className="filters">
          <Field label="Address *" error={errors.address}><input maxLength={60} {...bind("address")} /></Field>
          <GeoFields form={form} />
          <Field label="Administration mobile no. *" hint="+91" error={errors.administration_no}><input inputMode="numeric" {...bind("administration_no", digits(10))} /></Field>
          <Field label={`${lab ? "Lab" : "Pharmacy"} email ID *`} error={errors[email]}><input maxLength={40} {...bind(email)} /></Field>
          <Field label={`Land phone no. *`} hint={lab ? "6–11 digits" : "11 digits"} error={errors.land_phone}><input inputMode="numeric" {...bind("land_phone", digits(11))} /></Field>
          <Field label="Contact person name *" error={errors.contact_person_name}><input maxLength={20} {...bind("contact_person_name", letters)} /></Field>
          <Field label="Contact person mobile no. *" error={errors.contact_person_phone}><input inputMode="numeric" {...bind("contact_person_phone", digits(10))} /></Field>
          <Field label="Contact person email *" error={errors.contact_person_email}><input maxLength={40} {...bind("contact_person_email")} /></Field>
        </div>
        <p className="label">Registration documents</p>
        <div className="filters">
          <Field label="PAN card no. *" hint="Ex: ABCDE1234F" error={errors.pan_no}><input {...bind("pan_no", upper(10))} /></Field>
          <FileInput label="PAN card proof" error={errors.panimage} file={files.panimage} onFile={(x) => setFiles({ ...files, panimage: x })} />
          <FileInput label={lab ? "Civil regn. proof" : "D.L. proof"} error={errors.civilimage} file={files.civilimage} onFile={(x) => setFiles({ ...files, civilimage: x })} />
        </div>
        {lab && <><div className="toolbar"><p className="label">Lab specialities * {errors.specialities && <small className="err-text">{errors.specialities}</small>}</p>
          <label className="small"><input type="checkbox" checked={all.length > 0 && specs.length === all.length} onChange={(e) => setSpecs(e.target.checked ? all : [])} /> Select all</label></div>
          <div className="chips">{all.map((s) => <button type="button" key={s} className={`chip-btn ${specs.includes(s) ? "on" : ""}`} onClick={() => setSpecs(specs.includes(s) ? specs.filter((x) => x !== s) : [...specs, s])}>{s}</button>)}</div></>}
        <div className="row"><button type="button" className="btn ghost" onClick={() => { form.reset(); setSpecs([]); setFiles({}); }}>Reset</button><button className="btn primary" disabled={busy}>{busy ? <span className="spinner" /> : "Register"}</button></div>
      </form>
    </div>
  );
}
