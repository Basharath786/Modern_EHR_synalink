import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import CancelModal from "../../components/CancelModal";
import RescheduleModal from "../../components/RescheduleModal";
import SlotPicker from "../../components/SlotPicker";
import { APPT, Badge, DateChip, Empty, ErrorBox, Loading, Modal, OPEN_TYPES, PageHead, STATUS_TEXT, Tabs, fmtDate, fmtDateTime, useApi } from "../../components/ui";

const REASONS = ["Unable to attend", "Feeling better", "Booked elsewhere", "Schedule conflict"];
const tone = (s) => ({ accepted: "green", pending: "amber", cancelled: "red" }[s] || "gray");

function Row({ a, child, onCancel, onReschedule, onView }) {
  const [label, t] = APPT[a.appointment_type] || [a.appointment_type, "gray"];
  return (
    <li>
      <DateChip value={a.date_of_booking} />
      <div className="grow">
        <b>Dr. {a.doctor_name}</b>{child && <> <Badge tone="violet">{a.fullname} · {a.permanentid}</Badge></>}
        <p className="muted">{a.deptname} · {a.hospital_name}</p>
        <p className="muted small">{fmtDate(a.date_of_booking)} · {a.time_of_booking} · #{a.appointmentid}{a.symptoms_list?.trim() ? ` · ${a.symptoms_list.replace(/-/g, " ")}` : ""}</p>
        {a.pat_cancel_reason && <p className="muted small">Cancelled ({a.cancelled_by}): {a.pat_cancel_reason}</p>}
      </div>
      <div className="side"><Badge tone={t}>{label}</Badge>
        <div className="row nowrap">
          <button className="btn ghost sm" onClick={() => onView(a)}>View</button>
          {OPEN_TYPES.includes(a.appointment_type) && <button className="btn ghost sm" onClick={() => onReschedule(a)}>Reschedule</button>}
          {OPEN_TYPES.includes(a.appointment_type) && <button className="btn ghost sm" onClick={() => onCancel(a)}>Cancel</button>}
          {["completed", "referral_appointment"].includes(a.appointment_type) && <Link className="btn ghost sm" to={`/app/case-file/${a.appointmentid}`}>Case file</Link>}
        </div></div>
    </li>
  );
}

