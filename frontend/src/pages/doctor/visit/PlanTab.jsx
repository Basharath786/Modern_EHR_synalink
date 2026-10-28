import { useEffect, useState } from "react";
import { api } from "../../../api";
import TypeAhead from "../../../components/TypeAhead";
import { Badge, Modal, Tabs } from "../../../components/ui";

const USAGE = ["Morning", "Afternoon", "Evening", "SOS"];
const INSTR = ["Before Meals", "After Meals"];
const blankMed = { medicine_name: "", medicine_quantity: "", days: "", usage: [], instr: [], repeat: false };
const blankLab = { lab_test_name: "", emergency: false, repeat: false };

// Loadouts are saved per problem ("Universal" = no problem), like the old fetch/send/delete Loadout APIs
function Loadouts({ kind, problems, onApply, current, readOnly }) {
  const [problem, setProblem] = useState("");
  const [list, setList] = useState([]); const [name, setName] = useState(""); const [msg, setMsg] = useState(""); const [view, setView] = useState(null);
  const load = async () => { const { data } = await api(`doctor/loadouts/${kind}?problem=${encodeURIComponent(problem)}`); setList(data.loadouts || []); };
  useEffect(() => { load(); }, [problem]); // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    setMsg("");
    const { data } = await api(`doctor/loadouts/${kind}`, { method: "POST", body: { loadout_name: name.trim(), problem_name: problem, items: current } });
    if (data.status === "saved") { setName(""); load(); setMsg("Loadout saved."); }
    else setMsg(data.status === "duplicate_name" ? `A loadout named "${name}" already exists.` : "Could not save the loadout (name max 45, items max 200 characters).");
  }
  async function del(l) {
    if (!window.confirm(`Delete loadout "${l.loadout_name}"?`)) return;
    await api(`doctor/loadouts/${kind}/delete`, { method: "POST", body: { loadout_name: l.loadout_name, problem_name: l.problem_name || "" } }); load();
  }
  return (
    <div className="loadouts">
      <p className="label tight">Problems list</p>
      <Tabs small items={[["", "Universal"], ...problems.map((p) => [p, p.length > 40 ? p.slice(0, 40) + "…" : p])]} value={problem} onChange={setProblem} />
      <div className="lo-grid">{list.length === 0 ? <p className="muted small">No loadouts for {problem || "Universal"}.</p> : list.map((l) => (
        <div key={l.loadout_name} className="lo-card"><b>{l.loadout_name}</b><p className="muted small">{l.problem_name || "Universal"}</p>
          <ul>{l.items.slice(0, 4).map((x) => <li key={x}>{x}</li>)}{l.items.length > 4 && <li className="muted">+{l.items.length - 4} more</li>}</ul>
          <div className="row nowrap" style={{ marginTop: 6 }}><button className="btn ghost sm" onClick={() => setView(l)}>View</button>{!readOnly && <button className="btn primary sm" onClick={() => onApply(l.items)}>Use</button>}
            {!readOnly && <button className="link small" onClick={() => del(l)}>Delete</button>}</div></div>))}</div>
      {!readOnly && <div className="row nowrap" style={{ marginTop: 10 }}><input className="search grow" maxLength={45} value={name} onChange={(e) => setName(e.target.value)} placeholder={`Loadout name (for ${problem || "Universal"})`} />
        <button className="btn ghost sm" disabled={!name.trim() || !current.length} onClick={save}>Add loadout</button></div>}
      {msg && <p className="small muted">{msg}</p>}
      <Modal open={!!view} title={`Loadout: ${view?.loadout_name}`} onClose={() => setView(null)}>
        <p className="muted">Problem name: {view?.problem_name || "Universal"}</p><ul className="plain">{(view?.items || []).map((x) => <li key={x}>{x}</li>)}</ul>
        <div className="row"><button className="btn ghost" onClick={() => setView(null)}>Close</button>{!readOnly && <button className="btn primary" onClick={() => { onApply(view.items); setView(null); }}>Add to order</button>}</div>
      </Modal>
    </div>
  );
}

