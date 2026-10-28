import { useState } from "react";
import { api } from "../api";
import SlotPicker from "./SlotPicker";
import { Modal, fmtDate } from "./ui";

const MSG = { slot_unavailable: "That slot was just taken. Pick another.", same_slot: "Choose a different slot.", patient_conflict: "The patient already has an appointment at that time.", not_reschedulable: "This appointment cannot be rescheduled." };

export default function RescheduleModal({ appt, onClose, onDone, endpoint }) {
  const [slot, setSlot] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function go() {
    setBusy(true); setErr("");
    const { data } = await api(endpoint || `booking/appointments/${appt.appointmentid}/reschedule`, { method: "POST", body: slot });
    setBusy(false);
    if (data.status === "rescheduled") { setSlot(null); onDone(); } else setErr(MSG[data.status] || "Could not reschedule.");
  }
  return (
    <Modal open={!!appt} title="Reschedule appointment" onClose={onClose}>
      {appt && <><p className="muted">{appt.fullname} with {appt.doctor_name} · now {fmtDate(appt.date_of_booking)} · {appt.time_of_booking}</p>
        <SlotPicker doctorId={appt.doctorid} value={slot} onChange={setSlot} />
        {err && <div className="alert error">{err}</div>}
        <div className="row"><button className="btn ghost" onClick={onClose}>Close</button><button className="btn primary" disabled={!slot || busy} onClick={go}>{busy ? <span className="spinner" /> : "Confirm new time"}</button></div></>}
    </Modal>
  );
}
