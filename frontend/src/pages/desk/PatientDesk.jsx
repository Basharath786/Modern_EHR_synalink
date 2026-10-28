import { useState } from "react";
import { api, openFile } from "../../api";
import { RecordView, useReference } from "../../components/FormKit";
import { Badge, Empty, ErrorBox, Loading, Modal, PageHead, Tabs, fmtDate, fmtDateTime, useApi } from "../../components/ui";

const FIELDS = [["fname", "First name"], ["mname", "Middle name"], ["lname", "Last name"], ["dob", "Date of birth", "date"], ["gender", "Gender", ["Male", "Female", "Transgender", "Other"]],
  ["marital", "Marital status", ["single", "married", "widowed", "divorced"]], ["address", "Address"], ["state", "State", "state"], ["city", "City", "city"], ["zipcode", "Zip code"],
  ["mobno", "Mobile number"], ["hphone", "Home phone"], ["emergencycontact", "Emergency contact"], ["email", "Email"],
  ["bloodgroup", "Blood group", ["A +ve", "A -ve", "B +ve", "B -ve", "O +ve", "O -ve", "AB +ve", "AB -ve"]], ["insurance_provider", "Insurance provider"], ["govtidtype", "Govt ID type", ["Aadhaar Card"]], ["govtidno", "Govt ID number"]];
const pname = (p) => [p.fname, (p.mname || "").trim(), p.lname].filter(Boolean).join(" ");

// Legacy temporary-patients-list.html wizard: choose fields -> new values -> review -> optional new ID proof -> send
function ChangeRequest({ p, onClose, onDone }) {
  const ref = useReference();
  const [pick, setPick] = useState([]); const [vals, setVals] = useState({}); const [file, setFile] = useState(null); const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({}); const [busy, setBusy] = useState(false);
  const val = (k) => vals[k] ?? (p[k] == null ? "" : String(p[k]));
  async function send() {
    setBusy(true); const fd = new FormData(); const changes = {}; pick.forEach((k) => { changes[k] = val(k); }); fd.append("changes", JSON.stringify(changes)); if (file) fd.append("govtidfile", file);
    const { data } = await api(`desk/patients/${p.permanentid}/change-request`, { method: "POST", body: fd }); setBusy(false);
    if (data.status === "requested") onDone("Change request sent. The patient must approve it in their Notifications before anything changes.");
    else { setErrors(data.errors || { _: data.message || "Nothing was changed." }); setStep(1); }
  }
  const input = ([k, , t]) => {
    const on = (v) => setVals({ ...vals, [k]: v, ...(k === "state" ? { city: "" } : {}) });
    if (t === "date") return <input type="date" value={val(k)} onChange={(e) => on(e.target.value)} />;
    if (t === "state") return <select value={val(k)} onChange={(e) => on(e.target.value)}><option value="">Select</option>{Object.keys(ref?.states || {}).map((s) => <option key={s}>{s}</option>)}</select>;
    if (t === "city") return <select value={val(k)} onChange={(e) => on(e.target.value)}><option value="">Select</option>{(ref?.states?.[val("state")] || []).map((s) => <option key={s}>{s}</option>)}</select>;
    if (Array.isArray(t)) return <select value={val(k)} onChange={(e) => on(e.target.value)}><option value="">Select</option>{t.map((s) => <option key={s}>{s}</option>)}</select>;
    return <input value={val(k)} onChange={(e) => on(e.target.value)} />;
  };
  const chosen = FIELDS.filter(([k]) => pick.includes(k));
  return (
    <Modal open title={`Request change — ${pname(p)} (${p.permanentid})`} onClose={onClose} xl>
      <ol className="stepper">{["Select fields", "New values", "Review & send"].map((s, i) => <li key={s} className={step === i ? "on" : step > i ? "done" : ""}><span>{i + 1}</span>{s}</li>)}</ol>
      {errors._ && <div className="alert error">{errors._}</div>}
      {step === 0 && <><div className="chips" style={{ marginTop: 12 }}>{FIELDS.map(([k, l]) => <button key={k} type="button" className={`chip-btn ${pick.includes(k) ? "on" : ""}`}
        onClick={() => setPick(pick.includes(k) ? pick.filter((x) => x !== k) : [...pick, k])}>{l}</button>)}</div>
        <label className="field"><span>New ID proof (optional, PDF/JPG/PNG ≤ 5 MB)</span><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files[0] || null)} /></label>
        <div className="row"><button className="btn primary" disabled={!pick.length && !file} onClick={() => setStep(pick.length ? 1 : 2)}>Next</button></div></>}
      {step === 1 && <><div className="filters" style={{ marginTop: 12 }}>{chosen.map((fd) => <label key={fd[0]} className="field"><span>{fd[1]} <small className="muted">now: {String(p[fd[0]] ?? "—")}</small></span>{input(fd)}
        {errors[fd[0]] && <small className="err-text">{errors[fd[0]]}</small>}</label>)}</div>
        <div className="row"><button className="btn ghost" onClick={() => setStep(0)}>Back</button><button className="btn primary" onClick={() => setStep(2)}>Review</button></div></>}
      {step === 2 && <><div className="table-wrap" style={{ marginTop: 12 }}><table><thead><tr><th>Field</th><th>Current</th><th>Requested</th></tr></thead>
        <tbody>{chosen.map(([k, l]) => <tr key={k}><td><b>{l}</b></td><td className="muted">{String(p[k] ?? "—")}</td><td>{val(k) || "—"}</td></tr>)}
          {file && <tr><td><b>Govt ID proof</b></td><td className="muted">Current file</td><td>{file.name}</td></tr>}</tbody></table></div>
        <p className="muted small">Nothing changes until the patient approves the request in the patient portal. A newer request replaces an older pending one.</p>
        <div className="row"><button className="btn ghost" onClick={() => setStep(pick.length ? 1 : 0)}>Back</button><button className="btn primary" disabled={busy} onClick={send}>{busy ? <span className="spinner" /> : "Send to patient"}</button></div></>}
    </Modal>
  );
}

