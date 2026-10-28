import { useState } from "react";
import { api, openFile } from "../../api";
import { Badge, Empty, ErrorBox, Loading, Modal, PageHead, Tabs, fmtDate, fmtDateTime, useApi } from "../../components/ui";
import { useSubjects } from "./useSubjects";

// Self / Child tabs of the old record pages (patient-problems, -rxmedications, -labrecords …)
export function useSubjectTab() {
  const { subjects } = useSubjects();
  const [who, setWho] = useState(subjects[0]?.id);
  const cur = subjects.find((s) => s.id === who) || subjects[0];
  const tabs = subjects.length > 1 ? <Tabs items={subjects.map((s) => [s.id, s.child ? `Child · ${s.name}` : "Self"])} value={cur.id} onChange={setWho} /> : null;
  const q = cur?.child ? `?for=${cur.id}` : "";
  return { cur, tabs, q, amp: cur?.child ? `&for=${cur.id}` : "" };
}

const Wrap = ({ title, sub, tabs, res, children, empty, action }) => (
  <div className="stack"><PageHead title={title} subtitle={sub} action={action} />{tabs}
    {res.loading ? <Loading /> : res.error ? <ErrorBox onRetry={res.reload} /> : empty ? <Empty title={empty[0]} text={empty[1]} /> : children}
  </div>
);
const group = (rows) => Object.values(rows.reduce((acc, r) => { (acc[r.order_id] = acc[r.order_id] || { order_id: r.order_id, apnt_id: r.apnt_id, date: r.date || r.date_time, labname: r.labname, status: r.status, items: [] }).items.push(r); return acc; }, {}));