export default function PlanTab({ state, setState, writable }) {
  const [tab, setTab] = useState("meds");
  const [m, setM] = useState(blankMed); const [l, setL] = useState(blankLab);
  const [msg, setMsg] = useState(""); const [inter, setInter] = useState(null);
  const tog = (arr, x) => (arr.includes(x) ? arr.filter((y) => y !== x) : [...arr, x]);

  function addMed() {
    const qty = parseInt(m.medicine_quantity, 10); const days = parseInt(m.days, 10);
    if (!m.medicine_name.trim()) return setMsg("Please search and select a medicine.");
    if (!(qty >= 1 && qty <= 999)) return setMsg("Please enter the quantity (1-999).");
    if (!(days >= 1 && days <= 365)) return setMsg("Please enter the duration in days (1-365).");
    if (!m.usage.length) return setMsg("Please select the usage.");
    if (state.meds.some((x) => x.medicine_name.toLowerCase() === m.medicine_name.trim().toLowerCase())) return setMsg("This medicine is already in the order.");
    setMsg("");
    setState({ ...state, meds: [...state.meds, { medicine_name: m.medicine_name.trim().slice(0, 50), medicine_quantity: String(qty), medicine_duration: String(days),
      medicine_usage: USAGE.filter((u) => m.usage.includes(u)).join(", "), medicine_instructions: INSTR.filter((u) => m.instr.includes(u)).join(", "), repeat_medicine: m.repeat ? "YES" : "NO" }] });
    setM(blankMed);
  }
  function addLab() {
    if (!l.lab_test_name.trim()) return setMsg("Please search and select a lab test.");
    if (state.labs.some((x) => x.lab_test_name.toLowerCase() === l.lab_test_name.trim().toLowerCase())) return setMsg("This test is already in the order.");
    setMsg("");
    setState({ ...state, labs: [...state.labs, { lab_test_name: l.lab_test_name.trim().slice(0, 40), emergency_test: l.emergency ? "YES" : "NO", repeat_test: l.repeat ? "YES" : "NO" }] });
    setL(blankLab);
  }
  // A loadout only holds names: the doctor completes quantity / duration / usage afterwards (old "Use loadout")
  const applyMeds = (items) => setState({ ...state, meds: [...state.meds, ...items.filter((n) => !state.meds.some((x) => x.medicine_name === n)).map((n) => ({ medicine_name: n, medicine_quantity: "1", medicine_duration: "1", medicine_usage: "Morning", medicine_instructions: "", repeat_medicine: "NO" }))] });
  const applyLabs = (items) => setState({ ...state, labs: [...state.labs, ...items.filter((n) => !state.labs.some((x) => x.lab_test_name === n)).map((n) => ({ lab_test_name: n.slice(0, 40), emergency_test: "NO", repeat_test: "NO" }))] });
  const editMed = (i, patch) => setState({ ...state, meds: state.meds.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  async function check() {
    const { data } = await api("doctor/drug-interactions", { method: "POST", body: { medicine_names: state.meds.map((x) => x.medicine_name) } });
    setInter(data.interactions || []);
  }

  return (
    <div className="stack">
      <Tabs items={[["meds", `Add Medicines (${state.meds.length})`], ["labs", `Add Lab Tests (${state.labs.length})`]]} value={tab} onChange={setTab} />
      {msg && <div className="alert error">{msg}</div>}
      {tab === "meds" && (<>
        {writable && <section className="card">
          <h3>Add Medicines</h3>
          <div className="med-form">
            <div className="grow"><TypeAhead key={"m" + state.meds.length} endpoint="doctor/catalog/medicines" placeholder="Search medicine" clearOnPick={false} allowCustom={false} onPick={(x) => setM({ ...m, medicine_name: x })} />
              {m.medicine_name && <p className="small" style={{ marginTop: 6 }}>Selected: <b>{m.medicine_name}</b></p>}</div>
            <input className="search narrow" inputMode="numeric" placeholder="Quantity" value={m.medicine_quantity} onChange={(e) => setM({ ...m, medicine_quantity: e.target.value.replace(/\D/g, "").replace(/^0/, "").slice(0, 3) })} />
            <input className="search narrow" inputMode="numeric" placeholder="Duration (days)" value={m.days} onChange={(e) => setM({ ...m, days: e.target.value.replace(/\D/g, "").replace(/^0/, "").slice(0, 3) })} />
          </div>
          <div className="two-col" style={{ marginTop: 12 }}>
            <div><p className="label tight">Usage</p><div className="chips" style={{ marginTop: 4 }}>{USAGE.map((u) => <button key={u} type="button" className={`chip-btn ${m.usage.includes(u) ? "on" : ""}`} onClick={() => setM({ ...m, usage: tog(m.usage, u) })}>{u}</button>)}</div></div>
            <div><p className="label tight">Instructions</p><div className="chips" style={{ marginTop: 4 }}>{INSTR.map((u) => <button key={u} type="button" className={`chip-btn ${m.instr.includes(u) ? "on" : ""}`} onClick={() => setM({ ...m, instr: tog(m.instr, u) })}>{u}</button>)}
              <label className="check" style={{ marginLeft: 10 }}><input type="checkbox" checked={m.repeat} onChange={(e) => setM({ ...m, repeat: e.target.checked })} /> Repeat medicine</label></div></div>
          </div>
          <div className="row"><button className="btn primary sm" onClick={addMed}>Add to order</button></div>
        </section>}
        <section className="card">
          <div className="card-head"><h3>Review Order</h3>{state.meds.length > 1 && <button className="btn ghost sm" onClick={check}>Check drug interactions</button>}</div>
          {state.meds.length === 0 ? <p className="muted">No medicines added.</p> : (
            <div className="table-wrap tight"><table className="rx"><thead><tr><th>Medicine</th><th>Qty</th><th>Days</th><th>Usage</th><th>Instructions</th><th>Repeat</th><th /></tr></thead>
              <tbody>{state.meds.map((x, i) => <tr key={i}><td><b>{x.medicine_name}</b></td>
                <td>{writable ? <input type="number" min="1" max="999" value={x.medicine_quantity} onChange={(e) => editMed(i, { medicine_quantity: e.target.value.slice(0, 3) })} /> : x.medicine_quantity}</td>
                <td>{writable ? <input type="number" min="1" max="365" value={x.medicine_duration} onChange={(e) => editMed(i, { medicine_duration: e.target.value.slice(0, 3) })} /> : x.medicine_duration}</td>
                <td className="small">{x.medicine_usage}</td><td className="small">{x.medicine_instructions || "—"}</td><td>{x.repeat_medicine}</td>
                <td>{writable && <button className="link small" onClick={() => setState({ ...state, meds: state.meds.filter((_, j) => j !== i) })}>Remove</button>}</td></tr>)}</tbody></table></div>)}
          <Loadouts kind="medicines" problems={state.problems} current={state.meds.map((x) => x.medicine_name)} onApply={applyMeds} readOnly={!writable} />
        </section>
      </>)}
      {tab === "labs" && (<>
        {writable && <section className="card">
          <h3>Add Lab Tests</h3>
          <TypeAhead key={"l" + state.labs.length} endpoint="doctor/catalog/lab-tests" placeholder="Search lab test" clearOnPick={false} allowCustom={false} onPick={(x) => setL({ ...l, lab_test_name: x })} />
          {l.lab_test_name && <p className="small" style={{ marginTop: 6 }}>Selected: <b>{l.lab_test_name}</b></p>}
          <div className="chips"><label className="check"><input type="checkbox" checked={l.emergency} onChange={(e) => setL({ ...l, emergency: e.target.checked })} /> Emergency</label>
            <label className="check"><input type="checkbox" checked={l.repeat} onChange={(e) => setL({ ...l, repeat: e.target.checked })} /> Repeat lab test</label></div>
          <div className="row"><button className="btn primary sm" onClick={addLab}>Add to order</button></div>
        </section>}
        <section className="card"><h3>Review Order</h3>
          {state.labs.length === 0 ? <p className="muted">No lab tests added.</p> : (
            <div className="table-wrap tight"><table className="rx"><thead><tr><th>Lab test</th><th>Emergency</th><th>Repeat</th><th /></tr></thead>
              <tbody>{state.labs.map((x, i) => <tr key={i}><td><b>{x.lab_test_name}</b></td><td>{x.emergency_test === "YES" ? <Badge tone="red">YES</Badge> : "NO"}</td><td>{x.repeat_test}</td>
                <td>{writable && <button className="link small" onClick={() => setState({ ...state, labs: state.labs.filter((_, j) => j !== i) })}>Remove</button>}</td></tr>)}</tbody></table></div>)}
          <Loadouts kind="labs" problems={state.problems} current={state.labs.map((x) => x.lab_test_name)} onApply={applyLabs} readOnly={!writable} />
        </section>
      </>)}
      <Modal open={!!inter} title="Drug interactions" onClose={() => setInter(null)} wide>
        {inter && (inter.length === 0 ? <div className="alert info">No interactions found between the selected medicines.</div> : (
          <table className="rx"><thead><tr><th>Primary drug</th><th>Secondary drug</th><th>Severity</th><th>Pregnancy contraindicated</th></tr></thead>
            <tbody>{inter.map((x, i) => <tr key={i}><td>{x.PrimaryDrug}</td><td>{x.SecondaryDrug}</td><td><Badge tone={/major/i.test(x.Severity) ? "red" : /moderate/i.test(x.Severity) ? "amber" : "gray"}>{x.Severity}</Badge></td><td>{x.PregnancyContraindicated}</td></tr>)}</tbody></table>))}
        <div className="row"><button className="btn primary" onClick={() => setInter(null)}>OK</button></div>
      </Modal>
    </div>
  );
}
