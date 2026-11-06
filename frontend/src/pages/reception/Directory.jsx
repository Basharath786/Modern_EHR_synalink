import { useState } from "react";
import { openFile } from "../../api";
import { RecordView } from "../../components/FormKit";
import { Badge, Empty, ErrorBox, Loading, Modal, PageHead, Tabs, useApi } from "../../components/ui";

const KINDS = [["doctor", "Doctors"], ["nurse", "Nurses"], ["receptionist", "Receptionists"], ["department", "Departments"]];
const name = (x) => x.fullname || x.deptname || [x.fname, (x.mname || "").trim(), x.lname].filter(Boolean).join(" ");

// Legacy reception doctors-list / nurse-list / receptionist-list / dept-list (+ details) — own hospital, read-only
export default function Directory() {
  const [kind, setKind] = useState("doctor"); const [q, setQ] = useState(""); const [view, setView] = useState(null);
  const { data, loading, error, reload } = useApi(`desk/directory/${kind}`);
  const det = useApi(view ? `desk/directory/${kind}/${view}` : `desk/directory/${kind}`);
  const items = (data?.items || []).filter((x) => !q || `${x.permanentid} ${name(x)} ${x.deptname || ""} ${x.specialization || ""}`.toLowerCase().includes(q.toLowerCase()));
  const it = view && det.data?.item;
  return (
    <div className="stack">
      <PageHead title="Hospital directory" subtitle="Doctors, nurses, receptionists and departments of your hospital" />
      <Tabs items={KINDS} value={kind} onChange={(k) => { setKind(k); setView(null); }} />
      <input className="search" placeholder="Search by name, ID, department or speciality" value={q} onChange={(e) => setQ(e.target.value)} />
      {loading && !data ? <Loading /> : error ? <ErrorBox onRetry={reload} /> : items.length === 0 ? <Empty title="Nothing here" /> :
        <div className="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Department</th>{kind === "department" ? <><th>Head</th><th>Floor</th><th>Beds</th></> : <><th>Speciality / job</th><th>Mobile</th><th>Work phone</th><th>Status</th></>}</tr></thead>
          <tbody>{items.map((x) => <tr key={x.permanentid} className="clickable" onClick={() => setView(x.permanentid)}><td><b>{x.permanentid}</b></td><td>{name(x)}</td><td>{x.deptname}</td>
            {kind === "department" ? <><td>{x.deptheadname}<br /><small className="muted">{x.dept_head_mobile_number}</small></td><td>{x.floor_wing}</td><td>{x.noofbeds}</td></>
              : <><td>{x.specialization || x.jobtype}</td><td>{x.mobno}</td><td>{x.workphone}</td><td>{x.status ? <Badge tone={x.status === "APPROVED" ? "green" : "amber"}>{x.status}</Badge> : "—"}</td></>}</tr>)}</tbody></table></div>}
      <Modal open={!!view} title={it ? `${name(it)} (${view})` : view} onClose={() => setView(null)} xl>
        {!it ? <Loading /> : <><RecordView item={Object.fromEntries(Object.entries(it).filter(([k]) => k !== "slots"))} />
          {it.slots && <><p className="label">Weekly default slots</p><dl className="kv">{it.slots.map((d) => <div key={d.day}><dt>{d.day}</dt><dd className="small">{d.slots.length ? d.slots.join(", ") : "—"}</dd></div>)}</dl></>}</>}
      </Modal>
    </div>
  );
}

// Legacy reception/profile.html
export function ReceptionProfile() {
  const { data, loading, error, reload } = useApi("reception/profile");
  if (loading) return <Loading />; if (error) return <ErrorBox onRetry={reload} />;
  const p = data.profile;
  return (<div className="stack"><PageHead title="My profile" subtitle={p.permanentid} />
    <section className="card"><RecordView item={p} />
      {p.has_govtidfile && <div className="row" style={{ justifyContent: "flex-start" }}><button className="btn ghost sm" onClick={() => openFile("reception/profile/govtid")}>View ID proof</button></div>}</section></div>);
}
