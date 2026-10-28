import { useMemo, useState } from "react";
import { api } from "../../api";
import { FILE_LABELS, Field, FileInput, GeoFields, RecordView, digits, letters, useForm, useReference } from "../../components/FormKit";
import { Badge, Empty, ErrorBox, Loading, Modal, PageHead, Tabs, fmtDate, fmtDateTime, useApi } from "../../components/ui";

const TITLE = { doctor: "Doctors", nurse: "Nurses", receptionist: "Receptionists" };
const GENDERS = { doctor: ["Male", "Female", "Transgender"], nurse: ["Male", "Female", "Other"], receptionist: ["Male", "Female", "Others"] };
const BLOOD = ["A +ve", "A -ve", "B +ve", "B -ve", "O +ve", "O -ve", "AB +ve", "AB -ve"];
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const name = (x) => x.fullname || [x.fname, (x.mname || "").trim(), x.lname].filter(Boolean).join(" ");

export const ApprovalBadge = ({ s }) => s ? <Badge tone={s === "APPROVED" ? "green" : "amber"}>{s}</Badge> : null;

// ---------- weekly default slots (legacy slots.js: createDoctorSlot / rescheduleDefaultSlot / deleteEntireSlotsForDay)
function DefaultSlots({ doctorId }) {
  const { data, loading, reload } = useApi(`hospital/doctors/${doctorId}/slots`);
  const [day, setDay] = useState("monday"); const [len, setLen] = useState("15"); const [sel, setSel] = useState([]);
  const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
  if (loading && !data) return <Loading />;
  const current = data.days.find((d) => d.day === day).slots;
  const opts = data.catalog[len];
  async function act(action, slots) {
    if (action === "clear" && !window.confirm(`Remove all ${day} slots?`)) return;
    setBusy(true); setMsg(null);
    const { data: r } = await api(`hospital/doctors/${doctorId}/slots`, { method: "POST", body: { day, action, slots } });
    setBusy(false); setSel([]);
    const T = { added: "Slots added.", removed: "Slots removed.", cleared: "All slots of the day removed.", overlap: `${r.slot} overlaps ${r.with}.`, nothing_new: "These slots already exist.",
      slot_booked: `Booked appointments exist (${(r.appointments || []).map((a) => `${a.date_of_booking} ${a.time_of_booking}`).join(", ")}). Cancel or reschedule them first.`, select_slots: "Select at least one slot." };
    setMsg({ ok: ["added", "removed", "cleared"].includes(r.status), text: T[r.status] || "Could not update slots." }); reload();
  }
  return (
    <div className="stack">
      <Tabs small items={DAYS.map((d) => [d, d.slice(0, 3).toUpperCase(), data.days.find((x) => x.day === d).slots.length])} value={day} onChange={(d) => { setDay(d); setSel([]); setMsg(null); }} />
      {msg && <div className={`alert ${msg.ok ? "info" : "error"}`}>{msg.text}</div>}
      <div><p className="label tight">Current {day} slots ({current.length})</p>
        {current.length === 0 ? <p className="muted small">No default slots — patients cannot book this doctor on {day}s.</p> :
          <div className="chips">{current.map((s) => <span key={s} className="chip">{s} <button className="link small" disabled={busy} onClick={() => act("remove", [s])}>✕</button></span>)}</div>}
        {current.length > 0 && <div className="row" style={{ justifyContent: "flex-start" }}><button className="btn ghost sm" disabled={busy} onClick={() => act("clear")}>Delete all slots of the day</button></div>}</div>
      <div><div className="toolbar"><p className="label tight">Add slots</p>
        <select value={len} onChange={(e) => { setLen(e.target.value); setSel([]); }}><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">60 minutes</option></select></div>
        <div className="chips">{opts.map((s) => { const have = current.includes(s); return <button key={s} type="button" disabled={have} className={`chip-btn ${sel.includes(s) ? "on" : ""}`}
          onClick={() => setSel(sel.includes(s) ? sel.filter((x) => x !== s) : [...sel, s])}>{s}</button>; })}</div>
        <div className="row" style={{ justifyContent: "flex-start" }}><button className="btn primary sm" disabled={busy || !sel.length} onClick={() => act("add", sel)}>Add {sel.length || ""} slot(s)</button></div></div>
    </div>
  );
}

