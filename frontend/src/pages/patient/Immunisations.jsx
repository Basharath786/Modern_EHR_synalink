import { useState } from "react";
import { api, openFile } from "../../api";
import { Badge, Empty, ErrorBox, Loading, Modal, PageHead, fmtDate, useApi } from "../../components/ui";
import { useSubjectTab } from "./Records";

const blank = { vaccine_name: "", dose_no: "", vaccination_date: "" };
const ERR = { file_too_large: "File is larger than 5 MB.", unsupported_file: "Only PDF, JPG or PNG files are allowed.", missing_fields: "Fill in all required fields." };

export default function Immunisations() {
  const { tabs, q, cur, amp } = useSubjectTab();
  const forId = cur?.child ? cur.id : undefined;
  const { data, loading, error, reload } = useApi(`patient/vaccinations${q}`);
  const [open, setOpen] = useState(false); const [f, setF] = useState(blank); const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  async function add(e) {
    e.preventDefault(); setBusy(true); setErr("");
    const fd = new FormData(); Object.entries(f).forEach(([k, v]) => fd.append(k, v)); if (file) fd.append("file", file); if (forId) fd.append("for", forId);
    const { data: r } = await api("patient/vaccinations/add", { method: "POST", body: fd });
    setBusy(false);
    if (r.status === "added") { setOpen(false); setF(blank); setFile(null); reload(); } else setErr(ERR[r.status] || "Could not save.");
  }
  const view = (v) => openFile(`patient/vaccinations/file?vaccine_name=${encodeURIComponent(v.vaccine_name)}&dose_no=${encodeURIComponent(v.dose_no)}${amp}`);

  return (
    <div className="stack">
      <PageHead title="Immunisations" subtitle="Your vaccination history" action={<button className="btn primary" onClick={() => setOpen(true)}>+ Add vaccination{forId ? " for child" : ""}</button>} />
      {tabs}
      {loading ? <Loading /> : error ? <ErrorBox onRetry={reload} /> : data.vaccinations.length === 0 ? <Empty title="No vaccinations recorded" text="Add a vaccine and attach the certificate (PDF/JPG/PNG)." /> : (
        <div className="table-wrap"><table><thead><tr><th>Vaccine</th><th>Dose</th><th>Vaccinated on</th><th>Added</th><th>Certificate</th></tr></thead>
          <tbody>{data.vaccinations.map((v, i) => (
            <tr key={i}><td><b>{v.vaccine_name}</b></td><td>{v.dose_no}</td><td>{fmtDate(v.vaccination_date)}</td><td>{fmtDate(v.date)}</td>
              <td>{v.has_file ? <button className="btn ghost sm" onClick={() => view(v)}>View</button> : <Badge>None</Badge>}</td></tr>))}</tbody></table></div>)}
      <Modal open={open} title="Add vaccination" onClose={() => setOpen(false)}>
        <form onSubmit={add}>
          <label className="field"><span>Vaccine name</span><input required maxLength={45} value={f.vaccine_name} onChange={(e) => setF({ ...f, vaccine_name: e.target.value })} /></label>
          <div className="two"><label className="field"><span>Dose no.</span><input required maxLength={45} value={f.dose_no} onChange={(e) => setF({ ...f, dose_no: e.target.value })} /></label>
            <label className="field"><span>Vaccinated on</span><input type="date" required max={new Date().toISOString().slice(0, 10)} value={f.vaccination_date} onChange={(e) => setF({ ...f, vaccination_date: e.target.value })} /></label></div>
          <label className="field"><span>Certificate (optional, ≤ 5 MB)</span><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files[0] || null)} /></label>
          {err && <div className="alert error">{err}</div>}
          <div className="row"><button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? <span className="spinner" /> : "Save"}</button></div>
        </form>
      </Modal>
    </div>
  );
}
