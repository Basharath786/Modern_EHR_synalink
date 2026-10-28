import { useState } from "react";
import { api } from "../../api";
import { Badge, Empty, ErrorBox, Loading, Modal, PageHead, fmtDate, useApi } from "../../components/ui";
import { REACTIONS, SEVERITY } from "../doctor/visit/AssessmentTab";
import { useSubjectTab } from "./Records";

// Same lists as the old patient-add-allergies.html
const NAMES = ["Ants", "Avocado", "Banana", "Bed Bugs", "Bees", "Cats", "Celery", "Cephalosporins", "Chromium", "Cobalt", "Cockroaches", "Cosmetics", "Dairy", "Dilantin",
  "Dimethylaminopropylamine", "Dogs", "Dust", "Dust Mites", "Egg", "Fire Ants", "Fish", "Fleas", "Flies", "Formaldehyde", "Fungicide", "Garlic", "Glyceryl Monothioglycate", "Gold",
  "Grass", "Grassweed", "Hornets", "Hot Peppers", "Intravenous Contrast Dye", "Kiwi", "Latex", "Local Anaesthetics", "Maize", "Mango", "Meat", "Mold", "Mosquitoes", "Mustard",
  "Nickel", "Nsaids", "Oats", "Paraphenylenediamine", "Peanut", "Penicillin", "Perfume", "Photographic Developers", "Pollen", "Red Meat", "Semen", "Shellfish", "Silver", "Soy",
  "Strawberries", "Sulfonamides", "Sulphites", "Tartrazine", "Tegretol", "Tetracycline", "Ticks", "Toluenesulfonamide", "Tomatoes", "Tree Nut"];
const SEV = { mild: "green", "mild to moderate": "green", moderate: "amber", "moderate to severe": "amber", severe: "red", fatal: "red" };
const blank = { allergy_name: "", allergies_severity: "", reasons: [] };

export default function Allergies() {
  const { tabs, q, cur } = useSubjectTab();
  const forId = cur?.child ? cur.id : undefined;
  const { data, loading, error, reload } = useApi(`patient/allergies${q}`);
  const [open, setOpen] = useState(false); const [f, setF] = useState(blank); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const desc = f.reasons.join(",");

  async function add(e) {
    e.preventDefault(); setErr("");
    if (!f.allergy_name || !f.allergies_severity || !f.reasons.length) return setErr("Please fill all the fields.");
    if (desc.length > 50) return setErr("Description is too long (max 50 characters) — select fewer reactions.");
    setBusy(true);
    const { data: r } = await api("patient/allergies/add", { method: "POST", body: { allergy_name: f.allergy_name, allergies_severity: f.allergies_severity, allergies_description: desc, for: forId } });
    setBusy(false);
    if (r.status === "added") { setOpen(false); setF(blank); reload(); } else setErr("Could not save. Check the fields and try again.");
  }
  async function toggle(a) {
    await api("patient/allergies/status", { method: "POST", body: { for: forId, allergy_name: a.allergy_name, allergies_severity: a.allergies_severity, status: a.status?.toUpperCase() === "ACTIVE" ? "inactive" : "active" } });
    reload();
  }
  const sev = (s) => <Badge tone={SEV[(s || "").toLowerCase()] || "gray"}>{s}</Badge>;

  return (
    <div className="stack">
      <PageHead title="Allergies" subtitle="Allergy history and doctor's observation" action={<button className="btn primary" onClick={() => { setOpen(true); setErr(""); }}>+ Add allergy{forId ? " for child" : ""}</button>} />
      {tabs}
      {loading ? <Loading /> : error ? <ErrorBox onRetry={reload} /> : (<>
        <section className="card"><h3>{forId ? "Parent added" : "Patient added"} — allergy history</h3>
          {data.self_reported.length === 0 ? <Empty title="No allergies added" text="Add any allergy your doctors should know about." /> : (
            <ul className="list">{data.self_reported.map((a, i) => (
              <li key={i}><div className="grow"><b>{a.allergy_name}</b><p className="muted">{a.allergies_description || "No description"} · added {fmtDate(a.date_time)}</p></div>
                {sev(a.allergies_severity)}<Badge tone={a.status?.toUpperCase() === "ACTIVE" ? "blue" : "gray"}>{a.status}</Badge>
                <button className="btn ghost sm" onClick={() => toggle(a)}>{a.status?.toUpperCase() === "ACTIVE" ? "Mark inactive" : "Mark active"}</button></li>))}</ul>)}
        </section>
        <section className="card"><h3>Doctor's observation</h3>
          {data.doctor_recorded.length === 0 ? <p className="muted">Nothing recorded yet.</p> : (
            <ul className="list">{data.doctor_recorded.map((a, i) => (
              <li key={i}><div className="grow"><b>{a.allergy_name}</b><p className="muted">{a.allergies_description || "—"} · visit #{a.apnt_id}</p></div>{sev(a.allergies_severity)}<Badge tone="gray">{a.status}</Badge></li>))}</ul>)}
        </section></>)}
      <Modal open={open} title={forId ? `Add allergy — ${cur.name}` : "Add allergy"} onClose={() => setOpen(false)} wide>
        <form onSubmit={add}>
          <div className="two">
            <label className="field"><span>I'm allergic to</span><select value={f.allergy_name} onChange={(e) => setF({ ...f, allergy_name: e.target.value })}><option value="">Select allergy name</option>{NAMES.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label className="field"><span>Select severity</span><select value={f.allergies_severity} onChange={(e) => setF({ ...f, allergies_severity: e.target.value })}><option value="">Select</option>{SEVERITY.map((x) => <option key={x}>{x}</option>)}</select></label>
          </div>
          <p className="label">Select description <span className="muted">({desc.length}/50)</span></p>
          <div className="chips scroll">{REACTIONS.map((r) => <button key={r} type="button" className={`chip-btn ${f.reasons.includes(r) ? "on" : ""}`} onClick={() => setF({ ...f, reasons: f.reasons.includes(r) ? f.reasons.filter((x) => x !== r) : [...f.reasons, r] })}>{r}</button>)}</div>
          {err && <div className="alert error">{err}</div>}
          <div className="row"><button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? <span className="spinner" /> : "Submit"}</button></div>
        </form>
      </Modal>
    </div>
  );
}
