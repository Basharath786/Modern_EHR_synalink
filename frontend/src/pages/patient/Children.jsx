import { useState } from "react";
import { Link } from "react-router-dom";
import { api, openFile } from "../../api";
import { useAuth } from "../../auth";
import { Badge, Empty, ErrorBox, Loading, Modal, PageHead, fmtDate, useApi } from "../../components/ui";

const blank = { childfname: "", mname: "", lname: "", dob: "", gender: "", bloodgroup: "", mobno: "", govtidtype: "", govtidno: "" };
const ERR = { missing_fields: "Please fill in all required fields.", invalid_dob: "Enter a valid date of birth (child must be 18 or younger).", invalid_mobile: "Mobile number must be 10 digits.",
  file_too_large: "The ID proof must be smaller than 5 MB.", unsupported_file: "The ID proof must be a PDF, JPG or PNG file.", not_validated: "Your account is not validated yet.", invalid_govt_id: "Aadhaar card number must be 12 digits (not starting with 0 or 1)." };
const ageOf = (dob) => { if (!dob) return ""; const d = new Date(dob), t = new Date(); return t.getFullYear() - d.getFullYear() - ((t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) ? 1 : 0); };

// Old child-registration.html + child-list.html
export default function Children() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi("patient/children");
  const [open, setOpen] = useState(false); const [f, setF] = useState(blank); const [past, setPast] = useState([]); const [drugs, setDrugs] = useState([]); const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [ok, setOk] = useState("");
  const opts = data?.options;
  const tog = (arr, set, v) => { if (v === "None") return set(arr.includes("None") ? [] : ["None"]); const b = arr.filter((x) => x !== "None"); set(b.includes(v) ? b.filter((x) => x !== v) : [...b, v]); };

  async function save(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    const fd = new FormData(); Object.entries(f).forEach(([k, v]) => fd.append(k, v)); past.forEach((x) => fd.append("past_history", x)); drugs.forEach((x) => fd.append("drug_history", x)); if (file) fd.append("govtidfile", file);
    const { data: r } = await api("patient/children", { method: "POST", body: fd });
    setBusy(false);
    if (r.status === "registered") { setOpen(false); setF(blank); setPast([]); setDrugs([]); setFile(null); setOk(`Child registration successful! Child ID: ${r.child_id}`); reload(); }
    else setErr(ERR[r.status] || r.message || "Registration failed! Please try again.");
  }
  return (
    <div className="stack">
      <PageHead title="Children" subtitle="Register your children and manage their records" action={<button className="btn primary" onClick={() => { setOpen(true); setErr(""); }}>+ Add child</button>} />
      {ok && <div className="alert info">{ok}</div>}
      {loading ? <Loading /> : error ? <ErrorBox onRetry={reload} /> : data.children.length === 0 ? <Empty title="No children registered" text="Add a child to book appointments and keep their records." /> : (
        <div className="table-wrap"><table><thead><tr><th>Child ID</th><th>Name</th><th>DOB</th><th>Age</th><th>Gender</th><th>Mobile</th><th>Govt ID</th><th>History</th><th /></tr></thead>
          <tbody>{data.children.map((c) => <tr key={c.child_id}><td><b>{c.child_id}</b></td><td>{[c.childfname, (c.mname || "").trim(), c.lname].filter(Boolean).join(" ")}</td><td>{fmtDate(c.dob)}</td><td>{c.age}</td><td>{c.gender}</td>
            <td>{c.mobno && String(c.mobno) !== "0" ? c.mobno : "—"}</td><td className="small">{c.govtidtype}<br />{c.govtidno}</td>
            <td className="small">Past: {c.past_history || "None"}<br />Drugs: {c.drug_history || "None"}</td>
            <td className="nowrap">{c.has_govtid_file ? <button className="btn ghost sm" onClick={() => openFile(`patient/children/${c.child_id}/govtid`)}>ID proof</button> : <Badge>No file</Badge>}</td></tr>)}</tbody></table></div>)}
      {data?.children?.length > 0 && <div className="row" style={{ justifyContent: "flex-start" }}><Link className="btn ghost" to="/app/child-appointments">Child appointments</Link><Link className="btn ghost" to="/app/book-appointment">Book for a child</Link></div>}

      <Modal open={open} title="Child Registration" onClose={() => setOpen(false)} xl>
        <form onSubmit={save}>
          <p className="label tight">Child details</p>
          <div className="filters">
            <label className="field"><span>First name *</span><input required maxLength={45} value={f.childfname} onChange={(e) => setF({ ...f, childfname: e.target.value.replace(/[^A-Za-z ]/g, "") })} /></label>
            <label className="field"><span>Middle name</span><input maxLength={45} value={f.mname} onChange={(e) => setF({ ...f, mname: e.target.value.replace(/[^A-Za-z ]/g, "") })} /></label>
            <label className="field"><span>Last name *</span><input required maxLength={45} value={f.lname} onChange={(e) => setF({ ...f, lname: e.target.value.replace(/[^A-Za-z ]/g, "") })} /></label>
            <label className="field"><span>Date of birth * {f.dob && <small className="muted">Age {ageOf(f.dob)}</small>}</span><input type="date" required max={new Date().toISOString().slice(0, 10)} value={f.dob} onChange={(e) => setF({ ...f, dob: e.target.value })} /></label>
            <label className="field"><span>Gender *</span><select required value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></label>
            <label className="field"><span>Blood group</span><select value={f.bloodgroup} onChange={(e) => setF({ ...f, bloodgroup: e.target.value })}><option value="">Select</option>{(opts?.blood_groups || []).map((b) => <option key={b}>{b}</option>)}</select></label>
            <label className="field"><span>Child mobile number</span><input inputMode="numeric" maxLength={10} value={f.mobno} onChange={(e) => setF({ ...f, mobno: e.target.value.replace(/\D/g, "") })} /></label>
            <label className="field"><span>Parent ID</span><input disabled value={user.permanentid} /></label>
          </div>
          <p className="label">Child identification details</p>
          <div className="filters">
            <label className="field"><span>Govt ID type *</span><select required value={f.govtidtype} onChange={(e) => setF({ ...f, govtidtype: e.target.value })}><option value="">Select</option>{(opts?.govt_id_types || []).map((b) => <option key={b}>{b}</option>)}</select></label>
            <label className="field"><span>Govt ID no. *</span><input required inputMode="numeric" maxLength={12} pattern="[2-9][0-9]{11}" title="12-digit Aadhaar number" value={f.govtidno} onChange={(e) => setF({ ...f, govtidno: e.target.value.replace(/\D/g, "") })} /></label>
            <label className="field"><span>Upload govt ID proof (PDF/JPG/PNG ≤ 5 MB)</span><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files[0] || null)} /></label>
          </div>
          <p className="label">Child health history</p>
          <div className="chips">{(opts?.past_history || []).map((x) => <button key={x} type="button" className={`chip-btn ${past.includes(x) ? "on" : ""}`} disabled={x !== "None" && past.includes("None")} onClick={() => tog(past, setPast, x)}>{x}</button>)}</div>
          <p className="label">Child drug history</p>
          <div className="chips">{(opts?.drug_history || []).map((x) => <button key={x} type="button" className={`chip-btn ${drugs.includes(x) ? "on" : ""}`} disabled={x !== "None" && drugs.includes("None")} onClick={() => tog(drugs, setDrugs, x)}>{x}</button>)}</div>
          {err && <div className="alert error">{err}</div>}
          <div className="row"><button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? <span className="spinner" /> : "Register child"}</button></div>
        </form>
      </Modal>
    </div>
  );
}
