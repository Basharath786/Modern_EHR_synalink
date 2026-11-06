import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, openFile } from "../../api";
import { useAuth } from "../../auth";
import { Field, FileInput, RecordView, digits, letters, useForm } from "../../components/FormKit";
import { Badge, Empty, ErrorBox, Loading, Modal, PageHead, Tabs, fmtDate, fmtDateTime, useApi } from "../../components/ui";

const isAdmin = (u) => u.role === "LAB" || u.role === "PHARMACY";
const kindOf = (u) => (u.role.startsWith("LAB") ? "lab" : "pharmacy");
export const ORDER_STATUS = {
  PENDING: ["New", "amber"], AWAITING: ["Confirmed · awaiting sample", "blue"], PROCESSING: ["Processing", "violet"], COMPLETED: ["Completed", "green"],
  CONFIRMED: ["Confirmed", "blue"], CANCELLED: ["Cancelled", "red"], "CONFIRMATION-CANCELLED": ["Cancelled", "red"], "AWAITING-CANCELLED": ["Cancelled (awaiting)", "red"],
  "PROCESSING-CANCELLED": ["Cancelled (processing)", "red"],
};
const SBadge = ({ s }) => { const [l, t] = ORDER_STATUS[s] || [s, "gray"]; return <Badge tone={t}>{l}</Badge>; };
const ACTION_LABEL = { confirm: "Confirm", collect: "Sample collected", complete: "Mark delivered", cancel: "Cancel" };
const TABS = { lab: [["PENDING", "New"], ["AWAITING", "Awaiting sample"], ["PROCESSING", "Processing"], ["COMPLETED", "Completed"], ["CANCELLED", "Cancelled"]],
  pharmacy: [["PENDING", "New"], ["CONFIRMED", "Confirmed"], ["COMPLETED", "Delivered"], ["CANCELLED", "Cancelled"]] };
const inTab = (status, tab) => (tab === "CANCELLED" ? status.includes("CANCELLED") : status === tab);

// Legacy lab-portal/index.html + counts.js, pharmacy-portal/index.html, *-staff-portal/index.html
export function OrgHome() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi("org/dashboard");
  if (loading) return <Loading />; if (error) return <ErrorBox onRetry={reload} />;
  const o = data.orders; const lab = data.kind === "lab";
  const cancelled = Object.entries(o).filter(([k]) => k.includes("CANCELLED")).reduce((a, [, v]) => a + v, 0);
  return (
    <div className="stack">
      <section className="hero-card"><div><p className="eyebrow">{lab ? "Laboratory" : "Pharmacy"}{isAdmin(user) ? " admin" : " staff"}</p><h1>{data.org.name}</h1><p className="muted">{user.permanentid}</p></div>
        <Link className="btn primary" to="/app/orders">Open orders</Link></section>
      {isAdmin(user) && (data.pending_staff > 0 || data.incoming_affiliations > 0) && <div className="alert info">
        {data.pending_staff > 0 && <span><b>{data.pending_staff}</b> staff account(s) wait for approval — <Link className="link" to="/app/staff">review</Link>. </span>}
        {data.incoming_affiliations > 0 && <span><b>{data.incoming_affiliations}</b> hospital affiliation request(s) — <Link className="link" to="/app/affiliations">open</Link>.</span>}</div>}
      <div className="tiles">
        <Link to="/app/orders" className="tile amber"><span>New orders</span><b>{o.PENDING || 0}</b></Link>
        {lab ? <><Link to="/app/orders" className="tile blue"><span>Awaiting sample</span><b>{o.AWAITING || 0}</b></Link>
          <Link to="/app/orders" className="tile violet"><span>Processing</span><b>{o.PROCESSING || 0}</b></Link></>
          : <Link to="/app/orders" className="tile blue"><span>Confirmed</span><b>{o.CONFIRMED || 0}</b></Link>}
        <Link to="/app/orders" className="tile green"><span>{lab ? "Completed" : "Delivered"}</span><b>{o.COMPLETED || 0}</b></Link>
        <Link to="/app/orders" className="tile red"><span>Cancelled</span><b>{cancelled}</b></Link>
        <div className="tile gray"><span>Orders today</span><b>{data.today}</b></div>
        {isAdmin(user) ? <Link to="/app/staff" className="tile violet"><span>Staff</span><b>{data.staff}</b></Link> : <div className="tile violet"><span>Staff</span><b>{data.staff}</b></div>}
        {isAdmin(user) && <Link to="/app/affiliations" className="tile blue"><span>Affiliated hospitals</span><b>{data.affiliated_hospitals}</b></Link>}
      </div>
    </div>
  );
}

