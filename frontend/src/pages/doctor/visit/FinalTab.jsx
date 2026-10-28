import { useState } from "react";
import { api } from "../../../api";
import SlotPicker from "../../../components/SlotPicker";
import TypeAhead from "../../../components/TypeAhead";
import { Badge, Modal, Tabs, fmtDate, useApi } from "../../../components/ui";

function Directory({ items, onSend, busy, disabled, label }) {
  const [tab, setTab] = useState("aff");
  const list = tab === "aff" ? items.filter((x) => x.affiliated) : items;
  return (<>
    <Tabs small items={[["aff", "Affiliated", items.filter((x) => x.affiliated).length], ["all", "All", items.length]]} value={tab} onChange={setTab} />
    {list.length === 0 ? <p className="muted small" style={{ marginTop: 10 }}>No {tab === "aff" ? "affiliated " : ""}{label.toLowerCase()}s.</p> : (
      <div className="table-wrap tight"><table className="rx"><thead><tr><th>ID</th><th>Name</th><th>Address</th><th>Phone</th><th /></tr></thead>
        <tbody>{list.map((x) => <tr key={x.id}><td className="small">{x.id}</td><td><b>{x.name}</b></td><td className="small">{[x.address, x.city].filter(Boolean).join(", ")}</td><td className="small">{x.phone || "—"}</td>
          <td><button className="btn primary sm" disabled={disabled || busy} onClick={() => onSend(x)}>Send</button></td></tr>)}</tbody></table></div>)}
  </>);
}

function ReferralModal({ open, value, onChange, onClose }) {
  const [hid, setHid] = useState(value.hospital_id || "");
  const [dept, setDept] = useState(value.dept || "");
  const t = useApi(`doctor/referrals/targets${hid ? `?hospital_id=${hid}` : ""}`);
  const docs = (t.data?.doctors || []).filter((d) => !dept || d.deptname === dept);
  return (
    <Modal open={open} title="Request referral" onClose={onClose} wide>
      <p className="muted small">Hospitals in {t.data?.city || "your city"}.</p>
      <div className="filters" style={{ marginTop: 10 }}>
        <label className="field"><span>Hospital</span><select value={hid} onChange={(e) => { setHid(e.target.value); setDept(""); onChange({ ...value, hospital_id: e.target.value, doctor_id: "" }); }}>
          <option value="">Select hospital</option>{(t.data?.hospitals || []).map((h) => <option key={h.id} value={h.id}>{h.name} - {h.address}</option>)}</select></label>
        <label className="field"><span>Department</span><select value={dept} disabled={!hid} onChange={(e) => { setDept(e.target.value); onChange({ ...value, dept: e.target.value, doctor_id: "" }); }}>
          <option value="">Select department</option>{(t.data?.departments || []).map((d) => <option key={d}>{d}</option>)}</select></label>
        <label className="field"><span>Doctor *</span><select value={value.doctor_id || ""} disabled={!hid} onChange={(e) => onChange({ ...value, doctor_id: e.target.value, doctor_name: e.target.selectedOptions[0]?.text })}>
          <option value="">Select doctor</option>{docs.map((d) => <option key={d.id} value={d.id}>Dr. {d.name} - {d.id}</option>)}</select></label>
      </div>
      <label className="field"><span>Referral reason * <small className="muted">{(value.reason || "").length}/1000</small></span><textarea rows={3} maxLength={1000} value={value.reason || ""} onChange={(e) => onChange({ ...value, reason: e.target.value })} /></label>
      <div className="row"><button className="btn primary" disabled={!value.doctor_id || !(value.reason || "").trim()} onClick={onClose}>Done</button></div>
    </Modal>
  );
}

