import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Empty, ErrorBox, Loading, Tabs, useApi } from "../../components/ui";
import { Pulse } from "../../components/Icons";
import ThemeToggle from "../../components/ThemeToggle";

const KINDS = [["hospitals", "Hospitals"], ["doctors", "Doctors"], ["labs", "Laboratories"], ["pharmacies", "Pharmacies"]];

// Legacy root hospitals-list / doctors-list / labs-list / pharmacy-list (public, no sign-in needed)
export default function Directory() {
  const { kind = "hospitals" } = useParams(); const nav = useNavigate();
  const { data, loading, error, reload } = useApi(`public/directory/${kind}`);
  const [q, setQ] = useState(""); const [city, setCity] = useState("");
  const items = data?.items || []; const cities = [...new Set(items.map((i) => i.city).filter(Boolean))].sort();
  const list = items.filter((i) => (!city || i.city === city) && (!q.trim() || Object.values(i).join(" ").toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <div className="content" style={{ maxWidth: 1150, margin: "0 auto" }}>
      <div className="toolbar"><Link to="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}><span className="brand-mark"><Pulse /></span><div><b>Cobalt</b><small>Directory</small></div></Link>
        <div className="row" style={{ margin: 0 }}><ThemeToggle /><Link className="btn ghost" to="/login">Sign in</Link></div></div>
      <div className="stack">
        <Tabs items={KINDS.map(([k, l]) => [k, l])} value={kind} onChange={(k) => { nav(`/directory/${k}`); setQ(""); setCity(""); }} />
        <div className="toolbar"><input className="search" placeholder="Search by name, speciality, address…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={city} onChange={(e) => setCity(e.target.value)} style={{ maxWidth: 220 }}><option value="">All cities</option>{cities.map((c) => <option key={c}>{c}</option>)}</select></div>
        {loading && !data ? <Loading /> : error ? <ErrorBox onRetry={reload} /> : list.length === 0 ? <Empty title="Nothing found" text="Try another search." /> : kind === "doctors" ? (
          <div className="grid">{list.map((d) => <div key={d.id} className="module-card"><b>Dr. {d.name}</b><span>{d.specialization}{d.qualification ? ` · ${d.qualification}` : ""}</span>
            <span>{d.hospital_name}{d.city ? `, ${d.city}` : ""}</span>{d.experience ? <span>{d.experience} yrs experience</span> : null}</div>)}</div>
        ) : (
          <div className="table-wrap"><table><thead><tr><th>Name</th><th>Address</th><th>City</th><th>Phone</th><th>Email</th></tr></thead>
            <tbody>{list.map((i) => <tr key={i.id}><td><b>{i.name}</b></td><td>{i.address}</td><td>{[i.city, i.state].filter(Boolean).join(", ")}</td><td>{i.phone}</td><td className="small">{i.email}</td></tr>)}</tbody></table></div>)}
        <p className="muted small">{list.length} of {items.length} shown. Only approved organisations are listed.</p>
      </div>
    </div>
  );
}
