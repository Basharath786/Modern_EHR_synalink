import { useMemo, useState } from "react";
import { api } from "../api";
import SlotPicker from "./SlotPicker";
import SymptomPicker from "./SymptomPicker";
import { Empty, ErrorBox, Loading, fmtDate, initials, useApi } from "./ui";

const STEPS = ["Doctor", "Date & time", "Details"];
const ERR = {
  slot_unavailable: "That slot was just taken. Please pick another time.",
  patient_conflict: "This patient already has an appointment at that time.",
  busy: "The system is busy. Please try again in a moment.",
  not_found: "Doctor or patient not found.",
};

// subjects: [{id, name, gender, child}] -> "Book for: Self / Child" (old appointment-booking.html)
export default function BookingFlow({ patient, onDone, subjects }) {
  const docs = useApi("booking/doctors");
  const [who, setWho] = useState(subjects?.[0]?.id || "");
  const subject = subjects?.find((x) => x.id === who);
  const [wantSym, setWantSym] = useState(false);
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ city: "", hospital: "", dept: "" });
  const [doctor, setDoctor] = useState(null);
  const [slot, setSlot] = useState(null);
  const [type, setType] = useState("consult");
  const [picked, setPicked] = useState([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  const facets = docs.data?.facets;
  const hospitals = useMemo(() => (facets?.hospitals || []).filter((h) => !f.city || h.city === f.city), [facets, f.city]);
  const depts = useMemo(() => [...new Set((facets?.departments || []).filter((d) => !f.hospital || d.hospital_id === f.hospital).map((d) => d.name))], [facets, f.hospital]);
  const list = (docs.data?.doctors || []).filter((d) => (!f.city || d.city === f.city) && (!f.hospital || d.hospital_id === f.hospital) && (!f.dept || d.deptname === f.dept));

  async function submit() {
    setBusy(true); setErr("");
    const symptoms = [...picked, note.trim().replace(/,/g, " ")].filter(Boolean).map((x) => x.trim().replace(/\s+/g, "-")).join(",").slice(0, 600);
    const body = { doctor_id: doctor.permanentid, date: slot.date, time: slot.time, type, symptoms, patient_id: patient?.id };
    const { data } = await api(subject?.child ? `patient/children/${subject.id}/book` : "booking/book", { method: "POST", body });
    setBusy(false);
    if (data.status === "booked") onDone(data.appointment_id, { doctor, slot });
    else { setErr(ERR[data.status] || "Could not book the appointment."); if (data.status === "slot_unavailable") { setSlot(null); setStep(1); } }
  }

  return (
    <div className="stack">
      <ol className="stepper">{STEPS.map((s, i) => <li key={s} className={i === step ? "on" : i < step ? "done" : ""}><span>{i < step ? "✓" : i + 1}</span>{s}</li>)}</ol>

      {step === 0 && (<section className="card">
        {subjects?.length > 1 && <label className="field" style={{ marginTop: 0, maxWidth: 360 }}><span>Book appointment for</span>
          <select value={who} onChange={(e) => { setWho(e.target.value); setPicked([]); }}>{subjects.map((x) => <option key={x.id} value={x.id}>{x.child ? `Child — ${x.name} (${x.id})` : `Self — ${x.name}`}</option>)}</select></label>}
        <div className="filters">
          <label className="field"><span>City</span><select value={f.city} onChange={(e) => setF({ city: e.target.value, hospital: "", dept: "" })}><option value="">All cities</option>{(facets?.cities || []).map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="field"><span>Hospital</span><select value={f.hospital} onChange={(e) => setF({ ...f, hospital: e.target.value, dept: "" })}><option value="">All hospitals</option>{hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
          <label className="field"><span>Department</span><select value={f.dept} onChange={(e) => setF({ ...f, dept: e.target.value })}><option value="">All departments</option>{depts.map((d) => <option key={d}>{d}</option>)}</select></label>
        </div>
        {docs.loading ? <Loading /> : docs.error ? <ErrorBox onRetry={docs.reload} /> : list.length === 0 ? <Empty title="No doctors found" text="Try changing the filters." /> : (
          <ul className="list doc-list">{list.map((d) => (
            <li key={d.permanentid}>
              <span className="avatar sm">{initials(d.name)}</span>
              <div className="grow"><b>{d.name}</b><p className="muted">{d.specialization} · {d.qualification}{d.experience ? ` · ${d.experience} yrs` : ""}</p>
                <p className="muted small">{d.deptname} · {d.hospital_name}, {d.city}</p></div>
              <button className="btn primary sm" onClick={() => { setDoctor(d); setSlot(null); setStep(1); }}>Select</button>
            </li>))}</ul>)}
      </section>)}

      {step === 1 && (<section className="card">
        <div className="card-head"><div><h3>{doctor.name}</h3><p className="muted">{doctor.deptname} · {doctor.hospital_name}</p></div><button className="link" onClick={() => setStep(0)}>Change doctor</button></div>
        <SlotPicker doctorId={doctor.permanentid} value={slot} onChange={setSlot} />
        <div className="row"><button className="btn ghost" onClick={() => setStep(0)}>Back</button><button className="btn primary" disabled={!slot} onClick={() => setStep(2)}>Continue</button></div>
      </section>)}

      {step === 2 && (<section className="card">
        <p className="label">Appointment type</p>
        <div className="chips">{[["consult", "New appointment"], ["followup", "Follow-up"]].map(([v, l]) => <button key={v} type="button" className={`chip-btn ${type === v ? "on" : ""}`} onClick={() => setType(v)}>{l}</button>)}</div>
        <label className="check" style={{ marginTop: 18 }}><input type="checkbox" checked={wantSym} onChange={(e) => setWantSym(e.target.checked)} /> <b>I want to select {subject?.child ? "the symptoms" : patient ? "the patient's symptoms" : "my symptoms"}</b></label>
        {wantSym && <div style={{ marginTop: 12 }}><SymptomPicker gender={subject?.gender || patient?.gender} value={picked} onChange={setPicked} /></div>}
        <label className="field"><span>Anything else? <small className="muted">{note.length}/200</small></span><input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Describe how you feel" /></label>

        <div className="summary">
          {(patient || subject) && <div><span>Patient</span><b>{patient ? patient.name : `${subject.name}${subject.child ? ` (${subject.id})` : ""}`}</b></div>}
          <div><span>Doctor</span><b>{doctor.name}</b></div>
          <div><span>Hospital</span><b>{doctor.hospital_name}</b></div>
          <div><span>When</span><b>{fmtDate(slot.date)} · {slot.time}</b></div>
        </div>
        {err && <div className="alert error">{err}</div>}
        <div className="row"><button className="btn ghost" onClick={() => setStep(1)}>Back</button><button className="btn primary" disabled={busy} onClick={submit}>{busy ? <span className="spinner" /> : "Confirm booking"}</button></div>
      </section>)}
    </div>
  );
}
