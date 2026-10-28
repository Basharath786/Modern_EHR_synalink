import { useState } from "react";
import { Link } from "react-router-dom";
import { api, openFile } from "../../api";
import { useAuth } from "../../auth";
import { FILE_LABELS, RecordView } from "../../components/FormKit";
import { Badge, Empty, ErrorBox, Loading, Modal, PageHead, Tabs, fmtDate, fmtDateTime, useApi } from "../../components/ui";

const KIND = { hospital: ["Hospitals", "hospital_email"], lab: ["Laboratories", "labemail"], pharmacy: ["Pharmacies", "pharmacy_email"] };

// Legacy internal-admin/index.html (hospitalCounts / labCounts / pharmacyCounts) and super-admin/index.html
export function AdminHome() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi("admin/dashboard");
  if (loading) return <Loading />; if (error) return <ErrorBox onRetry={reload} />;
  const sa = user.role === "SUPER_ADMIN";
  return (
    <div className="stack">
      <section className="hero-card"><div><p className="eyebrow">{sa ? "Super admin" : "Internal admin"}</p><h1>{sa ? "Super Admin" : data.name || user.name}</h1><p className="muted">{user.permanentid}</p></div></section>
      <div className="tiles">
        {Object.entries(KIND).map(([k, [l]]) => <Link key={k} to={`/app/${k === "lab" ? "labs" : k === "pharmacy" ? "pharmacies" : "hospitals"}`} className={`tile ${data[k].pending ? "amber" : "green"}`}>
          <span>{l} — pending approval</span><b>{data[k].pending}</b><span>{data[k].approved} approved of {data[k].total}{!sa && data.approved_by_me ? ` · ${data.approved_by_me[k]} by you` : ""}</span></Link>)}
        {sa && <Link to="/app/internal-admins" className={`tile ${data.admins.pending ? "amber" : "blue"}`}><span>Internal admins — pending</span><b>{data.admins.pending}</b><span>{data.admins.active} active of {data.admins.approved}</span></Link>}
      </div>
      {sa && <div className="tiles">
        {[["Doctors", data.doctors, "doctor"], ["Nurses", data.nurses, "nurse"], ["Receptionists", data.receptionists, "receptionist"], ["Departments", data.departments, "department"],
          ["Patients (validated)", data.patients.approved, "patient"], ["Patients (not validated)", data.patients.pending, "patient_pending"], ["Children", data.children, "child"],
          ["Lab staff", data.lab_staff, "lab_staff"], ["Pharmacy staff", data.pharmacy_staff, "pharmacy_staff"]].map(([l, n, k]) =>
          <Link key={k} to={`/app/users?kind=${k}`} className="tile violet"><span>{l}</span><b>{n}</b></Link>)}</div>}
    </div>
  );
}

function EntityDetail({ kind, id, onClose, onChanged }) {
  const { data, loading, reload } = useApi(`admin/entities/${kind}/${id}`);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null);
  async function approve() {
    if (!window.confirm(`Approve ${id}? A set-password link will be e-mailed.`)) return;
    setBusy(true); const { data: r } = await api(`admin/entities/${kind}/${id}/approve`, { method: "POST", body: {} }); setBusy(false);
    setMsg({ ok: r.status === "approved", text: r.status === "approved" ? "Approved. The set-password link was sent." : r.message || "Could not approve." }); reload(); onChanged();
  }
  const it = data?.item;
  return (
    <Modal open title={it ? `${it.hospital_name || it.labname || it.pharmacy_name} (${id})` : id} onClose={onClose} xl>
      {loading && !data ? <Loading /> : <>
        <div className="toolbar"><div className="row" style={{ justifyContent: "flex-start" }}>{it.approved ? <Badge tone="green">Approved by {it.approved_by_name}</Badge> : <Badge tone="amber">Pending approval</Badge>}
          <Badge tone={it.password_set ? "green" : "gray"}>{it.password_set ? "Password set" : "Password not set"}</Badge></div>
          {!it.approved && <button className="btn primary sm" disabled={busy} onClick={approve}>Approve</button>}</div>
        {msg && <div className={`alert ${msg.ok ? "info" : "error"}`}>{msg.text}</div>}
        {!it.approved && <p className="muted small">Verify the PAN, GST and registration documents before approving.</p>}
        <RecordView item={it} fileBase={`admin/entities/${kind}/${id}/file`} files={FILE_LABELS} />
        {it.staff && <p className="small muted">Doctors {it.staff.doctor} · Nurses {it.staff.nurse} · Receptionists {it.staff.receptionist} · Departments {it.staff.department}</p>}
        {Object.entries(data.affiliations).map(([k, list]) => <div key={k}><p className="label">Affiliated {k}</p>{list.length ? <div className="chips">{list.map((a) => <span key={a.permanentid} className="chip">{a.name} ({a.permanentid})</span>)}</div> : <p className="muted small">None</p>}</div>)}
      </>}
    </Modal>
  );
}