function OrderDetail({ id, onClose, onChanged }) {
  const { data, loading, reload } = useApi(`org/orders/${id}`);
  const [sel, setSel] = useState([]); const [msg, setMsg] = useState(null); const [cancel, setCancel] = useState(null); const [reason, setReason] = useState("");
  const [up, setUp] = useState(null); const [file, setFile] = useState(null); const [busy, setBusy] = useState(false);
  if (loading && !data) return <Modal open title={`Order ${id}`} onClose={onClose} xl><Loading /></Modal>;
  const lab = data.kind === "lab"; const o = data.order; const items = data.items;
  const groups = Object.keys(data.flow).map((s) => [s, items.filter((i) => i.status === s)]).filter(([, l]) => l.length);
  async function act(from, action, names, why) {
    setBusy(true); setMsg(null);
    const { data: r } = await api(`org/orders/${id}/status`, { method: "POST", body: { action, from_status: from, items: names, reason: why || "" } }); setBusy(false);
    setMsg({ ok: r.status === "updated", text: r.status === "updated" ? `Updated to ${(ORDER_STATUS[r.to] || [r.to])[0]}. The patient was notified.` : r.message || { reason_required: "Please give a reason." }[r.status] || "Could not update." });
    setSel([]); setCancel(null); reload(); onChanged();
  }
  async function upload() {
    setBusy(true); const fd = new FormData(); fd.append("lab_test_name", up); fd.append("report_file", file);
    const { data: r } = await api(`org/orders/${id}/report`, { method: "POST", body: fd }); setBusy(false);
    setMsg({ ok: r.status === "uploaded", text: r.status === "uploaded" ? `Report uploaded for ${up}. The test is completed and the patient was notified.` : r.message || "Upload failed." });
    setUp(null); setFile(null); reload(); onChanged();
  }
  return (
    <Modal open title={`Order ${id} — ${o.fullname || o.patient_id}`} onClose={onClose} xl>
      <dl className="kv"><div><dt>Patient</dt><dd>{o.fullname} ({o.patient_id}){o.gender ? ` · ${o.gender}` : ""}{o.age ? `, ${o.age} y` : ""}</dd></div><div><dt>Mobile</dt><dd>{o.mobno || "—"}</dd></div>
        <div><dt>Appointment</dt><dd>{o.apnt_id}{o.date_of_booking ? ` · ${fmtDate(o.date_of_booking)} ${o.time_of_booking}` : ""}</dd></div>
        <div><dt>Doctor</dt><dd>{o.doctor_name ? `${o.doctor_name} (${o.deptname})` : "—"}</dd></div><div><dt>Hospital</dt><dd>{o.hospital_name || "—"}</dd></div><div><dt>Ordered</dt><dd>{fmtDateTime(o.date_time)}</dd></div></dl>
      {msg && <div className={`alert ${msg.ok ? "info" : "error"}`}>{msg.text}</div>}
      <div className="table-wrap"><table><thead><tr><th /><th>{lab ? "Lab test" : "Medicine"}</th>{lab ? <><th>Repeat</th><th>Emergency</th></> : <><th>Qty</th><th>Duration</th><th>Usage</th><th>Instructions</th></>}<th>Status</th><th /></tr></thead>
        <tbody>{items.map((i) => <tr key={i.name}><td>{data.flow[i.status] && <input type="checkbox" checked={sel.includes(i.name)} onChange={() => setSel(sel.includes(i.name) ? sel.filter((x) => x !== i.name) : [...sel, i.name])} />}</td>
          <td><b>{i.name}</b>{i.reason && <><br /><small className="muted">Reason: {i.reason}</small></>}</td>
          {lab ? <><td>{i.repeat_test}</td><td>{String(i.emergency_test).toUpperCase() === "YES" ? <Badge tone="red">Emergency</Badge> : "No"}</td></>
            : <><td>{i.medicine_quantity}</td><td>{i.medicine_duration}</td><td>{i.medicine_usage}</td><td className="small">{i.medicine_instructions}</td></>}
          <td><SBadge s={i.status} /></td>
          <td className="nowrap">{lab && i.status === "PROCESSING" && <button className="btn primary sm" onClick={() => { setUp(i.name); setFile(null); }}>Upload report</button>}
            {lab && i.has_report ? <button className="btn ghost sm" onClick={() => openFile(`org/orders/${id}/report/file?test=${encodeURIComponent(i.name)}`)}>View report</button> : null}</td></tr>)}</tbody></table></div>
      {groups.map(([from, list]) => { const chosen = list.filter((i) => sel.includes(i.name)).map((i) => i.name); const target = chosen.length ? chosen : list.map((i) => i.name);
        return <div key={from} className="toolbar"><span className="small"><SBadge s={from} /> {chosen.length ? `${chosen.length} selected` : `all ${list.length} item(s)`}</span>
          <div className="row">{Object.keys(data.flow[from]).filter((a) => !(lab && a === "complete")).map((a) => a === "cancel"
            ? <button key={a} className="btn ghost sm" disabled={busy} onClick={() => { setCancel([from, target]); setReason(""); }}>Cancel</button>
            : <button key={a} className="btn primary sm" disabled={busy} onClick={() => act(from, a, target)}>{ACTION_LABEL[a]}</button>)}</div></div>; })}
      {lab && items.some((i) => i.status === "PROCESSING") && <p className="muted small">Upload each test's report to complete it.</p>}
      <Modal open={!!cancel} title="Cancel order item(s)" onClose={() => setCancel(null)}>
        <p className="small">{cancel?.[1].join(", ")}</p>
        <label className="field"><span>Reason *</span><textarea rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <div className="row"><button className="btn ghost" onClick={() => setCancel(null)}>Back</button><button className="btn primary" disabled={!reason.trim() || busy} onClick={() => act(cancel[0], "cancel", cancel[1], reason)}>Cancel item(s)</button></div>
      </Modal>
      <Modal open={!!up} title={`Upload report — ${up}`} onClose={() => setUp(null)}>
        <FileInput label="Report file" file={file} onFile={setFile} />
        <div className="row"><button className="btn ghost" onClick={() => setUp(null)}>Back</button><button className="btn primary" disabled={!file || busy} onClick={upload}>{busy ? <span className="spinner" /> : "Upload & complete"}</button></div>
      </Modal>
    </Modal>
  );
}

// Legacy lab orders.html / orders.js and pharmacy orders.html / orders.js
export function OrgOrders() {
  const { user } = useAuth(); const kind = kindOf(user);
  const { data, loading, error, reload } = useApi("org/orders");
  const [tab, setTab] = useState("PENDING"); const [q, setQ] = useState(""); const [view, setView] = useState(null);
  const all = data?.orders || [];
  const count = (t) => all.filter((o) => Object.keys(o.statuses).some((s) => inTab(s, t))).length;
  const list = all.filter((o) => Object.keys(o.statuses).some((s) => inTab(s, tab)))
    .filter((o) => !q || `${o.order_id} ${o.patient_id} ${o.fullname} ${o.apnt_id} ${o.doctor_name}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack">
      <PageHead title={kind === "lab" ? "Lab orders" : "Medicine orders"} subtitle="Orders sent by doctors of affiliated hospitals" />
      <Tabs items={TABS[kind].map(([k, l]) => [k, l, count(k)])} value={tab} onChange={setTab} />
      <input className="search" placeholder="Search order, patient, appointment or doctor" value={q} onChange={(e) => setQ(e.target.value)} />
      {loading && !data ? <Loading /> : error ? <ErrorBox onRetry={reload} /> : list.length === 0 ? <Empty title="No orders here" /> :
        <div className="table-wrap"><table><thead><tr><th>Order</th><th>Patient</th><th>Appointment</th><th>Doctor / hospital</th><th>Items</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>{list.map((o) => <tr key={o.order_id} className="clickable" onClick={() => setView(o.order_id)}><td><b>{o.order_id}</b> {o.emergency && <Badge tone="red">Emergency</Badge>}</td>
            <td>{o.fullname || "—"}<br /><small className="muted">{o.patient_id}</small></td><td>{o.apnt_id}</td><td>{o.doctor_name || "—"}<br /><small className="muted">{o.hospital_name}</small></td>
            <td>{o.items}</td><td>{Object.entries(o.statuses).map(([s, n]) => <span key={s}><SBadge s={s} />{n > 1 ? ` ×${n}` : ""} </span>)}</td><td>{fmtDate(o.date_time)}</td></tr>)}</tbody></table></div>}
      {view && <OrderDetail id={view} onClose={() => setView(null)} onChanged={reload} />}
    </div>
  );
}

const STAFF_BLANK = { fname: "", dob: "", gender: "", marital: "", address: "", mobno: "", email: "", jobtype: "", qualification: "", experience: "", govtidtype: "", govtidno: "" };

// Legacy lab-staff-list / pharma-staff-list, *-staff-register, *-staff-details, staff-approval
export function OrgStaff() {
  const { user } = useAuth(); const kind = kindOf(user);
  const { data, loading, error, reload } = useApi("org/staff");
  const [view, setView] = useState(null); const [reg, setReg] = useState(false); const [ok, setOk] = useState(""); const [tab, setTab] = useState("all");
  const det = useApi(view ? `org/staff/${view}` : "org/dashboard");
  const form = useForm(STAFF_BLANK); const { f, errors, setErrors, bind, reset } = form;
  const [file, setFile] = useState(null); const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault(); setBusy(true); const fd = new FormData(); Object.entries(f).forEach(([k, v]) => fd.append(k, v)); if (file) fd.append("govtidfile", file);
    const { data: r } = await api("org/staff", { method: "POST", body: fd }); setBusy(false);
    if (r.status === "registered") { setReg(false); reset(); setFile(null); setOk(r.message); reload(); } else setErrors(r.errors || { fname: "Registration failed" });
  }
  async function approve(id) {
    const { data: r } = await api(`org/staff/${id}/approve`, { method: "POST", body: {} });
    setOk(r.status === "approved" ? `${id} approved. The set-password link was e-mailed.` : r.message || "Could not approve."); reload(); det.reload();
  }
  const items = (data?.items || []).filter((x) => tab === "all" || x.status === "PENDING");
  return (
    <div className="stack">
      <PageHead title={kind === "lab" ? "Lab staff" : "Pharmacy staff"} subtitle="Approved staff receive an e-mail to set their password" action={<button className="btn primary" onClick={() => setReg(true)}>+ Register staff</button>} />
      {ok && <div className="alert info">{ok}</div>}
      <Tabs items={[["all", "All staff", data?.items?.length], ["pending", "Waiting for approval", (data?.items || []).filter((x) => x.status === "PENDING").length]]} value={tab} onChange={setTab} />
      {loading && !data ? <Loading /> : error ? <ErrorBox onRetry={reload} /> : items.length === 0 ? <Empty title="No staff here" /> :
        <div className="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Mobile</th><th>Email</th><th>Job type</th><th>Qualification</th><th>Status</th><th>Registered</th><th /></tr></thead>
          <tbody>{items.map((x) => <tr key={x.permanentid}><td><b>{x.permanentid}</b></td><td>{x.fname}</td><td>{x.mobno}</td><td className="small">{x.email}</td><td>{x.jobtype}</td><td>{x.qualification}</td>
            <td><Badge tone={x.status === "APPROVED" ? "green" : "amber"}>{x.status}</Badge> {!x.password_set && <Badge>No password</Badge>}</td><td>{fmtDate(x.date_time)}</td>
            <td className="nowrap"><button className="btn ghost sm" onClick={() => setView(x.permanentid)}>View</button> {x.status === "PENDING" && <button className="btn primary sm" onClick={() => approve(x.permanentid)}>Approve</button>}</td></tr>)}</tbody></table></div>}
      <Modal open={!!view} title={`Staff ${view}`} onClose={() => setView(null)} xl>
        {!det.data?.item ? <Loading /> : <><Badge tone={det.data.password_set ? "green" : "gray"}>{det.data.password_set ? `Password set · last login ${fmtDateTime(det.data.last_login)}` : "Password not set yet"}</Badge>
          <RecordView item={det.data.item} />
          <div className="row">{det.data.item.has_govtidfile && <button className="btn ghost sm" onClick={() => openFile(`org/staff/${view}/file`)}>View ID proof</button>}
            {det.data.item.status === "PENDING" && <button className="btn primary sm" onClick={() => approve(view)}>Approve</button>}</div></>}
      </Modal>
      <Modal open={reg} title="Register staff" onClose={() => setReg(false)} xl>
        <form onSubmit={save} noValidate><div className="filters">
          <Field label="Full name *" error={errors.fname}><input maxLength={45} {...bind("fname", letters)} /></Field>
          <Field label="Date of birth *" error={errors.dob}><input type="date" max={new Date().toISOString().slice(0, 10)} {...bind("dob")} /></Field>
          <Field label="Gender *" error={errors.gender}><select {...bind("gender")}><option value="">Select</option>{["Male", "Female", "Others"].map((g) => <option key={g}>{g}</option>)}</select></Field>
          <Field label="Marital status *" error={errors.marital}><select {...bind("marital")}><option value="">Select</option>{["single", "married", "widowed", "divorced"].map((g) => <option key={g}>{g}</option>)}</select></Field>
          <Field label="Address *" error={errors.address}><input maxLength={60} {...bind("address")} /></Field>
          <Field label="Mobile no. *" error={errors.mobno}><input inputMode="numeric" {...bind("mobno", digits(10))} /></Field>
          <Field label="Email *" hint="set-password link goes here" error={errors.email}><input maxLength={40} {...bind("email")} /></Field>
          <Field label="Job type *" error={errors.jobtype}><select {...bind("jobtype")}><option value="">Select</option>{["Full Time", "Part Time", "Consultant"].map((g) => <option key={g}>{g}</option>)}</select></Field>
          <Field label="Qualification *" error={errors.qualification}><input maxLength={45} {...bind("qualification")} /></Field>
          <Field label="Years of experience" error={errors.experience}><input inputMode="numeric" {...bind("experience", digits(2))} /></Field>
          <Field label="Govt ID type *" error={errors.govtidtype}><select {...bind("govtidtype")}><option value="">Select</option><option>Aadhaar Card</option></select></Field>
          <Field label="Govt ID number *" error={errors.govtidno}><input inputMode="numeric" {...bind("govtidno", digits(12))} /></Field>
          <FileInput label="ID proof" error={errors.govtidfile} file={file} onFile={setFile} />
        </div><div className="row"><button type="button" className="btn ghost" onClick={() => setReg(false)}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? <span className="spinner" /> : "Register"}</button></div></form>
      </Modal>
    </div>
  );
}

// Legacy hospital-portal-details (request), requested-hospital-list, pending-affiliation-list, affiliated-hospital-list, cancelled-hospital-list
export function OrgAffiliations() {
  const [data, setData] = useState(null); const [error, setError] = useState(false); const [tab, setTab] = useState("affiliated");
  const [msg, setMsg] = useState(null); const [rej, setRej] = useState(null); const [reason, setReason] = useState(""); const [q, setQ] = useState("");
  const load = async () => { const r = await api("org/affiliations"); r.ok ? setData(r.data) : setError(true); };
  useEffect(() => { load(); }, []);
  async function act(path, body, okText) {
    setMsg(null); const { data: r } = await api(`org/affiliations/${path}`, { method: "POST", body: body || {} });
    if (r.affiliated) setData(r);
    setMsg({ ok: ["requested", "accepted", "rejected"].includes(r.status), text: ["requested", "accepted", "rejected"].includes(r.status) ? okText
      : { already_requested: "A request is already pending.", already_affiliated: "Already affiliated.", reason_required: "Please give a reason." }[r.status] || "Could not complete the action." });
  }
  const table = (items, cols, actions) => items.length === 0 ? <Empty title="Nothing here" /> : (
    <div className="table-wrap"><table><thead><tr><th>ID</th><th>Hospital</th><th>City</th><th>Email</th><th>Phone</th>{cols.includes("date") && <th>Date</th>}{cols.includes("reason") && <th>Reason</th>}{actions && <th />}</tr></thead>
      <tbody>{items.map((x) => <tr key={x.permanentid}><td><b>{x.permanentid}</b></td><td>{x.name}</td><td>{[x.city, x.state].filter(Boolean).join(", ")}</td><td className="small">{x.email}</td><td>{x.land_phone || x.administration_no}</td>
        {cols.includes("date") && <td>{fmtDate(x.date)}</td>}{cols.includes("reason") && <td className="small">{x.cancel_reason}</td>}{actions && <td className="nowrap">{actions(x)}</td>}</tr>)}</tbody></table></div>);
  const avail = (data?.available || []).filter((x) => !q || `${x.permanentid} ${x.name} ${x.city}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack">
      <PageHead title="Hospital affiliations" subtitle="Doctors of affiliated hospitals can send you orders" />
      {msg && <div className={`alert ${msg.ok ? "info" : "error"}`}>{msg.text}</div>}
      {error ? <ErrorBox onRetry={load} /> : !data ? <Loading /> : <>
        <Tabs small items={[["affiliated", "Affiliated", data.affiliated.length], ["request", "Request hospital"], ["outgoing", "Requested", data.outgoing.length + data.rejected_by_them.length],
          ["incoming", "Pending requests", data.incoming.length], ["cancelled", "Cancelled list", data.rejected_by_me.length]]} value={tab} onChange={setTab} />
        {tab === "affiliated" && table(data.affiliated, [])}
        {tab === "request" && <><input className="search" placeholder="Search approved hospitals" value={q} onChange={(e) => setQ(e.target.value)} />
          {table(avail, [], (x) => <button className="btn primary sm" onClick={() => act(`${x.permanentid}/request`, null, `Request sent to ${x.name}.`)}>Send request</button>)}</>}
        {tab === "outgoing" && <><p className="label tight">Waiting for the hospital</p>{table(data.outgoing, ["date"])}
          <p className="label">Rejected by the hospital</p>{table(data.rejected_by_them, ["date", "reason"], (x) => <button className="btn ghost sm" onClick={() => act(`${x.permanentid}/request`, null, "Request sent again.")}>Request again</button>)}</>}
        {tab === "incoming" && table(data.incoming, ["date"], (x) => <><button className="btn primary sm" onClick={() => act(`${x.permanentid}/accept`, null, `You are now affiliated with ${x.name}.`)}>Accept</button>{" "}
          <button className="btn ghost sm" onClick={() => { setRej(x); setReason(""); }}>Reject</button></>)}
        {tab === "cancelled" && table(data.rejected_by_me, ["date", "reason"])}
      </>}
      <Modal open={!!rej} title={`Reject request from ${rej?.name}`} onClose={() => setRej(null)}>
        <label className="field"><span>Reason *</span><textarea maxLength={300} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <div className="row"><button className="btn ghost" onClick={() => setRej(null)}>Cancel</button>
          <button className="btn primary" disabled={!reason.trim()} onClick={async () => { await act(`${rej.permanentid}/reject`, { reason }, "Request rejected."); setRej(null); }}>Reject</button></div>
      </Modal>
    </div>
  );
}

// Legacy lab-portal/profile.html, pharmacy-portal/profile.html and the staff portals' profile.html
export function OrgProfile() {
  const { data, loading, error, reload } = useApi("org/profile");
  if (loading) return <Loading />; if (error) return <ErrorBox onRetry={reload} />;
  return (<div className="stack"><PageHead title="Profile" subtitle={data.org ? `${data.item.permanentid} · ${data.org}` : data.item.permanentid} />
    <section className="card"><RecordView item={data.item} fileBase="org/profile/file" files={data.files} /></section></div>);
}
