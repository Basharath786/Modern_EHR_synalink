import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, openFile } from "../../api";
import { Badge, Empty, ErrorBox, Loading, Modal, PageHead, Tabs, fmtDateTime, useApi } from "../../components/ui";
import OrderSheet from "./OrderSheet";

// [button label, new status, style, needs a reason]  — legacy lab-portal/orders.js and pharmacy-staff-portal/orders.js
const ACTIONS = {
  lab: { pending: [["Confirm", "AWAITING", "primary"], ["Reject", "CONFIRMATION-CANCELLED", "ghost", true]],
    awaiting: [["Start processing", "PROCESSING", "primary"], ["Cancel", "AWAITING-CANCELLED", "ghost", true]],
    processing: [["Cancel", "PROCESSING-CANCELLED", "ghost", true]] },
  pharmacy: { pending: [["Confirm", "CONFIRMED", "primary"], ["Reject", "CONFIRMATION-CANCELLED", "ghost", true]],
    confirmed: [["Mark completed", "COMPLETED", "primary"], ["Cancel", "CANCELLED", "ghost", true]] },
};
const TONE = { PENDING: "amber", AWAITING: "blue", CONFIRMED: "blue", PROCESSING: "violet", COMPLETED: "green" };
const tone = (s) => (s?.includes("CANCELLED") ? "red" : TONE[s] || "gray");
const pretty = (s) => s.replace(/-/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
const MSG = { updated: "Order updated.", uploaded: "Report uploaded — the test is completed.", invalid_transition: "This item is no longer in the right state. Refresh and try again.",
  reason_required: "Please give a reason.", not_found: "Order not found." };
const REASONS = { lab: ["Sample not received", "Patient did not visit", "Test not available", "Equipment unavailable"], pharmacy: ["Out of stock", "Prescription unclear", "Patient request", "Not available"] };

export default function PartnerOrders() {
  const [sp, setSp] = useSearchParams(); const tab = sp.get("tab") || "pending";
  const { data, loading, error, reload } = useApi(`partner/orders?tab=${tab}`);
  const [msg, setMsg] = useState(null); const [cancel, setCancel] = useState(null); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState(null); const [sheet, setSheet] = useState(null); const file = useRef(null);
  const [q, setQ] = useState("");

  async function update(order, status, item, why) {
    setBusy(true); setMsg(null);
    const { data: r } = await api(`partner/orders/${order}/status`, { method: "POST", body: { status, item, reason: why } }); setBusy(false);
    setMsg({ ok: r.status === "updated", text: r.status === "updated" ? `${MSG.updated} (${r.updated} ${r.updated === 1 ? "item" : "items"} → ${pretty(r.new_status)})` : MSG[r.status] || "Could not update." });
    setCancel(null); setReason(""); reload();
  }
  async function sendReport() {
    const f = file.current?.files[0]; if (!f) return setMsg({ ok: false, text: "Choose the report file." });
    setBusy(true); const fd = new FormData(); fd.append("lab_test_name", upload.item); fd.append("file", f);
    const { data: r } = await api(`partner/orders/${upload.order}/report/upload`, { method: "POST", body: fd }); setBusy(false);
    setMsg({ ok: r.status === "uploaded", text: r.status === "uploaded" ? MSG.uploaded : r.message || MSG[r.status] || "Upload failed." }); if (r.status === "uploaded") { setUpload(null); reload(); }
  }
  const act = (o, a, item) => (a[3] ? setCancel({ order: o, status: a[1], item, label: a[0] }) : update(o, a[1], item));

  if (loading && !data) return <Loading />; if (error && !data) return <ErrorBox onRetry={reload} />;
  const lab = data.kind === "lab"; const actions = (ACTIONS[data.kind][tab] || []);
  const list = data.orders.filter((o) => !q.trim() || `${o.order_id} ${o.patient_name} ${o.patient_id} ${o.doctor_name} ${o.items.map((i) => i.name).join(" ")}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="stack">
      <PageHead title={lab ? "Lab orders" : "Medicine orders"} subtitle={lab ? "Tests ordered by doctors for this laboratory" : "Prescriptions sent to this pharmacy"} />
      <div className="toolbar"><Tabs items={data.tabs.map((t) => [t.key, t.label, data.counts[t.key]])} value={tab} onChange={(k) => { setSp({ tab: k }); setMsg(null); }} />
        <input className="search" placeholder="Search order, patient, doctor, item…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {msg && <div className={`alert ${msg.ok ? "info" : "error"}`}>{msg.text}</div>}
      {list.length === 0 ? <Empty title="No orders here" text="Nothing matches this view." /> : list.map((o) => (
        <section className="card" key={o.order_id}>
          <div className="card-head"><div><h3>Order #{o.order_id} <small className="muted">· {fmtDateTime(o.date_time)}</small></h3>
            <p className="muted small">{o.patient_name} ({o.patient_id}) · {o.doctor_name ? `Dr. ${o.doctor_name} · ` : ""}{o.hospital_name ? `${o.hospital_name}${o.deptname ? ` (${o.deptname})` : ""} · ` : ""}{o.apnt_id}</p></div>
            <div className="row" style={{ margin: 0 }}><button className="btn ghost sm" onClick={() => setSheet(o.order_id)}>{lab ? "Order sheet" : "Prescription"}</button>
              {actions.map((a) => <button key={a[1]} className={`btn ${a[2]} sm`} disabled={busy} onClick={() => act(o.order_id, a)}>{a[0]} all</button>)}</div></div>
          <div className="table-wrap tight"><table><thead>{lab ? <tr><th>Test</th><th>Flags</th><th>Status</th><th>Reason</th><th /></tr>
            : <tr><th>Medicine</th><th>Qty</th><th>Usage</th><th>Instructions</th><th>Duration</th><th>Status</th><th>Reason</th><th /></tr>}</thead>
            <tbody>{o.items.map((i) => (
              <tr key={i.name}><td><b>{i.name}</b></td>
                {lab ? <td>{i.emergency && <Badge tone="red">Urgent</Badge>} {i.repeat && <Badge tone="violet">Repeat</Badge>}</td>
                  : <><td>{i.quantity}</td><td>{i.usage}</td><td>{i.instructions}</td><td>{i.duration}{i.days ? ` · ${i.days}d` : ""} {i.repeat && <Badge tone="violet">Repeat</Badge>}</td></>}
                <td><Badge tone={tone(i.status)}>{pretty(i.status)}</Badge></td><td className="small">{i.reason || "—"}</td>
                <td className="nowrap">{actions.map((a) => <button key={a[1]} className={`btn ${a[2]} sm`} disabled={busy} onClick={() => act(o.order_id, a, i.name)}>{a[0]}</button>)}
                  {lab && tab === "processing" && <button className="btn primary sm" onClick={() => setUpload({ order: o.order_id, item: i.name })}>Upload report</button>}
                  {lab && i.has_report && <button className="btn ghost sm" onClick={() => openFile(`partner/orders/${o.order_id}/report?lab_test_name=${encodeURIComponent(i.name)}`)}>View report</button>}</td></tr>))}</tbody></table></div>
        </section>))}

      <Modal open={!!cancel} title={`${cancel?.label} — reason required`} onClose={() => setCancel(null)}>
        <p className="muted">Order #{cancel?.order}{cancel?.item ? ` · ${cancel.item}` : " · all items"}. The patient is notified by e-mail.</p>
        <div className="chips">{REASONS[data.kind].map((r) => <button key={r} type="button" className={`chip-btn ${reason === r ? "on" : ""}`} onClick={() => setReason(r)}>{r}</button>)}</div>
        <label className="field"><span>Reason <small className="muted">{reason.length}/300</small></span><textarea rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <div className="row"><button className="btn ghost" onClick={() => setCancel(null)}>Back</button><button className="btn primary" disabled={!reason.trim() || busy} onClick={() => update(cancel.order, cancel.status, cancel.item, reason.trim())}>{busy ? <span className="spinner" /> : "Confirm"}</button></div>
      </Modal>
      <Modal open={!!upload} title="Upload report" onClose={() => setUpload(null)}>
        <p className="muted">Order #{upload?.order} · {upload?.item}. Uploading marks this test completed and notifies the patient.</p>
        <label className="field"><span>Report file <small className="muted">PDF / JPG / PNG ≤ 5 MB</small></span><input ref={file} type="file" accept=".pdf,.jpg,.jpeg,.png" /></label>
        <div className="row"><button className="btn ghost" onClick={() => setUpload(null)}>Cancel</button><button className="btn primary" disabled={busy} onClick={sendReport}>{busy ? <span className="spinner" /> : "Upload & complete"}</button></div>
      </Modal>
      {sheet && <OrderSheet orderId={sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}
