import { useState } from "react";
import AnatomyModal from "../../../components/AnatomyModal";
import SvgMap from "../../../components/SvgMap";
import { Badge, Loading, Modal, Tabs } from "../../../components/ui";
import { groupItems, groupKey, isOrgan, systemItems } from "./reviewModel";

function Group({ data, g, ans, set, scope = "", openModal, gender, readOnly }) {
  const key = groupKey(g, scope);
  const [model, setModel] = useState(null);
  const sel = groupItems(data, g, ans, new Set(), scope);
  return (
    <div className={`qcard ${sel.length ? "answered" : ""}`}>
      <h5>{g.title || " "}</h5>
      <div className="opts">
        {g.options.map((o) => {
          const t = o.type || "radio";
          if (t === "radio") {
            const on = ans.radio[key] === o.id;
            return <button key={o.id} type="button" disabled={readOnly} className={`opt ${on ? "on" : ""}`} onClick={() => {
              if (o.modal) { set({ ...ans, radio: { ...ans.radio, [key]: o.id } }); openModal(o.modal); return; }
              set({ ...ans, radio: { ...ans.radio, [key]: on ? undefined : o.id } });
            }}>{o.label}{o.modal ? " ▸" : ""}</button>;
          }
          if (t === "checkbox") return <button key={o.id} type="button" disabled={readOnly} className={`opt ${ans.check[o.id] ? "on" : ""}`} onClick={() => set({ ...ans, check: { ...ans.check, [o.id]: !ans.check[o.id] } })}>{o.label}</button>;
          if (t === "number") return <input key={o.id} type="number" min="0" disabled={readOnly} className="opt-input" placeholder="Enter value" value={ans.value[o.id] || ""} onChange={(e) => set({ ...ans, value: { ...ans.value, [o.id]: e.target.value } })} />;
          if (t === "model") {
            const mk = `${scope}|${o.id}`; const picked = ans.model[mk] || [];
            return <button key={o.id} type="button" disabled={readOnly} className={`opt model ${picked.length ? "on" : ""}`} onClick={() => setModel({ mk, organ: isOrgan(o.modal) ? o.modal : null })}>🧍 {picked.length ? `${picked.length} site(s)` : "Select area on model"}</button>;
          }
          if (t === "button" && o.modal) return <button key={o.id} type="button" className="opt" onClick={() => openModal(o.modal)}>{o.label} ▸</button>;
          return null;
        })}
      </div>
      {model && <AnatomyModal open gender={gender} organ={model.organ} selected={ans.model[model.mk] || []}
        onChange={(p) => set({ ...ans, model: { ...ans.model, [model.mk]: p } })} onClose={() => setModel(null)} />}
    </div>
  );
}

function Nodes({ data, nodes, ans, set, sysId, openModal, gender, readOnly, depth = 0 }) {
  const [tab, setTab] = useState({});
  const groups = nodes.filter((n) => n.type === "group");
  return (<>
    {nodes.map((n, i) => {
      if (n.type === "figure") return (
        <div key={i} className="figure"><SvgMap svg={n.svg} selected={ans.fig[sysId] || []}
          onPick={(p) => { if (readOnly) return; const cur = ans.fig[sysId] || []; set({ ...ans, fig: { ...ans.fig, [sysId]: cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p] } }); }} /></div>);
      if (n.type === "tabs") {
        const k = tab[i] ?? 0;
        return (<div key={i} className={`subtabs d${depth}`}>
          <Tabs small items={n.tabs.map((t, j) => [j, t.label])} value={k} onChange={(j) => setTab({ ...tab, [i]: j })} />
          <Nodes key={k} data={data} nodes={n.tabs[k]?.children || []} ans={ans} set={set} sysId={sysId} openModal={openModal} gender={gender} readOnly={readOnly} depth={depth + 1} />
        </div>);
      }
      return null;
    })}
    {groups.length > 0 && <div className="qgrid">{groups.map((g, i) => <Group key={(g.name || g.title) + i} data={data} g={g} ans={ans} set={set} openModal={openModal} gender={gender} readOnly={readOnly} />)}</div>}
  </>);
}

export default function SystemReviewTab({ data, ans, set, gender, readOnly }) {
  const [sys, setSys] = useState("GENERAL");
  const [modal, setModal] = useState(null);
  if (!data) return <Loading />;
  const s = data.systems.find((x) => x.id === sys) || data.systems[0];
  const items = systemItems(data, s, ans);
  const m = modal && data.modals[modal];
  return (
    <div className="stack">
      <section className="card">
        <div className="card-head"><div><h3>System Review — Select Examination</h3><p className="muted small">{s.title}</p></div></div>
        <Tabs items={data.systems.map((x) => [x.id, x.label, systemItems(data, x, ans).length || undefined])} value={s.id} onChange={setSys} />
        <div style={{ marginTop: 16 }}><Nodes key={s.id} data={data} nodes={s.children} ans={ans} set={set} sysId={s.id} openModal={setModal} gender={gender} readOnly={readOnly} /></div>
      </section>
      <section className="card autotext"><p className="label tight">Auto text — Symptom-{s.label}</p>
        {items.length ? <div className="chips">{items.map((x) => <Badge key={x} tone="blue">{x}</Badge>)}</div> : <p className="muted small">None selected.</p>}</section>
      <Modal open={!!m} title={m?.title || ""} onClose={() => setModal(null)} wide>
        {m && <div className="qgrid">{m.groups.map((g, i) => <Group key={i} data={data} g={g} ans={ans} set={set} scope={modal} openModal={setModal} gender={gender} readOnly={readOnly} />)}</div>}
        <div className="row"><button className="btn primary" onClick={() => setModal(null)}>Done</button></div>
      </Modal>
    </div>
  );
}
