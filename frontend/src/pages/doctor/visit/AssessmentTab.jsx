import { useState } from "react";
import { api } from "../../../api";
import TypeAhead from "../../../components/TypeAhead";
import { Badge, Tabs, fmtDate, useApi } from "../../../components/ui";
import PastHistoryModal from "./PastHistoryModal";
import { PH_FIELDS, historySummary } from "./pastHistory";

export const SEVERITY = ["Unknown", "Mild", "Mild to Moderate", "Moderate", "Moderate to Severe", "Severe", "Fatal"];
export const REACTIONS = ["Anaphylaxis", "Angioedema", "Arthralgia", "Conjuctivitis", "Cough", "Confusion", "Chills", "Chest tightness", "Cracked Skin", "Diarrhoea", "Dry Skin",
  "Diarrhea", "Dizziness", "Edema", "Erythema", "Flushed Skin", "Facial Flushing", "Facial Swelling", "Fainting", "Fever", "Headache", "Hives", "Irregular Heart Rate", "Itching",
  "Itchy Throat", "Lightheaded", "Malaise", "Myalgia", "Nasal Congestion", "Nausea", "Other", "Pain at injection site", "Soreness at injection site", "Photosensitvity", "Puritis",
  "Rash", "Red Skin", "Respiratory Distress", "Rhinorrhea", "S.O.B", "Skin Rash", "Sore Throat", "Swelling", "Vomiting", "Wheeze"];
const sevTone = (s) => ({ mild: "green", "mild to moderate": "green", moderate: "amber", "moderate to severe": "amber", severe: "red", fatal: "red" }[(s || "").toLowerCase()] || "gray");

function Review({ title, items, render, onRemove, readOnly }) {
  return (<div className="review"><p className="label tight">{title} — review order ({items.length})</p>
    {items.length === 0 ? <p className="muted small">Nothing added yet.</p> : (
      <table className="rx"><tbody>{items.map((x, i) => <tr key={i}><td className="muted">{i + 1}</td><td>{render(x)}</td>
        <td className="nowrap">{!readOnly && <button className="link small" onClick={() => onRemove(i)}>Remove</button>}</td></tr>)}</tbody></table>)}</div>);
}