// Referral tabs (Java listReferralPatientDetails + patientAccept/CancelReferralAppointment + referredAppointmentBooking)
function Referrals({ items, onChanged, childOnly }) {
  const [tab, setTab] = useState("requests");
  const [cancel, setCancel] = useState(null); const [reason, setReason] = useState("");
  const [book, setBook] = useState(null); const [slot, setSlot] = useState(null); const [view, setView] = useState(null); const [msg, setMsg] = useState("");
  const list = items.filter((r) => (childOnly ? r.patient_id.startsWith("CHILD") : !r.patient_id.startsWith("CHILD")));
  const groups = {
    requests: list.filter((r) => r.patient_status === "pending"),
    pending: list.filter((r) => r.patient_status === "accepted" && ["pending", "cancelled"].includes(r.referred_doc_status)),
    accepted: list.filter((r) => r.patient_status === "accepted" && r.referred_doc_status === "accepted"),
    cancelled: list.filter((r) => r.patient_status === "cancelled"),
  };
  async function act(path, body) { const { data } = await api(path, { method: "POST", body }); setMsg(["accepted", "cancelled", "booked"].includes(data.status) ? "" : STATUS_TEXT(data.status, "Could not complete the action.")); return data; }
  const rows = groups[tab];
  return (<>
    <Tabs small items={[["requests", "Referral Requests", groups.requests.length], ["pending", "Referral Doctor Pending", groups.pending.length], ["accepted", "Accepted Referrals", groups.accepted.length], ["cancelled", "Cancelled Referrals", groups.cancelled.length]]} value={tab} onChange={setTab} />
    {msg && <div className="alert error">{msg}</div>}
    {rows.length === 0 ? <Empty title="No referrals" text="Nothing in this list." /> : (
      <div className="table-wrap"><table><thead><tr><th>Appointment</th>{childOnly && <th>Child</th>}<th>Referred by</th><th>Referred to</th><th>Reason</th><th>Status</th><th /></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.apnt_id}>
          <td><b>{r.apnt_id}</b><p className="muted small">{fmtDateTime(r.date_time)}</p></td>{childOnly && <td>{r.patient_name}<p className="muted small">{r.patient_id}</p></td>}
          <td>Dr. {r.referrer_doc_name}<p className="muted small">{r.referrer_hospital_name}</p></td>
          <td>Dr. {r.referred_doc_name}<p className="muted small">{r.referred_doc_id} · {r.referred_hospital_name}</p></td>
          <td className="small" style={{ maxWidth: 240 }}>{r.referral_reason}</td>
          <td><Badge tone={tone(r.patient_status)}>you: {r.patient_status}</Badge><br /><Badge tone={tone(r.referred_doc_status)}>doctor: {r.referred_doc_status}</Badge>
            {r.referred_doc_status === "cancelled" && r.referred_doc_cancel_reason !== "-" && <p className="muted small">{r.referred_doc_cancel_reason}</p>}</td>
          <td className="nowrap"><button className="btn ghost sm" onClick={() => setView(r)}>View</button>
            {tab === "requests" && <><button className="btn primary sm" onClick={async () => { await act(`patient/referrals/${r.apnt_id}/accept`, {}); onChanged(); }}>Accept</button>
              <button className="btn ghost sm" onClick={() => { setCancel(r); setReason(""); }}>Cancel</button></>}
            {tab === "accepted" && <button className="btn primary sm" onClick={() => { setBook(r); setSlot(null); }}>Book appointment</button>}</td></tr>)}</tbody></table></div>)}
    <Modal open={!!cancel} title="Cancel referral appointment" onClose={() => setCancel(null)}>
      <label className="field"><span>Reason <small className="muted">{reason.length}/200</small></span><textarea rows={3} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      <div className="row"><button className="btn ghost" onClick={() => setCancel(null)}>Close</button><button className="btn primary" disabled={!reason.trim()} onClick={async () => { const d = await act(`patient/referrals/${cancel.apnt_id}/cancel`, { reason }); if (d.status === "cancelled") { setCancel(null); onChanged(); } }}>Submit reason</button></div>
    </Modal>
    <Modal open={!!book} title="Book referral appointment" onClose={() => setBook(null)} wide>
      {book && <><p className="muted">With Dr. {book.referred_doc_name} · {book.referred_hospital_name}</p>
        <SlotPicker doctorId={book.referred_doc_id} value={slot} onChange={setSlot} />
        <div className="row"><button className="btn ghost" onClick={() => setBook(null)}>Close</button><button className="btn primary" disabled={!slot} onClick={async () => { const d = await act(`patient/referrals/${book.apnt_id}/book`, slot); if (d.status === "booked") { setBook(null); onChanged(); } }}>Confirm booking</button></div></>}
    </Modal>
    <Modal open={!!view} title="Referral request details" onClose={() => setView(null)} wide>
      {view && <dl className="kv"><div><dt>Appointment ID</dt><dd>{view.apnt_id}</dd></div><div><dt>Patient</dt><dd>{view.patient_name} ({view.patient_id})</dd></div>
        <div><dt>Ref. by doc name</dt><dd>Dr. {view.referrer_doc_name}</dd></div><div><dt>Ref. by hospital name</dt><dd>{view.referrer_hospital_name}</dd></div>
        <div><dt>Ref. to doc ID</dt><dd>{view.referred_doc_id}</dd></div><div><dt>Ref. to doc name</dt><dd>Dr. {view.referred_doc_name} ({view.referred_dept})</dd></div>
        <div><dt>Ref. to hospital ID</dt><dd>{view.referred_hospital_id}</dd></div><div><dt>Ref. to hospital name</dt><dd>{view.referred_hospital_name}</dd></div>
        <div><dt>Symptoms list</dt><dd>{(view.symptoms_list || "—").replace(/-/g, " ")}</dd></div><div><dt>Reason</dt><dd>{view.referral_reason}</dd></div></dl>}
    </Modal>
  </>);
}

