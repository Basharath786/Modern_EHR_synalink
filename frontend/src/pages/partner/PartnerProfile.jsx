import { FILE_LABELS, RecordView } from "../../components/FormKit";
import { Badge, ErrorBox, Loading, PageHead, useApi } from "../../components/ui";
import { useAuth } from "../../auth";

// Legacy profile.html of lab-portal / pharmacy-portal / lab-staff-portal / pharmacy-staff-portal
export default function PartnerProfile() {
  const { user } = useAuth(); const admin = user.role === "LAB" || user.role === "PHARMACY";
  const { data, loading, error, reload } = useApi(admin ? "partner/profile" : "partner/me");
  if (loading && !data) return <Loading />; if (error && !data) return <ErrorBox onRetry={reload} />;
  return (
    <div className="stack">
      <PageHead title="My profile" subtitle={user.permanentid} />
      <section className="card"><RecordView item={data.item} fileBase="partner/me/file" files={FILE_LABELS} /></section>
      {admin && <section className="card"><h3>Affiliated hospitals</h3>{data.hospitals.length === 0 ? <p className="muted">Not affiliated with any hospital yet.</p>
        : <div className="chips">{data.hospitals.map((h) => <Badge key={h.permanentid} tone="blue">{h.name} · {h.city}</Badge>)}</div>}</section>}
    </div>
  );
}