export default function AssessmentTab({ v, state, setState, writable, reload, gender }) {
  const [tab, setTab] = useState("summary");
  const [sub, setSub] = useState("flags");
  const [custom, setCustom] = useState("");
  const [al, setAl] = useState({ name: "", severity: "", reasons: [] });
  const [ph, setPh] = useState(false);
  const [msg, setMsg] = useState("");
  const most = useApi("doctor/catalog/most-used-problems");
  const s = v.summary; const apid = v.appointment.appointmentid;
  const add = (key, val) => { const t = String(val).trim(); if (!t) return; if (state[key].some((x) => (x.toLowerCase?.() || "") === t.toLowerCase())) { setMsg(`"${t}" is already added.`); return; } setMsg(""); setState({ ...state, [key]: [...state[key], t] }); };
  const remove = (key, i) => setState({ ...state, [key]: state[key].filter((_, j) => j !== i) });
  async function toggle(kind, name, status, severity) {
    const { data } = await api(`doctor/appointments/${apid}/status`, { method: "POST", body: { kind, name, status: status?.toUpperCase() === "ACTIVE" ? "INACTIVE" : "ACTIVE", severity } });
    if (data.status === "updated") reload(); else setMsg("Could not change the status.");
  }
  function addAllergy() {
    if (!al.name.trim() || !al.severity) { setMsg("Please enter the allergy and select the severity."); return; }
    setMsg(""); setState({ ...state, allergies: [...state.allergies, { allergy_name: al.name.trim().slice(0, 45), allergies_severity: al.severity, allergies_description: al.reasons.join(", ").slice(0, 200) }] });
    setAl({ name: "", severity: "", reasons: [] });
  }
  const StatusBtn = ({ kind, x, name, sev }) => <button className="btn ghost sm" onClick={() => toggle(kind, name, x.status, sev)}>{x.status?.toUpperCase() === "ACTIVE" ? "Make inactive" : "Make active"}</button>;

  return (
    <div className="stack">
      <Tabs items={[["summary", "Summary"], ["flags", "Add Flags"], ["problems", "Add Problems"], ["allergies", "Add Allergies"], ["history", "Past History"]]} value={tab} onChange={setTab} />
      {msg && <div className="alert error">{msg}</div>}

      {tab === "summary" && (<section className="card">
        <Tabs small items={[["flags", "Flags", s.flags.length], ["problems", "Problems", s.problems.length], ["allergies", "Allergies", s.allergies.length], ["patient", "Patient added allergy", s.patient_allergies.length], ["history", "Past History"], ["visits", "Past visits", s.past_visits.length]]} value={sub} onChange={setSub} />
        <div style={{ marginTop: 14 }}>
          {sub === "flags" && (s.flags.length === 0 ? <p className="muted">No flags.</p> : <table className="rx"><thead><tr><th>Flag</th><th>Status</th><th>Visit</th><th /></tr></thead><tbody>{s.flags.map((x, i) => <tr key={i}><td><b>{x.name}</b></td><td><Badge tone={x.status?.toUpperCase() === "ACTIVE" ? "red" : "gray"}>{x.status}</Badge></td><td className="muted small">{x.apnt_id} · {fmtDate(x.date_time)}</td><td><StatusBtn kind="flag" x={x} name={x.name} /></td></tr>)}</tbody></table>)}
          {sub === "problems" && (s.problems.length === 0 ? <p className="muted">No problems.</p> : <table className="rx"><thead><tr><th>Problem</th><th>Status</th><th>Visit</th><th /></tr></thead><tbody>{s.problems.map((x, i) => <tr key={i}><td><b>{x.name}</b></td><td><Badge tone={x.status?.toUpperCase() === "ACTIVE" ? "amber" : "gray"}>{x.status}</Badge></td><td className="muted small">{x.apnt_id} · {fmtDate(x.date_time)}</td><td><StatusBtn kind="problem" x={x} name={x.name} /></td></tr>)}</tbody></table>)}
          {sub === "allergies" && (s.allergies.length === 0 ? <p className="muted">No allergies recorded by doctors.</p> : <table className="rx"><thead><tr><th>Allergy</th><th>Severity</th><th>Description</th><th>Status</th><th /></tr></thead><tbody>{s.allergies.map((x, i) => <tr key={i}><td><b>{x.allergy_name}</b></td><td><Badge tone={sevTone(x.allergies_severity)}>{x.allergies_severity}</Badge></td><td className="small">{x.allergies_description}</td><td>{x.status}</td><td><StatusBtn kind="allergy" x={x} name={x.allergy_name} /></td></tr>)}</tbody></table>)}
          {sub === "patient" && (s.patient_allergies.length === 0 ? <p className="muted">The patient has not added allergies.</p> : <table className="rx"><thead><tr><th>Allergy</th><th>Severity</th><th>Description</th><th>Status</th><th /></tr></thead><tbody>{s.patient_allergies.map((x, i) => <tr key={i}><td><b>{x.allergy_name}</b></td><td><Badge tone={sevTone(x.allergies_severity)}>{x.allergies_severity}</Badge></td><td className="small">{x.allergies_description}</td><td>{x.status}</td><td><StatusBtn kind="patient_allergy" x={x} name={x.allergy_name} sev={x.allergies_severity} /></td></tr>)}</tbody></table>)}
          {sub === "history" && (<><dl className="kv">{PH_FIELDS.map((f) => <div key={f.key}><dt>{f.title}</dt><dd>{historySummary(state.history, f)}</dd></div>)}</dl>
            {writable && <div className="row"><button className="btn ghost sm" onClick={() => setPh(true)}>Edit past history</button></div>}</>)}
          {sub === "visits" && (s.past_visits.length === 0 ? <p className="muted">No earlier case files.</p> : <table className="rx"><thead><tr><th>Appointment</th><th>Doctor</th><th>Hospital</th><th>Status</th><th /></tr></thead><tbody>{s.past_visits.map((x) => <tr key={x.apnt_id}><td>{x.apnt_id}<p className="muted small">{x.apnt_details}</p></td><td>{x.doctor_name}<p className="muted small">{x.deptname}</p></td><td>{x.hospital_name}</td><td>{x.case_status}</td><td><a className="link small" href={`/app/case-file/${x.apnt_id}`} target="_blank" rel="noreferrer">Case file</a></td></tr>)}</tbody></table>)}
        </div>
      </section>)}

      {tab === "flags" && (<section className="card two-col">
        <div>
          <p className="label tight">Enter flags</p>
          {writable && <TypeAhead endpoint="doctor/catalog/flags" placeholder="Search flags" allowCustom={false} onPick={(x) => add("flags", x.slice(0, 50))} />}
          <p className="label">Add custom flags</p>
          {writable && <div className="row nowrap" style={{ marginTop: 0 }}><input className="search grow" maxLength={50} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Add custom flag" />
            <button className="btn ghost sm" disabled={!custom.trim()} onClick={() => { add("flags", custom); setCustom(""); }}>Add custom flag</button></div>}
        </div>
        <Review title="Flags" items={state.flags} render={(x) => <b>{x}</b>} onRemove={(i) => remove("flags", i)} readOnly={!writable} />
      </section>)}

      {tab === "problems" && (<section className="card two-col">
        <div>
          <p className="label tight">Enter problems (ICD)</p>
          {writable && <TypeAhead endpoint="doctor/catalog/problems" placeholder="Search problems" onPick={(x) => add("problems", x.slice(0, 200))} />}
          <p className="label">Frequently used problems</p>
          {(most.data?.items || []).length === 0 ? <p className="muted small">Problems you use often appear here.</p> :
            <div className="chips">{most.data.items.map((m) => <button key={m.problem_name} className="chip-btn" disabled={!writable} onClick={() => add("problems", m.problem_name)}>{m.problem_name} <em className="count">{m.usage_count}</em></button>)}</div>}
        </div>
        <Review title="Problems" items={state.problems} render={(x) => <b>{x}</b>} onRemove={(i) => remove("problems", i)} readOnly={!writable} />
      </section>)}

      {tab === "allergies" && (<section className="card two-col">
        <div>
          <p className="label tight">Enter allergies</p>
          {writable && <><TypeAhead key={"a" + state.allergies.length} endpoint="doctor/catalog/allergies" placeholder="Search allergies (or type and press Enter)" clearOnPick={false} onPick={(x) => setAl({ ...al, name: x })} />
            {al.name && <p className="small" style={{ marginTop: 6 }}>Allergy: <b>{al.name}</b></p>}
            <label className="field"><span>Severity</span><select value={al.severity} onChange={(e) => setAl({ ...al, severity: e.target.value })}><option value="">Select severity…</option>{SEVERITY.map((x) => <option key={x}>{x}</option>)}</select></label>
            <p className="label">Description</p>
            <div className="chips scroll">{REACTIONS.map((r) => <button key={r} type="button" className={`chip-btn ${al.reasons.includes(r) ? "on" : ""}`} onClick={() => setAl({ ...al, reasons: al.reasons.includes(r) ? al.reasons.filter((x) => x !== r) : [...al.reasons, r] })}>{r}</button>)}</div>
            <div className="row"><button className="btn primary sm" onClick={addAllergy}>Add allergy</button></div></>}
        </div>
        <Review title="Allergies" items={state.allergies} render={(x) => <><b>{x.allergy_name}</b> <Badge tone={sevTone(x.allergies_severity)}>{x.allergies_severity}</Badge><p className="muted small">{x.allergies_description}</p></>} onRemove={(i) => remove("allergies", i)} readOnly={!writable} />
      </section>)}

      {tab === "history" && (<section className="card">
        <p className="muted">Add / view the past history of this patient. It is submitted together with the report.</p>
        <dl className="kv">{PH_FIELDS.map((f) => <div key={f.key}><dt>{f.title}</dt><dd>{historySummary(state.history, f)}</dd></div>)}</dl>
        {writable && <div className="row"><button className="btn primary" onClick={() => setPh(true)}>Add Past History</button></div>}
      </section>)}

      <PastHistoryModal open={ph} value={state.history} gender={gender} onClose={() => setPh(false)} onSave={(h) => { setState({ ...state, history: h }); setPh(false); }} />
    </div>
  );
}
