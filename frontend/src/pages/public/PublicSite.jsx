import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
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

// Legacy index.html (home page)
export function Landing() {
  const [s, setS] = useState(null);
  useEffect(() => { api("public/stats").then(({ ok, data }) => ok && setS(data)); }, []);
  const features = [
    ["One health record", "Case files, prescriptions, lab reports, allergies and immunisations follow the patient across every Cobalt hospital."],
    ["Book in seconds", "Patients book, reschedule and cancel appointments with any doctor; reception books for walk-ins."],
    ["Connected labs & pharmacies", "Doctors send lab tests and medicines straight to affiliated labs and pharmacies; reports come back to the patient."],
    ["Verified identities", "Every patient, doctor and organisation is validated with government documents before getting access."],
  ];
  return (
    <div className="content" style={{ maxWidth: 1180, margin: "0 auto" }}>
      <TopBar />
      <section className="hero-card" style={{ padding: "48px 36px" }}>
        <div><p className="eyebrow">Cobalt EHR</p><h1 style={{ fontSize: 40 }}>Your health is our only priority.</h1>
          <p className="muted" style={{ maxWidth: 560 }}>A single, secure health record for patients, hospitals, doctors, laboratories and pharmacies.</p>
          <div className="row" style={{ justifyContent: "flex-start" }}><Link className="btn primary" to="/register/patient">Create patient account</Link>
            <Link className="btn ghost" to="/find/doctors">Find a doctor</Link><Link className="btn ghost" to="/registration-status">Check registration status</Link></div></div>
      </section>
      <div className="tiles" style={{ marginTop: 20 }}>
        {[["Hospitals", "hospitals", "blue"], ["Doctors", "doctors", "violet"], ["Laboratories", "labs", "green"], ["Pharmacies", "pharmacies", "amber"]].map(([l, k, t]) =>
          <Link key={k} to={`/find/${k}`} className={`tile ${t}`}><span>{l}</span><b>{s ? s[k] : "…"}</b></Link>)}
        <div className="tile red"><span>Registered patients</span><b>{s ? s.patients : "…"}</b></div>
      </div>
      <h2 style={{ marginTop: 32 }}>Why choose Cobalt</h2>
      <div className="grid">{features.map(([t, d]) => <div key={t} className="card"><h3>{t}</h3><p className="muted">{d}</p></div>)}</div>
      <h2 style={{ marginTop: 32 }}>Join Cobalt</h2>
      <div className="grid">
        {[["Patients", "/register/patient", "Sign up with your mobile number."], ["Hospitals", "/register/hospital", "Register your hospital and staff."],
          ["Laboratories", "/register/lab", "Receive lab orders from affiliated hospitals."], ["Pharmacies", "/register/pharmacy", "Receive prescriptions from affiliated hospitals."],
          ["Internal admins", "/register/internal-admin", "Review and approve organisations."]].map(([t, to, d]) =>
          <Link key={t} to={to} className="module-card"><b>{t}</b><span className="muted small">{d}</span></Link>)}
      </div>
      <p className="muted small" style={{ textAlign: "center", margin: "36px 0" }}>© Cobalt EHR · MEPSTRA</p>
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
  const [items, setItems] = useState(null); const [f, setF] = useState({}); const [q, setQ] = useState("");
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
  const call = async (path, body) => { setErr(""); setBusy(true); const res = await api(path, { method: "POST", body }); setBusy(false); return res.data; };
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
