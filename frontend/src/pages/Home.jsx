import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { PORTALS, modulesOf } from "../roles";
import { slug } from "../components/Shell";
import PatientHome from "./patient/PatientHome";
import DoctorHome from "./doctor/DoctorHome";
import ReceptionHome from "./reception/ReceptionHome";
import HospitalHome from "./hospital/HospitalHome";
import { AdminHome } from "./admin/AdminPages";

const PHASES = [["Foundation & login", true], ["Patient (core)", true], ["Doctor + Reception (core)", true], ["Hospital + Admins", true], ["Lab + Pharmacy", false], ["Integrations", false]];

export default function Home() {
  const { user } = useAuth();
  if (user.role === "PATIENT") return <PatientHome />;
  if (user.role === "DOCTOR") return <DoctorHome />;
  if (user.role === "RECEPTIONIST") return <ReceptionHome />;
  if (user.role === "HOSPITAL") return <HospitalHome />;
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return <AdminHome />;
  const portal = PORTALS[user.portal];
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const last = user.last_login ? new Date(user.last_login).toLocaleString() : "First sign-in";

  return (
    <div className="stack">
      <section className="hero-card">
        <div>
          <p className="eyebrow">{greet}</p>
          <h1>{user.name}</h1>
          <p className="muted">Signed in to the {portal.title}</p>
        </div>
        <dl className="facts">
          <div><dt>User ID</dt><dd>{user.permanentid}</dd></div>
          <div><dt>Role</dt><dd>{user.role.replace("_", " ")}</dd></div>
          <div><dt>Previous login</dt><dd>{last}</dd></div>
        </dl>
      </section>

      <section className="card">
        <div className="card-head"><h3>Conversion progress</h3><span className="pill">Phase 4 complete</span></div>
        <ol className="steps">
          {PHASES.map(([name, done], i) => (
            <li key={name} className={done ? "done" : ""}><span>{done ? "✓" : i + 1}</span>{name}</li>
          ))}
        </ol>
      </section>

      <section>
        <h3 className="section-title">Your modules</h3>
        <div className="grid">
          {modulesOf(user.portal).map(({ name, phase }) => (
            <Link key={name} to={`/app/${slug(name)}`} state={{ name, phase }} className="module-card">
              <b>{name}</b><span>Arrives in Phase {phase}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