function Detail({ kind, id, onClose, onChanged }) {
  const { data, loading, reload } = useApi(`hospital/staff/${kind}/${id}`);
  const [tab, setTab] = useState("details"); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  async function approve() {
    setBusy(true); const { data: r } = await api(`hospital/staff/${kind}/${id}/approve`, { method: "POST", body: {} }); setBusy(false);
    setMsg(r.status === "approved" ? "Approved. A set-password link was sent to the work e-mail." : r.message || "Could not approve."); reload(); onChanged();
  }
  const it = data?.item;
  return (
    <Modal open title={it ? `${name(it)} (${id})` : id} onClose={onClose} xl>
      {loading && !data ? <Loading /> : <>
        <div className="toolbar"><div className="row" style={{ justifyContent: "flex-start" }}><ApprovalBadge s={it.status} />
          <Badge tone={data.password_set ? "green" : "gray"}>{data.password_set ? `Password set · last login ${fmtDateTime(data.last_login)}` : "Password not set yet"}</Badge></div>
          {it.status === "PENDING" && <button className="btn primary sm" disabled={busy} onClick={approve}>Approve</button>}</div>
        {msg && <div className="alert info">{msg}</div>}
        {kind === "doctor" && <Tabs small items={[["details", "Details"], ["slots", "Default slots"]]} value={tab} onChange={setTab} />}
        {tab === "details" ? <RecordView item={it} fileBase={`hospital/staff/${kind}/${id}/file`} files={FILE_LABELS} /> : <DefaultSlots doctorId={id} />}
      </>}
    </Modal>
  );
}

const blankFor = (kind) => ({ fullname: "", fname: "", mname: "", lname: "", dob: "", gender: "", marital: "", bloodgroup: "", address: "", country: "India", state: "", city: "", zipcode: "",
  mobno: "", workphone: "", workemail: "", altemail: "", emergencycontact: "", jobtype: "", specialization: "", qualification: "", experience: "", deptname: "", mciregno: "",
  govtidtype: "", govtidno: "", pastworked: "", kind });

