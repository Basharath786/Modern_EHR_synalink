import { useState } from "react";
import { api } from "../../api";
import SlotPicker from "../../components/SlotPicker";
import TypeAhead from "../../components/TypeAhead";
import { Badge, ErrorBox, Loading, Modal, fmtDate, useApi } from "../../components/ui";

const MSG = { invalid_items: "Please check the entries (some are missing or too long).", invalid_pharmacy: "Choose a pharmacy affiliated with your hospital.", invalid_lab: "Choose a lab affiliated with your hospital.",
  appointment_closed: "This appointment is closed (cancelled or missed).", slot_unavailable: "That slot was just taken.", patient_conflict: "The patient already has an appointment then.", child_not_supported: "Follow-ups for children arrive with the Children module." };
const DAYS = { "Day(s)": 1, "Week(s)": 7, "Month(s)": 30 };

function Section({ title, hint, children }) { return <section className="card"><div className="card-head"><div><h3>{title}</h3>{hint && <p className="muted small">{hint}</p>}</div></div>{children}</section>; }
function Chips({ items, onRemove, tone = "blue" }) { return items.length ? <div className="chips sel">{items.map((s) => <Badge key={s} tone={tone}>{s} <button className="x" onClick={() => onRemove(s)} aria-label={`Remove ${s}`}>×</button></Badge>)}</div> : null; }
const Result = ({ r }) => r && <div className={`alert ${r.ok ? "info" : "error"}`}>{r.text}</div>;

export default function Consultation({ id, onChanged }) {
  const { data, loading, error, reload } = useApi(`doctor/appointments/${id}/consultation`);
  const meds = useApi("doctor/loadouts/medicines"); const labs = useApi("doctor/loadouts/labs");
  if (loading && !data) return <Loading />; if (error && !data) return <ErrorBox onRetry={reload} />;   // keep showing data while refreshing
  const closed = !["consult", "consult-rescheduled", "followup", "referral", "referral_appointment", "completed"].includes(data.appointment.appointment_type);
  const done = () => { reload(); onChanged?.(); };
  return (
    <div className="stack">
      {closed && <div className="alert error">This appointment is {data.appointment.appointment_type}. Records can no longer be added.</div>}
      <ProblemsFlags id={id} data={data} done={done} disabled={closed} />
      <Allergies id={id} data={data} done={done} disabled={closed} />
      <Prescription id={id} data={data} loadouts={meds} done={done} disabled={closed} />
      <LabOrder id={id} data={data} loadouts={labs} done={done} disabled={closed} />
      <FollowUp id={id} done={done} disabled={closed} />
    </div>
  );
}

function ProblemsFlags({ id, data, done, disabled }) {
  const [problems, setProblems] = useState([]); const [flags, setFlags] = useState([]); const [r, setR] = useState(null);
  const add = (list, set) => (v) => !list.includes(v) && set([...list, v]);
  async function save(kind, list, set) {
    const { data: d } = await api(`doctor/appointments/${id}/${kind}`, { method: "POST", body: { [kind]: list } });
    setR(d.status === "added" ? { ok: true, text: d.added ? `Saved ${d.added} new ${kind}${d.skipped_duplicates ? ` (${d.skipped_duplicates} were already active)` : ""}.` : "Nothing new to save: already active for this patient." } : { ok: false, text: MSG[d.status] || "Could not save." });
    if (d.status === "added") { set([]); done(); }
  }
  const toggle = async (kind, name, status) => { await api(`doctor/appointments/${id}/status`, { method: "POST", body: { kind, name, status } }); done(); };
  const rowsOf = (items, kind, key) => items.length === 0 ? <p className="muted small">None recorded in this visit.</p> : (
    <ul className="plain">{items.map((x, i) => <li key={i} className="inline"><b>{x[key]}</b> <Badge tone={x.status?.toUpperCase() === "ACTIVE" ? "amber" : "gray"}>{x.status}</Badge>
      {!disabled && <button className="link small" onClick={() => toggle(kind, x[key], x.status?.toUpperCase() === "ACTIVE" ? "inactive" : "active")}>{x.status?.toUpperCase() === "ACTIVE" ? "Mark inactive" : "Mark active"}</button>}</li>)}</ul>);
  return (
    <div className="two-col">
      <Section title="Problems" hint="Search diagnoses (ICD list) or press Enter to add your own">
        {!disabled && <><TypeAhead endpoint="doctor/catalog/problems" placeholder="e.g. cholera, fever…" onPick={add(problems, setProblems)} />
          <Chips items={problems} onRemove={(s) => setProblems(problems.filter((x) => x !== s))} />
          {problems.length > 0 && <div className="row"><button className="btn primary sm" onClick={() => save("problems", problems, setProblems)}>Save {problems.length} problem{problems.length > 1 ? "s" : ""}</button></div>}</>}
        {rowsOf(data.problems, "problem", "pat_problems")}<Result r={r} />
      </Section>
      <Section title="Flags" hint="Alerts that appear on the patient's chart">
        {!disabled && <><TypeAhead endpoint="doctor/catalog/flags" placeholder="e.g. weight gain…" onPick={add(flags, setFlags)} />
          <Chips items={flags} tone="red" onRemove={(s) => setFlags(flags.filter((x) => x !== s))} />
          {flags.length > 0 && <div className="row"><button className="btn primary sm" onClick={() => save("flags", flags, setFlags)}>Save {flags.length} flag{flags.length > 1 ? "s" : ""}</button></div>}</>}
        {rowsOf(data.flags, "flag", "pat_flags")}
      </Section>
    </div>
  );
}

