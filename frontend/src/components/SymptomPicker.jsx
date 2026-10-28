import { useMemo, useState } from "react";
import SvgMap, { MODELS, genderKey } from "./SvgMap";
import { Badge, Loading, useApi } from "./ui";

// Old "Select Symptoms Here" box (patient booking, reception booking and the doctor's
// "Add Symptoms" modal): click a body part on the human model (or pick it from the list,
// or press General), tick the symptoms of that part, they go to the selected list.
export default function SymptomPicker({ gender, value, onChange, max = 600 }) {
  const sym = useApi("booking/symptoms");
  const [g, setG] = useState(genderKey(gender));
  const [side, setSide] = useState(0);
  const [part, setPart] = useState("");
  const [q, setQ] = useState("");
  const parts = useMemo(() => Object.keys(sym.data?.symptoms || {}).sort(), [sym.data]);
  const list = (sym.data?.symptoms?.[part] || []).filter((s) => !q || s.toLowerCase().includes(q.toLowerCase()));
  const toggle = (s) => {
    const next = value.includes(s) ? value.filter((x) => x !== s) : [...value, s];
    if (next.join(",").length <= max) onChange(next);
  };
  const pick = (name) => { const hit = parts.find((p) => p.toLowerCase() === name.toLowerCase()); if (hit) { setPart(hit); setQ(""); } };
  if (sym.loading) return <Loading />;
  return (
    <div className="sympick">
      <div className="sympick-model">
        <div className="row nowrap spread">
          <div className="tabs small">{[["male", "Male"], ["female", "Female"]].map(([k, l]) => <button key={k} type="button" className={g === k ? "on" : ""} onClick={() => setG(k)}>{l}</button>)}</div>
          <div className="row nowrap">
            <button type="button" className="btn ghost sm" onClick={() => pick("General")}>General</button>
            <button type="button" className="btn ghost sm" onClick={() => setSide(1 - side)}>⟳ Rotate ({side ? "back" : "front"})</button>
          </div>
        </div>
        <SvgMap svg={MODELS.body[g][side]} selected={part ? [part] : []} onPick={pick} className="body" />
      </div>
      <div className="sympick-list">
        <label className="field"><span>Body part</span>
          <select value={part} onChange={(e) => { setPart(e.target.value); setQ(""); }}><option value="">Select body part…</option>{parts.map((p) => <option key={p}>{p}</option>)}</select></label>
        {part ? (<>
          <input className="search" style={{ marginTop: 12, width: "100%" }} placeholder={`Filter ${part} symptoms…`} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="chips scroll">{list.map((s) => <button key={s} type="button" className={`chip-btn ${value.includes(s) ? "on" : ""}`} onClick={() => toggle(s)}>{value.includes(s) ? "✓ " : "+ "}{s}</button>)}</div>
        </>) : <p className="muted small" style={{ marginTop: 12 }}>Click a body part on the model, choose it from the list, or press <b>General</b>.</p>}
        <p className="label">Selected symptoms ({value.length})</p>
        {value.length === 0 ? <p className="muted small">None yet.</p> : (
          <div className="chips sel">{value.map((s) => <Badge key={s} tone="blue">{s} <button type="button" className="x" onClick={() => toggle(s)} aria-label={`Remove ${s}`}>×</button></Badge>)}</div>)}
      </div>
    </div>
  );
}
