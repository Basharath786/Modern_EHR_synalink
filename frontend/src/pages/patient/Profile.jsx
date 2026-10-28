import { openFile } from "../../api";
import { useAuth } from "../../auth";
import { Badge, ErrorBox, Loading, PageHead, fmtDate, useApi } from "../../components/ui";

const GROUPS = [
  ["Personal", [["First name", "fname"], ["Middle name", "mname"], ["Last name", "lname"], ["Date of birth", "dob", fmtDate], ["Age", "age"], ["Gender", "gender"], ["Marital status", "marital"], ["Blood group", "bloodgroup"]]],
  ["Contact", [["Mobile", "mobno"], ["Home phone", "hphone"], ["Emergency contact", "emergencycontact"], ["Email", "email"], ["Address", "address"], ["City", "city"], ["State", "state"], ["Country", "country"], ["ZIP", "zipcode"]]],
  ["Identity & insurance", [["Govt ID type", "govtidtype"], ["Govt ID no.", "govtidno"], ["Insurance provider", "insurance_provider"], ["Registered on", "registered_on", fmtDate]]],
  ["Medical background", [["Family history", "family_history"], ["Past history", "past_history"], ["Drug history", "drug_history"], ["Social history", "social_history"]]],
];

export default function Profile() {
  const { data, loading, error, reload } = useApi("patient/profile");
  const { user } = useAuth();
  if (loading) return <Loading />;
  if (error) return <ErrorBox onRetry={reload} />;
  const p = data.profile;
  return (
    <div className="stack">
      <PageHead title="My Profile" subtitle={`${p.permanentid} · changes to your details go through your hospital (you approve them in Notifications)`}
        action={<Badge tone={user.validated === false ? "amber" : "green"}>{user.validated === false ? "Validation pending" : "Validated"}</Badge>} />
      {GROUPS.map(([title, fields]) => (
        <section className="card" key={title}><h3>{title}</h3>
          <dl className="kv">{fields.map(([label, key, fmt]) => <div key={key}><dt>{label}</dt><dd>{p[key] === null || p[key] === "" ? "—" : fmt ? fmt(p[key]) : String(p[key])}</dd></div>)}</dl>
          {title === "Identity & insurance" && <div className="row" style={{ justifyContent: "flex-start" }}><button className="btn ghost sm" onClick={async () => { if (!(await openFile("patient/profile/govtid"))) alert("No ID proof uploaded."); }}>View govt ID proof</button></div>}</section>))}
    </div>
  );
}
