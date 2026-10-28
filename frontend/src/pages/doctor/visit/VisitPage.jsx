import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../../api";
import CaseFile from "../../../components/CaseFile";
import { APPT, Badge, ErrorBox, Loading, Modal, Tabs, fmtDate, useApi } from "../../../components/ui";
import { useLegacy } from "../../../lib/legacyData";
import AssessmentTab from "./AssessmentTab";
import FinalTab from "./FinalTab";
import PlanTab from "./PlanTab";
import SubjectiveTab from "./SubjectiveTab";
import SystemReviewTab from "./SystemReviewTab";
import { historyPayload, historyState } from "./pastHistory";
import { emptyReview, reviewText } from "./reviewModel";
import { buildQuestions, findSymptom, itemsFor, subjectiveText } from "./symptomModel";

const VITALS = [
  ["temperature", "Temperature (°F)", "94 - 109", 5, /[^0-9.]/g], ["respiratory_rate", "Respiratory Rate (/min)", "0 - 40", 2, /[^0-9.]/g],
  ["pulse_rate", "Pulse Rate (/min)", "0 - 220", 3, /[^0-9.]/g], ["height", "Height (Feet)", "5'8", 4, /[^0-9']/g],
  ["weight", "Weight (Kgs)", "0.5 - 442", 5, /[^0-9.]/g], ["blood_pressure", "Blood Pressure (mm/hg)", "120/80", 7, /[^0-9/]/g], ["spo2", "SpO2 (%)", "0 - 100", 3, /[^0-9.]/g],
];
const VITAL_UNIT = { temperature: "F", respiratory_rate: "/min", pulse_rate: "/min", height: "Feet", weight: "Kg", blood_pressure: "mm/hg", spo2: "%" };
const VITAL_LABEL = { temperature: "Temperature", respiratory_rate: "Respiratory Rate", pulse_rate: "Pulse Rate", height: "Height", weight: "Weight", blood_pressure: "Blood Pressure", spo2: "SpO2" };
const ERR = {
  status_required: "Please select appointment status and try again.", invalid_vital: "Please check the vitals", report_exists: "The report for this appointment was already sent.",
  appointment_closed: "This appointment is closed.", invalid_referral: "Choose the referred doctor and enter the reason.", referral_exists: "A referral already exists for this appointment.",
  followup_slot_required: "Choose the follow-up slot.", slot_unavailable: "The follow-up slot was just taken. Choose another.", patient_conflict: "The patient already has an appointment at that follow-up time.",
  invalid_items: "Some entries are invalid or too long.", too_long: "Some sections are too long.",
};
const fresh = (v) => ({
  vitals: {}, subj: {}, custom: {}, review: emptyReview(), flags: [], problems: [], allergies: [], history: historyState(v.summary.history),
  meds: [], labs: [], diagnosis: [], status: "", referral: {}, followup: {}, medsSent: "", labsSent: "",
});

export default function VisitPage() {
  const { id } = useParams(); const nav = useNavigate();
  const { data: v, loading, error, reload } = useApi(`doctor/appointments/${id}/visit`);
  const cat = useLegacy("sympdata"); const auto = useLegacy("autotext"); const sr = useLegacy("sysrev");
  const KEY = `cobalt.visit.${id}`;
  const [state, setStateRaw] = useState(null);
  const [tab, setTab] = useState("vitals");
  const [preview, setPreview] = useState(false); const [review, setReview] = useState(false);
  const [sending, setSending] = useState(false); const [err, setErr] = useState(""); const [done, setDone] = useState(null);

  useEffect(() => {
    if (!v || state) return;
    let saved = null; try { saved = JSON.parse(sessionStorage.getItem(KEY)); } catch { /* none */ }
    setStateRaw(saved && !v.report_sent ? { ...fresh(v), ...saved } : fresh(v));
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const setState = (s) => { setStateRaw(s); try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* full */ } };

  const symptoms = v?.symptoms || [];
  const subjective = useMemo(() => {
    if (!state || !cat.data || !auto.data) return "";
    return subjectiveText(symptoms.map((name) => { const S = findSymptom(cat.data, name); const qs = S ? buildQuestions(cat.data, auto.data, S) : [];
      return { name: S || name, items: state.subj[name] ? itemsFor(qs, state.subj[name]) : [], custom: state.custom[name] || [] }; }));
  }, [state, cat.data, auto.data, symptoms]);
  const sysText = useMemo(() => (state && sr.data ? reviewText(sr.data, state.review) : ""), [state, sr.data]);
  const vitalsText = state ? VITALS.filter(([k]) => (state.vitals[k] || "").trim()).map(([k]) => `${VITAL_LABEL[k]}: ${state.vitals[k].trim()} ${VITAL_UNIT[k]}`).join(",") : "";

  if (loading && !v) return <Loading />;
  if (error && !v) return <ErrorBox onRetry={reload} />;
  if (!state) return <Loading />;
  const a = v.appointment; const p = v.patient; const writable = v.writable;
  const [label, tone] = APPT[a.appointment_type] || [a.appointment_type, "gray"];
  const name = [p.fname, (p.mname || "").trim(), p.lname].filter(Boolean).join(" ") || a.fullname;

  async function saveSymptoms(list) {
    const { data } = await api(`doctor/appointments/${id}/symptoms`, { method: "POST", body: { symptoms: list } });
    if (data.status === "updated") { reload(); return true; }
    setErr(data.status === "too_long" ? "The symptom list is too long (600 characters)." : "Could not update the symptoms."); return false;
  }

  function payload() {
    return {
      status: state.status, vitals: state.vitals, subjective_symptoms: subjective, system_review: sysText, objective_symptoms: "",
      problems: state.problems, flags: state.flags, allergies: state.allergies, diagnosis: state.diagnosis,
      medicines: state.meds.map((m) => ({ ...m, medicine_duration: `${m.medicine_duration} Day(s) ` })), lab_tests: state.labs,
      history: historyPayload(state.history), referral: state.referral, followup: state.followup,
    };
  }
  async function send() {
    setErr("");
    if (!state.status) return setErr(ERR.status_required);
    if (state.status === "referral-request" && (!state.referral.doctor_id || !(state.referral.reason || "").trim())) return setErr(ERR.invalid_referral);
    if (state.status === "followup" && !state.followup.date) return setErr(ERR.followup_slot_required);
    if (!window.confirm("Send the reports? The case file cannot be changed afterwards.")) return;
    setSending(true);
    const { data } = await api(`doctor/appointments/${id}/report`, { method: "POST", body: payload() });
    setSending(false);
    if (data.status === "sent") { sessionStorage.removeItem(KEY); setDone(data); return; }
    setErr(ERR[data.status] ? `${ERR[data.status]}${data.field ? ` (${data.field.replace("_", " ")})` : ""}.` : "Error while sending the reports.");
    if (data.status === "invalid_vital") setTab("vitals");
  }
  const previewReport = {
    ...a, patient: p, patient_id: a.permanentid, apnt_id: a.appointmentid, apnt_details: `${a.date_of_booking} & ${a.time_of_booking}`, doctor_name: `${v.doctor.fname} ${v.doctor.lname}`,
    dept_name: v.doctor.deptname, doctor_qualification: v.doctor.qualification, hospital_name: v.doctor.hospital_name, address: v.doctor.hospital_address, city: v.doctor.hospital_city,
    land_phone: v.doctor.hospital_phone, hospital_email: v.doctor.hospital_email, symptoms: a.symptoms_list, vitals: vitalsText, subjective_symptoms: subjective, system_review: sysText,
    medicine_prescription: state.meds.length ? " " + state.meds.map((m) => `name-${m.medicine_name},quantity-${m.medicine_quantity},duration-${m.medicine_duration} Day(s) ,usage-${m.medicine_usage},instruction-${m.medicine_instructions},repeat_medicine-${m.repeat_medicine},`).join("") : "",
    lab_test_list: state.labs.length ? " " + state.labs.map((l) => `name-${l.lab_test_name},repeat_test-${l.repeat_test},emergency_test-${l.emergency_test},`).join("") : "",
    problems: state.problems.map((x) => `name-${x},`).join(""), provisional_diagnosis: state.problems.map((x) => `name-${x},`).join(""), flags: state.flags.map((x) => `name-${x},`).join(""),
    allergies: state.allergies.map((x) => `name-${x.allergy_name},severity-${x.allergies_severity},description-${x.allergies_description},`).join(""),
    diagnosis: state.diagnosis.map((x) => `${x},`).join(""), case_status: state.status || "—", date_time: new Date().toISOString(), ...Object.fromEntries(Object.entries(historyPayload(state.history)).map(([k, x]) => [k, typeof x === "object" ? JSON.stringify(x) : x])),
  };

  if (done) return (
    <div className="empty"><span className="empty-icon ok">✓</span><h2>Reports sent successfully!</h2>
      <p className="muted">{name} · {a.appointmentid}<br />{done.followup_appointment_id ? `Follow-up appointment ${done.followup_appointment_id} booked.` : done.appointment_type === "referral_appointment" ? "Referral request sent to the patient." : "Appointment completed."}</p>
      <div className="row"><Link className="btn ghost" to={`/app/case-file/${a.appointmentid}`}>View case file</Link><Link className="btn primary" to="/app/appointments">Back to appointments</Link></div></div>);

  return (
    <div className="stack visit">
      <div className="page-head">
        <div><h1>Patient Examination</h1><p className="muted">Appointment {a.appointmentid} · Patient {a.permanentid} · {fmtDate(a.date_of_booking)} {a.time_of_booking}</p></div>
        <div className="row nowrap"><Badge tone={tone}>{label}</Badge>{v.report_sent && <Link className="btn ghost sm" to={`/app/case-file/${a.appointmentid}`}>View case file</Link>}
          <button className="btn ghost sm" onClick={() => setReview(true)}>Review auto text</button><button className="btn ghost sm" onClick={() => nav(-1)}>← Back</button></div>
      </div>
      <section className="card visit-head">
        <div><span>Patient</span><b>{name}</b><small>{p.age ?? "—"} · {p.gender || "—"}{p.bloodgroup ? ` · ${p.bloodgroup}` : ""}{p.parent_id ? ` · child of ${p.parent_id}` : ""}</small></div>
        <div><span>Doctor</span><b>Dr. {v.doctor.fname} {v.doctor.lname}</b><small>{v.doctor.deptname} · {v.doctor.hospital_name}</small></div>
        <div><span>Symptoms</span><b className="small">{symptoms.map((s) => s.replace(/-/g, " ")).join(", ") || "—"}</b></div>
        <div><span>Alerts</span><b className="small">{v.summary.flags.filter((f) => f.status?.toUpperCase() === "ACTIVE").map((f) => "⚑ " + f.name).join(", ") || "No active flags"}</b>
          <small>{[...v.summary.allergies, ...v.summary.patient_allergies].filter((x) => x.status?.toUpperCase() === "ACTIVE").map((x) => x.allergy_name).join(", ") || "No active allergies"}</small></div>
      </section>
      {!writable && <div className="alert info">{v.report_sent ? "The report of this appointment has been sent. The examination is read-only." : "This appointment is closed (cancelled / missed / referred). The examination is read-only."}</div>}
      <Tabs items={[["vitals", "Vitals"], ["subjective", "Subjective Symptoms"], ["review", "System Review"], ["assessment", "Assessment"], ["plan", "Plan / Treatment"], ["final", "Final Review"]]} value={tab} onChange={setTab} />

      {tab === "vitals" && (<section className="card"><h3>Enter Vitals</h3>
        <div className="vitals">{VITALS.map(([k, l, ph, max, strip]) => (
          <label key={k} className="vital"><span>{l}</span><input disabled={!writable} maxLength={max} placeholder={ph} value={state.vitals[k] || ""}
            onChange={(e) => setState({ ...state, vitals: { ...state.vitals, [k]: e.target.value.replace(strip, "") } })} /></label>))}</div>
        <div className="autotext" style={{ marginTop: 16 }}><p className="label tight">Vitals auto text</p><p className="small">{vitalsText.split(",").join(" · ") || "None selected."}</p></div>
      </section>)}
      {tab === "subjective" && (cat.data && auto.data ? <SubjectiveTab v={v} symptoms={symptoms} catalog={cat.data} auto={auto.data} state={state} setState={setState} gender={p.gender} writable={writable} onSaveSymptoms={saveSymptoms} /> : <Loading />)}
      {tab === "review" && <SystemReviewTab data={sr.data} ans={state.review} set={(r) => setState({ ...state, review: r })} gender={p.gender} readOnly={!writable} />}
      {tab === "assessment" && <AssessmentTab v={v} state={state} setState={setState} writable={writable} reload={reload} gender={p.gender} />}
      {tab === "plan" && <PlanTab state={state} setState={setState} writable={writable} />}
      {tab === "final" && <FinalTab v={v} state={state} setState={setState} writable={writable} reload={reload} onPreview={() => setPreview(true)} onSend={send} sending={sending} err={err} />}
      {err && tab !== "final" && <div className="alert error">{err}</div>}

      <Modal open={preview} title="Case File Preview" onClose={() => setPreview(false)} xl><CaseFile r={previewReport} /></Modal>
      <Modal open={review} title="Review Auto Text" onClose={() => setReview(false)} xl>
        <div className="autotext big">
          <p className="label tight">Vitals</p><p>{vitalsText.split(",").join(" · ") || "None selected"}</p>
          <p className="label">Subjective symptoms <span className="muted">— Patient was apparently asymptomatic:</span></p><p>{subjective || "None selected"}</p>
          <p className="label">System review</p><p>{sysText || "None selected"}</p>
          <p className="label">Problems / Flags / Allergies</p><p>{[...state.problems, ...state.flags.map((f) => "⚑ " + f), ...state.allergies.map((x) => `${x.allergy_name} (${x.allergies_severity})`)].join(", ") || "None"}</p>
          <p className="label">Medicines / Lab tests</p><p>{[...state.meds.map((m) => m.medicine_name), ...state.labs.map((l) => l.lab_test_name)].join(", ") || "None"}</p>
        </div>
      </Modal>
    </div>
  );
}
