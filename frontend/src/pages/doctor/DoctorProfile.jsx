import { openFile } from "../../api";
import { Badge, ErrorBox, Loading, PageHead, fmtDate, useApi } from "../../components/ui";

const GROUPS = [
  ["Personal", [["First name", "fname"], ["Middle name", "mname"], ["Last name", "lname"], ["Date of birth", "dob", fmtDate], ["Age", "age"], ["Gender", "gender"], ["Marital status", "marital"], ["Blood group", "bloodgroup"]]],
  ["Contact", [["Mobile", "mobno"], ["Work phone", "workphone"], ["Work email", "workemail"], ["Alternate email", "altemail"], ["Emergency contact", "emergencycontact"], ["Address", "address"], ["City", "city"], ["State", "state"], ["Country", "country"], ["ZIP", "zipcode"]]],
  ["Professional", [["Hospital", "hospital_name"], ["Hospital ID", "hospital_id"], ["Department", "deptname"], ["Specialization", "specialization"], ["Qualification", "qualification"], ["Experience (years)", "experience"], ["Past worked", "pastworked"], ["Job type", "jobtype"], ["MCI reg. no.", "mciregno"]]],
  ["Identity", [["Govt ID type", "govtidtype"], ["Govt ID no.", "govtidno"], ["Registered on", "date_time", fmtDate]]],
  ["Hospital contact", [["Address", "hospital_address"], ["City", "hospital_city"], ["Phone", "hospital_phone"], ["Email", "hospital_email"]]],
];

// Old doctor-portal/doctor-details.html
export default function DoctorProfile() {
  const { data, loading, error, reload } = useApi("doctor/profile");
  if (loading) return <Loading />; if (error) return <ErrorBox onRetry={reload} />;
  const p = data.profile;
  return (
    <div className="stack">
      <PageHead title={`Dr. ${p.fname} ${p.lname}`} subtitle={`${p.permanentid} · ${p.deptname} · ${p.hospital_name}`} action={<Badge tone={p.status === "APPROVED" ? "green" : "amber"}>{p.status}</Badge>} />
      {GROUPS.map(([title, fields]) => (
        <section className="card" key={title}><h3>{title}</h3>
          <dl className="kv">{fields.map(([label, key, fmt]) => <div key={key}><dt>{label}</dt><dd>{p[key] === null || p[key] === "" || p[key] === undefined ? "—" : fmt ? fmt(p[key]) : String(p[key])}</dd></div>)}</dl></section>))}
      <section className="card"><h3>Documents</h3><div className="row" style={{ justifyContent: "flex-start" }}>
        <button className="btn ghost sm" disabled={!p.has_mci_file} onClick={() => openFile("doctor/profile/file/mci")}>View MCI certificate</button>
        <button className="btn ghost sm" disabled={!p.has_govtid_file} onClick={() => openFile("doctor/profile/file/govtid")}>View govt ID proof</button></div></section>
    </div>
  );
}