export function Problems() {
  const { tabs, q } = useSubjectTab();
  const res = useApi(`patient/problems${q}`); const rows = res.data?.problems || [];
  return (<Wrap title="Problems" sub="Health problems noted by your doctors" tabs={tabs} res={res} empty={rows.length ? null : ["No problems recorded", "Problems appear here after a consultation."]}>
    <div className="table-wrap"><table><thead><tr><th>Problem</th><th>Status</th><th>Visit</th><th>Recorded</th></tr></thead>
      <tbody>{rows.map((p, i) => <tr key={i}><td><b>{p.pat_problems}</b></td><td><Badge tone={p.status === "ACTIVE" ? "amber" : "gray"}>{p.status}</Badge></td><td>#{p.apnt_id}</td><td>{fmtDate(p.date_time)}</td></tr>)}</tbody></table></div></Wrap>);
}

// Choose a pharmacy / lab from the full list (old listAllPharma / listAllLabs "Send Order" tables)
function SendOrder({ kind, item, onClose, onDone, forId }) {
  const dir = useApi(`patient/directory/${kind === "medicine" ? "pharmacies" : "labs"}`);
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState(null);
  async function send(x) {
    setBusy(true); setMsg("");
    const body = kind === "medicine" ? { order_id: item.order_id, medicine_name: item.medicine_name, pharmacy_id: x.id, for: forId } : { order_id: item.order_id, lab_test_name: item.lab_test_name, lab_id: x.id, for: forId };
    const { data } = await api(kind === "medicine" ? "patient/medications/reorder" : "patient/lab-orders/reorder", { method: "POST", body });
    setBusy(false); setConfirm(null);
    if (data.status === "ordered") onDone(`Order #${data.order_id} sent to ${data.pharmacy || data.lab}.`); else setMsg(data.status === "not_repeatable" ? "This item is not marked for repeat." : "Could not send the order.");
  }
  return (
    <Modal open title={`Send ${kind === "medicine" ? "medicine" : "lab test"} order`} onClose={onClose} wide>
      <p className="muted">{item.medicine_name || item.lab_test_name} · from order #{item.order_id}</p>
      {msg && <div className="alert error">{msg}</div>}
      {dir.loading ? <Loading /> : <div className="table-wrap tight"><table className="rx"><thead><tr><th>ID</th><th>Name</th><th>Address</th><th>Phone</th><th /></tr></thead>
        <tbody>{dir.data.items.map((x) => <tr key={x.id}><td className="small">{x.id}</td><td><b>{x.name}</b></td><td className="small">{[x.address, x.city].filter(Boolean).join(", ")}</td><td className="small">{x.phone || "—"}</td>
          <td><button className="btn primary sm" disabled={busy} onClick={() => setConfirm(x)}>Send</button></td></tr>)}</tbody></table></div>}
      <Modal open={!!confirm} title="Confirm order" onClose={() => setConfirm(null)}>
        <p>Send the order to <b>{confirm?.name}</b>?</p>
        <div className="row"><button className="btn ghost" onClick={() => setConfirm(null)}>Cancel</button><button className="btn primary" disabled={busy} onClick={() => send(confirm)}>Confirm</button></div>
      </Modal>
    </Modal>
  );
}

function Prescription({ kind, orderId, onClose }) {
  const { data, loading } = useApi(`patient/orders/${kind}/${orderId}`);
  return (
    <Modal open title={kind === "medicines" ? "Medicine Prescription" : "Lab Tests Prescription"} onClose={onClose} xl>
      {loading || !data ? <Loading /> : (<div className="casefile">
        <div className="cf-actions no-print"><button className="btn primary sm" onClick={() => window.print()}>Download prescription</button></div>
        <header className="cf-head"><div><h2>COBALT</h2><p className="muted small">{kind === "medicines" ? "Medicine prescription" : "Lab test prescription"}</p></div>
          <div className="cf-hosp"><b>{data.appointment.hospital_name}</b><p className="small">{[data.appointment.address, data.appointment.city].filter(Boolean).join(", ")}</p><p className="small">{data.appointment.land_phone}</p></div></header>
        <div className="cf-grid"><div><span>Patient</span><b>{data.appointment.fullname}</b><small>{data.items[0].patient_id}</small></div><div><span>Doctor</span><b>Dr. {data.appointment.doctor_name}</b><small>{data.appointment.deptname}</small></div>
          <div><span>Appointment ID</span><b>{data.appointment.appointmentid}</b><small>{data.appointment.date_of_booking} {data.appointment.time_of_booking}</small></div><div><span>Order ID</span><b>{orderId}</b><small>{data.items[0].pharmacy_name || data.items[0].labname}</small></div></div>
        {kind === "medicines" ? <table className="cf-table"><thead><tr><th>Name</th><th>Quantity</th><th>Duration</th><th>Usage</th><th>Instruction</th><th>Repeat medicine</th></tr></thead>
          <tbody>{data.items.map((m, i) => <tr key={i}><td>{m.medicine_name}</td><td>{m.medicine_quantity}</td><td>{m.medicine_duration}</td><td>{m.medicine_usage}</td><td>{m.medicine_instructions}</td><td>{m.repeat_medicine}</td></tr>)}</tbody></table>
          : <table className="cf-table"><thead><tr><th>Test name</th><th>Repeat test</th><th>Emergency</th><th>Status</th></tr></thead><tbody>{data.items.map((m, i) => <tr key={i}><td>{m.lab_test_name}</td><td>{m.repeat_test}</td><td>{m.emergency_test}</td><td>{m.status}</td></tr>)}</tbody></table>}
      </div>)}
    </Modal>
  );
}

export function Medications() {
  const { tabs, q, cur } = useSubjectTab();
  const res = useApi(`patient/medications${q}`); const orders = group(res.data?.medications || []);
  const [send, setSend] = useState(null); const [pres, setPres] = useState(null); const [msg, setMsg] = useState("");
  return (<Wrap title="Medications" sub="Prescriptions from your visits — repeat medicines can be ordered again" tabs={tabs} res={res} empty={orders.length ? null : ["No medications", "Prescribed medicines appear here."]}>
    {msg && <div className="alert info">{msg}</div>}
    <div className="stack">{orders.map((o) => (
      <section key={o.order_id} className="card"><div className="card-head"><div><h3>Order #{o.order_id}</h3><p className="muted small">Appointment {o.apnt_id} · {fmtDate(o.date)}</p></div>
        <button className="btn ghost sm" onClick={() => setPres(o.order_id)}>View prescription</button></div>
        <div className="table-wrap tight"><table className="rx"><thead><tr><th>Medicine</th><th>Qty</th><th>Duration</th><th>Usage</th><th>Instructions</th><th>Repeat</th><th /></tr></thead>
          <tbody>{o.items.map((m, i) => <tr key={i}><td><b>{m.medicine_name}</b></td><td>{m.medicine_quantity}</td><td>{m.medicine_duration}</td><td>{m.medicine_usage}</td><td>{m.medicine_instructions || "—"}</td>
            <td>{m.repeat_medicine === "YES" ? <Badge tone="violet">YES</Badge> : "NO"}</td><td>{m.repeat_medicine === "YES" && <button className="btn primary sm" onClick={() => setSend(m)}>Send order</button>}</td></tr>)}</tbody></table></div>
      </section>))}</div>
    {send && <SendOrder kind="medicine" item={send} forId={cur.child ? cur.id : undefined} onClose={() => setSend(null)} onDone={(t) => { setSend(null); setMsg(t); res.reload(); }} />}
    {pres && <Prescription kind="medicines" orderId={pres} onClose={() => setPres(null)} />}
  </Wrap>);
}

const LAB = { COMPLETED: "green", PENDING: "amber", PROCESSING: "blue", CANCELLED: "red" };
export function LabRecords() {
  const { tabs, q, cur, amp } = useSubjectTab();
  const res = useApi(`patient/lab-orders${q}`); const rows = res.data?.lab_orders || []; const orders = group(rows);
  const [send, setSend] = useState(null); const [pres, setPres] = useState(null); const [msg, setMsg] = useState("");
  return (<Wrap title="Lab Records" sub="Tests ordered for you and their reports" tabs={tabs} res={res} empty={rows.length ? null : ["No lab orders", "Lab tests ordered by your doctor appear here."]}>
    {msg && <div className="alert info">{msg}</div>}
    <div className="stack">{orders.map((o) => (
      <section key={o.order_id} className="card"><div className="card-head"><div><h3>Order #{o.order_id} · {o.labname}</h3><p className="muted small">Appointment {o.apnt_id} · {fmtDateTime(o.date)}</p></div>
        <button className="btn ghost sm" onClick={() => setPres(o.order_id)}>View prescription</button></div>
        <div className="table-wrap tight"><table className="rx"><thead><tr><th>Test</th><th>Status</th><th>Repeat</th><th>Report</th><th /></tr></thead>
          <tbody>{o.items.map((l, i) => <tr key={i}><td><b>{l.lab_test_name}</b>{l.emergency_test === "YES" && <> <Badge tone="red">Urgent</Badge></>}{l.lab_cancel_reason && <p className="muted small">{l.lab_cancel_reason}</p>}</td>
            <td><Badge tone={LAB[l.status] || "gray"}>{l.status}</Badge></td><td>{l.repeat_test}</td>
            <td>{l.has_report ? <button className="btn ghost sm" onClick={() => openFile(`patient/lab-orders/report?apnt_id=${l.apnt_id}&order_id=${l.order_id}${amp}`)}>View</button> : "—"}</td>
            <td>{l.repeat_test === "YES" && <button className="btn primary sm" onClick={() => setSend(l)}>Send order</button>}</td></tr>)}</tbody></table></div>
      </section>))}</div>
    {send && <SendOrder kind="lab" item={send} forId={cur.child ? cur.id : undefined} onClose={() => setSend(null)} onDone={(t) => { setSend(null); setMsg(t); res.reload(); }} />}
    {pres && <Prescription kind="labs" orderId={pres} onClose={() => setPres(null)} />}
  </Wrap>);
}
