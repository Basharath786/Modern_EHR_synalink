import { PH_FIELDS, historySummary, historyState } from "../pages/doctor/visit/pastHistory";
import { fmtDate, fmtDateTime } from "./ui";

// Parsers for the strings stored in patient_reportfile_data (same layout the Java UI wrote)
export function parseMeds(s) {
  const out = []; const re = /name-(.*?),quantity-(.*?),duration-(.*?),usage-(.*?),instruction-(.*?),repeat_medicine-(YES|NO|yes|no),/g; let m;
  while ((m = re.exec(s || ""))) out.push({ name: m[1].trim(), qty: m[2].trim(), duration: m[3].trim(), usage: m[4].trim(), instruction: m[5].trim(), repeat: m[6].toUpperCase() });
  return out;
}
export function parseLabs(s) {
  const out = []; const re = /name-(.*?),repeat_test-(YES|NO|yes|no),emergency_test-(YES|NO|yes|no),/g; let m;
  while ((m = re.exec(s || ""))) out.push({ name: m[1].trim(), repeat: m[2].toUpperCase(), emergency: m[3].toUpperCase() });
  return out;
}
export function parseAllergies(s) {
  const out = []; const re = /name-\s*(.*?),severity-\s*(.*?),description-(.*?),(?=name-|\s*$)/g; let m;
  while ((m = re.exec(s || ""))) out.push({ name: m[1].trim(), severity: m[2].trim(), description: m[3].trim() });
  return out;
}
export const parseNames = (s) => String(s || "").trim().replace(/^name-/, "").replace(/,\s*$/, "").split(/,\s*name-/).map((x) => x.trim()).filter(Boolean);
export function parseBlocks(s) {
  const blocks = []; let cur = null; let custom = false;
  for (const raw of String(s || "").split(",")) {
    const t = raw.trim(); if (!t) continue;
    if (/^Symptom-/i.test(t)) { cur = { title: t.replace(/^Symptom-/i, ""), items: [], custom: [] }; blocks.push(cur); custom = false; continue; }
    if (/^Add Custom Descriptions List:?$/i.test(t)) { custom = true; continue; }
    if (!cur) { cur = { title: "", items: [], custom: [] }; blocks.push(cur); }
    (custom ? cur.custom : cur.items).push(t);
  }
  return blocks;
}

const Sec = ({ title, children, show = true }) => show ? <section className="cf-sec"><h4>{title}</h4>{children}</section> : null;
const Blocks = ({ text }) => {
  const b = parseBlocks(text);
  if (!b.length) return <p className="muted">—</p>;
  return b.map((x, i) => <div key={i} className="cf-block">{x.title && <b>{x.title}</b>}<ul>{x.items.map((y, j) => <li key={j}>{y}</li>)}</ul>
    {x.custom.length > 0 && <><i className="muted small">Custom descriptions</i><ul>{x.custom.map((y, j) => <li key={j}>{y}</li>)}</ul></>}</div>);
};

