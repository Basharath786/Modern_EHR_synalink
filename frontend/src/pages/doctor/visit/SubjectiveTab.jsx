import { useMemo, useState } from "react";
import AnatomyModal from "../../../components/AnatomyModal";
import SymptomPicker from "../../../components/SymptomPicker";
import { Badge, Empty, Modal } from "../../../components/ui";
import { buildQuestions, emptyAnswers, findSymptom, itemsFor } from "./symptomModel";

function OptionInput({ o, group, ans, set, gender, readOnly }) {
  const [model, setModel] = useState(false);
  const upd = (patch) => set({ ...ans, ...patch });
  if (o.input === "radio") {
    const on = ans.radio[group] === o.id;
    return <button type="button" disabled={readOnly} className={`opt ${on ? "on" : ""}`} onClick={() => upd({ radio: { ...ans.radio, [group]: on ? undefined : o.id } })}>{o.label}</button>;
  }
  if (o.input === "check") {
    const on = !!ans.check[o.id];
    return <button type="button" disabled={readOnly} className={`opt ${on ? "on" : ""}`} onClick={() => upd({ check: { ...ans.check, [o.id]: !on } })}>{on ? "✓ " : ""}{o.label}</button>;
  }
  if (o.input === "model") {
    const picked = ans.model[o.id] || [];
    return (<>
      <button type="button" disabled={readOnly} className={`opt model ${picked.length ? "on" : ""}`} onClick={() => setModel(true)}>🧍 {picked.length ? `${picked.length} site(s)` : o.label}</button>
      {model && <AnatomyModal open gender={gender} selected={picked} onChange={(p) => upd({ model: { ...ans.model, [o.id]: p } })} onClose={() => setModel(false)} />}
    </>);
  }
  const type = o.input === "date" ? "date" : o.input === "text" ? "text" : "number";
  return <input className="opt-input" disabled={readOnly} type={type} min={o.min ?? (type === "number" ? 0 : undefined)} max={o.max} maxLength={o.input === "duration" ? 2 : 80}
    placeholder={o.label} value={ans.value[o.id] || ""}
    onChange={(e) => upd({ value: { ...ans.value, [o.id]: o.input === "duration" ? e.target.value.replace(/\D/g, "").slice(0, 2) : e.target.value } })} />;
}

export function SymptomQuestions({ questions, ans, set, gender, readOnly }) {
  return (
    <div className="qgrid">
      {questions.map((q) => (
        <div key={q.key} className="qcard">
          <h5>{q.title}</h5>
          <div className="opts">
            {q.options.map((o) => o.input === "sub" ? (
              <button key={o.id} type="button" disabled={readOnly} className={`opt ${ans.radio[q.group] === o.id ? "on" : ""}`}
                onClick={() => set({ ...ans, radio: { ...ans.radio, [q.group]: ans.radio[q.group] === o.id ? undefined : o.id } })}>{o.label} ▾</button>
            ) : <OptionInput key={o.id} o={o} group={q.group} ans={ans} set={set} gender={gender} readOnly={readOnly} />)}
          </div>
          {q.options.filter((o) => o.input === "sub" && ans.radio[q.group] === o.id).map((o) => (
            <div key={o.id} className="subq">
              <p className="muted small">{q.title} › {o.label} — options</p>
              {o.sub.map((s) => (<div key={s.key} className="subq-row"><b>{s.title}</b>
                <div className="opts">{s.options.map((so) => <OptionInput key={so.id} o={so} group={s.group} ans={ans} set={set} gender={gender} readOnly={readOnly} />)}</div></div>))}
            </div>))}
        </div>))}
    </div>
  );
}

