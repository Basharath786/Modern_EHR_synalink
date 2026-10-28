import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, openFile } from "../../api";
import { APPT, Badge, Empty, ErrorBox, Loading, PageHead, Tabs, fmtDate, fmtDateTime, useApi } from "../../components/ui";

// Old patient-profile.html + history-files.js: everything about a patient the doctor treats
export default function PatientFiles() {
  const { pid } = useParams(); const nav = useNavigate();
  const { data, loading, error, reload } = useApi(`doctor/patients/${pid}/files`);
  const [tab, setTab] = useState("visits"); const [msg, setMsg] = useState("");
  if (loading) return <Loading />; if (error) return <ErrorBox onRetry={reload} />;
  const p = data.profile; const name = [p.fname, (p.mname || "").trim(), p.lname].filter(Boolean).join(" ");
  const myAppt = data.visits[0]?.appointmentid;
  const file = (kind, q) => openFile(`doctor/patients/${pid}/file/${kind}?${new URLSearchParams(q)}`);
  async function toggle(kind, name, status, severity) {
    if (!myAppt) return;
    const { data: r } = await api(`doctor/appointments/${myAppt}/status`, { method: "POST", body: { kind, name, status: status?.toUpperCase() === "ACTIVE" ? "INACTIVE" : "ACTIVE", severity } });
    setMsg(r.status === "updated" ? "" : "Could not change the status."); reload();
  }
  const groupBy = (rows) => Object.values(rows.reduce((acc, r) => { (acc[r.order_id] = acc[r.order_id] || { ...r, items: [] }).items.push(r); return acc; }, {}));
  const meds = groupBy(data.medications); const labs = groupBy(data.lab_orders);
  const T = ({ head, rows }) => rows.length === 0 ? <Empty title="Nothing recorded" /> : <div className="table-wrap"><table><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows}</tbody></table></div>;
  return (
    <div className="stack">
      <PageHead title={name} subtitle={`${p.permanentid} · ${p.age ?? "—"} · ${p.gender || "—"}${p.bloodgroup ? ` · ${p.bloodgroup}` : ""}${p.parent_id ? ` · child of ${p.parent_id}` : ""}`} action={<button className="btn ghost sm" onClick={() => nav(-1)}>← Back</button>} />
      <section className="card"><dl className="kv">
        <div><dt>Mobile</dt><dd>{p.mobno || "—"}</dd></div><div><dt>Email</dt><dd>{p.email || "—"}</dd></div><div><dt>Date of birth</dt><dd>{fmtDate(p.dob)}</dd></div>
        {!p.parent_id && <><div><dt>Marital</dt><dd>{p.marital || "—"}</dd></div><div><dt>Address</dt><dd>{[p.address, p.city].filter(Boolean).join(", ") || "—"}</dd></div></>}
        <div><dt>Family history</dt><dd>{p.family_history || "—"}</dd></div><div><dt>Past history</dt><dd>{p.past_history || "—"}</dd></div><div><dt>Drug history</dt><dd>{p.drug_history || "—"}</dd></div>
        {!p.parent_id && <div><dt>Social history</dt><dd>{p.social_history || "—"}</dd></div>}</dl></section>
      {msg && <div className="alert error">{msg}</div>}
      <Tabs items={[["visits", "Appointments", data.all_visits.length], ["case", "Case files", data.case_files.length], ["problems", "Problems", data.problems.length], ["flags", "Flags", data.flags.length],
        ["allergies", "Allergies", data.allergies.length + data.patient_allergies.length], ["meds", "Medications", meds.length], ["labs", "Lab tests", labs.length], ["vacc", "Vaccinations", data.vaccinations.length], ["past", "Past reports", data.past_reports.length]]} value={tab} onChange={setTab} />
      {tab === "visits" && <T head={["Appointment", "Date", "Doctor", "Type", ""]} rows={data.all_visits.map((a) => { const [l, t] = APPT[a.appointment_type] || [a.appointment_type, "gray"]; return (
        <tr key={a.appointmentid}><td><b>{a.appointmentid}</b><p className="muted small">{(a.symptoms_list || "").replace(/-/g, " ")}</p></td><td>{fmtDate(a.date_of_booking)} {a.time_of_booking}</td><td>Dr. {a.doctor_name}<p className="muted small">{a.deptname} · {a.hospital_name}</p></td><td><Badge tone={t}>{l}</Badge></td>
          <td>{data.visits.some((x) => x.appointmentid === a.appointmentid) && <Link className="link small" to={`/app/appointments/${a.appointmentid}`}>Open</Link>}</td></tr>); })} />}
      {tab === "case" && <T head={["Appointment", "Doctor", "Status", "Diagnosis", ""]} rows={data.case_files.map((c) => <tr key={c.apnt_id}><td><b>{c.apnt_id}</b><p className="muted small">{c.apnt_details}</p></td><td>Dr. {c.doctor_name}<p className="muted small">{c.deptname} · {c.hospital_name}</p></td><td>{c.case_status}</td><td className="small">{(c.diagnosis || "").replace(/,\s*$/, "") || "—"}</td><td><Link className="btn ghost sm" to={`/app/case-file/${c.apnt_id}`}>Preview</Link></td></tr>)} />}
      {tab === "problems" && <T head={["Problem", "Status", "Visit", ""]} rows={data.problems.map((x, i) => <tr key={i}><td><b>{x.pat_problems}</b></td><td><Badge tone={x.status?.toUpperCase() === "ACTIVE" ? "amber" : "gray"}>{x.status}</Badge></td><td className="small">{x.apnt_id} · {fmtDate(x.date_time)}</td><td>{myAppt && <button className="btn ghost sm" onClick={() => toggle("problem", x.pat_problems, x.status)}>Toggle</button>}</td></tr>)} />}
      {tab === "flags" && <T head={["Flag", "Status", "Visit", ""]} rows={data.flags.map((x, i) => <tr key={i}><td><b>{x.pat_flags}</b></td><td><Badge tone={x.status?.toUpperCase() === "ACTIVE" ? "red" : "gray"}>{x.status}</Badge></td><td className="small">{x.apnt_id} · {fmtDate(x.date_time)}</td><td>{myAppt && <button className="btn ghost sm" onClick={() => toggle("flag", x.pat_flags, x.status)}>Toggle</button>}</td></tr>)} />}
      {tab === "allergies" && (<>
        <h3 className="section-title">Doctor's observation</h3>
        <T head={["Allergy", "Severity", "Description", "Status", ""]} rows={data.allergies.map((x, i) => <tr key={i}><td><b>{x.allergy_name}</b></td><td>{x.allergies_severity}</td><td className="small">{x.allergies_description}</td><td>{x.status}</td><td>{myAppt && <button className="btn ghost sm" onClick={() => toggle("allergy", x.allergy_name, x.status)}>Toggle</button>}</td></tr>)} />
        <h3 className="section-title">Patient added</h3>
        <T head={["Allergy", "Severity", "Description", "Status", ""]} rows={data.patient_allergies.map((x, i) => <tr key={i}><td><b>{x.allergy_name}</b></td><td>{x.allergies_severity}</td><td className="small">{x.allergies_description}</td><td>{x.status}</td><td>{myAppt && <button className="btn ghost sm" onClick={() => toggle("patient_allergy", x.allergy_name, x.status, x.allergies_severity)}>Toggle</button>}</td></tr>)} />
      </>)}
      {tab === "meds" && <T head={["Order", "Pharmacy", "Medicines", "Status", "Ordered"]} rows={meds.map((o) => <tr key={o.order_id}><td><b>#{o.order_id}</b><p className="muted small">{o.apnt_id}</p></td><td>{o.pharmacy_name}</td>
        <td>{o.items.map((m, i) => <p key={i} className="small"><b>{m.medicine_name}</b> × {m.medicine_quantity} · {m.medicine_usage} · {m.medicine_duration} {m.days_left > 0 ? <Badge tone="green">{m.days_left} days left</Badge> : null}</p>)}</td>
        <td>{o.confirmation_status || "PENDING"}</td><td className="small">{fmtDateTime(o.date_time)}</td></tr>)} />}
      {tab === "labs" && <T head={["Order", "Lab", "Tests", "Status", "Report"]} rows={labs.map((o) => <tr key={o.order_id}><td><b>#{o.order_id}</b><p className="muted small">{o.apnt_id}</p></td><td>{o.labname}</td>
        <td>{o.items.map((m, i) => <p key={i} className="small"><b>{m.lab_test_name}</b>{m.emergency_test === "YES" && <> <Badge tone="red">Urgent</Badge></>}{m.repeat_test === "YES" && <> <Badge tone="violet">Repeat</Badge></>}</p>)}</td>
        <td>{o.status}{o.lab_cancel_reason ? <p className="muted small">{o.lab_cancel_reason}</p> : null}</td><td>{o.items.some((m) => m.has_report) ? <button className="btn ghost sm" onClick={() => file("lab-report", { order_id: o.order_id })}>View</button> : "—"}</td></tr>)} />}
      {tab === "vacc" && <T head={["Vaccine", "Dose", "Given", "Added", "File"]} rows={data.vaccinations.map((x, i) => <tr key={i}><td><b>{x.vaccine_name}</b></td><td>{x.dose_no}</td><td>{fmtDate(x.vaccination_date)}</td><td>{fmtDate(x.date)}</td><td>{x.has_file ? <button className="btn ghost sm" onClick={() => file("vaccination", { vaccine_name: x.vaccine_name, dose_no: x.dose_no })}>View</button> : "—"}</td></tr>)} />}
      {tab === "past" && <T head={["File name", "Uploaded", ""]} rows={data.past_reports.map((x, i) => <tr key={i}><td><b>{x.file_name}</b></td><td>{fmtDate(x.date)}</td><td><button className="btn ghost sm" onClick={() => file("past-report", { name: x.file_name })}>View</button></td></tr>)} />}
    </div>
  );
}
