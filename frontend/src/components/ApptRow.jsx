import { APPT, Badge, DateChip, fmtDate } from "./ui";

// One appointment card. `who` = which name to headline ("patient" or "doctor").
export default function ApptRow({ a, who = "patient", actions, onClick }) {
  const [label, tone] = APPT[a.appointment_type] || [a.appointment_type, "gray"];
  const title = who === "patient" ? a.fullname : a.doctor_name;
  return (
    <li onClick={onClick} className={onClick ? "clickable" : ""}>
      <DateChip value={a.date_of_booking} />
      <div className="grow">
        <b>{title}</b>
        <p className="muted">{who === "patient" ? `${a.permanentid} · with ${a.doctor_name}` : a.deptname} · {a.time_of_booking}</p>
        <p className="muted small">{fmtDate(a.date_of_booking)} · #{a.appointmentid}{a.symptoms_list?.trim() ? ` · ${a.symptoms_list}` : ""}</p>
        {a.pat_cancel_reason && <p className="muted small">Cancelled ({a.cancelled_by}): {a.pat_cancel_reason}</p>}
      </div>
      <div className="side" onClick={(e) => e.stopPropagation()}><Badge tone={tone}>{label}</Badge>{actions}</div>
    </li>
  );
}
