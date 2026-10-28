import { Link } from "react-router-dom";
import { useAuth } from "../../auth";
import { useEffect } from "react";
import ApptRow from "../../components/ApptRow";
import { Badge, ErrorBox, Loading, useApi } from "../../components/ui";

const Tile = ({ label, value, tone, to }) => (
  <Link to={to} className={`tile ${tone}`}><span>{label}</span><b>{value}</b></Link>
);

export default function PatientHome() {
  const { user, updateUser } = useAuth();
  const { data, loading, error, reload } = useApi("patient/dashboard");
  const today = useApi("patient/today");
  useEffect(() => { if (today.data && today.data.validated !== user.validated) updateUser({ validated: today.data.validated }); }, [today.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const h = new Date().getHours();
  const greet = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  if (loading) return <Loading />;
  if (error) return <ErrorBox onRetry={reload} />;
  const a = data.appointments;
  return (
    <div className="stack">
      <section className="hero-card">
        <div><p className="eyebrow">{greet}</p><h1>{user.name}</h1><p className="muted">Your health, in one place</p></div>
        <dl className="facts">
          <div><dt>Patient ID</dt><dd>{user.permanentid}</dd></div>
          <div><dt>Previous login</dt><dd>{user.last_login ? new Date(user.last_login).toLocaleString() : "First sign-in"}</dd></div>
        </dl>
      </section>

      {user.validated === false && <div className="alert info"><b>Validation pending.</b> Your patient account is active but not validated yet. You can use Dashboard, My Appointments, Book Appointment and My Profile.
        Medical menus will be enabled after validation by a Hospital, Laboratory, Pharmacy or Receptionist.</div>}
      {data.unread_notifications > 0 && (
        <Link to="/app/notifications" className="alert info banner">You have {data.unread_notifications} unread notification{data.unread_notifications > 1 ? "s" : ""} →</Link>
      )}

      <div className="tiles">
        <Tile label="Upcoming appointments" value={a.upcoming} tone="blue" to="/app/appointments" />
        <Tile label="Completed visits" value={a.completed} tone="green" to="/app/appointments" />
        {user.validated !== false && <>
          <Tile label="Active problems" value={data.active_problems} tone="amber" to="/app/problems" />
          <Tile label="Active allergies" value={data.active_allergies} tone="red" to="/app/allergies" />
          <Tile label="Vaccinations" value={data.vaccinations} tone="violet" to="/app/immunisations" />
          <Tile label="Lab orders pending" value={data.pending_lab_orders} tone="gray" to="/app/lab-records" /></>}
        <Tile label="Missed / cancelled" value={`${a.missed} / ${a.cancelled}`} tone="gray" to="/app/appointments" />
      </div>

      <div className="two-col">
        <section className="card"><div className="card-head"><h3>Appointments for today</h3></div>
          {!today.data || today.data.self.length === 0 ? <p className="muted">No appointments today.</p> : <ul className="list">{today.data.self.map((a) => <ApptRow key={a.appointmentid} a={a} who="doctor" />)}</ul>}</section>
        {today.data?.children?.length > 0 && <section className="card"><div className="card-head"><h3>Today's appointments for child</h3><Link className="link" to="/app/child-appointments">View all</Link></div>
          <ul className="list">{today.data.children.map((a) => <ApptRow key={a.appointmentid} a={a} who="doctor" />)}</ul></section>}
      </div>
      <section className="card">
        <div className="card-head"><h3>Next appointments</h3><Link className="link" to="/app/appointments">View all</Link></div>
        {data.next_appointments.length === 0 ? <p className="muted">No upcoming appointments.</p> : (
          <ul className="list">
            {data.next_appointments.map((x) => (
              <li key={x.appointmentid}>
                <div className="date-chip"><b>{new Date(x.date_of_booking).getDate()}</b><span>{new Date(x.date_of_booking).toLocaleString(undefined, { month: "short" })}</span></div>
                <div className="grow"><b>{x.doctor_name}</b><p className="muted">{x.deptname} · {x.hospital_name}</p></div>
                <Badge tone="blue">{x.time_of_booking}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
