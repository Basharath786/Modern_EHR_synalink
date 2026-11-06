import { useState } from "react";
import { FILE_LABELS, RecordView } from "../../components/FormKit";
import { Badge, Empty, ErrorBox, Loading, Modal, PageHead, fmtDate, useApi } from "../../components/ui";

const TITLE = { doctor: "Doctors", nurse: "Nurses", receptionist: "Receptionists" };
const name = (x) => x.fullname || [x.fname, (x.mname || "").trim(), x.lname].filter(Boolean).join(" ");

// Legacy reception dept-list.html
export function ReceptionDepartments() {
  const { data, loading, error, reload } = useApi("reception/departments");
  return (
    <div className="stack"><PageHead title="Departments" subtitle="Departments of your hospital" />
      {loading && !data ? <Loading /> : error ? <ErrorBox onRetry={reload} /> : data.departments.length === 0 ? <Empty title="No departments" /> : (
        <div className="table-wrap"><table><thead><tr><th>Department</th><th>Head</th><th>Head mobile</th><th>Floor / wing</th><th>Doctors</th><th>Nurses</th><th>Rooms</th><th>Beds</th></tr></thead>
          <tbody>{data.departments.map((d) => <tr key={d.permanentid}><td><b>{d.deptname}</b></td><td>{d.deptheadname}</td><td>{d.dept_head_mobile_number}</td><td>{d.floor_wing}</td><td>{d.assigneddoctors}</td><td>{d.assignednurses}</td><td>{d.noofrooms}</td><td>{d.noofbeds}</td></tr>)}</tbody></table></div>)}
    </div>
  );
}

function Detail({ kind, id, onClose }) {
  const { data, loading } = useApi(`reception/staff/${kind}/${id}`);
  const it = data?.item;
  return (
    <Modal open title={it ? `${name(it)} (${id})` : id} onClose={onClose} xl>
      {loading && !data ? <Loading /> : <>
        <RecordView item={it} fileBase={`reception/staff/${kind}/${id}/file`} files={FILE_LABELS} />
        {kind === "doctor" && data.slots && <><p className="label">Weekly slots</p>
          {data.slots.map((d) => <p key={d.day} className="small"><b style={{ textTransform: "capitalize" }}>{d.day}</b>{" "}{d.slots.length ? d.slots.map((s) => <span key={s} className="chip">{s}</span>) : <span className="muted">no slots</span>}</p>)}</>}</>}
    </Modal>
  );
}

// Legacy reception doctors-list / doctor-details, nurse-list / nurse-details, receptionist-list / receptionist-details
export function ReceptionStaff({ kind }) {
  const { data, loading, error, reload } = useApi(`reception/staff/${kind}`);
  const [view, setView] = useState(null); const [q, setQ] = useState("");
  const list = (data?.items || []).filter((x) => !q.trim() || `${name(x)} ${x.permanentid} ${x.deptname || ""} ${x.specialization || ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="stack"><PageHead title={TITLE[kind]} subtitle="Staff of your hospital" />
      <input className="search" placeholder="Search name, ID, department…" value={q} onChange={(e) => setQ(e.target.value)} />
      {loading && !data ? <Loading /> : error ? <ErrorBox onRetry={reload} /> : list.length === 0 ? <Empty title="Nobody found" /> : (
        <div className="table-wrap"><table><thead><tr><th>ID</th><th>Name</th>{kind !== "receptionist" && <th>Specialization</th>}<th>Department</th><th>Mobile</th><th>Work email</th>{data.items[0]?.status !== undefined && <th>Status</th>}<th>Registered</th><th /></tr></thead>
          <tbody>{list.map((x) => <tr key={x.permanentid}><td><b>{x.permanentid}</b></td><td>{name(x)}</td>{kind !== "receptionist" && <td>{x.specialization}</td>}<td>{x.deptname}</td><td>{x.mobno}</td><td className="small">{x.workemail}</td>
            {x.status !== undefined && <td><Badge tone={x.status === "APPROVED" ? "green" : "amber"}>{x.status}</Badge></td>}<td>{fmtDate(x.date_time)}</td>
            <td><button className="btn ghost sm" onClick={() => setView(x.permanentid)}>View</button></td></tr>)}</tbody></table></div>)}
      {view && <Detail kind={kind} id={view} onClose={() => setView(null)} />}
    </div>
  );
}

// Legacy reception profile.html
export function ReceptionProfile() {
  const { data, loading, error, reload } = useApi("reception/profile");
  if (loading && !data) return <Loading />; if (error && !data) return <ErrorBox onRetry={reload} />;
  return (
    <div className="stack"><PageHead title="My profile" subtitle={data.hospital?.hospital_name} />
      <section className="card"><RecordView item={data.item} fileBase="reception/profile/file" files={FILE_LABELS} /></section></div>
  );
}