export default function SubjectiveTab({ v, symptoms, catalog, auto, state, setState, gender, writable, onSaveSymptoms }) {
  const [active, setActive] = useState(null);
  const [adding, setAdding] = useState(false); const [addList, setAddList] = useState([]);
  const [removing, setRemoving] = useState(false); const [rmList, setRmList] = useState([]);
  const [customText, setCustomText] = useState("");
  const cur = active && symptoms.includes(active) ? active : symptoms[0];
  const S = useMemo(() => findSymptom(catalog, cur), [catalog, cur]);
  const questions = useMemo(() => (S ? buildQuestions(catalog, auto, S) : []), [catalog, auto, S]);
  const ans = state.subj[cur] || emptyAnswers();
  const custom = state.custom[cur] || [];
  const setAns = (a) => setState({ ...state, subj: { ...state.subj, [cur]: a } });
  const setCustom = (c) => setState({ ...state, custom: { ...state.custom, [cur]: c } });
  const items = S ? itemsFor(questions, ans) : [];

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head"><div><h3>Select Symptoms</h3><p className="muted small">Symptoms reported for this appointment. Answer the questions of each symptom.</p></div>
          {writable && <div className="row nowrap"><button className="btn ghost sm" onClick={() => { setAddList([]); setAdding(true); }}>+ Add symptoms</button>
            <button className="btn ghost sm" disabled={!symptoms.length} onClick={() => { setRmList([]); setRemoving(true); }}>Remove symptoms</button></div>}</div>
        {symptoms.length === 0 ? <Empty title="No symptoms" text="Add the patient's symptoms with the human model." /> :
          <div className="chips">{symptoms.map((s) => {
            const done = (state.subj[s] && itemsFor(buildQuestions(catalog, auto, findSymptom(catalog, s) || "") || [], state.subj[s]).length) || (state.custom[s] || []).length;
            return <button key={s} className={`chip-btn ${s === cur ? "on" : ""}`} onClick={() => setActive(s)}>{done ? "● " : ""}{s.replace(/-/g, " ")}</button>;
          })}</div>}
      </section>

      {cur && (<section className="card">
        <div className="card-head"><h3>{cur.replace(/-/g, " ")}</h3>{!S && <Badge tone="amber">No question set for this symptom</Badge>}</div>
        {S && <SymptomQuestions questions={questions} ans={ans} set={setAns} gender={gender} readOnly={!writable} />}
        <div className="two-col" style={{ marginTop: 16 }}>
          <div>
            <p className="label tight">Custom descriptions</p>
            {writable && <div className="row nowrap" style={{ marginTop: 0 }}><input className="search grow" maxLength={200} value={customText} onChange={(e) => setCustomText(e.target.value)} placeholder="Custom description…"
              onKeyDown={(e) => { if (e.key === "Enter" && customText.trim()) { setCustom([...custom, customText.trim()]); setCustomText(""); } }} />
              <button className="btn ghost sm" disabled={!customText.trim()} onClick={() => { setCustom([...custom, customText.trim()]); setCustomText(""); }}>Add</button></div>}
            <div className="chips sel">{custom.map((c, i) => <Badge key={i} tone="violet">{c} {writable && <button className="x" onClick={() => setCustom(custom.filter((_, j) => j !== i))}>×</button>}</Badge>)}</div>
          </div>
          <div className="autotext"><p className="label tight">Auto text — Symptom-{cur.replace(/-/g, " ")}</p>
            {items.length === 0 && !custom.length ? <p className="muted small">None selected.</p> : <ul>{items.map((i) => <li key={i}>{i}.</li>)}{custom.map((c, k) => <li key={"c" + k}><i>{c}</i></li>)}</ul>}</div>
        </div>
      </section>)}

      <Modal open={adding} title="Add Symptoms" onClose={() => setAdding(false)} xl>
        <SymptomPicker gender={gender} value={addList} onChange={setAddList} />
        <div className="row"><button className="btn ghost" onClick={() => setAdding(false)}>Close</button>
          <button className="btn primary" disabled={!addList.length} onClick={async () => { if (await onSaveSymptoms([...symptoms, ...addList.filter((x) => !symptoms.includes(x))])) setAdding(false); }}>Add symptoms</button></div>
      </Modal>
      <Modal open={removing} title="Remove Symptoms" onClose={() => setRemoving(false)}>
        <div className="chips">{symptoms.map((s) => <button key={s} className={`chip-btn ${rmList.includes(s) ? "on" : ""}`} onClick={() => setRmList(rmList.includes(s) ? rmList.filter((x) => x !== s) : [...rmList, s])}>{rmList.includes(s) ? "✓ " : ""}{s.replace(/-/g, " ")}</button>)}</div>
        <div className="row"><button className="btn ghost" onClick={() => setRemoving(false)}>Close</button>
          <button className="btn primary" disabled={!rmList.length} onClick={async () => { if (await onSaveSymptoms(symptoms.filter((s) => !rmList.includes(s)))) setRemoving(false); }}>Remove symptoms</button></div>
      </Modal>
    </div>
  );
}
