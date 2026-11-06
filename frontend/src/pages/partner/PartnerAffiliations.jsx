import { useState } from "react";
import { api } from "../../api";
import { Badge, Empty, ErrorBox, Loading, Modal, PageHead, Tabs, fmtDate, useApi } from "../../components/ui";

const MSG = { requested: "Request sent. The hospital was notified by e-mail.", accepted: "Affiliation accepted.", rejected: "Request rejected.", already_affiliated: "Already affiliated with this hospital.",
  already_requested: "A request already exists with this hospital.", reason_required: "Please give a reason.", not_found: "Request not found." };

// Legacy hospital-portal-details / affiliated-hospital-list / requested-hospital-list / pending-affiliation-list / cancelled-hospital-list
export default function PartnerAffiliations() {
  const { data, loading, error, reload } = useApi("partner/affiliations");
  const [tab, setTab] = useState("affiliated"); const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
  const [reject, setReject] = useState(null); const [reason, setReason] = useState(""); const [info, setInfo] = useState(null);
  if (loading && !data) return <Loading />; if (error && !data) return <ErrorBox onRetry={reload} />;
  const lab = data.kind === "lab"; const mine = lab ? "laboratory" : "pharmacy";

  async function post(hid, action, body = {}) {
    setBusy(true); setMsg(null); const { data: r } = await api(`partner/affiliations/${hid}/${action}`, { method: "POST", body }); setBusy(false);
    const ok = ["requested", "accepted", "rejected"].includes(r.status); setMsg({ ok, text: MSG[r.status] || "Could not complete." }); setReject(null); setReason(""); reload();
    if (ok && action === "request") setTab("outgoing");
  }
  const TABS = [["affiliated", "Affiliated", data.affiliated.length], ["incoming", "Pending requests", data.incoming.length], ["outgoing", "Requested", data.outgoing.length],
    ["rejected", "Cancelled", data.rejected_by_me.length + data.rejected_by_them.length], ["available", "Find hospitals", data.available.length]];
  const table = (items, actions, extra) => items.length === 0 ? <Empty title="Nothing here" /> : (
    <div className="table-wrap"><table><thead><tr><th>Hospital</th><th>Location</th><th>Contact</th>{extra && <th>{extra[0]}</th>}<th /></tr></thead>
      <tbody>{items.map((h) => <tr key={h.permanentid}><td><b>{h.name}</b><br /><small className="muted">{h.permanentid}</small></td><td>{[h.city, h.state].filter(Boolean).join(", ")}</td>
        <td className="small">{h.email}<br />{h.land_phone}</td>{extra && <td className="small">{extra[1](h)}</td>}
        <td className="nowrap"><button className="btn ghost sm" onClick={() => setInfo(h)}>Details</button> {actions(h)}</td></tr>)}</tbody></table></div>);

  return (
    <div className="stack">
      <PageHead title="Hospital affiliations" subtitle={`Hospitals that can send patients' ${lab ? "lab orders" : "prescriptions"} to your ${mine}`} />
      <Tabs items={TABS} value={tab} onChange={(k) => { setTab(k); setMsg(null); }} />
      {msg && <div className={`alert ${msg.ok ? "info" : "error"}`}>{msg.text}</div>}
      {tab === "affiliated" && table(data.affiliated, () => null)}
      {tab === "incoming" && <>{data.incoming.length > 0 && <p className="muted small">These hospitals asked to affiliate with you.</p>}
        {table(data.incoming, (h) => <><button className="btn primary sm" disabled={busy} onClick={() => post(h.permanentid, "accept")}>Accept</button> <button className="btn ghost sm" disabled={busy} onClick={() => { setReject(h); setReason(""); }}>Reject</button></>, ["Requested", (h) => fmtDate(h.date)])}</>}
      {tab === "outgoing" && table(data.outgoing, () => <Badge tone="amber">Waiting for the hospital</Badge>, ["Sent", (h) => fmtDate(h.date)])}
      {tab === "rejected" && <>
        <section className="card"><h3>You rejected ({data.rejected_by_me.length})</h3>{table(data.rejected_by_me, () => null, ["Reason", (h) => h.cancel_reason])}</section>
        <section className="card"><h3>Hospitals that rejected your request ({data.rejected_by_them.length})</h3>{table(data.rejected_by_them, (h) => <button className="btn primary sm" disabled={busy} onClick={() => post(h.permanentid, "request")}>Request again</button>, ["Reason", (h) => h.cancel_reason])}</section></>}
      {tab === "available" && table(data.available, (h) => <button className="btn primary sm" disabled={busy} onClick={() => post(h.permanentid, "request")}>Request affiliation</button>)}

      <Modal open={!!reject} title={`Reject ${reject?.name || ""}`} onClose={() => setReject(null)}>
        <label className="field"><span>Reason * <small className="muted">{reason.length}/300</small></span><textarea rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <div className="row"><button className="btn ghost" onClick={() => setReject(null)}>Back</button><button className="btn primary" disabled={!reason.trim() || busy} onClick={() => post(reject.permanentid, "reject", { reason: reason.trim() })}>Reject request</button></div>
      </Modal>
      <Modal open={!!info} title={info?.name || ""} onClose={() => setInfo(null)}>
        {info && <dl className="kv">{[["Hospital ID", info.permanentid], ["Address", info.address], ["City", info.city], ["State", info.state], ["Email", info.email], ["Land phone", info.land_phone],
          ["Administration mobile", info.administration_no], ["Contact person", info.contact_person_name]].filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
      </Modal>
    </div>
  );
}
