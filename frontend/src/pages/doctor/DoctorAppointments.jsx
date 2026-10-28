import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ApptRow from "../../components/ApptRow";
import CancelModal from "../../components/CancelModal";
import { Empty, ErrorBox, Loading, OPEN_TYPES, PageHead, Tabs, useApi } from "../../components/ui";
import ReferralTable from "./ReferralTable";

// Same grouping as the old doctor-portal/appointments.html tabs
const today = () => new Date().toISOString().slice(0, 10);

export default function DoctorAppointments() {
  const loc = useLocation();
  const { data, loading, error, reload } = useApi("doctor/appointments?scope=all");
  const refs = useApi("doctor/referrals");
  const [main, setMain] = useState(loc.hash === "#past" ? "past" : loc.hash === "#referral" ? "upcoming" : "today");
  const [up, setUp] = useState(loc.hash === "#referral" ? "referral" : "consult"); const [rs, setRs] = useState("consult-rescheduled");
  const [ref, setRef] = useState("incoming"); const [past, setPast] = useState("completed");
  const [target, setTarget] = useState(null);
  const nav = useNavigate();
  const all = data?.appointments || [];
  const by = (t) => all.filter((a) => a.appointment_type === t);
  const r = refs.data || { incoming: [], outgoing: [], booked: [] };
  const groups = useMemo(() => ({
    incoming: r.incoming.filter((x) => x.patient_status === "accepted" && x.referred_doc_status === "pending"),
    accepted: r.incoming.filter((x) => x.patient_status === "accepted" && x.referred_doc_status === "accepted"),
    cancelled: [...r.incoming, ...r.outgoing].filter((x) => x.referred_doc_status === "cancelled" || x.patient_status === "cancelled"),
    outgoing: r.outgoing,
  }), [r]);

  const list = (items, empty = "No appointments") => items.length === 0 ? <Empty title={empty} text="Nothing in this list." /> : (
    <ul className="list cards">{items.map((a) => (
      <ApptRow key={a.appointmentid} a={a} onClick={() => nav(`/app/appointments/${a.appointmentid}`)} actions={<>
        {OPEN_TYPES.includes(a.appointment_type) && <button className="btn primary sm" onClick={() => nav(`/app/visit/${a.appointmentid}`)}>Examine</button>}
        {a.appointment_type === "completed" && <button className="btn ghost sm" onClick={() => nav(`/app/case-file/${a.appointmentid}`)}>Case file</button>}
        {OPEN_TYPES.includes(a.appointment_type) && <button className="btn ghost sm" onClick={() => setTarget(a)}>Cancel</button>}</>} />))}</ul>);

  return (
    <div className="stack">
      <PageHead title="Appointments" subtitle="Your patients and schedule" />
      <Tabs items={[["today", "Today", all.filter((a) => a.date_of_booking === today()).length], ["upcoming", "Upcoming"], ["past", "Past"]]} value={main} onChange={setMain} />
      {loading ? <Loading /> : error ? <ErrorBox onRetry={reload} /> : (<>
        {main === "today" && list(all.filter((a) => a.date_of_booking === today()).sort((x, y) => (x.time_of_booking > y.time_of_booking ? 1 : -1)), "No appointments today")}
        {main === "upcoming" && (<>
          <Tabs small items={[["consult", "Direct Consult", by("consult").length], ["rescheduled", "Rescheduled", by("consult-rescheduled").length + by("followup-rescheduled").length + by("referral-rescheduled").length],
            ["followup", "Follow Up", by("followup").length], ["referral", "Referral"]]} value={up} onChange={setUp} />
          {up === "consult" && list(by("consult"))}
          {up === "followup" && list(by("followup"))}
          {up === "rescheduled" && (<><Tabs small items={[["consult-rescheduled", "Consult"], ["followup-rescheduled", "Follow Up"], ["referral-rescheduled", "Referral"]]} value={rs} onChange={setRs} />{list(by(rs))}</>)}
          {up === "referral" && (<>
            <Tabs small items={[["outgoing", "Outgoing Referral", groups.outgoing.length], ["incoming", "Incoming Referral", groups.incoming.length], ["accepted", "Accepted Referral", groups.accepted.length],
              ["booked", "Referral Booked", r.booked.length], ["cancelled", "Cancelled Referrals", groups.cancelled.length]]} value={ref} onChange={setRef} />
            {refs.loading && !refs.data ? <Loading /> : ref === "booked" ? list(r.booked, "No referral appointments booked") :
              <ReferralTable kind={ref} items={groups[ref]} onChanged={() => { refs.reload(); reload(); }} />}
          </>)}
        </>)}
        {main === "past" && (<>
          <Tabs small items={[["completed", "Completed", by("completed").length], ["dns", "Did Not Show Up", by("dns").length], ["cancelled", "Cancelled", by("cancelled").length], ["referral_appointment", "Referred out", by("referral_appointment").length]]} value={past} onChange={setPast} />
          {list(by(past))}
        </>)}
      </>)}
      <CancelModal appt={target} endpoint={`doctor/appointments/${target?.appointmentid}/cancel`} reasons={["Doctor unavailable", "Emergency", "Schedule change"]}
        onClose={() => setTarget(null)} onDone={() => { setTarget(null); reload(); }} />
    </div>
  );
}