export default function FinalTab({ v, state, setState, writable, reload, onPreview, onSend, sending, err }) {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [diag, setDiag] = useState("");
  const [refOpen, setRefOpen] = useState(false); const [fuOpen, setFuOpen] = useState(false);
  const apid = v.appointment.appointmentid;
  const medsKey = JSON.stringify(state.meds); const labsKey = JSON.stringify(state.labs);
  async function sendMeds(p) {
    setBusy(true); setMsg(null);
    const { data } = await api(`doctor/appointments/${apid}/prescription`, { method: "POST", body: { pharmacy_id: p.id, medicines: state.meds.map((x) => ({ ...x, number_of_days: x.medicine_duration })) } });
    setBusy(false);
    if (data.status === "ordered") { setState({ ...state, medsSent: medsKey }); setMsg({ ok: true, text: `Order #${data.order_id} sent to ${data.pharmacy}.` }); reload(); }
    else setMsg({ ok: false, text: data.status === "invalid_items" ? `Please check the medicine "${data.medicine || ""}" (quantity 1-999, duration, usage).` : "Could not send the order." });
  }
  async function sendLabs(l) {
    setBusy(true); setMsg(null);
    const { data } = await api(`doctor/appointments/${apid}/lab-order`, { method: "POST", body: { lab_id: l.id, tests: state.labs } });
    setBusy(false);
    if (data.status === "ordered") { setState({ ...state, labsSent: labsKey }); setMsg({ ok: true, text: `Order #${data.order_id} sent to ${data.lab}.` }); reload(); }
    else setMsg({ ok: false, text: "Could not send the lab order." });
  }
  const addDiag = (x) => { const t = x.trim(); if (t && !state.diagnosis.includes(t)) setState({ ...state, diagnosis: [...state.diagnosis, t] }); };
  const setStatus = (s) => { setState({ ...state, status: s }); if (s === "referral-request") setRefOpen(true); if (s === "followup") setFuOpen(true); };
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  return (
    <div className="stack">
      {msg && <div className={`alert ${msg.ok ? "info" : "error"}`}>{msg.text}</div>}
      <section className="card">
        <h3>Send Orders</h3>
        <div className="two-col" style={{ marginTop: 12 }}>
          <div><p className="label tight">Pharmacy list — {state.meds.length} medicine(s){state.medsSent === medsKey && state.meds.length ? " · sent" : ""}</p>
            {state.meds.length === 0 ? <p className="muted small">Add medicines in Plan / Treatment first.</p> :
              <Directory label="Pharmacy" items={v.options.pharmacies} onSend={sendMeds} busy={busy} disabled={!writable || state.medsSent === medsKey} />}</div>
          <div><p className="label tight">Lab list — {state.labs.length} test(s){state.labsSent === labsKey && state.labs.length ? " · sent" : ""}</p>
            {state.labs.length === 0 ? <p className="muted small">Add lab tests in Plan / Treatment first.</p> :
              <Directory label="Lab" items={v.options.labs} onSend={sendLabs} busy={busy} disabled={!writable || state.labsSent === labsKey} />}</div>
        </div>
        {(v.prescriptions.length > 0 || v.lab_orders.length > 0) && (<><p className="label">Orders sent for this appointment</p>
          <ul className="plain">{v.prescriptions.map((o) => <li key={"p" + o.order_id}><Badge tone="blue">Pharmacy #{o.order_id}</Badge> {o.pharmacy_name} · {o.items.map((i) => i.medicine_name).join(", ")} <span className="muted small">({o.confirmation_status || "PENDING"})</span></li>)}
            {v.lab_orders.map((o) => <li key={"l" + o.order_id}><Badge tone="violet">Lab #{o.order_id}</Badge> {o.labname} · {o.items.map((i) => i.lab_test_name).join(", ")} <span className="muted small">({o.status || "PENDING"})</span></li>)}</ul></>)}
      </section>

      <section className="card">
        <h3>Send Report Files</h3>
        <div className="two-col" style={{ marginTop: 12 }}>
          <div><p className="label tight">Provisional diagnosis</p>
            {state.problems.length === 0 ? <p className="muted small">Add problems in Assessment — they become the provisional diagnosis.</p> : <ul className="plain">{state.problems.map((p) => <li key={p}>{p},</li>)}</ul>}</div>
          <div><p className="label tight">Select diagnosis</p>
            {writable && <><button className="btn ghost sm" disabled={!state.problems.length} onClick={() => setState({ ...state, diagnosis: [...new Set([...state.diagnosis, ...state.problems])] })}>Same as provisional diagnosis? Click here to add</button>
              <p className="muted small" style={{ margin: "10px 0 6px" }}>Or search new diagnosis below</p>
              <div className="row nowrap" style={{ marginTop: 0 }}><div className="grow"><TypeAhead endpoint="doctor/catalog/problems" placeholder="Search diagnosis" onPick={addDiag} /></div></div></>}
            <div className="chips sel">{state.diagnosis.map((d) => <Badge key={d} tone="green">{d} {writable && <button className="x" onClick={() => setState({ ...state, diagnosis: state.diagnosis.filter((x) => x !== d) })}>×</button>}</Badge>)}</div>
            {diag && null}
          </div>
        </div>
        <p className="label">Select appointment status *</p>
        <div className="chips">{[["completed", "Completed"], ["referral-request", "Request Referral"], ["followup", "Book Follow Up"]].map(([k, l]) =>
          <button key={k} type="button" disabled={!writable} className={`chip-btn ${state.status === k ? "on" : ""}`} onClick={() => setStatus(k)}>{state.status === k ? "● " : "○ "}{l}</button>)}</div>
        {state.status === "referral-request" && <p className="small" style={{ marginTop: 8 }}>{state.referral.doctor_id ? <>Referral to <b>{state.referral.doctor_name}</b> — {state.referral.reason}</> : <span className="err-text">Choose the doctor and the reason.</span>} <button className="link small" onClick={() => setRefOpen(true)}>Change</button></p>}
        {state.status === "followup" && <p className="small" style={{ marginTop: 8 }}>{state.followup.date ? <>Follow-up on <b>{fmtDate(state.followup.date)} · {state.followup.time}</b></> : <span className="err-text">Choose the follow-up slot.</span>} <button className="link small" onClick={() => setFuOpen(true)}>Change</button></p>}
        {err && <div className="alert error">{err}</div>}
        <div className="row">
          <button className="btn ghost" onClick={onPreview}>Preview case file</button>
          <button className="btn primary" disabled={!writable || sending} onClick={onSend}>{sending ? <span className="spinner" /> : "Send reports"}</button>
        </div>
      </section>

      <ReferralModal open={refOpen} value={state.referral} onChange={(r) => setState({ ...state, status: "referral-request", referral: r })} onClose={() => setRefOpen(false)} />
      <Modal open={fuOpen} title="Book follow-up appointment" onClose={() => setFuOpen(false)} wide>
        <p className="muted small">Your free slots (from tomorrow, next 15 days).</p>
        <SlotPicker endpoint="doctor/slots" minDate={tomorrow} value={state.followup.date ? state.followup : null} onChange={(s) => setState({ ...state, status: "followup", followup: s || {} })} />
        <div className="row"><button className="btn primary" disabled={!state.followup.date} onClick={() => setFuOpen(false)}>Done</button></div>
      </Modal>
    </div>
  );
}
