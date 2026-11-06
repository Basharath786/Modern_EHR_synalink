import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import { Field } from "../../components/FormKit";
import { Pulse } from "../../components/Icons";
import ThemeToggle from "../../components/ThemeToggle";
import { Empty, Loading } from "../../components/ui";

function TopBar() {
  return (
    <div className="toolbar" style={{ padding: "14px 0" }}>
      <Link to="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}><span className="brand-mark"><Pulse /></span><div><b>Cobalt</b><small>Electronic Health Records</small></div></Link>
      <div className="row" style={{ marginTop: 0 }}>
        <Link className="link" to="/find/doctors">Doctors</Link><Link className="link" to="/find/hospitals">Hospitals</Link>
        <Link className="link" to="/find/labs">Laboratories</Link><Link className="link" to="/find/pharmacies">Pharmacies</Link>
        <ThemeToggle /><Link className="btn ghost" to="/register/patient">Sign up</Link><Link className="btn primary" to="/login">Sign in</Link>
      </div>
    </div>
  );
}

function useCount(target) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (target == null) return undefined;
    let raf; const t0 = performance.now();
    const tick = (t) => { const k = Math.min((t - t0) / 900, 1); setN(Math.round(target * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [target]);
  return n;
}
const Stat = ({ label, value }) => { const n = useCount(value); return <div className="lp-stat"><b>{value == null ? "…" : `${n}+`}</b><span>{label}</span></div>; };
const I = {
  record: <path d="M9 3h6l1 2h3v16H5V5h3l1-2Zm-1 8h8M8 15h5" />, calendar: <path d="M7 3v3m10-3v3M4 8h16M5 5h14v15H5zM9 12h2m2 0h2m-6 4h2" />,
  flask: <path d="M9 3h6M10 3v6L5 19a1.5 1.5 0 0 0 1.3 2h11.4a1.5 1.5 0 0 0 1.3-2L14 9V3M8 14h8" />, shield: <path d="M12 3 5 6v6c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V6l-7-3Zm-3 9 2 2 4-4" />,
  pill: <path d="m8.5 15.5 7-7a3.5 3.5 0 0 0-5-5l-7 7a3.5 3.5 0 0 0 5 5Zm-1.8-8.8 5 5" />, bell: <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2Zm4 4h4" />,
  hospital: <path d="M4 21V7l8-4 8 4v14M9 21v-5h6v5M12 8v4m-2-2h4" />, user: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0" />,
  search: <path d="m21 21-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z" />, arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
};
const Ico = ({ n }) => <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{I[n]}</svg>;

// Legacy index.html (home page) - redesigned
export function Landing() {
  const [s, setS] = useState(null); const [q, setQ] = useState(""); const nav = useNavigate();
  useEffect(() => { api("public/stats").then(({ ok, data }) => ok && setS(data)); }, []);
  const features = [
    ["record", "One lifelong health record", "Case files, prescriptions, lab reports, allergies and immunisations follow the patient to every Cobalt hospital."],
    ["calendar", "Appointments in seconds", "Book, reschedule or cancel with any doctor. Reception books walk-ins against live doctor slots."],
    ["flask", "Labs that report back", "Doctors send tests to affiliated labs; results are uploaded straight into the patient's record."],
    ["pill", "Prescriptions to pharmacies", "Medicines go to the patient's chosen pharmacy, which confirms and delivers the order."],
    ["shield", "Verified & secure", "Every patient, doctor and organisation is validated with government documents. Encrypted credentials and lockout."],
    ["bell", "Always informed", "E-mail and WhatsApp updates for OTPs, approvals, appointments and orders."],
  ];
  const steps = [["Sign up", "Create your patient account with your mobile number and a one-time code."], ["Get validated", "Show your Govt ID at any Cobalt hospital to unlock your full record."],
    ["Book & consult", "Pick a doctor and slot; your visit, reports and medicines are saved automatically."]];
  return (
    <div className="lp">
      <header className="lp-nav">
        <Link to="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}><span className="brand-mark"><Pulse /></span><div><b>Cobalt</b><small>Electronic Health Records</small></div></Link>
        <nav><Link to="/find/doctors">Doctors</Link><Link to="/find/hospitals">Hospitals</Link><Link to="/find/labs">Laboratories</Link><Link to="/find/pharmacies">Pharmacies</Link><Link to="/registration-status">Status</Link></nav>
        <div className="row" style={{ marginTop: 0 }}><ThemeToggle /><Link className="btn ghost" to="/register/patient">Sign up</Link><Link className="btn primary" to="/login">Sign in</Link></div>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-text">
          <span className="lp-chip"><span className="lp-pulse" /> Connected care for patients, hospitals, labs &amp; pharmacies</span>
          <h1>Your health is our <em>only priority.</em></h1>
          <p>One secure health record that travels with you — from booking the appointment to the doctor's notes, lab reports and the medicines at your pharmacy.</p>
          <form className="lp-search" onSubmit={(e) => { e.preventDefault(); nav("/find/doctors", { state: { q } }); }}>
            <Ico n="search" /><input placeholder="Search doctors, specialities or hospitals" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn primary">Find a doctor</button>
          </form>
          <div className="lp-cta"><Link className="btn primary lg" to="/register/patient">Create patient account <Ico n="arrow" /></Link><Link className="btn ghost lg" to="/login">I already have an ID</Link></div>
        </div>
        <div className="lp-hero-art" aria-hidden="true">
          <div className="lp-card main"><div className="lp-card-head"><span className="lp-avatar">MR</span><div><b>Meena Rao</b><small>PAT41970 · Validated</small></div><span className="badge green">Active</span></div>
            <div className="lp-vitals"><div><small>BP</small><b>118/76</b></div><div><small>Pulse</small><b>72</b></div><div><small>SpO₂</small><b>98%</b></div></div>
            <svg viewBox="0 0 300 70" className="lp-ecg"><path d="M0 40h60l12-24 14 46 12-38 10 16h40l12-24 14 46 12-38 10 16h64" fill="none" stroke="url(#g)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><defs><linearGradient id="g"><stop stopColor="#2f5bff" /><stop offset="1" stopColor="#7c3aed" /></linearGradient></defs></svg></div>
          <div className="lp-card float a"><Ico n="calendar" /><div><b>Appointment booked</b><small>Today · 10:30 AM · Cardiology</small></div></div>
          <div className="lp-card float b"><Ico n="flask" /><div><b>Lab report ready</b><small>Thyroid profile · Completed</small></div></div>
          <div className="lp-card float c"><Ico n="pill" /><div><b>Medicines confirmed</b><small>3 items · Ready for pickup</small></div></div>
        </div>
      </section>

      <section className="lp-stats">
        <Stat label="Hospitals" value={s?.hospitals} /><Stat label="Doctors" value={s?.doctors} /><Stat label="Laboratories" value={s?.labs} />
        <Stat label="Pharmacies" value={s?.pharmacies} /><Stat label="Patients" value={s?.patients} />
      </section>

      <section className="lp-section">
        <p className="eyebrow">Why Cobalt</p><h2>Everything a care journey needs, in one place</h2>
        <div className="lp-features">{features.map(([ic, t, d]) => <div key={t} className="lp-feature"><span className="lp-ico"><Ico n={ic} /></span><h3>{t}</h3><p>{d}</p></div>)}</div>
      </section>

      <section className="lp-section lp-steps-wrap">
        <p className="eyebrow">For patients</p><h2>Get started in three steps</h2>
        <div className="lp-steps">{steps.map(([t, d], i) => <div key={t} className="lp-step"><span>{i + 1}</span><h3>{t}</h3><p>{d}</p></div>)}</div>
      </section>

      <section className="lp-section">
        <p className="eyebrow">Join the network</p><h2>Built for every role in healthcare</h2>
        <div className="lp-roles">
          {[["user", "Patients", "/register/patient", "Sign up with your mobile number."], ["hospital", "Hospitals", "/register/hospital", "Register your hospital, departments and staff."],
            ["flask", "Laboratories", "/register/lab", "Receive lab orders and upload reports."], ["pill", "Pharmacies", "/register/pharmacy", "Receive and deliver prescriptions."],
            ["shield", "Internal admins", "/register/internal-admin", "Review and approve organisations."]].map(([ic, t, to, d]) =>
            <Link key={t} to={to} className="lp-role"><span className="lp-ico"><Ico n={ic} /></span><div><b>{t}</b><small>{d}</small></div><Ico n="arrow" /></Link>)}
        </div>
      </section>

      <section className="lp-banner">
        <div><h2>Ready to take charge of your health?</h2><p>Create your free patient account in under two minutes.</p></div>
        <div className="row" style={{ marginTop: 0 }}><Link className="btn lg light" to="/register/patient">Create account</Link><Link className="btn lg outline-light" to="/find/doctors">Browse doctors</Link></div>
      </section>

      <footer className="lp-footer">
        <div className="brand"><span className="brand-mark"><Pulse /></span><div><b>Cobalt EHR</b><small>by MEPSTRA</small></div></div>
        <div className="lp-links"><Link to="/find/doctors">Doctors</Link><Link to="/find/hospitals">Hospitals</Link><Link to="/find/labs">Labs</Link><Link to="/find/pharmacies">Pharmacies</Link>
          <Link to="/registration-status">Registration status</Link><Link to="/set-password">Forgot password</Link><Link to="/super-admin">Super admin</Link></div>
        <small className="muted">© {new Date().getFullYear()} Cobalt EHR. All rights reserved.</small>
      </footer>
    </div>
  );
}

const DIR = {
  doctors: { title: "Doctors", filters: [["state", "State"], ["city", "City"], ["hospital_name", "Hospital"], ["specialization", "Speciality"]],
    card: (x) => <><h3>Dr. {x.name}</h3><p>{x.specialization}{x.qualification ? ` · ${x.qualification}` : ""}</p><p className="muted small">{x.experience} year(s) experience · {x.deptname}</p>
      <p className="small"><b>{x.hospital_name}</b><br />{[x.city, x.state].filter(Boolean).join(", ")}</p></> },
  hospitals: { title: "Hospitals", filters: [["state", "State"], ["city", "City"], ["type", "Type"], ["category", "Private / Govt"]],
    card: (x) => <><h3>{x.name}</h3><p className="muted small">{x.type} · {x.category}{x.beds ? ` · ${x.beds} beds` : ""}</p><p className="small">{x.address}, {x.city}, {x.state} {x.zipcode}</p>
      <p className="small">☎ {x.land_phone || "—"} · {x.email}</p>{x.specialities_list && <p className="muted small">{x.specialities_list.split(",").slice(0, 8).join(", ")}{x.specialities_list.split(",").length > 8 ? "…" : ""}</p>}</> },
  labs: { title: "Laboratories", filters: [["state", "State"], ["city", "City"], ["category", "Private / Govt"]],
    card: (x) => <><h3>{x.name}</h3><p className="muted small">{x.category}</p><p className="small">{x.address}, {x.city}, {x.state} {x.zipcode}</p><p className="small">☎ {x.land_phone || "—"} · {x.email}</p>
      {x.specialities_list && <p className="muted small">{x.specialities_list}</p>}</> },
  pharmacies: { title: "Pharmacies", filters: [["state", "State"], ["city", "City"], ["category", "Type"]],
    card: (x) => <><h3>{x.name}</h3><p className="muted small">{x.category === "Governament" ? "Government" : x.category}</p><p className="small">{x.address}, {x.city}, {x.state} {x.zipcode}</p><p className="small">☎ {x.land_phone || "—"} · {x.email}</p></> },
};

// Legacy doctors-list.html, hospitals-list.html, labs-list.html, pharmacy-list.html
export function PublicDirectory() {
  const { kind } = useParams();
  const cfg = DIR[kind] || DIR.doctors;
  const loc = useLocation();
  const [items, setItems] = useState(null); const [f, setF] = useState({}); const [q, setQ] = useState(loc.state?.q || "");
  useEffect(() => { setItems(null); setF({}); api(`public/directory/${kind}`).then(({ ok, data }) => setItems(ok ? data.items : [])); }, [kind]);
  const opts = useMemo(() => Object.fromEntries(cfg.filters.map(([k]) => [k, [...new Set((items || []).map((x) => x[k]).filter(Boolean))].sort()])), [items, cfg]);
  const list = (items || []).filter((x) => cfg.filters.every(([k]) => !f[k] || x[k] === f[k]) && (!q || JSON.stringify(x).toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="content" style={{ maxWidth: 1180, margin: "0 auto" }}>
      <TopBar />
      <h1>{cfg.title}</h1>
      <div className="filters">
        <Field label="Search"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, speciality, area…" /></Field>
        {cfg.filters.map(([k, l]) => <Field key={k} label={l}><select value={f[k] || ""} onChange={(e) => setF({ ...f, [k]: e.target.value })}><option value="">All</option>{opts[k].map((o) => <option key={o}>{o}</option>)}</select></Field>)}
      </div>
      <p className="muted small">{items ? `${list.length} of ${items.length}` : ""}</p>
      {!items ? <Loading /> : list.length === 0 ? <Empty title={`No ${cfg.title.toLowerCase()} found`} text="Try another filter." /> :
        <div className="grid">{list.map((x) => <div key={x.permanentid} className="card">{cfg.card(x)}</div>)}</div>}
      {kind === "doctors" && <div className="row" style={{ justifyContent: "center", margin: "24px 0" }}><Link className="btn primary" to="/login">Sign in to book an appointment</Link></div>}
    </div>
  );
}

// Legacy profile-status.html + profile-update.html
export function RegistrationStatus() {
  const [id, setId] = useState(""); const [r, setR] = useState(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0); const [code, setCode] = useState(""); const [token, setToken] = useState(""); const [no, setNo] = useState(""); const [file, setFile] = useState(null); const [done, setDone] = useState("");
  const call = async (path, body) => { setErr(""); setBusy(true); const res = await api(path, { method: "POST", body }); if (res.data?.status === "cancelled_by_user") { if (typeof setBusy === "function") setBusy(false); return; } setBusy(false); return res.data; };
  async function check(e) { e?.preventDefault(); setDone(""); setStep(0); const d = await call("public/registration-status", { id }); d.status === "ok" ? setR(d) : (setR(null), setErr(d.message || "Not found.")); }
  async function sendCode() { const d = await call("public/registration-status/code", { id: r.registration.id }); d.status === "code_sent" ? setStep(1) : setErr(d.message || "Could not send the code."); }
  async function verify(e) { e.preventDefault(); const d = await call("public/registration-status/verify", { id: r.registration.id, code });
    if (d.status === "matched") { setToken(d.token); setStep(2); } else setErr({ expired: "Code expired. Send a new one.", "invalid attempts": "Too many attempts. Send a new code.", "not matched": `Incorrect code. ${d.attempts_left} attempt(s) left.` }[d.status] || "Could not verify."); }
  async function upload(e) {
    e.preventDefault(); const fd = new FormData(); fd.append("id", r.registration.id); fd.append("token", token); fd.append("govtidno", no); if (file) fd.append("govtidfile", file);
    const d = await call("public/registration-status/update", fd);
    if (d.status === "updated") { setDone(`Your new ID details were sent for validation. Uploads left: ${d.uploads_left}.`); setStep(0); check(); }
    else setErr(d.errors ? Object.values(d.errors).join(" ") : d.message || "Upload failed.");
  }
  const reg = r?.registration;
  const tone = { VALIDATED: "info", PENDING: "info", HOLD: "error", REJECTED: "error" }[reg?.status] || "info";
  return (
    <div className="content" style={{ maxWidth: 900, margin: "0 auto" }}>
      <TopBar />
      <h1>Registration status</h1>
      <form className="card row" onSubmit={check} style={{ justifyContent: "flex-start" }}>
        <input className="search grow" placeholder="Permanent ID (PAT…) or temporary ID" value={id} onChange={(e) => setId(e.target.value)} />
        <button className="btn primary" disabled={busy || !id.trim()}>Check</button></form>
      {err && <div className="alert error">{err}</div>}{done && <div className="alert info">{done}</div>}
      {reg && <section className="card stack">
        <h3>{reg.name} <span className="muted small">({reg.id})</span></h3>
        <div className={`alert ${tone}`}>{{
          VALIDATED: "Your profile is validated. You have full access to the patient portal.",
          PENDING: "Your profile is under validation. Please visit one of the validation centres below with your Govt ID.",
          HOLD: `Your registration is on hold: ${reg.hold_reason || "details need correction"}.`,
          REJECTED: "Your registration was rejected. Please contact a validation centre." }[reg.status] || reg.status}</div>
        {reg.kind === "temporary" && <p className="muted small">Holds: {reg.holds} · ID uploads used: {reg.uploads} of 3</p>}
        {reg.can_update && step === 0 && <div className="row" style={{ justifyContent: "flex-start" }}><button className="btn primary" disabled={busy} onClick={sendCode}>Update my ID details</button>
          <span className="muted small">A code will be sent to {reg.email}.</span></div>}
        {step === 1 && <form onSubmit={verify} className="row" style={{ justifyContent: "flex-start" }}><input className="search" inputMode="numeric" maxLength={6} placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          <button className="btn primary" disabled={busy || code.length !== 6}>Verify</button><button type="button" className="btn ghost" onClick={sendCode}>Resend</button></form>}
        {step === 2 && <form onSubmit={upload} className="filters">
          <Field label="Aadhaar number *"><input inputMode="numeric" maxLength={12} value={no} onChange={(e) => setNo(e.target.value.replace(/\D/g, ""))} /></Field>
          <Field label="ID proof * (PDF/JPG/PNG ≤ 5 MB)"><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files[0] || null)} /></Field>
          <div className="row"><button className="btn primary" disabled={busy || no.length !== 12 || !file}>Submit</button></div></form>}
        {r.centers.length > 0 && <><p className="label">Validation centres</p>
          <div className="table-wrap"><table><thead><tr><th>Hospital</th><th>Address</th><th>City</th><th>Phone</th></tr></thead>
            <tbody>{r.centers.map((c, i) => <tr key={i}><td>{c.name}</td><td className="small">{c.address}</td><td>{c.city}, {c.state}</td><td>{c.land_phone}</td></tr>)}</tbody></table></div></>}
      </section>}
    </div>
  );
}
