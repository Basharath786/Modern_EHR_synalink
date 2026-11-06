import { Link } from "react-router-dom";
import { useAuth } from "../../auth";
import ApptRow from "../../components/ApptRow";
import { ErrorBox, Loading, useApi, N } from "../../components/ui";

export default function ReceptionHome() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi("reception/dashboard");
  if (loading) return <Loading />; if (error) return <ErrorBox onRetry={reload} />;
  const t = data.today;
  return (
    <div className="stack">
      <section className="hero-card"><div><p className="eyebrow">Front desk</p><h1>{user.name}</h1><p className="muted">{data.hospital}</p></div>
        <Link className="btn primary" to="/app/book">+ Book appointment</Link></section>
      <div className="tiles">
        <Link to="/app/appointments" className="tile blue"><span>Today's appointments</span><b><N v={t.total} /></b></Link>
        <Link to="/app/appointments" className="tile amber"><span>Waiting</span><b><N v={t.waiting} /></b></Link>
        <Link to="/app/appointments" className="tile green"><span>Completed</span><b><N v={t.completed} /></b></Link>
        <Link to="/app/appointments" className="tile red"><span>Cancelled today</span><b><N v={t.cancelled} /></b></Link>
        <Link to="/app/appointments" className="tile violet"><span>Upcoming</span><b><N v={data.upcoming} /></b></Link>
        <div className="tile gray"><span>Doctors at this hospital</span><b><N v={data.doctors} /></b></div>
      </div>
      <section className="card"><div className="card-head"><h3>Today at the hospital</h3><Link className="link" to="/app/appointments">View all</Link></div>
        {data.queue.length === 0 ? <p className="muted">No appointments today.</p> : <ul className="list">{data.queue.map((a) => <ApptRow key={a.appointmentid} a={a} />)}</ul>}</section>
    </div>
  );
}
