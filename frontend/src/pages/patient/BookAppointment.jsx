import { Link } from "react-router-dom";
import { useState } from "react";
import BookingFlow from "../../components/BookingFlow";
import { Loading, PageHead, fmtDate } from "../../components/ui";
import { useSubjects } from "./useSubjects";

export default function BookAppointment() {
  const [done, setDone] = useState(null);
  const { subjects, loading } = useSubjects();
  if (done) return (
    <div className="empty"><span className="empty-icon ok">✓</span><h2>Appointment booked</h2>
      <p className="muted">{done.doctor.name} · {fmtDate(done.slot.date)} · {done.slot.time}<br />Reference #{done.id}</p>
      <div className="row"><button className="btn ghost" onClick={() => setDone(null)}>Book another</button><Link className="btn primary" to="/app/appointments">View appointments</Link></div></div>
  );
  if (loading) return <Loading />;
  return (<div className="stack"><PageHead title="Book an appointment" subtitle="Find a doctor, pick a time, select the symptoms on the human model." /><BookingFlow subjects={subjects} onDone={(id, d) => setDone({ id, ...d })} /></div>);
}