function Register({ kind, onClose, onDone }) {
  const form = useForm(blankFor(kind)); const { f, errors, setErrors, bind } = form;
  const ref = useReference(); const depts = useApi("hospital/departments");
  const [files, setFiles] = useState({}); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const age = useMemo(() => { if (!f.dob) return ""; const d = new Date(f.dob), t = new Date(); return t.getFullYear() - d.getFullYear() - ((t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) ? 1 : 0); }, [f.dob]);
  async function save(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    const fd = new FormData(); Object.entries(f).forEach(([k, v]) => k !== "kind" && fd.append(k, v)); Object.entries(files).forEach(([k, v]) => v && fd.append(k, v));
    const { data } = await api(`hospital/staff/${kind}`, { method: "POST", body: fd });
    setBusy(false);
    if (data.status === "registered") onDone(data.message);
    else if (data.errors) { setErrors(data.errors); setErr("Please correct the highlighted fields."); } else setErr("Registration failed.");
  }
  const deptList = (depts.data?.departments || []).map((d) => d.deptname);
  return (
    <Modal open title={`Register ${kind}`} onClose={onClose} xl>
      <form onSubmit={save} noValidate>
        {err && <div className="alert error">{err}</div>}
        {deptList.length === 0 && !depts.loading && <div className="alert error">Register a department first.</div>}
        <p className="label tight">Personal details</p>
        <div className="filters">
          {kind === "receptionist" ? <Field label="Full name *" error={errors.fullname}><input maxLength={45} {...bind("fullname", letters)} /></Field> : <>
            <Field label="First name *" error={errors.fname}><input maxLength={45} {...bind("fname", (v) => v.replace(/[^A-Za-z]/g, ""))} /></Field>
            <Field label="Middle name" error={errors.mname}><input maxLength={45} {...bind("mname", (v) => v.replace(/[^A-Za-z]/g, ""))} /></Field>
            <Field label="Last name *" error={errors.lname}><input maxLength={45} {...bind("lname", (v) => v.replace(/[^A-Za-z]/g, ""))} /></Field></>}
          <Field label="Date of birth *" hint={age !== "" ? `Age ${age}` : ""} error={errors.dob}><input type="date" max={new Date().toISOString().slice(0, 10)} {...bind("dob")} /></Field>
          <Field label="Gender *" error={errors.gender}><select {...bind("gender")}><option value="">Select</option>{GENDERS[kind].map((g) => <option key={g}>{g}</option>)}</select></Field>
          <Field label="Marital status *" error={errors.marital}><select {...bind("marital")}><option value="">Select</option>{["single", "married", "widowed", "divorced"].map((g) => <option key={g}>{g}</option>)}</select></Field>
          {kind !== "receptionist" && <Field label="Blood group" error={errors.bloodgroup}><select {...bind("bloodgroup")}><option value="">Select</option>{BLOOD.map((g) => <option key={g}>{g}</option>)}</select></Field>}
          <Field label="Address *" error={errors.address}><input maxLength={60} {...bind("address")} /></Field>
          {kind !== "receptionist" && <GeoFields form={form} />}
        </div>
        <p className="label">Contact</p>
        <div className="filters">
          <Field label="Mobile no. *" error={errors.mobno}><input inputMode="numeric" {...bind("mobno", digits(10))} /></Field>
          <Field label="Work phone no. *" error={errors.workphone}><input inputMode="numeric" {...bind("workphone", digits(11))} /></Field>
          <Field label="Work email ID *" hint="set-password link goes here" error={errors.workemail}><input maxLength={kind === "receptionist" ? 45 : 40} {...bind("workemail")} /></Field>
          <Field label="Alternative email ID" error={errors.altemail}><input maxLength={kind === "receptionist" ? 45 : 40} {...bind("altemail")} /></Field>
          <Field label="Emergency contact no. *" error={errors.emergencycontact}><input inputMode="numeric" {...bind("emergencycontact", digits(10))} /></Field>
        </div>
        <p className="label">Professional</p>
        <div className="filters">
          <Field label="Job type *" error={errors.jobtype}><select {...bind("jobtype")}><option value="">Select</option>{["Full Time", "Part Time", "Consultant"].map((g) => <option key={g}>{g}</option>)}</select></Field>
          <Field label="Department *" error={errors.deptname}><select {...bind("deptname")}><option value="">Select</option>{deptList.map((g) => <option key={g}>{g}</option>)}</select></Field>
          {kind !== "receptionist" && <Field label="Specialization *" error={errors.specialization}><select {...bind("specialization")}><option value="">Select</option>{(ref?.specialities || []).map((g) => <option key={g}>{g}</option>)}</select></Field>}
          <Field label="Qualification *" error={errors.qualification}><input maxLength={kind === "receptionist" ? 20 : 45} {...bind("qualification")} /></Field>
          <Field label={`Experience in years${kind === "doctor" ? " *" : ""}`} error={errors.experience}><input inputMode="numeric" {...bind("experience", digits(2))} /></Field>
          <Field label="Past worked at" error={errors.pastworked}><input maxLength={50} {...bind("pastworked")} /></Field>
          {kind !== "receptionist" && <Field label="MCI regn. no. *" error={errors.mciregno}><input maxLength={14} {...bind("mciregno")} /></Field>}
          {kind !== "receptionist" && <FileInput label="MCI number proof" error={errors.mcifile} file={files.mcifile} onFile={(x) => setFiles({ ...files, mcifile: x })} />}
          <Field label="Govt ID type *" error={errors.govtidtype}><select {...bind("govtidtype")}><option value="">Select</option><option>Aadhaar Card</option></select></Field>
          <Field label="Govt ID number *" error={errors.govtidno}><input inputMode="numeric" {...bind("govtidno", digits(12))} /></Field>
          <FileInput label="Govt ID proof" error={errors.govtidfile} file={files.govtidfile} onFile={(x) => setFiles({ ...files, govtidfile: x })} />
        </div>
        <div className="row"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? <span className="spinner" /> : "Register"}</button></div>
      </form>
    </Modal>
  );
}