function PatientView({ pid, onClose, onChanged }) {
  const { data, loading, reload } = useApi(`desk/patients/${pid}`);
  const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false); const [chg, setChg] = useState(false);
  async function validate() {
    setBusy(true); const { data: r } = await api(`desk/patients/${pid}/validate`, { method: "POST", body: {} }); setBusy(false);
    setMsg({ ok: r.status === "validated", text: r.message || "Could not validate." }); reload(); onChanged();
  }
  const p = data?.patient;
  return (
    <Modal open title={p ? `${pname(p)} (${pid})` : pid} onClose={onClose} xl>
      {loading && !data ? <Loading /> : <>
        <div className="toolbar"><div className="row" style={{ justifyContent: "flex-start" }}>{p.validated ? <Badge tone="green">Validated by {p.approved_by_name}</Badge> : <Badge tone="amber">Not validated</Badge>}
          {data.pending_request && <Badge tone="violet">Change request waiting for patient</Badge>}</div>
          <div className="row">{p.has_govtidfile && <button className="btn ghost sm" onClick={() => openFile(`desk/patients/${pid}/govtid`)}>View ID proof</button>}
            <button className="btn ghost sm" onClick={() => setChg(true)}>Request change</button>
            {!p.validated && <button className="btn primary sm" disabled={busy} onClick={validate}>Validate patient</button>}</div></div>
        {msg && <div className={`alert ${msg.ok ? "info" : "error"}`}>{msg.text}</div>}
        {!p.validated && <p className="muted small">Check the Govt ID proof against the person in front of you before validating. Validation unlocks case sheets and medical records in the patient portal.</p>}
        <RecordView item={p} />
        {data.children.length > 0 && <><p className="label">Children</p><ul className="list">{data.children.map((c) => <li key={c.child_id}>{c.child_id} — {c.childfname} {c.lname} · {c.gender} · {fmtDate(c.dob)}</li>)}</ul></>}
        {data.requests.length > 0 && <><p className="label">Change requests</p><div className="table-wrap"><table><thead><tr><th>Sent</th><th>By</th><th>Fields</th><th>Status</th></tr></thead>
          <tbody>{data.requests.map((r) => <tr key={r.id}><td>{fmtDateTime(r.created_at)}</td><td>{r.changed_by_name}</td><td className="small">{r.details.map((d) => `${d.label}: ${d.old || "—"} → ${d.new || "—"}`).join("; ")}</td>
            <td><Badge tone={{ PENDING: "amber", APPROVED: "green", REJECTED: "red" }[r.status] || "gray"}>{r.status}</Badge></td></tr>)}</tbody></table></div></>}
      </>}
      {chg && p && <ChangeRequest p={p} onClose={() => setChg(false)} onDone={(t) => { setChg(false); setMsg({ ok: true, text: t }); reload(); }} />}
    </Modal>
  );
}

