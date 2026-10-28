import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Field, FileInput, GeoFields, digits, letters, upper, useForm, useReference } from "../../components/FormKit";
import { Pulse } from "../../components/Icons";
import ThemeToggle from "../../components/ThemeToggle";

const TYPES = [["Multi Speciality", "Multi Speciality"], ["General Hospital", "General Hospital"], ["Womens hospitals", "Women’s Hospital"], ["Childrens hospitals", "Children’s Hospital"],
  ["Cardiac hospitals", "Cardiac Hospital"], [" Oncology hospitals", "Oncology Hospital"], ["Psychiatric hospitals", "Psychiatric Hospital"], ["Trauma centers", "Trauma Centers"],
  [" Cancer treatment centers", "Cancer Treatment Centers"]];
const blank = { hospital_name: "", accreditation: "", category: "", type: "", providers: "", no_wards: "", size: "", blood_bank: "", insurance_provider: "", address: "",
  country: "India", state: "", city: "", zipcode: "", administration_no: "", hospital_email: "", land_phone: "", contact_person: "", pan_no: "", gst_no: "", reg_no: "" };

// Legacy register/hospital-registration.html + hosp-reg.js (v1/register HOSPITAL + v1/upload)
export default function HospitalRegister() {
  const form = useForm(blank); const { f, errors, setErrors, bind } = form;
  const ref = useReference();
  const [spec, setSpec] = useState([]); const [files, setFiles] = useState({});
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(null); const [err, setErr] = useState("");
  const all = ref?.specialities || [];

  async function submit(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    const fd = new FormData(); Object.entries(f).forEach(([k, v]) => fd.append(k, v)); spec.forEach((s) => fd.append("specialities", s));
    Object.entries(files).forEach(([k, v]) => v && fd.append(k, v));
    const { data } = await api("public/register/hospital", { method: "POST", body: fd });
    setBusy(false);
    if (data.status === "registered") setDone(data);
    else if (data.errors) { setErrors(data.errors); setErr("Please correct the highlighted fields."); }
    else setErr("Registration failed. Please try again.");
  }

  if (done) return (
    <div className="center-page"><div className="auth-card wide"><h2>Registration successful</h2>
      <div className="alert info">{done.message}</div>
      <p className="muted">Keep your Permanent ID <b>{done.permanentid}</b>. After the Cobalt internal admin approves the hospital you will get an e-mail to set your password.</p>
      <div className="row"><Link className="btn primary" to="/login">Go to sign in</Link></div></div></div>);

  return (
    <div className="content" style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="toolbar"><div className="brand"><span className="brand-mark"><Pulse /></span><div><b>Cobalt</b><small>Hospital registration</small></div></div>
        <div className="row"><ThemeToggle /><Link className="btn ghost" to="/login">Sign in</Link></div></div>
      <form className="card stack" onSubmit={submit} noValidate>
        <h2>Register your hospital</h2>
        {err && <div className="alert error">{err}</div>}
        <p className="label tight">Hospital details</p>
        <div className="filters">
          <Field label="Hospital name *" error={errors.hospital_name}><input maxLength={50} {...bind("hospital_name")} /></Field>
          <Field label="Accreditation no. *" hint="Ex: H-1234-1234" error={errors.accreditation}><input maxLength={11} {...bind("accreditation", upper(11))} /></Field>
          <Field label="Private / Govt *" error={errors.category}><select {...bind("category")}><option value="">Select</option><option>Private</option><option>Government</option></select></Field>
          <Field label="Type of hospital *" error={errors.type}><select {...bind("type")}><option value="">Select</option>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="No. of doctors *" error={errors.providers}><input inputMode="numeric" {...bind("providers", digits(6))} /></Field>
          <Field label="No. of wards *" error={errors.no_wards}><input inputMode="numeric" {...bind("no_wards", digits(4))} /></Field>
          <Field label="No. of beds *" error={errors.size}><input inputMode="numeric" {...bind("size", digits(4))} /></Field>
          <Field label="Blood bank number" error={errors.blood_bank}><input maxLength={11} {...bind("blood_bank", (v) => v.replace(/[^A-Za-z0-9]/g, ""))} /></Field>
          <Field label="Medical insurance provider" error={errors.insurance_provider}><input maxLength={45} {...bind("insurance_provider")} /></Field>
        </div>
        <p className="label">Address &amp; contact</p>
        <div className="filters">
          <Field label="Address *" error={errors.address}><input maxLength={60} {...bind("address")} /></Field>
          <GeoFields form={form} />
          <Field label="Administration mobile no. *" hint="+91" error={errors.administration_no}><input inputMode="numeric" {...bind("administration_no", digits(10))} /></Field>
          <Field label="Email ID *" error={errors.hospital_email}><input maxLength={40} {...bind("hospital_email")} /></Field>
          <Field label="Land phone no." error={errors.land_phone}><input inputMode="numeric" {...bind("land_phone", digits(11))} /></Field>
          <Field label="Administration name" error={errors.contact_person}><input maxLength={40} {...bind("contact_person", letters)} /></Field>
        </div>
        <p className="label">Registration documents</p>
        <div className="filters">
          <Field label="PAN card no. *" hint="Ex: ABCDE1234F" error={errors.pan_no}><input {...bind("pan_no", upper(10))} /></Field>
          <Field label="GST no. *" hint="Ex: 12ABCDE1234F5G6" error={errors.gst_no}><input {...bind("gst_no", upper(15))} /></Field>
          <Field label="Civil regn. no. *" hint="21 characters" error={errors.reg_no}><input {...bind("reg_no", upper(21))} /></Field>
          <FileInput label="PAN card proof" error={errors.pan_card} file={files.pan_card} onFile={(x) => setFiles({ ...files, pan_card: x })} />
          <FileInput label="GST no. proof" error={errors.gst_proof} file={files.gst_proof} onFile={(x) => setFiles({ ...files, gst_proof: x })} />
          <FileInput label="Civil regn. no. proof" error={errors.registration_proof} file={files.registration_proof} onFile={(x) => setFiles({ ...files, registration_proof: x })} />
        </div>
        <div className="toolbar"><p className="label">List of specialities * {errors.specialities && <small className="err-text">{errors.specialities}</small>}</p>
          <label className="small"><input type="checkbox" checked={all.length > 0 && spec.length === all.length} onChange={(e) => setSpec(e.target.checked ? all : [])} /> Select all</label></div>
        <div className="chips">{all.map((s) => <button type="button" key={s} className={`chip-btn ${spec.includes(s) ? "on" : ""}`} onClick={() => setSpec(spec.includes(s) ? spec.filter((x) => x !== s) : [...spec, s])}>{s}</button>)}</div>
        <div className="row"><button type="button" className="btn ghost" onClick={() => { form.reset(); setSpec([]); setFiles({}); }}>Reset</button>
          <button className="btn primary" disabled={busy}>{busy ? <span className="spinner" /> : "Register"}</button></div>
      </form>
    </div>
  );
}