// Legacy internal-admin hospitals-list / labs-list / pharma-list (+ details / approved-details) pages
export function Review({ kind }) {
  const [status, setStatus] = useState("pending"); const [q, setQ] = useState(""); const [view, setView] = useState(null);
  const { data, loading, error, reload } = useApi(`admin/entities/${kind}?status=${status}`);
  const [title, emailCol] = KIND[kind];
  const items = (data?.items || []).filter((x) => !q || `${x.permanentid} ${x.display_name} ${x.city}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack">
      <PageHead title={title} subtitle="Review registrations and approve them" />
      <Tabs items={[["pending", "Pending approval"], ["approved", "Approved"]]} value={status} onChange={setStatus} />
      <input className="search" placeholder="Search by ID, name or city" value={q} onChange={(e) => setQ(e.target.value)} />
      {loading && !data ? <Loading /> : error ? <ErrorBox onRetry={reload} /> : items.length === 0 ? <Empty title={status === "pending" ? "Nothing waiting for approval" : "None approved yet"} /> :
        <div className="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Land phone</th><th>Address</th>{status === "approved" && <th>Approved by</th>}<th>Date</th><th /></tr></thead>
          <tbody>{items.map((x) => <tr key={x.permanentid} className="clickable" onClick={() => setView(x.permanentid)}><td><b>{x.permanentid}</b></td><td>{x.display_name}</td><td className="small">{x[emailCol]}</td>
            <td>{x.land_phone}</td><td className="small">{[x.address, x.city].filter(Boolean).join(", ")}</td>{status === "approved" && <td>{x.approved_by_name}</td>}<td>{fmtDate(x.date_time)}</td>
            <td><button className="btn ghost sm">View</button></td></tr>)}</tbody></table></div>}
      {view && <EntityDetail kind={kind} id={view} onClose={() => setView(null)} onChanged={reload} />}
    </div>
  );
}

// Legacy internal-admin/profile.html
export function AdminProfile() {
  const { data, loading, error, reload } = useApi("admin/profile");
  if (loading) return <Loading />; if (error) return <ErrorBox onRetry={reload} />;
  const a = data.admin;
  return (<div className="stack"><PageHead title="My profile" subtitle={a.permanentid} />
    <section className="card"><RecordView item={a} />
      {a.has_govtidfile && <div className="row" style={{ justifyContent: "flex-start" }}><button className="btn ghost sm" onClick={() => openFile("admin/profile/govtid")}>View ID proof</button></div>}</section></div>);
}

// ---------------- super admin
// Legacy super-admin/admin-list.html, temp-admin-details.html (validate ADMIN), admins-details.html (updateAdminStatus)
export function InternalAdmins() {
  const [status, setStatus] = useState("pending"); const [view, setView] = useState(null); const [msg, setMsg] = useState(null);
  const { data, loading, error, reload } = useApi(`superadmin/admins?status=${status}`);
  const det = useApi(view ? `superadmin/admins/${view}` : "superadmin/status");
  async function approve(id) {
    if (!window.confirm("Approve this internal admin? A Permanent ID and a set-password link will be e-mailed.")) return;
    const { data: r } = await api(`superadmin/admins/${id}/approve`, { method: "POST", body: {} });
    setMsg({ ok: r.status === "approved", text: r.status === "approved" ? `Approved — Permanent ID ${r.permanentid}.` : "Could not approve." }); setView(null); reload();
  }
  async function toggle(id, st) {
    const { data: r } = await api(`superadmin/admins/${id}/status`, { method: "POST", body: { status: st } });
    setMsg({ ok: r.status === "updated", text: r.status === "updated" ? `${id} is now ${st}.` : "Could not update." }); reload(); det.reload();
  }
  const it = view && det.data?.item;
  return (
    <div className="stack">
      <PageHead title="Internal admins" subtitle="Approve new internal admins and activate / deactivate them" />
      <Tabs items={[["pending", "Pending approval"], ["approved", "Approved"]]} value={status} onChange={(s) => { setStatus(s); setView(null); }} />
      {msg && <div className={`alert ${msg.ok ? "info" : "error"}`}>{msg.text}</div>}
      {loading && !data ? <Loading /> : error ? <ErrorBox onRetry={reload} /> : data.items.length === 0 ? <Empty title="Nothing here" /> :
        <div className="table-wrap"><table><thead><tr><th>{status === "pending" ? "Temp ID" : "Permanent ID"}</th><th>Name</th><th>Organization</th><th>Employee ID</th><th>Email</th><th>Mobile</th>
          {status === "approved" && <><th>Status</th><th>Last login</th></>}<th>Date</th><th /></tr></thead>
          <tbody>{data.items.map((x) => { const id = x.permanentid || x.temp_id; return <tr key={id}><td><b>{id}</b></td><td>{x.fullname}</td><td>{x.organizationname}</td><td>{x.empid}</td>
            <td className="small">{x.workemail}</td><td>{x.mobno}</td>
            {status === "approved" && <><td><Badge tone={x.status === "ACTIVE" ? "green" : "red"}>{x.status}</Badge> {!x.password_set && <Badge>No password</Badge>}</td><td>{x.password_set ? fmtDateTime(x.last_login) : "—"}</td></>}
            <td>{fmtDate(x.date_time)}</td>
            <td className="nowrap"><button className="btn ghost sm" onClick={() => setView(id)}>View</button>{" "}
              {status === "pending" ? <button className="btn primary sm" onClick={() => approve(id)}>Approve</button>
                : <button className="btn ghost sm" onClick={() => toggle(id, x.status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}>{x.status === "ACTIVE" ? "Deactivate" : "Activate"}</button>}</td></tr>; })}</tbody></table></div>}
      <Modal open={!!view} title={`Internal admin ${view}`} onClose={() => setView(null)} xl>
        {!it ? <Loading /> : <><RecordView item={it} />
          {it.approved_counts && <p className="small muted">Approved: {it.approved_counts.hospital} hospitals · {it.approved_counts.lab} labs · {it.approved_counts.pharmacy} pharmacies</p>}
          <div className="row">{it.has_govtidfile && <button className="btn ghost sm" onClick={() => openFile(`superadmin/admins/${view}/govtid`)}>View ID proof</button>}
            {it.pending && <button className="btn primary sm" onClick={() => approve(view)}>Approve</button>}</div></>}
      </Modal>
    </div>
  );
}

const USER_KINDS = [["doctor", "Doctors"], ["nurse", "Nurses"], ["receptionist", "Receptionists"], ["department", "Departments"], ["patient", "Patients"], ["patient_pending", "Patients (not validated)"],
  ["patient_temp", "Temporary patients"], ["child", "Children"], ["lab_staff", "Lab staff"], ["pharmacy_staff", "Pharmacy staff"]];
const ID = (x) => x.permanentid || x.child_id || x.temp_id;

// Legacy super-admin doctors-list / nurse-list / receptionist-list / dept-list / patients-list / children-list / lab-staff-list / pharma-staff-list (+ details)
export function Users() {
  const init = new URLSearchParams(window.location.search).get("kind") || "doctor";
  const [kind, setKind] = useState(init); const [q, setQ] = useState(""); const [view, setView] = useState(null);
  const { data, loading, error, reload } = useApi(`superadmin/users/${kind}`);
  const det = useApi(view ? `superadmin/users/${kind}/${view}` : "superadmin/status");
  const items = (data?.items || []).filter((x) => !q || `${ID(x)} ${x.display_name} ${x.hospital_name || ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack">
      <PageHead title="All users" subtitle="Read-only directory of every registered user" />
      <div className="filters"><label className="field"><span>User type</span><select value={kind} onChange={(e) => { setKind(e.target.value); setView(null); }}>{USER_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="field"><span>Search</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ID, name or hospital" /></label></div>
      {loading && !data ? <Loading /> : error ? <ErrorBox onRetry={reload} /> : items.length === 0 ? <Empty title="No records" /> :
        <div className="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Hospital / parent</th><th>Mobile</th><th>Email</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>{items.map((x) => <tr key={ID(x)} className="clickable" onClick={() => setView(ID(x))}><td><b>{ID(x)}</b></td><td>{x.display_name}</td>
            <td>{x.hospital_name || x.parent_id || x.labid || x.pharmacy_id || "—"}</td><td>{x.mobno || x.dept_head_mobile_number || "—"}</td><td className="small">{x.workemail || x.email || "—"}</td>
            <td>{x.status ? <Badge tone={x.status === "APPROVED" ? "green" : "amber"}>{x.status}</Badge> : kind.startsWith("patient") ? (x.approved_by ? <Badge tone="green">Validated</Badge> : <Badge tone="amber">Pending</Badge>) : "—"}</td>
            <td>{fmtDate(x.date_time)}</td></tr>)}</tbody></table></div>}
      <Modal open={!!view} title={`${USER_KINDS.find(([k]) => k === kind)[1]} — ${view}`} onClose={() => setView(null)} xl>
        {!det.data?.item ? <Loading /> : <RecordView item={det.data.item} fileBase={`superadmin/users/${kind}/${view}/file`} files={FILE_LABELS} />}
      </Modal>
    </div>
  );
}
