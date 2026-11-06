import { Link } from "react-router-dom";
import { useAuth } from "../../auth";
import { Badge, ErrorBox, Loading, fmtDateTime, useApi } from "../../components/ui";

const TONE = { pending: "amber", awaiting: "blue", confirmed: "blue", processing: "violet", completed: "green", cancelled: "red" };

// Legacy lab-portal / pharmacy-portal / *-staff-portal index.html (labOrderCount, labStaffCount, pharmacyOrdersCount, pharmacyStaffCount)
export default function PartnerHome() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi("partner/dashboard");
  if (loading && !data) return <Loading />; if (error && !data) return <ErrorBox onRetry={reload} />;
  const lab = data.kind === "lab";
  const total = Object.values(data.counts).reduce((a, b) => a + b, 0);
  return (
    <div className="stack">
      <section className="hero-card"><div><p className="eyebrow">{lab ? "Laboratory" : "Pharmacy"} {data.is_admin ? "admin" : "staff"}</p><h1>{data.partner_name}</h1>
        <p className="muted">{user.name} · {user.permanentid}</p></div>
        <dl className="facts"><div><dt>Total orders</dt><dd>{total}</dd></div><div><dt>Staff</dt><dd>{data.staff}</dd></div>
          {data.is_admin && <div><dt>Affiliated hospitals</dt><dd>{data.affiliated_hospitals}</dd></div>}</dl></section>

      {data.is_admin && (data.pending_staff > 0 || data.pending_affiliations > 0) && <div className="alert info">
        {data.pending_staff > 0 && <span><b>{data.pending_staff}</b> staff account(s) wait for approval — <Link className="link" to="/app/staff-approval">review</Link>. </span>}
        {data.pending_affiliations > 0 && <span><b>{data.pending_affiliations}</b> hospital affiliation request(s) — <Link className="link" to="/app/affiliations">open</Link>.</span>}</div>}

      <div className="tiles">
        {data.tabs.map((t) => <Link key={t.key} to={`/app/orders?tab=${t.key}`} className={`tile ${TONE[t.key] || "gray"}`}><span>{t.label}</span><b>{data.counts[t.key]}</b></Link>)}
        {data.is_admin && <Link to="/app/patient-validation" className="tile red"><span>Patients to validate</span><b>{data.unvalidated_patients}</b></Link>}
      </div>

      <section className="card"><div className="card-head"><h3>Newest orders waiting for you</h3><Link className="link" to="/app/orders?tab=pending">All new orders</Link></div>
        {data.recent_pending.length === 0 ? <p className="muted">No new orders.</p> : (
          <div className="table-wrap"><table><thead><tr><th>Order</th><th>Patient</th><th>{lab ? "Tests" : "Medicines"}</th><th>Doctor</th><th>Received</th></tr></thead>
            <tbody>{data.recent_pending.map((o) => <tr key={o.order_id}><td><b>#{o.order_id}</b></td><td>{o.patient_name}<br /><small className="muted">{o.patient_id}</small></td>
              <td>{o.items.map((i) => i.name).join(", ")} {o.items.some((i) => i.emergency) && <Badge tone="red">Urgent</Badge>}</td><td>{o.doctor_name}<br /><small className="muted">{o.hospital_name}</small></td><td>{fmtDateTime(o.date_time)}</td></tr>)}</tbody></table></div>)}
      </section>
    </div>
  );
}
