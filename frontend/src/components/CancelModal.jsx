import { useState } from "react";
import { api } from "../api";
import { Modal, fmtDate } from "./ui";

const MSG = { reason_required: "Please give a reason.", reason_too_long: "Reason must be 30 characters or fewer.", not_cancellable: "This appointment can no longer be cancelled." };

// endpoint example: "doctor/appointments/APNT123/cancel"
export default function CancelModal({ appt, endpoint, reasons, onClose, onDone }) {
  const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function go() {
    setBusy(true); setErr("");
    const { data } = await api(endpoint, { method: "POST", body: { reason } });
    setBusy(false);
    if (data.status === "cancelled") { setReason(""); onDone(); } else setErr(MSG[data.status] || "Could not cancel.");
  }
  return (
    <Modal open={!!appt} title="Cancel appointment" onClose={onClose}>
      <p className="muted">{appt?.fullname || appt?.doctor_name} · {fmtDate(appt?.date_of_booking)} · {appt?.time_of_booking}</p>
      <div className="chips">{reasons.map((r) => <button key={r} type="button" className={`chip-btn ${reason === r ? "on" : ""}`} onClick={() => setReason(r)}>{r}</button>)}</div>
      <label className="field"><span>Reason <small className="muted">{reason.length}/30</small></span><input maxLength={30} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Tell us why" /></label>
      {err && <div className="alert error">{err}</div>}
      <div className="row"><button className="btn ghost" onClick={onClose}>Keep appointment</button><button className="btn primary" disabled={!reason.trim() || busy} onClick={go}>{busy ? <span className="spinner" /> : "Confirm cancellation"}</button></div>
    </Modal>
  );
}
