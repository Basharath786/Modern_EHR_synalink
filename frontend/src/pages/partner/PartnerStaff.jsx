import { useState } from "react";
import { api } from "../../api";
import { FILE_LABELS, Field, FileInput, RecordView, digits, letters, useForm } from "../../components/FormKit";
import { Badge, Empty, ErrorBox, Loading, Modal, PageHead, fmtDate, fmtDateTime, useApi } from "../../components/ui";

const blank = { fname: "", dob: "", gender: "", marital: "", address: "", mobno: "", workemail: "", jobtype: "", qualification: "", experience: "", govtidtype: "", govtidno: "" };
const ApprovalBadge = ({ s }) => (s ? <Badge tone={s === "APPROVED" ? "green" : "amber"}>{s}</Badge> : null);

function Detail({ id, onClose, onChanged }) {
  const { data, loading, reload } = useApi(`partner/staff/${id}`);
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  async function approve() {
    setBusy(true); const { data: r } = await api(`partner/staff/${id}/approve`, { method: "POST", body: {} }); setBusy(false);
    setMsg(r.status === "approved" ? "Approved. A set-password link was sent to the work e-mail." : r.message || "Could not approve."); reload(); onChanged();
  }
  const it = data?.item;
  return (
    <Modal open title={it ? `${it.fname} (${id})` : id} onClose={onClose} xl>
      {loading && !data ? <Loading /> : <>
        <div className="toolbar"><div className="row" style={{ justifyContent: "flex-start" }}><ApprovalBadge s={it.status} />
          <Badge tone={data.password_set ? "green" : "gray"}>{data.password_set ? `Password set · last login ${fmtDateTime(data.last_login)}` : "Password not set yet"}</Badge></div>
          {it.status === "PENDING" && <button className="btn primary sm" disabled={busy} onClick={approve}>Approve</button>}</div>
        {msg && <div className="alert info">{msg}</div>}
        <RecordView item={it} fileBase={`partner/staff/${id}/file`} files={FILE_LABELS} /></>}
    </Modal>
  );
}

function Register({ label, onClose, onDone }) {
  const form = useForm(blank); const { f, errors, setErrors, bind } = form;
  const [file, setFile] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function save(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    const fd = new FormData(); Object.entries(f).forEach(([k, v]) => fd.append(k, v)); if (file) fd.append("govtidfile", file);
    const { data } = await api("partner/staff", { method: "POST", body: fd }); setBusy(false);
    if (data.status === "registered") onDone(data.message);
    else if (data.errors) { setErrors(data.errors); setErr("Please correct the highlighted fields."); } else setErr("Registration failed.");
  }
  const age = f.dob ? Math.floor((Date.now() - new Date(f.dob)) / 31557600000) : "";
  return (
    <Modal open title={`Register ${label.toLowerCase()}`} onClose={onClose} xl>
      <form onSubmit={save} noValidate>
        {err && <div className="alert error">{err}</div>}
        <div className="filters">
          <Field label="Full name *" error={errors.fname}><input maxLength={45} {...bind("fname", letters)} /></Field>
          <Field label="Date of birth *" hint={age !== "" ? `Age ${age}` : ""} error={errors.dob}><input type="date" max={new Date().toISOString().slice(0, 10)} {...bind("dob")} /></Field>
          <Field label="Gender *" error={errors.gender}><select {...bind("gender")}><option value="">Select</option>{["Male", "Female", "Others"].map((g) => <option key={g}>{g}</option>)}</select></Field>
          <Field label="Marital status *" error={errors.marital}><select {...bind("marital")}><option value="">Select</option>{["single", "married", "widowed", "divorced"].map((g) => <option key={g}>{g}</option>)}</select></Field>
          <Field label="Address *" error={errors.address}><input maxLength={60} {...bind("address")} /></Field>
          <Field label="Mobile no. *" error={errors.mobno}><input inputMode="numeric" {...bind("mobno", digits(10))} /></Field>
          <Field label="Work email ID *" hint="set-password link goes here" error={errors.workemail}><input maxLength={40} {...bind("workemail")} /></Field>
          <Field label="Job type *" error={errors.jobtype}><select {...bind("jobtype")}><option value="">Select</option>{["Full Time", "Part Time", "Consultant"].map((g) => <option key={g}>{g}</option>)}</select></Field>
          <Field label="Qualification *" error={errors.qualification}><input maxLength={45} {...bind("qualification", letters)} /></Field>
          <Field label="Experience in years" error={errors.experience}><input inputMode="numeric" {...bind("experience", digits(2))} /></Field>
          <Field label="Govt ID type *" error={errors.govtidtype}><select {...bind("govtidtype")}><option value="">Select</option><option>Aadhaar Card</option></select></Field>
          <Field label="Govt ID number *" error={errors.govtidno}><input inputMode="numeric" {...bind("govtidno", digits(12))} /></Field>
          <FileInput label="Govt ID proof" error={errors.govtidfile} file={file} onFile={setFile} />
        </div>
        <div className="row"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? <span className="spinner" /> : "Register"}</button></div>
      </form>
    </Modal>
  );
}

