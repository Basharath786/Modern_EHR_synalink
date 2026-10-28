import { useState } from "react";
import { Link } from "react-router-dom";
import { api, openFile } from "../../api";
import { Empty, ErrorBox, Loading, Modal, PageHead, Tabs, fmtDate, useApi } from "../../components/ui";
import { useSubjects } from "./useSubjects";

const ERR = { invalid_file_name: "Give the file a name (letters, numbers, max 45).", duplicate_file_name: "Please give a unique name for your file.",
  file_too_large: "Please upload a PDF file below 1 MB.", unsupported_file: "Only PDF files are allowed.", file_required: "Choose a PDF file." };

// Old patient-casefiles.html: Self (Summary by Doctor / Patient health history) and Child (Doctor uploaded / Parent uploaded)
export default function CaseFiles() {
  const cf = useApi("patient/case-files?all=1"); const pr = useApi("patient/past-reports?all=1");
  const { children, subjects } = useSubjects();
  const [who, setWho] = useState("self"); const [tab, setTab] = useState("doctor");
  const [up, setUp] = useState(false); const [f, setF] = useState({ name: "", for: "", file: null }); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const selfId = subjects[0]?.id;
  const cases = (cf.data?.case_files || []).filter((c) => (who === "self" ? c.patient_id === selfId : c.patient_id.startsWith("CHILD")));
  const reports = who === "self" ? pr.data?.self || [] : pr.data?.children || [];
  async function upload(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    const fd = new FormData(); fd.append("file_name", f.name.trim()); if (f.file) fd.append("file", f.file);
    const { data } = await api(`patient/past-reports${f.for ? `?for=${f.for}` : ""}`, { method: "POST", body: fd });
    setBusy(false);
    if (data.status === "uploaded") { setUp(false); setF({ name: "", for: "", file: null }); pr.reload(); } else setErr(ERR[data.status] || "Upload failed.");
  }
  const view = (r) => openFile(`patient/past-reports/file?name=${encodeURIComponent(r.file_name)}${r.patient_id?.startsWith("CHILD") ? `&for=${r.patient_id}` : ""}`);
  return (
    <div className="stack">
      <PageHead title="Case Files & Past Reports" subtitle="Visit summaries written by doctors and the health records you uploaded"
        action={<button className="btn primary" onClick={() => { setF({ name: "", for: who === "child" ? children[0]?.id || "" : "", file: null }); setErr(""); setUp(true); }}>+ Upload past report</button>} />
      <Tabs items={[["self", "Self"], ["child", "Child"]]} value={who} onChange={(w) => { setWho(w); setTab("doctor"); }} />
      <Tabs small items={who === "self" ? [["doctor", "Summary by Doctor"], ["mine", "Patient health history"]] : [["doctor", "Doctor Uploaded"], ["mine", "Parent Uploaded"]]} value={tab} onChange={setTab} />
      {tab === "doctor" && (cf.loading ? <Loading /> : cf.error ? <ErrorBox onRetry={cf.reload} /> : cases.length === 0 ? <Empty title="No case files yet" text="A case file appears after the doctor sends the visit report." /> : (
        <div className="table-wrap"><table><thead><tr><th>Appointment</th>{who === "child" && <th>Child ID</th>}<th>Doctor</th><th>Hospital</th><th>Case status</th><th>Diagnosis</th><th /></tr></thead>
          <tbody>{cases.map((c) => <tr key={c.apnt_id}><td><b>{c.apnt_id}</b><p className="muted small">{c.apnt_details}</p></td>{who === "child" && <td>{c.patient_id}</td>}
            <td>Dr. {c.doctor_name}<p className="muted small">{c.deptname}</p></td><td>{c.hospital_name}</td><td>{c.case_status}</td><td className="small">{(c.diagnosis || "").replace(/,\s*$/, "") || "—"}</td>
            <td><Link className="btn ghost sm" to={`/app/case-file/${c.apnt_id}`}>Case file</Link></td></tr>)}</tbody></table></div>))}
      {tab === "mine" && (pr.loading ? <Loading /> : reports.length === 0 ? <Empty title="No reports uploaded" text={who === "self" ? "Upload your past health records / reports here." : "Upload your child's past case files here."} /> : (
        <div className="table-wrap"><table><thead><tr>{who === "child" && <th>Child</th>}<th>File name</th><th>Uploaded</th><th /></tr></thead>
          <tbody>{reports.map((r, i) => <tr key={i}>{who === "child" && <td>{r.child_name}<p className="muted small">{r.patient_id}</p></td>}<td><b>{r.file_name}</b></td><td>{fmtDate(r.date)}</td>
            <td><button className="btn ghost sm" onClick={() => view(r)}>View</button></td></tr>)}</tbody></table></div>))}
      <Modal open={up} title="Upload past report" onClose={() => setUp(false)}>
        <form onSubmit={upload}>
          <label className="field"><span>For</span><select value={f.for} onChange={(e) => setF({ ...f, for: e.target.value })}><option value="">Myself</option>{children.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}</select></label>
          <label className="field"><span>Please give a unique name for your file <small className="muted">{f.name.length}/45</small></span><input required maxLength={45} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="field"><span>Please upload PDF file with size below 1 MB</span><input type="file" accept="application/pdf,.pdf" required onChange={(e) => setF({ ...f, file: e.target.files[0] || null })} /></label>
          {err && <div className="alert error">{err}</div>}
          <div className="row"><button type="button" className="btn ghost" onClick={() => setUp(false)}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? <span className="spinner" /> : "Upload"}</button></div>
        </form>
      </Modal>
    </div>
  );
}