function Allergies({ id, data, done, disabled }) {
  const cat = useApi("doctor/catalog/allergies?q=aa");
  const [list, setList] = useState([]); const [sev, setSev] = useState("Mild"); const [reaction, setReaction] = useState(""); const [r, setR] = useState(null);
  async function save() {
    const { data: d } = await api(`doctor/appointments/${id}/allergies`, { method: "POST", body: { allergies: list } });
    setR(d.status === "added" ? { ok: true, text: "Allergies saved." } : { ok: false, text: MSG[d.status] || "Could not save." });
    if (d.status === "added") { setList([]); done(); }
  }
  return (
    <Section title="Allergies" hint="Recorded against this visit">
      {!disabled && <><div className="filters">
        <div><p className="label tight">Allergen</p><TypeAhead endpoint="doctor/catalog/allergies" placeholder="Search allergen…" onPick={(name) => setList([...list, { allergy_name: name, allergies_severity: sev, allergies_description: reaction }])} /></div>
        <label className="field"><span>Severity</span><select value={sev} onChange={(e) => setSev(e.target.value)}><option>Mild</option><option>Moderate</option><option>Severe</option></select></label>
        <label className="field"><span>Reaction</span><select value={reaction} onChange={(e) => setReaction(e.target.value)}><option value="">—</option>{(cat.data?.reactions || []).map((x) => <option key={x}>{x}</option>)}</select></label></div>
        <Chips items={list.map((a) => `${a.allergy_name} · ${a.allergies_severity}${a.allergies_description ? " · " + a.allergies_description : ""}`)} tone="red" onRemove={(s) => setList(list.filter((a) => !s.startsWith(a.allergy_name + " ·")))} />
        {list.length > 0 && <div className="row"><button className="btn primary sm" onClick={save}>Save {list.length}</button></div>}</>}
      {data.allergies.length === 0 ? <p className="muted small">None recorded in this visit.</p> : <ul className="plain">{data.allergies.map((a, i) => <li key={i}><b>{a.allergy_name}</b> <Badge tone={{ severe: "red", moderate: "amber", mild: "green" }[a.allergies_severity?.toLowerCase()] || "gray"}>{a.allergies_severity}</Badge> <span className="muted small">{a.allergies_description}</span></li>)}</ul>}
      <Result r={r} />
    </Section>
  );
}

const blankMed = (name) => ({ medicine_name: name, medicine_quantity: 1, amount: 3, unit: "Day(s)", medicine_usage: "Morning", medicine_instructions: "After Meals", repeat_medicine: false });