// Printable case file (Java report-file.html / casefiles.js "Case File Preview" + download)
export default function CaseFile({ r, onClose }) {
  const p = r.patient || {};
  const meds = parseMeds(r.medicine_prescription); const labs = parseLabs(r.lab_test_list); const allergies = parseAllergies(r.allergies);
  const problems = parseNames(r.problems); const flags = parseNames(r.flags); const prov = parseNames(r.provisional_diagnosis);
  const hist = historyState(r);
  const name = [p.fname, (p.mname || "").trim(), p.lname].filter(Boolean).join(" ") || r.fullname;
  return (
    <div className="casefile">
      <div className="cf-actions no-print"><button className="btn primary sm" onClick={() => window.print()}>Print / Save as PDF</button>{onClose && <button className="btn ghost sm" onClick={onClose}>Close</button>}</div>
      <header className="cf-head">
        <div><h2>COBALT</h2><p className="muted small">Electronic Health Record — Case File</p></div>
        <div className="cf-hosp"><b>{r.hospital_name}</b><p className="small">{[r.address, r.city].filter(Boolean).join(", ")}</p><p className="small">{r.land_phone ? `Phone: ${r.land_phone}` : ""} {r.hospital_email || ""}</p></div>
      </header>
      <div className="cf-grid">
        <div><span>Patient</span><b>{name}</b><small>{r.patient_id}</small></div>
        <div><span>Age / Gender</span><b>{p.age ?? "—"} / {p.gender || "—"}</b><small>{p.bloodgroup ? `Blood group ${p.bloodgroup}` : ""}</small></div>
        <div><span>Contact</span><b>{p.mobno || "—"}</b><small>{p.email || r.email || ""}</small></div>
        <div><span>Appointment</span><b>{r.apnt_id}</b><small>{r.apnt_details}</small></div>
        <div><span>Doctor</span><b>Dr. {r.doctor_name}</b><small>{[r.dept_name, r.doctor_qualification].filter(Boolean).join(" · ")}</small></div>
        <div><span>Case status</span><b>{r.case_status}</b><small>{fmtDateTime(r.date_time)}</small></div>
      </div>
      <Sec title="Symptom list"><p>{String(r.symptoms || "").replace(/,\s*-?/g, ", ").replace(/-/g, " ").replace(/^,\s*/, "") || "—"}</p></Sec>
      <Sec title="Vitals"><p>{String(r.vitals || "").trim() ? String(r.vitals).split(",").map((x) => x.trim()).filter(Boolean).join(" · ") : "—"}</p></Sec>
      <Sec title="Subjective symptoms"><Blocks text={r.subjective_symptoms} /></Sec>
      <Sec title="Objective symptoms" show={!!String(r.objective_symptoms || "").trim()}><Blocks text={r.objective_symptoms} /></Sec>
      <Sec title="System review"><Blocks text={r.system_review} /></Sec>
      <div className="cf-cols">
        <Sec title="Problems">{problems.length ? <ul>{problems.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="muted">—</p>}</Sec>
        <Sec title="Flags">{flags.length ? <ul>{flags.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="muted">—</p>}</Sec>
      </div>
      <Sec title="Allergies">{allergies.length ? <table className="cf-table"><thead><tr><th>Name</th><th>Severity</th><th>Description</th></tr></thead><tbody>{allergies.map((a, i) => <tr key={i}><td>{a.name}</td><td>{a.severity}</td><td>{a.description}</td></tr>)}</tbody></table> : <p className="muted">—</p>}</Sec>
      <Sec title="Medicines prescribed">{meds.length ? <table className="cf-table"><thead><tr><th>Name</th><th>Quantity</th><th>Duration</th><th>Usage</th><th>Instruction</th><th>Repeat</th></tr></thead><tbody>{meds.map((m, i) => <tr key={i}><td>{m.name}</td><td>{m.qty}</td><td>{m.duration}</td><td>{m.usage}</td><td>{m.instruction}</td><td>{m.repeat}</td></tr>)}</tbody></table> : <p className="muted">—</p>}
        {r.pharmacy_order_id ? <p className="muted small">Pharmacy order #{r.pharmacy_order_id} ({r.pharmacy_id})</p> : null}</Sec>
      <Sec title="Lab tests prescribed">{labs.length ? <table className="cf-table"><thead><tr><th>Name</th><th>Repeat test</th><th>Emergency test</th></tr></thead><tbody>{labs.map((m, i) => <tr key={i}><td>{m.name}</td><td>{m.repeat}</td><td>{m.emergency}</td></tr>)}</tbody></table> : <p className="muted">—</p>}
        {r.lab_order_id ? <p className="muted small">Lab order #{r.lab_order_id} ({r.labid})</p> : null}</Sec>
      <div className="cf-cols">
        <Sec title="Provisional diagnosis">{prov.length ? <ul>{prov.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="muted">—</p>}</Sec>
        <Sec title="Diagnosis"><p>{String(r.diagnosis || "").replace(/,\s*$/, "") || "—"}</p></Sec>
      </div>
      <Sec title="Past history"><dl className="cf-kv">{PH_FIELDS.map((f) => <div key={f.key}><dt>{f.title}</dt><dd>{historySummary(hist, f)}</dd></div>)}</dl></Sec>
      <footer className="cf-foot small muted">Generated {fmtDate(new Date())} · Cobalt EHR</footer>
    </div>
  );
}
