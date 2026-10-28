import { useEffect, useState } from "react";
import { api } from "../../api";
import { Badge, Empty, ErrorBox, Loading, Modal, PageHead, fmtDateTime, useApi } from "../../components/ui";

const ROLE = { RECEPTIONIST: "Receptionist", HOSPITAL: "Hospital", LAB: "Laboratory", PHARMACY: "Pharmacy" };
const STATUS = { PENDING: ["Waiting for you", "amber"], APPROVED: ["Approved", "green"], REJECTED: ["Rejected", "red"], EXPIRED: ["Replaced", "gray"] };

// Old patient-notifications.html: staff change requests need the patient's Approve / Reject
export default function Notifications() {
  const { data, loading, error, reload } = useApi("patient/notifications");
  const [ask, setAsk] = useState(null); const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (data?.unread_count > 0) api("patient/notifications/read", { method: "POST", body: {} }); }, [data]);
  const list = data?.notifications || [];
  const pending = list.filter((n) => n.type === "CHANGE_REQUEST" && n.status === "PENDING").length;
  async function decide() {
    setBusy(true);
    const { data: r } = await api(`patient/notifications/${ask.n.id}/respond`, { method: "POST", body: { decision: ask.decision } });
    setBusy(false); setAsk(null);
    setMsg({ ok: ["approved", "rejected"].includes(r.status), text: r.message || "Could not complete. Please try again." }); reload();
  }
  return (
    <div className="stack">
      <PageHead title="Notifications" subtitle={pending ? `${pending} waiting for your approval` : list.length ? `${list.length} update${list.length === 1 ? "" : "s"} in history` : "No updates"} />
      {msg && <div className={`alert ${msg.ok ? "info" : "error"}`}>{msg.text}</div>}
      {loading ? <Loading /> : error ? <ErrorBox onRetry={reload} /> : list.length === 0 ? <Empty title="No notifications yet" text="When hospital staff want to update your details, the request will appear here for your approval." /> : (
        <ul className="list cards">{list.map((n) => {
          const isReq = n.type === "CHANGE_REQUEST"; const isPending = isReq && n.status === "PENDING";
          const [sl, st] = STATUS[n.status] || [null, "gray"];
          const title = isReq ? (isPending ? "Approval needed: update to your details" : "Update to your details") : n.title;
          const newLabel = !isReq || n.status === "APPROVED" ? "Updated value" : "Requested value";
          return (
            <li key={n.id} className={isPending || !n.is_read ? "unread" : ""} style={{ display: "block" }}>
              <div className="row nowrap spread" style={{ marginTop: 0 }}><b>{title} {isReq && sl && <Badge tone={st}>{sl}</Badge>}</b><span className="muted small">{fmtDateTime(n.created_at)}</span></div>
              {n.changed_by_name && <p className="muted small">{isReq ? "Requested by " : "Updated by "}{n.changed_by_name} ({ROLE[n.changed_role] || n.changed_role})</p>}
              {Array.isArray(n.details) && n.details.length ? (
                <div className="table-wrap tight"><table className="rx"><thead><tr><th>Field</th><th>Previous value</th><th>{newLabel}</th></tr></thead>
                  <tbody>{n.details.map((d, i) => <tr key={i}><td><b>{d.label}</b></td><td className="muted">{d.old || "—"}</td><td>{d.new || "—"}</td></tr>)}</tbody></table></div>
              ) : <p className="muted" style={{ marginTop: 6 }}>{n.message}</p>}
              {isPending && <div className="row" style={{ justifyContent: "flex-start" }}><button className="btn primary sm" onClick={() => setAsk({ n, decision: "APPROVE" })}>✓ Approve</button>
                <button className="btn ghost sm" onClick={() => setAsk({ n, decision: "REJECT" })}>✕ Reject</button><span className="muted small">Your details change only if you approve.</span></div>}
              {isReq && n.status === "APPROVED" && <p className="small" style={{ marginTop: 8 }}>You approved this request. These changes are now saved in your record.</p>}
              {isReq && n.status === "REJECTED" && <p className="small" style={{ marginTop: 8 }}>You rejected this request. Your record was not changed.</p>}
              {isReq && n.status === "EXPIRED" && <p className="small" style={{ marginTop: 8 }}>This request was replaced by a newer one. Your record was not changed.</p>}
              {!isReq && <p className="muted small" style={{ marginTop: 8 }}>If you did not authorise this change, please contact the hospital.</p>}
            </li>);
        })}</ul>)}
      <Modal open={!!ask} title={ask?.decision === "APPROVE" ? "Approve these changes?" : "Reject these changes?"} onClose={() => setAsk(null)}>
        <p className="muted">{ask?.decision === "APPROVE" ? "Your details will be updated as shown in the table." : "Your details will stay as they are."}</p>
        <div className="row"><button className="btn ghost" onClick={() => setAsk(null)}>Cancel</button><button className="btn primary" disabled={busy} onClick={decide}>{busy ? <span className="spinner" /> : ask?.decision === "APPROVE" ? "Yes, approve" : "Yes, reject"}</button></div>
      </Modal>
    </div>
  );
}
