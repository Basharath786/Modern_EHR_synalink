import { FILE_LABELS, RecordView } from "../../components/FormKit";
import { ErrorBox, Loading, PageHead, useApi } from "../../components/ui";

// Legacy hospital-details.html
export default function HospitalProfile() {
  const { data, loading, error, reload } = useApi("hospital/profile");
  if (loading) return <Loading />; if (error) return <ErrorBox onRetry={reload} />;
  return (<div className="stack"><PageHead title="Hospital profile" subtitle={data.hospital.permanentid} />
    <section className="card"><RecordView item={data.hospital} fileBase="hospital/profile/file" files={FILE_LABELS} /></section></div>);
}
