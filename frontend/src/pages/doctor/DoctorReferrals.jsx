import { useState } from "react";
import ApptRow from "../../components/ApptRow";
import { Empty, ErrorBox, Loading, PageHead, Tabs, useApi } from "../../components/ui";
import ReferralTable from "./ReferralTable";

// Referral tabs of the old doctor appointments page, as their own screen
export default function DoctorReferrals() {
  const { data, loading, error, reload } = useApi("doctor/referrals");
  const [tab, setTab] = useState("incoming");
  if (loading) return <Loading />; if (error) return <ErrorBox onRetry={reload} />;
  const g = {
    incoming: data.incoming.filter((x) => x.patient_status === "accepted" && x.referred_doc_status === "pending"),
    accepted: data.incoming.filter((x) => x.patient_status === "accepted" && x.referred_doc_status === "accepted"),
    awaiting: data.incoming.filter((x) => x.patient_status === "pending"),
    cancelled: [...data.incoming, ...data.outgoing].filter((x) => x.referred_doc_status === "cancelled" || x.patient_status === "cancelled"),
    outgoing: data.outgoing,
  };
  return (
    <div className="stack">
      <PageHead title="Referrals" subtitle="Patients you referred and patients referred to you" />
      <Tabs items={[["incoming", "Incoming", g.incoming.length], ["accepted", "Accepted", g.accepted.length], ["outgoing", "Outgoing", g.outgoing.length], ["booked", "Referral booked", data.booked.length], ["cancelled", "Cancelled", g.cancelled.length], ["awaiting", "Waiting for patient", g.awaiting.length]]} value={tab} onChange={setTab} />
      {tab === "booked" ? (data.booked.length ? <ul className="list cards">{data.booked.map((a) => <ApptRow key={a.appointmentid} a={a} />)}</ul> : <Empty title="No referral appointments" />)
        : <ReferralTable kind={tab} items={g[tab]} onChanged={reload} />}
    </div>
  );
}
