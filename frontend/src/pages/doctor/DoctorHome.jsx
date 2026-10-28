import { Link } from "react-router-dom";
import { useAuth } from "../../auth";
import ApptRow from "../../components/ApptRow";
import { ErrorBox, Loading, useApi } from "../../components/ui";

export default function DoctorHome() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi("doctor/dashboard");
  const h = new Date().getHours(); const greet = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  if (loading) return <Loading />; if (error) return <ErrorBox onRetry={reload} />;
  const t = data.today;
  return (
    <div className="stack">
      <section className="hero-card"><div><p className="eyebrow">{greet}</p><h1>Dr. {user.name}</h1><p className="muted">{t.waiting} patient{t.waiting === 1 ? "" : "s"} waiting today</p></div>
        <dl className="facts"><div><dt>Doctor ID</dt><dd>{user.permanentid}</dd></div><div><dt>Previous login</dt><dd>{user.last_login ? new Date(user.last_login).toLocaleString() : "First sign-in"}</dd></div></dl></section>
      <div className="tiles">
        <Link to="/app/appointments" className="tile blue"><span>Today's appointments</span><b>{t.total}</b></Link>
        <Link to="/app/appointments" className="tile amber"><span>Waiting</span><b>{t.waiting}</b></Link>
        <Link to="/app/appointments" className="tile green"><span>Completed today</span><b>{t.completed}</b></Link>
        <Link to="/app/appointments" className="tile violet"><span>Upcoming</span><b>{data.upcoming}</b></Link>
        <Link to="/app/appointments" className="tile gray"><span>Patients seen (all time)</span><b>{data.patients_seen}</b></Link>
        <Link to="/app/slots" className="tile red"><span>My availability</span><b>View →</b></Link>
      </div>
      <section className="card"><div className="card-head"><h3>Today's queue</h3><Link className="link" to="/app/appointments">All appointments</Link></div>
        {data.queue.length === 0 ? <p className="muted">No patients waiting. 🎉</p> : <ul className="list">{data.queue.map((a) => <ApptRow key={a.appointmentid} a={a} />)}</ul>}</section>
    </div>
  );
}
