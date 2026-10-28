import { useEffect, useRef } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { PORTALS, modulesOf } from "../roles";
import { Grid, Key, Logout, Pulse } from "./Icons";
import ThemeToggle from "./ThemeToggle";
import { useApi } from "./ui";

export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const IDLE_MS = 15 * 60 * 1000;   // old portals logged out after 15 idle minutes

// Old doctor sidebar "today's queue" (doctor-login.js renderDoctorSidebarQueue)
function DoctorQueue() {
  const { data } = useApi("doctor/dashboard");
  const nav = useNavigate();
  if (!data) return null;
  return (<>
    <p className="nav-label">Today's queue ({data.queue.length})</p>
    {data.queue.length === 0 ? <p className="muted small" style={{ padding: "0 12px" }}>No patients waiting.</p> : data.queue.map((a) => (
      <button key={a.appointmentid} className="nav-item queue" onClick={() => nav(`/app/visit/${a.appointmentid}`)} title={a.appointmentid}>
        <span className="nav-dot" /> <span className="grow"><b>{a.time_of_booking.split("-")[0]}</b> {a.fullname}</span></button>))}
  </>);
}

export default function Shell() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const portal = PORTALS[user.portal];
  const initials = (user.name || user.permanentid).split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const timer = useRef(null);
  useEffect(() => {
    const reset = () => { clearTimeout(timer.current); timer.current = setTimeout(() => { signOut(); window.location.href = "/login?reason=idle"; }, IDLE_MS); };
    reset(); ["mousemove", "keydown", "click", "touchstart"].forEach((e) => window.addEventListener(e, reset));
    return () => { clearTimeout(timer.current); ["mousemove", "keydown", "click", "touchstart"].forEach((e) => window.removeEventListener(e, reset)); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="shell">
      <aside className="sidebar no-print">
        <div className="brand"><span className="brand-mark"><Pulse /></span><div><b>Cobalt</b><small>{portal.title}</small></div></div>
        <nav>
          <NavLink to="/app" end className="nav-item"><Grid /> Dashboard</NavLink>
          <p className="nav-label">Modules</p>
          {modulesOf(user.portal, user).map(({ name, phase, path }) => (
            <NavLink key={name} to={`/app/${path || slug(name)}`} state={{ name, phase }} className="nav-item">
              <span className="nav-dot" /> {name}{!path && <em className="phase-tag">P{phase}</em>}
            </NavLink>
          ))}
          {user.role === "PATIENT" && user.validated === false && <p className="muted small" style={{ padding: "8px 12px" }}>Medical menus open after a hospital, lab, pharmacy or receptionist validates your Permanent ID.</p>}
          {user.role === "DOCTOR" && <DoctorQueue />}
          <p className="nav-label">Account</p>
          <button className="nav-item" onClick={() => nav("/change-password")}><Key /> Change password</button>
        </nav>
      </aside>
      <div className="main">
        <header className="topbar no-print">
          <div><h2>{portal.title}</h2></div>
          <div className="topbar-right">
            {user.role === "PATIENT" && <NavLink className="btn primary sm" to="/app/book-appointment">Book appointment</NavLink>}
            <ThemeToggle />
            <div className="avatar" title={user.permanentid}>{initials}</div>
            <button className="btn ghost" onClick={() => { signOut(); nav("/login"); }}><Logout /> Sign out</button>
          </div>
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