// Legacy doctors-list / nurse-list / receptionist-list + *-register + *-details pages
export default function Staff({ kind }) {
  const { data, loading, error, reload } = useApi(`hospital/staff/${kind}`);
  const [q, setQ] = useState(""); const [view, setView] = useState(null); const [reg, setReg] = useState(false); const [ok, setOk] = useState("");
  const items = (data?.items || []).filter((x) => !q || `${x.permanentid} ${name(x)} ${x.deptname} ${x.mobno}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack">
      <PageHead title={TITLE[kind]} subtitle={`${data?.items?.length ?? "…"} registered`} action={<button className="btn primary" onClick={() => setReg(true)}>+ Register {kind}</button>} />
      {ok && <div className="alert info">{ok}</div>}
      <input className="search" placeholder="Search by ID, name, department or mobile" value={q} onChange={(e) => setQ(e.target.value)} />
      {loading && !data ? <Loading /> : error ? <ErrorBox onRetry={reload} /> : items.length === 0 ? <Empty title={`No ${TITLE[kind].toLowerCase()}`} /> :
        <div className="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Department</th>{kind !== "receptionist" && <th>Specialization</th>}<th>Mobile</th><th>Work email</th><th>Status</th><th>Registered</th><th /></tr></thead>
          <tbody>{items.map((x) => <tr key={x.permanentid} className="clickable" onClick={() => setView(x.permanentid)}><td><b>{x.permanentid}</b></td><td>{name(x)}</td><td>{x.deptname}</td>
            {kind !== "receptionist" && <td>{x.specialization}</td>}<td>{x.mobno}</td><td className="small">{x.workemail}</td>
            <td><ApprovalBadge s={x.status} /> {!x.password_set && <Badge>No password</Badge>}</td><td>{fmtDate(x.date_time)}</td><td><button className="btn ghost sm">View</button></td></tr>)}</tbody></table></div>}
      {view && <Detail kind={kind} id={view} onClose={() => setView(null)} onChanged={reload} />}
      {reg && <Register kind={kind} onClose={() => setReg(false)} onDone={(m) => { setReg(false); setOk(m); reload(); }} />}
    </div>
  );
}

// Legacy staff-approval.html / doctor-approval.js
export function StaffApproval() {
  const { data, loading, error, reload } = useApi("hospital/approvals");
  const [view, setView] = useState(null);
  const [msg, setMsg] = useState("");
  async function approve(kind, id) {
    const { data: r } = await api(`hospital/staff/${kind}/${id}/approve`, { method: "POST", body: {} });
    setMsg(r.status === "approved" ? `${id} approved. The set-password link was e-mailed.` : r.message || "Could not approve."); reload();
  }
  const block = (kind, label) => (
    <section className="card"><div className="card-head"><h3>{label} ({data[kind].length})</h3></div>
      {data[kind].length === 0 ? <p className="muted">Nothing waiting.</p> :
        <div className="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Department</th><th>Mobile</th><th>Work email</th><th>Registered</th><th /></tr></thead>
          <tbody>{data[kind].map((x) => <tr key={x.permanentid}><td><b>{x.permanentid}</b></td><td>{name(x)}</td><td>{x.deptname}</td><td>{x.mobno}</td><td className="small">{x.workemail}</td><td>{fmtDate(x.date_time)}</td>
            <td className="nowrap"><button className="btn ghost sm" onClick={() => setView([kind, x.permanentid])}>View</button> <button className="btn primary sm" onClick={() => approve(kind, x.permanentid)}>Approve</button></td></tr>)}</tbody></table></div>}
    </section>);
  return (
    <div className="stack">
      <PageHead title="Staff approval" subtitle="Approved staff receive an e-mail to set their password (first login)." />
      {msg && <div className="alert info">{msg}</div>}
      {loading && !data ? <Loading /> : error ? <ErrorBox onRetry={reload} /> : <>{block("doctor", "Doctors")}{block("receptionist", "Receptionists")}</>}
      {view && <Detail kind={view[0]} id={view[1]} onClose={() => setView(null)} onChanged={reload} />}
    </div>
  );
}
