import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import { APPT, Badge, ErrorBox, Loading, Modal, PageHead, fmtDate, useApi } from "../../components/ui";

const OPEN = ["consult", "consult-rescheduled", "followup", "followup-rescheduled", "referral", "referral-rescheduled"];
const Block = ({ title, children, empty }) => (<section className="card"><h3>{title}</h3>{children || <p className="muted">{empty}</p>}</section>);

export default function DoctorAppointmentDetail() {
  const { id } = useParams(); const nav = useNavigate();
  const { data, loading, error, reload } = useApi(`doctor/appointments/${id}`);
  const [note, setNote] = useState(""); const [edit, setEdit] = useState(null);
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox onRetry={reload} />;
  const { appointment: a, patient: p } = data; const pr = p.profile; const [label, tone] = APPT[a.appointment_type] || [a.appointment_type, "gray"];
  const child = !!pr.parent_id;
  const hist = child ? [["Past history", "past_history"], ["Drug history", "drug_history"]] : [["Family history", "family_history"], ["Past history", "past_history"], ["Drug history", "drug_history"], ["Social history", "social_history"]];
  const open = OPEN.includes(a.appointment_type);
  async function saveHistory() {
    const { data: r } = await api(`doctor/patients/${a.permanentid}/history`, { method: "POST", body: edit });
    if (r.status === "updated") { setEdit(null); reload(); } else setNote("Could not save history (check the length).");
  }
  return (
    <div className="stack">
      <PageHead title={a.fullname} subtitle={`${a.permanentid} · ${fmtDate(a.date_of_booking)} · ${a.time_of_booking}`}
        action={<div className="row nowrap"><Badge tone={tone}>{label}</Badge>
          <button className="btn primary sm" onClick={() => nav(`/app/visit/${id}`)}>{open ? "Start examination" : "Open examination"}</button>
          {["completed", "referral_appointment"].includes(a.appointment_type) && <button className="btn ghost sm" onClick={() => nav(`/app/case-file/${id}`)}>Case file</button>}
          <button className="btn ghost sm" onClick={() => nav(`/app/patients/${a.permanentid}`)}>Patient history</button>
          <button className="btn ghost sm" onClick={() => nav(-1)}>← Back</button></div>} />
      {note && <div className="alert error">{note}</div>}
      {(<>
        <section className="card"><dl className="kv">
          <div><dt>Age / gender</dt><dd>{pr.age ?? "—"} · {pr.gender || "—"}</dd></div><div><dt>Blood group</dt><dd>{pr.bloodgroup || "—"}</dd></div>
          <div><dt>Date of birth</dt><dd>{fmtDate(pr.dob)}</dd></div><div><dt>Reported symptoms</dt><dd>{a.symptoms_list?.trim() || "—"}</dd></div></dl>
          {child && <div className="chips sel"><Badge tone="violet">Child of {pr.parent_id}</Badge></div>}
          {p.flags.length > 0 && <div className="chips sel">{p.flags.map((f, i) => <Badge key={i} tone="red">⚑ {f.pat_flags}</Badge>)}</div>}</section>
        <div className="two-col">
          <Block title="Allergies" empty="None recorded.">{p.allergies.length > 0 && <ul className="plain">{p.allergies.map((x, i) => <li key={i}><b>{x.allergy_name}</b> <Badge tone={{ severe: "red", moderate: "amber", mild: "green" }[(x.allergies_severity || "").toLowerCase()] || "gray"}>{x.allergies_severity}</Badge> <span className="muted small">{x.status}</span></li>)}</ul>}</Block>
          <Block title="Problems" empty="None recorded.">{p.problems.length > 0 && <ul className="plain">{p.problems.map((x, i) => <li key={i}><b>{x.pat_problems}</b> <Badge tone={x.status === "ACTIVE" ? "amber" : "gray"}>{x.status}</Badge></li>)}</ul>}</Block>
          <Block title="Recent medications" empty="None recorded.">{p.medications.length > 0 && <ul className="plain">{p.medications.map((x, i) => <li key={i}><b>{x.medicine_name}</b> <span className="muted small">{x.medicine_usage} · {x.medicine_duration} · {fmtDate(x.date)}</span></li>)}</ul>}</Block>
          <Block title="Vaccinations" empty="None recorded.">{p.vaccinations.length > 0 && <ul className="plain">{p.vaccinations.map((x, i) => <li key={i}><b>{x.vaccine_name}</b> <span className="muted small">dose {x.dose_no} · {fmtDate(x.vaccination_date)}</span></li>)}</ul>}</Block>
        </div>
        <section className="card"><div className="card-head"><h3>Medical background</h3><button className="btn ghost sm" onClick={() => setEdit(Object.fromEntries(hist.map(([, k]) => [k, pr[k] || ""])))}>Edit</button></div>
          <dl className="kv">{hist.map(([l, k]) => <div key={k}><dt>{l}</dt><dd>{pr[k] || "—"}</dd></div>)}</dl></section>
      </>)}

      <Modal open={!!edit} title="Edit medical background" onClose={() => setEdit(null)}>
        {edit && hist.map(([l, k]) => <label className="field" key={k}><span>{l} <small className="muted">{edit[k].length}/{child ? 200 : 300}</small></span><textarea rows={3} maxLength={child ? 200 : 300} value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></label>)}
        <div className="row"><button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" onClick={saveHistory}>Save</button></div>
      </Modal>
    </div>
  );
}
