import { useState } from "react";
import SvgMap, { MODELS, genderKey } from "./SvgMap";
import { Badge, Modal } from "./ui";

// Old "SymptomModal-…" / "selectSymptomModals": the male / female 3D model where the doctor clicks
// the exact site. Each click toggles "Located on <part>" (several parts may be chosen).
// `organ` shows one of the organ drawings instead (renal / female reproductive / breast).
export default function AnatomyModal({ open, title, gender, selected, onChange, onClose, organ }) {
  const [side, setSide] = useState(0);
  const [g, setG] = useState(genderKey(gender));
  const svg = organ ? MODELS.organ[organ] : MODELS.anatomy[g][side];
  const toggle = (p) => onChange(selected.includes(p) ? selected.filter((x) => x !== p) : [...selected, p]);
  return (
    <Modal open={open} title={title || (organ ? "Select area" : `${g === "female" ? "Female" : "Male"} 3D Model`)} onClose={onClose} wide>
      {!organ && <div className="row nowrap spread" style={{ marginTop: 0 }}>
        <div className="tabs small">{[["male", "Male"], ["female", "Female"]].map(([k, l]) => <button key={k} type="button" className={g === k ? "on" : ""} onClick={() => setG(k)}>{l}</button>)}</div>
        <button type="button" className="btn ghost sm" onClick={() => setSide(1 - side)}>⟳ Rotate model ({side ? "back" : "front"})</button></div>}
      <div className="anatomy-wrap"><SvgMap svg={svg} selected={selected} onPick={toggle} className={organ ? "organ" : "anatomy"} /></div>
      <p className="label">Selected sites</p>
      {selected.length === 0 ? <p className="muted small">Click on the model to mark the site.</p> :
        <div className="chips sel">{selected.map((s) => <Badge key={s} tone="blue">Located on {s.toLowerCase()} <button type="button" className="x" onClick={() => toggle(s)}>×</button></Badge>)}</div>}
      <div className="row"><button type="button" className="btn primary" onClick={onClose}>Done</button></div>
    </Modal>
  );
}
