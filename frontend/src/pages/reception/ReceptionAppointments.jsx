import { useEffect, useState } from "react";
import { api } from "../../api";
import ApptRow from "../../components/ApptRow";
import CancelModal from "../../components/CancelModal";
import RescheduleModal from "../../components/RescheduleModal";
import { Empty, ErrorBox, Loading, OPEN_TYPES, PageHead, useApi } from "../../components/ui";

const TABS = [["today", "Today"], ["upcoming", "Upcoming"], ["past", "Past"], ["all", "All"]];
const RESCHEDULABLE = ["consult", "consult-rescheduled", "followup"];

export default function ReceptionAppointments() {
  const [scope, setScope] = useState("today"); const [q, setQ] = useState(""); const [dq, setDq] = useState("");
  useEffect(() => { const t = setTimeout(() => setDq(q), 300); return () => clearTimeout(t); }, [q]);
  const { data, loading, error, reload } = useApi(`reception/appointments?scope=${scope}&q=${encodeURIComponent(dq)}`);
  const [cancelT, setCancelT] = useState(null); const [reschT, setReschT] = useState(null);
  return (
    <div className="stack">
      <PageHead title="Appointments" subtitle="All appointments at your hospital" />
      <div className="toolbar"><div className="tabs">{TABS.map(([k, l]) => <button key={k} className={scope === k ? "on" : ""} onClick={() => setScope(k)}>{l}</button>)}</div>
        <input className="search" placeholder="Search patient, doctor or ID…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {loading ? <Loading /> : error ? <ErrorBox onRetry={reload} /> : data.appointments.length === 0 ? <Empty title="No appointments" text="Nothing matches this view." /> : (
        <ul className="list cards">{data.appointments.map((a) => (
          <ApptRow key={a.appointmentid} a={a} actions={OPEN_TYPES.includes(a.appointment_type) && (<>
            {RESCHEDULABLE.includes(a.appointment_type) && <button className="btn ghost sm" onClick={() => setReschT(a)}>Reschedule</button>}
            <button className="btn ghost sm" onClick={() => setCancelT(a)}>Cancel</button></>)} />))}</ul>)}
      <CancelModal appt={cancelT} endpoint={`reception/appointments/${cancelT?.appointmentid}/cancel`} reasons={["Patient request", "Doctor unavailable", "Duplicate booking"]}
        onClose={() => setCancelT(null)} onDone={() => { setCancelT(null); reload(); }} />
      <RescheduleModal appt={reschT} onClose={() => setReschT(null)} onDone={() => { setReschT(null); reload(); }} />
    </div>
  );
}