function Prescription({ id, data, loadouts, done, disabled }) {
  const o = data.options; const [pharm, setPharm] = useState(o.pharmacies[0]?.id || ""); const [items, setItems] = useState([]); const [r, setR] = useState(null); const [saveAs, setSaveAs] = useState(false); const [ln, setLn] = useState("");
  const upd = (i, k, v) => setItems(items.map((m, j) => (j === i ? { ...m, [k]: v } : m)));
  const payload = () => items.map((m) => ({ medicine_name: m.medicine_name, medicine_quantity: Number(m.medicine_quantity), medicine_duration: `${m.amount} ${m.unit}`, medicine_usage: m.medicine_usage,
    medicine_instructions: m.medicine_instructions, repeat_medicine: m.repeat_medicine ? "YES" : "NO", number_of_days: Number(m.amount) * DAYS[m.unit] }));
  async function send() {
    const { data: d } = await api(`doctor/appointments/${id}/prescription`, { method: "POST", body: { pharmacy_id: pharm, medicines: payload() } });
    setR(d.status === "ordered" ? { ok: true, text: `Order #${d.order_id} sent to ${d.pharmacy} (${d.items} medicine${d.items > 1 ? "s" : ""}).` } : { ok: false, text: MSG[d.status] || "Could not send the order." });
    if (d.status === "ordered") { setItems([]); done(); }
  }
  async function saveLoadout() {
    const { data: d } = await api("doctor/loadouts/medicines", { method: "POST", body: { loadout_name: ln, problem_name: "", items: items.map((m) => m.medicine_name) } });
    if (d.status === "saved") { setSaveAs(false); setLn(""); loadouts.reload(); }
  }
  return (
    <Section title="Prescription" hint="Medicines are sent as an order to a pharmacy affiliated with your hospital">
      {!disabled && <>
        <div className="filters">
          <label className="field"><span>Pharmacy</span><select value={pharm} onChange={(e) => setPharm(e.target.value)}>{o.pharmacies.length === 0 && <option value="">No affiliated pharmacy</option>}{o.pharmacies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="field"><span>Apply a saved loadout</span><select value="" onChange={(e) => { const l = loadouts.data?.loadouts[e.target.value]; if (l) setItems([...items, ...l.items.map(blankMed)]); }}>
            <option value="">Choose…</option>{(loadouts.data?.loadouts || []).map((l, i) => <option key={i} value={i}>{l.loadout_name}{l.problem_name ? ` — ${l.problem_name.slice(0, 30)}` : ""}</option>)}</select></label></div>
        <TypeAhead endpoint="doctor/catalog/medicines" placeholder="Search medicine to add…" allowCustom={false} onPick={(n) => setItems([...items, blankMed(n)])} />
        {items.length > 0 && <div className="table-wrap tight"><table className="rx"><thead><tr><th>Medicine</th><th>Qty</th><th>For</th><th>When</th><th>Instructions</th><th>Repeat</th><th /></tr></thead>
          <tbody>{items.map((m, i) => (<tr key={i}><td><b>{m.medicine_name}</b></td>
            <td><input type="number" min="1" max="999" value={m.medicine_quantity} onChange={(e) => upd(i, "medicine_quantity", e.target.value)} /></td>
            <td className="nowrap"><input type="number" min="1" max="365" value={m.amount} onChange={(e) => upd(i, "amount", e.target.value)} /> <select value={m.unit} onChange={(e) => upd(i, "unit", e.target.value)}>{o.units.map((u) => <option key={u}>{u}</option>)}</select></td>
            <td><select value={m.medicine_usage} onChange={(e) => upd(i, "medicine_usage", e.target.value)}>{o.usage.map((u) => <option key={u}>{u}</option>)}</select></td>
            <td><select value={m.medicine_instructions} onChange={(e) => upd(i, "medicine_instructions", e.target.value)}>{o.instructions.map((u) => <option key={u}>{u}</option>)}</select></td>
            <td><input type="checkbox" checked={m.repeat_medicine} onChange={(e) => upd(i, "repeat_medicine", e.target.checked)} /></td>
            <td><button className="link" onClick={() => setItems(items.filter((_, j) => j !== i))}>Remove</button></td></tr>))}</tbody></table></div>}
        {items.length > 0 && <div className="row"><button className="btn ghost sm" onClick={() => setSaveAs(true)}>Save as loadout</button><button className="btn primary" disabled={!pharm} onClick={send}>Send order to pharmacy</button></div>}</>}
      <Result r={r} />
      {data.prescriptions.length > 0 && <><p className="label">Orders from this visit</p>{data.prescriptions.map((p) => (
        <div key={p.order_id} className="order"><div className="card-head"><b>Order #{p.order_id} · {p.pharmacy_name}</b><Badge tone={p.confirmation_status === "COMPLETED" ? "green" : "amber"}>{p.confirmation_status}</Badge></div>
          <ul className="plain">{p.items.map((m, i) => <li key={i}><b>{m.medicine_name}</b> × {m.medicine_quantity} <span className="muted small">{m.medicine_usage} · {m.medicine_instructions} · {m.medicine_duration}{m.repeat_medicine === "YES" ? " · repeat" : ""}</span></li>)}</ul></div>))}</>}
      <Modal open={saveAs} title="Save loadout" onClose={() => setSaveAs(false)}><label className="field"><span>Loadout name</span><input maxLength={45} value={ln} onChange={(e) => setLn(e.target.value)} /></label>
        <div className="row"><button className="btn ghost" onClick={() => setSaveAs(false)}>Cancel</button><button className="btn primary" disabled={!ln.trim()} onClick={saveLoadout}>Save</button></div></Modal>
    </Section>
  );
}

function LabOrder({ id, data, loadouts, done, disabled }) {
  const o = data.options; const [lab, setLab] = useState(o.labs[0]?.id || ""); const [tests, setTests] = useState([]); const [r, setR] = useState(null);
  const upd = (i, k, v) => setTests(tests.map((t, j) => (j === i ? { ...t, [k]: v } : t)));
  async function send() {
    const { data: d } = await api(`doctor/appointments/${id}/lab-order`, { method: "POST", body: { lab_id: lab, tests: tests.map((t) => ({ lab_test_name: t.name, repeat_test: t.repeat ? "YES" : "NO", emergency_test: t.urgent ? "YES" : "NO" })) } });
    setR(d.status === "ordered" ? { ok: true, text: `Order #${d.order_id} sent to ${d.lab} (${d.items} test${d.items > 1 ? "s" : ""}).` } : { ok: false, text: MSG[d.status] || "Could not send the order." });
    if (d.status === "ordered") { setTests([]); done(); }
  }
  const add = (n) => !tests.some((t) => t.name === n) && setTests([...tests, { name: n, repeat: false, urgent: false }]);
  return (
    <Section title="Lab tests" hint="Tests are sent as an order to a lab affiliated with your hospital">
      {!disabled && <>
        <div className="filters">
          <label className="field"><span>Lab</span><select value={lab} onChange={(e) => setLab(e.target.value)}>{o.labs.length === 0 && <option value="">No affiliated lab</option>}{o.labs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <label className="field"><span>Apply a saved loadout</span><select value="" onChange={(e) => { const l = loadouts.data?.loadouts[e.target.value]; if (l) l.items.forEach(add); }}>
            <option value="">Choose…</option>{(loadouts.data?.loadouts || []).map((l, i) => <option key={i} value={i}>{l.loadout_name}{l.problem_name ? ` — ${l.problem_name.slice(0, 30)}` : ""}</option>)}</select></label></div>
        <TypeAhead endpoint="doctor/catalog/lab-tests" placeholder="Search test to add…" allowCustom={false} onPick={add} />
        {tests.length > 0 && <ul className="plain">{tests.map((t, i) => (<li key={t.name} className="inline"><b>{t.name}</b>
          <label className="check"><input type="checkbox" checked={t.urgent} onChange={(e) => upd(i, "urgent", e.target.checked)} /> Urgent</label>
          <label className="check"><input type="checkbox" checked={t.repeat} onChange={(e) => upd(i, "repeat", e.target.checked)} /> Repeat</label>
          <button className="link" onClick={() => setTests(tests.filter((_, j) => j !== i))}>Remove</button></li>))}</ul>}
        {tests.length > 0 && <div className="row"><button className="btn primary" disabled={!lab} onClick={send}>Send order to lab</button></div>}</>}
      <Result r={r} />
      {data.lab_orders.length > 0 && <><p className="label">Orders from this visit</p>{data.lab_orders.map((l) => (
        <div key={l.order_id} className="order"><div className="card-head"><b>Order #{l.order_id} · {l.labname}</b><Badge tone={{ COMPLETED: "green", PROCESSING: "blue" }[l.status] || "amber"}>{l.status}</Badge></div>
          <ul className="plain">{l.items.map((t, i) => <li key={i}><b>{t.lab_test_name}</b> {t.emergency_test === "YES" && <Badge tone="red">Urgent</Badge>} {t.repeat_test === "YES" && <Badge tone="violet">Repeat</Badge>}</li>)}</ul></div>))}</>}
    </Section>
  );
}

function FollowUp({ id, done, disabled }) {
  const [slot, setSlot] = useState(null); const [r, setR] = useState(null); const [busy, setBusy] = useState(false);
  async function book() {
    setBusy(true); const { data: d } = await api(`doctor/appointments/${id}/followup`, { method: "POST", body: slot }); setBusy(false);
    setR(d.status === "booked" ? { ok: true, text: `Follow-up booked for ${fmtDate(slot.date)}, ${slot.time} (#${d.appointment_id}).` } : { ok: false, text: MSG[d.status] || "Could not book the follow-up." });
    if (d.status === "booked") { setSlot(null); done(); }
  }
  return (
    <Section title="Follow-up" hint="Book the patient's next visit with you">
      {disabled ? <p className="muted small">Not available for closed appointments.</p> : <><SlotPicker endpoint="doctor/slots" value={slot} onChange={setSlot} />
        <div className="row"><button className="btn primary" disabled={!slot || busy} onClick={book}>{busy ? <span className="spinner" /> : "Book follow-up"}</button></div></>}
      <Result r={r} />
    </Section>
  );
}
