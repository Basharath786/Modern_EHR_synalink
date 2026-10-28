import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import BookingFlow from "../../components/BookingFlow";
import { Empty, PageHead, fmtDate, initials } from "../../components/ui";

export default function ReceptionBook() {
  const [q, setQ] = useState(""); const [res, setRes] = useState(null); const [patient, setPatient] = useState(null); const [done, setDone] = useState(null);
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return; }
    const t = setTimeout(async () => { const { data } = await api(`reception/patients?q=${encodeURIComponent(q.trim())}`); setRes(data.patients || []); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  if (done) return (<div className="empty"><span className="empty-icon ok">✓</span><h2>Appointment booked</h2>
    <p className="muted">{patient.name} with {done.doctor.name}<br />{fmtDate(done.slot.date)} · {done.slot.time} · #{done.id}</p>
    <div className="row"><button className="btn ghost" onClick={() => { setDone(null); setPatient(null); setQ(""); }}>Book another</button><Link className="btn primary" to="/app/appointments">View appointments</Link></div></div>);

  return (
    <div className="stack">
      <PageHead title="Book an appointment" subtitle={patient ? `For ${patient.name} (${patient.id})` : "First find the patient"} action={patient && <button className="btn ghost sm" onClick={() => setPatient(null)}>Change patient</button>} />
      {!patient ? (<section className="card">
        <label className="field"><span>Search patient by ID, name or mobile</span><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. PAT49232 or Niharika" /></label>
        {res && (res.length === 0 ? <Empty title="No patient found" text="Check the spelling, or register the patient first (coming in Phase 3B)." /> : (
          <ul className="list doc-list">{res.map((p) => { const name = [p.fname, p.mname, p.lname].filter(Boolean).join(" "); return (
            <li key={p.permanentid}><span className="avatar sm">{initials(name)}</span><div className="grow"><b>{name}</b><p className="muted">{p.permanentid} · {p.age ?? "—"} · {p.gender || "—"} · {p.mobno}</p></div>
              <button className="btn primary sm" onClick={() => setPatient({ id: p.permanentid, name })}>Select</button></li>); })}</ul>))}
      </section>) : <BookingFlow patient={patient} onDone={(id, d) => setDone({ id, ...d })} />}
    </div>
  );
}
