import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth";
import CaseFile from "../components/CaseFile";
import { ErrorBox, Loading, useApi } from "../components/ui";

// Case file of one visit (doctor: any patient they treat; patient: self or own child)
export default function CaseFilePage() {
  const { id } = useParams(); const { user } = useAuth(); const nav = useNavigate();
  const { data, loading, error, reload } = useApi(user.role === "DOCTOR" ? `doctor/reports/${id}` : `patient/case-files/${id}`);
  if (loading) return <Loading />;
  if (error) return <div className="stack"><ErrorBox onRetry={reload} /><p className="muted">No case file was sent for appointment {id} yet.</p></div>;
  return <CaseFile r={data.report} onClose={() => nav(-1)} />;
}