function TempPatients() {
  const { data, loading, error, reload } = useApi("desk/temp-patients");
  const [act, setAct] = useState(null); const [reason, setReason] = useState(""); const [msg, setMsg] = useState(null);
  async function go(t, kind, body) {
    const { data: r } = await api(`desk/temp-patients/${t.temp_id}/${kind}`, { method: "POST", body: body || {} });
    setMsg({ ok: ["on_hold", "rejected", "validated"].includes(r.status), text: r.status === "validated" ? `Validated — Permanent ID ${r.permanentid}. A set-password link was e-mailed.` : r.message || { on_hold: "Put on hold.", rejected: "Rejected." }[r.status] || "Could not complete." });
    setAct(null); reload();
  }
  if (loading && !data) return <Loading />; if (error) return <ErrorBox onRetry={reload} />;
  return (<>
    {msg && <div className={`alert ${msg.ok ? "info" : "error"}`}>{msg.text}</div>}
    {data.items.length === 0 ? <Empty title="No temporary registrations" text="Older self-registrations waiting in the temporary table appear here." /> :
      <div className="table-wrap"><table><thead><tr><th>Temp ID</th><th>Name</th><th>Mobile</th><th>Email</th><th>Status</th><th>Registered</th><th /></tr></thead>
        <tbody>{data.items.map((t) => <tr key={t.temp_id}><td>{t.temp_id}</td><td>{t.display_name}</td><td>{t.mobno}</td><td className="small">{t.email}</td>
          <td>{t.status || "PENDING"}{t.hold_attempt ? ` (${t.hold_attempt}/3)` : ""}{t.hold?.reason_for_hold && <><br /><small className="muted">{t.hold.reason_for_hold}</small></>}</td><td>{fmtDate(t.date_time)}</td>
          <td className="nowrap">{t.has_govtidfile && <button className="btn ghost sm" onClick={() => openFile(`desk/temp-patients/${t.temp_id}/file`)}>ID</button>}{" "}
            <button className="btn primary sm" onClick={() => go(t, "validate")}>Validate</button>{" "}
            <button className="btn ghost sm" onClick={() => { setAct([t, "hold"]); setReason(""); }}>Hold</button>{" "}
            <button className="btn ghost sm" disabled={(t.hold_attempt || 0) < 2} title="Allowed after two holds" onClick={() => { setAct([t, "reject"]); setReason(""); }}>Reject</button></td></tr>)}</tbody></table></div>}
    <Modal open={!!act} title={act?.[1] === "hold" ? "Put registration on hold" : "Reject registration"} onClose={() => setAct(null)}>
      <label className="field"><span>Reason *</span><input maxLength={100} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      <div className="row"><button className="btn ghost" onClick={() => setAct(null)}>Cancel</button><button className="btn primary" disabled={!reason.trim()} onClick={() => go(act[0], act[1], { reason })}>Confirm</button></div>
    </Modal>
  </>);
}

// Hospital + reception: validate self-registered patients and request changes to their details
export default function PatientDesk() {
  const [tab, setTab] = useState("unvalidated"); const [q, setQ] = useState(""); const [view, setView] = useState(null);
  const path = tab === "temp" ? null : `desk/patients?filter=${tab}&q=${encodeURIComponent(q)}`;
  const { data, loading, error, reload } = useApi(path || "desk/patients?filter=none");
  return (
    <div className="stack">
      <PageHead title="Patient validation" subtitle="Validate Permanent IDs and request corrections (patient approves)" />
      <Tabs items={[["unvalidated", "Waiting for validation"], ["validated", "Validated"], ["all", "Search all"], ["temp", "Temporary registrations"]]} value={tab} onChange={setTab} />
      {tab === "temp" ? <TempPatients /> : <>
        <input className="search" placeholder="Search by Permanent ID, name, mobile or email" value={q} onChange={(e) => setQ(e.target.value)} />
        {loading && !data ? <Loading /> : error ? <ErrorBox onRetry={reload} /> : data.items.length === 0 ? <Empty title="No patients found" /> :
          <div className="table-wrap"><table><thead><tr><th>Permanent ID</th><th>Name</th><th>Gender</th><th>DOB</th><th>Mobile</th><th>City</th><th>Status</th><th>Registered</th></tr></thead>
            <tbody>{data.items.map((p) => <tr key={p.permanentid} className="clickable" onClick={() => setView(p.permanentid)}><td><b>{p.permanentid}</b></td><td>{pname(p)}</td><td>{p.gender}</td><td>{fmtDate(p.dob)}</td>
              <td>{p.mobno}</td><td>{p.city}</td><td>{p.approved_by ? <Badge tone="green">Validated</Badge> : <Badge tone="amber">Pending</Badge>}</td><td>{fmtDate(p.date_time)}</td></tr>)}</tbody></table></div>}</>}
      {view && <PatientView pid={view} onClose={() => setView(null)} onChanged={reload} />}
    </div>
  );
}
