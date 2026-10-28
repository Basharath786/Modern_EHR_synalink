import { useState } from "react";
import { api } from "../../api";
import { Badge, Empty, Modal, fmtDateTime } from "../../components/ui";

const tone = (s) => ({ accepted: "green", pending: "amber", cancelled: "red" }[s] || "gray");

// Referral lists of the doctor (Java listReferredDoctorDetails / listReferrerDoctorDetails),
// with Accept / Decline for incoming referrals (doctorAcceptReferralAppointment / doctorCancelReferralAppointment).
export default function ReferralTable({ kind, items, onChanged }) {
  const [decline, setDecline] = useState(null); const [reason, setReason] = useState(""); const [view, setView] = useState(null); const [msg, setMsg] = useState("");
  async function accept(r) {
    const { data } = await api(`doctor/referrals/${r.apnt_id}/accept`, { method: "POST", body: {} });
    setMsg(data.status === "accepted" ? "" : "Could not accept this referral."); onChanged();
  }
  async function doDecline() {
    const { data } = await api(`doctor/referrals/${decline.apnt_id}/decline`, { method: "POST", body: { reason } });
    if (data.status === "cancelled") { setDecline(null); setReason(""); onChanged(); } else setMsg(data.status === "reason_too_long" ? "Reason must be 200 characters or fewer." : "Could not decline.");
  }
  if (!items.length) return <Empty title="No referrals" text="Nothing in this list." />;
  return (<>
    {msg && <div className="alert error">{msg}</div>}
    <div className="table-wrap"><table>
      <thead><tr><th>Appointment</th><th>Patient</th><th>{kind === "outgoing" ? "Referred to" : "Referred by"}</th><th>Reason</th><th>Patient</th><th>Doctor</th><th /></tr></thead>
      <tbody>{items.map((r) => (
        <tr key={r.apnt_id}>
          <td><b>{r.apnt_id}</b><p className="muted small">{fmtDateTime(r.date_time)}</p></td>
          <td>{r.patient_name}<p className="muted small">{r.patient_id}</p></td>
          <td>{kind === "outgoing" ? <>Dr. {r.referred_doc_name}<p className="muted small">{r.referred_doc_id} · {r.referred_hospital_name}</p></> : <>Dr. {r.referrer_doc_name}<p className="muted small">{r.referrer_doc_id} · {r.referrer_hospital_name}</p></>}</td>
          <td className="small" style={{ maxWidth: 260 }}>{r.referral_reason}</td>
          <td><Badge tone={tone(r.patient_status)}>{r.patient_status}</Badge>{r.patient_status === "cancelled" && r.pat_cancel_reason !== "-" && <p className="muted small">{r.pat_cancel_reason}</p>}</td>
          <td><Badge tone={tone(r.referred_doc_status)}>{r.referred_doc_status}</Badge>{r.referred_doc_status === "cancelled" && r.referred_doc_cancel_reason !== "-" && <p className="muted small">{r.referred_doc_cancel_reason}</p>}</td>
          <td className="nowrap"><button className="btn ghost sm" onClick={() => setView(r)}>View</button>
            {kind === "incoming" && <><button className="btn primary sm" onClick={() => accept(r)}>Accept</button><button className="btn ghost sm" onClick={() => { setDecline(r); setReason(""); }}>Decline</button></>}
            {kind === "accepted" && <button className="btn ghost sm" onClick={() => { setDecline(r); setReason(""); }}>Cancel</button>}</td>
        </tr>))}</tbody></table></div>
    <Modal open={!!decline} title="Decline referral" onClose={() => setDecline(null)}>
      <p className="muted">{decline?.apnt_id} · {decline?.patient_name}</p>
      <label className="field"><span>Reason <small className="muted">{reason.length}/200</small></span><textarea rows={3} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      <div className="row"><button className="btn ghost" onClick={() => setDecline(null)}>Close</button><button className="btn primary" disabled={!reason.trim()} onClick={doDecline}>Submit</button></div>
    </Modal>
    <Modal open={!!view} title="Referral details" onClose={() => setView(null)} wide>
      {view && <dl className="kv">
        <div><dt>Appointment ID</dt><dd>{view.apnt_id}</dd></div><div><dt>Patient</dt><dd>{view.patient_name} ({view.patient_id})</dd></div>
        <div><dt>Original appointment</dt><dd>{view.date_of_booking} {view.time_of_booking}</dd></div><div><dt>Symptoms</dt><dd>{(view.symptoms_list || "—").replace(/-/g, " ")}</dd></div>
        <div><dt>Ref. by doctor</dt><dd>Dr. {view.referrer_doc_name} ({view.referrer_doc_id})</dd></div><div><dt>Ref. by hospital</dt><dd>{view.referrer_hospital_name} ({view.referrer_hospital_id})</dd></div>
        <div><dt>Ref. to doctor</dt><dd>Dr. {view.referred_doc_name} ({view.referred_doc_id}) · {view.referred_dept}</dd></div><div><dt>Ref. to hospital</dt><dd>{view.referred_hospital_name} ({view.referred_hospital_id})</dd></div>
        <div><dt>Reason</dt><dd>{view.referral_reason}</dd></div><div><dt>Status</dt><dd>Patient {view.patient_status} · Doctor {view.referred_doc_status}</dd></div>
      </dl>}
      {view && <div className="row"><a className="btn ghost" href={`/app/case-file/${view.apnt_id}`} target="_blank" rel="noreferrer">Case file of the referring visit</a></div>}
    </Modal>
  </>);
}
