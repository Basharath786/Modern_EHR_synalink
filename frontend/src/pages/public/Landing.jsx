import { Link } from "react-router-dom";
import { Pulse, Shield } from "../../components/Icons";
import ThemeToggle from "../../components/ThemeToggle";
import { useApi } from "../../components/ui";

const Count = ({ n, label }) => <div className="land-stat"><b>{n ?? "—"}</b><span>{label}</span></div>;
const FEATURES = [
  ["For patients", "Book appointments with the right doctor, keep your records, case files, prescriptions and lab reports in one place and approve every change to your profile.", "/register/patient", "Create a patient account"],
  ["For doctors", "A complete consultation workspace: vitals, a 3D body model for symptoms, system review, orders to pharmacies and labs, referrals and case files.", "/login", "Doctor sign in"],
  ["For hospitals", "Register doctors, nurses and receptionists, manage slots and departments, validate patients and affiliate with labs and pharmacies.", "/register/hospital", "Register a hospital"],
  ["For labs & pharmacies", "Receive orders from affiliated hospitals, move them from new to completed, upload reports and keep staff and affiliations under control.", "/register/lab", "Register a laboratory"],
];

// Legacy root index.html ("Your health is our only priority", Why Choose Cobalt, For Patients / For Doctors) — counters are live numbers
export default function Landing() {
  const { data } = useApi("public/stats");
  return (
    <div className="landing">
      <header className="land-top"><Link to="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}><span className="brand-mark"><Pulse /></span><div><b>Cobalt</b><small>Electronic Health Records</small></div></Link>
        <nav className="row" style={{ margin: 0 }}><Link className="link" to="/directory/hospitals">Directory</Link><ThemeToggle /><Link className="btn ghost" to="/register/patient">Sign up</Link><Link className="btn primary" to="/login">Sign in</Link></nav></header>
      <section className="land-hero"><div><p className="eyebrow">Cobalt EHR</p><h1>Your health is our only priority.</h1>
        <p className="muted" style={{ fontSize: "1.1rem", maxWidth: 560 }}>One secure workspace connecting patients, doctors, hospitals, laboratories and pharmacies — so every visit, prescription and report stays together.</p>
        <div className="row" style={{ justifyContent: "flex-start" }}><Link className="btn primary" to="/register/patient">Get started</Link><Link className="btn ghost" to="/directory/doctors">Find a doctor</Link></div>
        <p className="muted small" style={{ marginTop: 18 }}><Shield /> Encrypted credentials · OTP sign-in for patients · role-based access</p></div>
        <div className="land-stats"><Count n={data?.doctors} label="Doctors" /><Count n={data?.hospitals} label="Hospitals" /><Count n={data?.labs} label="Laboratories" /><Count n={data?.pharmacies} label="Pharmacies" /><Count n={data?.patients} label="Patients" /></div></section>
      <section className="land-grid"><h2 className="section-title">Why choose Cobalt</h2>
        <div className="grid">{FEATURES.map(([t, d, to, cta]) => <div key={t} className="module-card"><b>{t}</b><span style={{ lineHeight: 1.5 }}>{d}</span><Link className="link" to={to}>{cta} →</Link></div>)}</div></section>
      <footer className="land-foot"><span>© Cobalt EHR</span><span><Link className="link" to="/directory/hospitals">Hospitals</Link> · <Link className="link" to="/directory/labs">Labs</Link> · <Link className="link" to="/directory/pharmacies">Pharmacies</Link> · <Link className="link" to="/register/internal-admin">Admin sign-up</Link> · <Link className="link" to="/profile-update">Temporary patient?</Link></span></footer>
    </div>
  );
}