// Legacy lab-staff-list / lab-staff-register / lab-staff-details (and the pharmacy equivalents)
export default function PartnerStaff() {
  const { data, loading, error, reload } = useApi("partner/staff");
  const [view, setView] = useState(null); const [reg, setReg] = useState(false); const [msg, setMsg] = useState("");
  if (loading && !data) return <Loading />; if (error && !data) return <ErrorBox onRetry={reload} />;
  const label = data.kind === "lab" ? "Lab staff" : "Pharmacy staff";
  return (
    <div className="stack">
      <PageHead title={label} subtitle="Register your staff. They sign in after you approve them and they set their password." action={<button className="btn primary" onClick={() => setReg(true)}>+ Register staff</button>} />
      {msg && <div className="alert info">{msg}</div>}
      {data.items.length === 0 ? <Empty title="No staff yet" text="Register a staff member to start." /> : (
        <div className="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Job type</th><th>Qualification</th><th>Mobile</th><th>Work email</th><th>Status</th><th>Password</th><th>Registered</th><th /></tr></thead>
          <tbody>{data.items.map((x) => <tr key={x.permanentid}><td><b>{x.permanentid}</b></td><td>{x.fname}</td><td>{x.jobtype}</td><td>{x.qualification}</td><td>{x.mobno}</td><td className="small">{x.email}</td>
            <td><ApprovalBadge s={x.status} /></td><td><Badge tone={x.password_set ? "green" : "gray"}>{x.password_set ? "Set" : "Not set"}</Badge></td><td>{fmtDate(x.date_time)}</td>
            <td><button className="btn ghost sm" onClick={() => setView(x.permanentid)}>View</button></td></tr>)}</tbody></table></div>)}
      {view && <Detail id={view} onClose={() => setView(null)} onChanged={reload} />}
      {reg && <Register label={label} onClose={() => setReg(false)} onDone={(m) => { setReg(false); setMsg(m); reload(); }} />}
    </div>
  );
}

// Legacy staff-approval.html
export function PartnerStaffApproval() {
  const { data, loading, error, reload } = useApi("partner/staff/approvals");
  const [view, setView] = useState(null); const [msg, setMsg] = useState("");
  async function approve(id) {
    const { data: r } = await api(`partner/staff/${id}/approve`, { method: "POST", body: {} });
    setMsg(r.status === "approved" ? `${id} approved. The set-password link was e-mailed.` : r.message || "Could not approve."); reload();
  }
  return (
    <div className="stack">
      <PageHead title="Staff approval" subtitle="Approved staff receive an e-mail to set their password (first login)." />
      {msg && <div className="alert info">{msg}</div>}
      {loading && !data ? <Loading /> : error ? <ErrorBox onRetry={reload} /> : data.items.length === 0 ? <Empty title="Nothing waiting" text="All staff registrations are approved." /> : (
        <div className="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Job type</th><th>Mobile</th><th>Work email</th><th>Registered</th><th /></tr></thead>
          <tbody>{data.items.map((x) => <tr key={x.permanentid}><td><b>{x.permanentid}</b></td><td>{x.fname}</td><td>{x.jobtype}</td><td>{x.mobno}</td><td className="small">{x.email}</td><td>{fmtDate(x.date_time)}</td>
            <td className="nowrap"><button className="btn ghost sm" onClick={() => setView(x.permanentid)}>View</button> <button className="btn primary sm" onClick={() => approve(x.permanentid)}>Approve</button></td></tr>)}</tbody></table></div>)}
      {view && <Detail id={view} onClose={() => setView(null)} onChanged={reload} />}
    </div>
  );
}
