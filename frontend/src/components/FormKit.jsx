import { useEffect, useState } from "react";
import { api, openFile } from "../api";
import { Check, Dot } from "./Icons";
import { fmtDate, fmtDateTime } from "./ui";

// ---------- reference data (India states / cities + specialities, legacy countries.js / hosp-reg.js)
let refCache = null;
export function useReference() {
  const [ref, setRef] = useState(refCache);
  useEffect(() => {
    if (refCache) return;
    api("public/reference").then(({ ok, data }) => { if (ok) { refCache = data; setRef(data); } });
  }, []);
  return ref;
}

// ---------- tiny form state helper
export function useForm(initial) {
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState({});
  const bind = (name, filter) => ({
    name, value: f[name] ?? "",
    onChange: (e) => { const v = filter ? filter(e.target.value) : e.target.value; setF((cur) => ({ ...cur, [name]: v })); setErrors((er) => ({ ...er, [name]: undefined })); },
  });
  return { f, setF, errors, setErrors, bind, reset: () => { setF(initial); setErrors({}); } };
}

export const digits = (n) => (v) => v.replace(/\D/g, "").slice(0, n);
export const letters = (v) => v.replace(/[^A-Za-z ]/g, "");
export const upper = (n) => (v) => v.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, n);

export function Field({ label, error, children, hint, wide }) {
  return (
    <label className="field" style={wide ? { gridColumn: "1 / -1" } : undefined}>
      <span>{label}{hint && <small className="muted"> {hint}</small>}</span>
      {children}
      {error && <small className="err-text">{error}</small>}
    </label>
  );
}

export function GeoFields({ form, labels = {} }) {
  const ref = useReference();
  const { f, setF, errors, bind } = form;
  const states = ref ? Object.keys(ref.states) : [];
  const cities = ref && f.state ? ref.states[f.state] || [] : [];
  return (<>
    <Field label="Country *" error={errors.country}><select {...bind("country")}><option value="">Select</option><option>India</option></select></Field>
    <Field label="State *" error={errors.state}>
      <select name="state" value={f.state || ""} onChange={(e) => setF((c) => ({ ...c, state: e.target.value, city: "" }))}><option value="">Select</option>{states.map((s) => <option key={s}>{s}</option>)}</select></Field>
    <Field label={labels.city || "City / District *"} error={errors.city}><select {...bind("city")}><option value="">Select</option>{cities.map((s) => <option key={s}>{s}</option>)}</select></Field>
    <Field label="Zip code *" error={errors.zipcode}><input inputMode="numeric" {...bind("zipcode", digits(6))} /></Field>
  </>);
}

export function FileInput({ label, error, onFile, file, required = true }) {
  return (
    <Field label={`${label}${required ? " *" : ""}`} error={error} hint="PDF/JPG/PNG ≤ 5 MB">
      <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => onFile(e.target.files[0] || null)} />
      {file && <small className="muted">{file.name}</small>}
    </Field>
  );
}

// ---------- password rules (same policy as the legacy portals)
export const RULES = (max = 32) => [
  [`8–${max} characters`, (p) => p.length >= 8 && p.length <= max],
  ["One uppercase letter", (p) => /[A-Z]/.test(p)],
  ["One lowercase letter", (p) => /[a-z]/.test(p)],
  ["One number", (p) => /[0-9]/.test(p)],
  ["One special character", (p) => /[^A-Za-z0-9]/.test(p)],
];
export function PasswordRules({ value, max = 32 }) {
  const rules = RULES(max);
  const passed = rules.filter(([, t]) => t(value)).length;
  return (<>
    <div className="meter"><i style={{ width: `${(passed / rules.length) * 100}%` }} data-level={passed} /></div>
    <p className="meter-label">{["", "Weak", "Weak", "Fair", "Good", "Strong"][passed]}</p>
    <ul className="rules">{rules.map(([t, fn]) => <li key={t} className={fn(value) ? "ok" : ""}>{fn(value) ? <Check /> : <Dot />} {t}</li>)}</ul>
  </>);
}
export const passwordOk = (p, max = 32) => RULES(max).every(([, t]) => t(p));

// ---------- read-only record view (legacy *-details.html tables)
const LABELS = {
  permanentid: "Permanent ID", temp_id: "Temporary ID", fname: "First name", mname: "Middle name", lname: "Last name", fullname: "Full name", dob: "Date of birth",
  mobno: "Mobile", workphone: "Work phone", workemail: "Work email", altemail: "Alternative email", emergencycontact: "Emergency contact", bloodgroup: "Blood group",
  jobtype: "Job type", hospital_name: "Hospital", hospital_id: "Hospital ID", deptname: "Department", mciregno: "MCI reg. no.", govtidtype: "Govt ID type",
  govtidno: "Govt ID no.", date_time: "Registered / updated", administration_no: "Administration mobile", hospital_email: "Email", land_phone: "Land phone",
  contact_person_name: "Administration name", reg_no: "Civil reg. no.", pan_no: "PAN", gst_no: "GST", no_wards: "Wards", size: "Beds", providers: "Doctors",
  specialities_list: "Specialities", affiliated_labs_list: "Affiliated labs", affiliated_pharmacy_list: "Affiliated pharmacies", affiliated_hospital_list: "Affiliated hospitals",
  approved_by: "Approved by", approved_by_name: "Approved by", labname: "Laboratory", labemail: "Email", pharmacy_name: "Pharmacy", pharmacy_email: "Email", civilno: "Civil no.",
  organizationname: "Organization", empid: "Employee ID", deptheadname: "Head of department", dept_head_mobile_number: "Head mobile", floor_wing: "Floor / wing",
  assigneddoctors: "Assigned doctors", assignednurses: "Assigned nurses", noofrooms: "Rooms", noofbeds: "Beds", hphone: "Home phone", insurance_provider: "Insurance",
  childfname: "First name", parent_id: "Parent ID", child_id: "Child ID", labid: "Lab ID", pharmacy_id: "Pharmacy ID",
};
const label = (k) => LABELS[k] || k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const SKIP = new Set(["display_name", "password_set", "approved", "pending", "staff", "approved_counts", "last_login", "validated", "approved_by_name"]);

export function RecordView({ item, fileBase, files = {} }) {
  if (!item) return null;
  const entries = Object.entries(item).filter(([k, v]) => !SKIP.has(k) && !k.startsWith("has_") && v !== null && v !== "" && typeof v !== "object");
  const fileKeys = Object.keys(item).filter((k) => k.startsWith("has_"));
  return (<>
    <dl className="kv">{entries.map(([k, v]) => <div key={k}><dt>{label(k)}</dt><dd>{k === "date_time" ? fmtDateTime(v) : k === "dob" ? fmtDate(v) : String(v)}</dd></div>)}
      {item.approved_by_name && <div><dt>Approved by</dt><dd>{item.approved_by_name}</dd></div>}</dl>
    {fileBase && fileKeys.length > 0 && <div className="row" style={{ justifyContent: "flex-start" }}>
      {fileKeys.map((k) => { const col = k.slice(4); return item[k]
        ? <button key={k} type="button" className="btn ghost sm" onClick={() => openFile(`${fileBase}/${col}`)}>View {files[col] || label(col)}</button>
        : <span key={k} className="muted small">No {files[col] || label(col)}</span>; })}
    </div>}
  </>);
}

export const FILE_LABELS = { pan_card: "PAN card", gst_proof: "GST proof", registration_proof: "Registration proof", panimage: "PAN card", civilimage: "Civil reg. proof",
  mcifile: "MCI proof", govtidfile: "Govt ID proof" };