// Old patient-appointments.html / child-appointments.html tab layout
export function AppointmentsView({ child }) {
  const { data, loading, error, reload } = useApi(child ? "patient/children/appointments" : "patient/appointments");
  const refs = useApi("patient/referrals");
  const [main, setMain] = useState("upcoming"); const [up, setUp] = useState("consult"); const [rs, setRs] = useState("consult-rescheduled"); const [past, setPast] = useState("completed"); const [refTab, setRefTab] = useState("referrals");
  const [cancel, setCancel] = useState(null); const [resch, setResch] = useState(null); const [view, setView] = useState(null);
  const all = data?.appointments || [];
  const by = (t) => all.filter((a) => a.appointment_type === t);
  const booked = useMemo(() => (refs.data?.booked || []).filter((a) => (child ? a.permanentid.startsWith("CHILD") : !a.permanentid.startsWith("CHILD"))), [refs.data, child]);
  const L = (items) => items.length === 0 ? <Empty title="Nothing here" text="No appointments in this list." /> : (
    <ul className="list cards">{items.map((a) => <Row key={a.appointmentid} a={a} child={child} onView={setView} onCancel={setCancel} onReschedule={setResch} />)}</ul>);
  const reloadAll = () => { reload(); refs.reload(); };
  return (
    <div className="stack">
      <PageHead title={child ? "Child Appointments" : "My Appointments"} subtitle={child ? "Appointments of your children" : "Your consultations and visits"} action={<Link className="btn primary" to="/app/book-appointment">+ Book appointment</Link>} />
      <Tabs items={[["upcoming", "Upcoming"], ["past", "Past"]]} value={main} onChange={setMain} />
      {loading ? <Loading /> : error ? <ErrorBox onRetry={reload} /> : (<>
        {main === "upcoming" && (<>
          <Tabs small items={[["consult", "Direct Consult", by("consult").length], ["rescheduled", "Rescheduled", by("consult-rescheduled").length + by("followup-rescheduled").length + by("referral-rescheduled").length], ["followup", "Follow Up", by("followup").length], ["referral", "Referral"]]} value={up} onChange={setUp} />
          {up === "consult" && L(by("consult"))}
          {up === "followup" && L(by("followup"))}
          {up === "rescheduled" && <><Tabs small items={[["consult-rescheduled", "Consult"], ["followup-rescheduled", "Follow Up"], ["referral-rescheduled", "Referral"]]} value={rs} onChange={setRs} />{L(by(rs))}</>}
          {up === "referral" && <><Tabs small items={[["referrals", "Referral requests"], ["booked", "Referral Booked", booked.length]]} value={refTab} onChange={setRefTab} />
            {refTab === "booked" ? L(booked) : refs.loading && !refs.data ? <Loading /> : <Referrals items={refs.data?.referrals || []} childOnly={child} onChanged={reloadAll} />}</>}
        </>)}
        {main === "past" && <><Tabs small items={[["completed", "Completed", by("completed").length], ["dns", "Did Not Show Up", by("dns").length], ["cancelled", "Cancelled", by("cancelled").length], ["referral_appointment", "Referred", by("referral_appointment").length]]} value={past} onChange={setPast} />{L(by(past))}</>}
      </>)}
      <CancelModal appt={cancel} endpoint={child ? `patient/children/appointments/${cancel?.appointmentid}/cancel` : `patient/appointments/${cancel?.appointmentid}/cancel`} reasons={REASONS} onClose={() => setCancel(null)} onDone={() => { setCancel(null); reload(); }} />
      <RescheduleModal appt={resch} endpoint={child && resch ? `patient/children/appointments/${resch.appointmentid}/reschedule` : undefined} onClose={() => setResch(null)} onDone={() => { setResch(null); reload(); }} />
      <Modal open={!!view} title="Appointment details" onClose={() => setView(null)} wide>
        {view && <dl className="kv"><div><dt>Appointment ID</dt><dd>{view.appointmentid}</dd></div><div><dt>Patient</dt><dd>{view.fullname} ({view.permanentid})</dd></div>
          <div><dt>Doctor</dt><dd>Dr. {view.doctor_name} ({view.doctorid})</dd></div><div><dt>Department</dt><dd>{view.deptname}</dd></div><div><dt>Hospital</dt><dd>{view.hospital_name}</dd></div>
          <div><dt>Date / time</dt><dd>{fmtDate(view.date_of_booking)} · {view.time_of_booking}</dd></div><div><dt>Type</dt><dd>{(APPT[view.appointment_type] || [view.appointment_type])[0]}</dd></div>
          <div><dt>Symptoms</dt><dd>{(view.symptoms_list || "—").replace(/-/g, " ")}</dd></div>{view.rescheduled_by && <div><dt>Rescheduled by</dt><dd>{view.rescheduled_by}</dd></div>}
          {view.pat_cancel_reason && <div><dt>Cancel reason</dt><dd>{view.pat_cancel_reason} ({view.cancelled_by})</dd></div>}<div><dt>Booked on</dt><dd>{fmtDateTime(view.date_time)}</dd></div></dl>}
      </Modal>
    </div>
  );
}

export default function Appointments() { return <AppointmentsView />; }
export function ChildAppointments() { return <AppointmentsView child />; }
