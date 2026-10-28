import { useEffect, useState } from "react";
import { Modal } from "../../../components/ui";
import { PH_FIELDS, historySummary } from "./pastHistory";

// Same tag buttons as the old modal: "None" clears the field; radio groups keep one value.
export default function PastHistoryModal({ open, value, gender, onSave, onClose, title = "Past History" }) {
  const [st, setSt] = useState(value);
  useEffect(() => { if (open) setSt(value); }, [open, value]);
  const female = !String(gender || "").toLowerCase().startsWith("m");

  function toggleList(f, v) {
    const cur = st[f.key] || [];
    if (v === "None") return setSt({ ...st, [f.key]: cur.includes("None") ? [] : ["None"] });
    const base = cur.filter((x) => x !== "None");
    setSt({ ...st, [f.key]: base.includes(v) ? base.filter((x) => x !== v) : [...base, v] });
  }
  function toggleJson(f, g, v) {
    const cur = { ...(st[f.key] || {}) };
    if (g.radio) { if (cur[g.key] === v) delete cur[g.key]; else cur[g.key] = v; }
    else { const arr = Array.isArray(cur[g.key]) ? cur[g.key] : []; const next = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]; if (next.length) cur[g.key] = next; else delete cur[g.key]; }
    setSt({ ...st, [f.key]: cur });
  }
  const isOn = (f, g, v) => (g.radio ? st[f.key]?.[g.key] === v : (st[f.key]?.[g.key] || []).includes(v));

  return (
    <Modal open={open} title={title} onClose={onClose} xl>
      <div className="ph-grid">
        {PH_FIELDS.filter((f) => !f.female || female).map((f) => (
          <section key={f.key} className="ph-card">
            <h4>{f.title}</h4>
            {f.type === "list" ? (
              <div className="chips">{["None", ...f.options].map((o) => {
                const on = (st[f.key] || []).includes(o); const dis = o !== "None" && (st[f.key] || []).includes("None");
                return <button key={o} type="button" disabled={dis} className={`chip-btn ${on ? "on" : ""}`} onClick={() => toggleList(f, o)}>{on ? "✓" : "+"} {o}</button>;
              })}</div>
            ) : (<>
              <div className="chips"><button type="button" className={`chip-btn ${Object.keys(st[f.key] || {}).length === 0 ? "on" : ""}`} onClick={() => setSt({ ...st, [f.key]: {} })}>None</button></div>
              {f.groups.map((g, i) => (<div key={g.title + i}><p className="label tight" style={{ marginTop: 10 }}>{g.title}{g.radio ? "" : " (any)"}</p>
                <div className="chips" style={{ marginTop: 4 }}>{g.options.map((o) => <button key={o} type="button" className={`chip-btn ${isOn(f, g, o) ? "on" : ""}`} onClick={() => toggleJson(f, g, o)}>{isOn(f, g, o) ? "✓" : "+"} {o}</button>)}</div></div>))}
            </>)}
            <p className="muted small" style={{ marginTop: 8 }}><b>Selected:</b> {historySummary(st, f)}</p>
          </section>))}
      </div>
      <div className="row"><button type="button" className="btn ghost" onClick={onClose}>Close</button><button type="button" className="btn primary" onClick={() => onSave(st)}>Save</button></div>
    </Modal>
  );
}
