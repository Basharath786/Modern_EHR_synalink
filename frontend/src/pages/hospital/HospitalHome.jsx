import { Link } from "react-router-dom";
import { useAuth } from "../../auth";
import { APPT, Badge, ErrorBox, Loading, useApi } from "../../components/ui";

// Legacy hospital-portal/index.html + counts.js (listCountDetails, hospitalAppointmentCount, today's list)
export default function HospitalHome() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi("hospital/dashboard");
  if (loading) return <Loading />; if (error) return <ErrorBox onRetry={reload} />;
  const c = data.counts, a = data.appointments;
  return (
    <div className="stack">
      <section className="hero-card"><div><p className="eyebrow">Hospital admin</p><h1>{data.hospital}</h1><p className="muted">{user.permanentid}</p></div>
        <Link className="btn primary" to="/app/book">+ Book appointment</Link></section>
      {(data.pending_staff > 0 || data.pending_affiliations.lab + data.pending_affiliations.pharmacy > 0) && <div className="alert info">
        {data.pending_staff > 0 && <span><b>{data.pending_staff}</b> staff account(s) wait for approval — <Link className="link" to="/app/staff-approval">review</Link>. </span>}
        {data.pending_affiliations.lab + data.pending_affiliations.pharmacy > 0 && <span><b>{data.pending_affiliations.lab + data.pending_affiliations.pharmacy}</b> incoming affiliation request(s) — <Link className="link" to="/app/affiliations">open</Link>.</span>}</div>}
      <div className="tiles">
        <Link to="/app/doctors" className="tile blue"><span>Doctors</span><b>{c.doctors}</b></Link>
        <Link to="/app/nurses" className="tile violet"><span>Nurses</span><b>{c.nurses}</b></Link>
        <Link to="/app/receptionists" className="tile green"><span>Receptionists</span><b>{c.receptionists}</b></Link>
        <Link to="/app/departments" className="tile amber"><span>Departments</span><b>{c.departments}</b></Link>
        <Link to="/app/patient-validation" className="tile red"><span>Patients to validate</span><b>{data.unvalidated_patients}</b></Link>
      </div>
      <section className="card"><div className="card-head"><h3>Appointments</h3><Link className="link" to="/app/appointments">View all</Link></div>
        <div className="tiles">
          {[["consult", "Consult"], ["followup", "Follow up"], ["referral_appointment", "Referral"], ["completed", "Completed"], ["cancelled", "Cancelled"], ["dns", "Did not show"],
            ["consult-rescheduled", "Rescheduled"]].map(([k, l]) => <div key={k} className={`tile ${(APPT[k] || [])[1] || "gray"}`}><span>{l}</span><b>{k === "consult-rescheduled" ? a[k] + a["followup-rescheduled"] + a["referral-rescheduled"] : a[k]}</b></div>)}
        </div></section>
      <section className="card"><div className="card-head"><h3>Today ({data.today.length})</h3></div>
        {data.today.length === 0 ? <p className="muted">No appointments today.</p> :
          <div className="table-wrap"><table><thead><tr><th>Time</th><th>Appointment</th><th>Patient</th><th>Doctor</th><th>Department</th><th>Status</th></tr></thead>
            <tbody>{data.today.map((x) => <tr key={x.appointmentid}><td>{x.time_of_booking}</td><td>{x.appointmentid}</td><td>{x.fullname}<br /><small className="muted">{x.permanentid}</small></td>
              <td>{x.doctor_name}</td><td>{x.deptname}</td><td><Badge tone={(APPT[x.appointment_type] || [])[1]}>{(APPT[x.appointment_type] || [x.appointment_type])[0]}</Badge></td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}
