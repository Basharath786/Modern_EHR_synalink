import { useState } from "react";
import { Empty, ErrorBox, Loading, useApi } from "./ui";

export default function SlotPicker({ doctorId, value, onChange, endpoint, minDate }) {
  const { data: raw, loading, error, reload } = useApi(endpoint || `booking/doctors/${doctorId}/slots`);
  const data = raw && { ...raw, days: raw.days.filter((d) => !minDate || d.date >= minDate).map((d) => ({ ...d, slots: d.slots.filter((s) => !s.booked) })).filter((d) => d.slots.length) };
  const [day, setDay] = useState(value?.date || null);
  if (loading) return <Loading />;
  if (error) return <ErrorBox onRetry={reload} />;
  if (!data.days.length) return <Empty title="No free slots" text="This doctor has no free slots in the next 16 days." />;
  const active = data.days.find((d) => d.date === day) || null;
  return (
    <div>
      <p className="label">Choose a date</p>
      <div className="day-row">
        {data.days.map((d) => {
          const dt = new Date(d.date + "T00:00:00");
          return (
            <button key={d.date} type="button" className={`day-chip ${day === d.date ? "on" : ""}`} onClick={() => { setDay(d.date); onChange(null); }}>
              <span>{dt.toLocaleString(undefined, { weekday: "short" })}</span><b>{dt.getDate()}</b><span>{dt.toLocaleString(undefined, { month: "short" })}</span>
              <em>{d.slots.length} free</em>
            </button>
          );
        })}
      </div>
      {active && (<>
        <p className="label">Choose a time</p>
        <div className="time-row">
          {active.slots.map((s) => (
            <button key={s.time} type="button" className={`time-chip ${value?.date === active.date && value?.time === s.time ? "on" : ""}`}
              onClick={() => onChange({ date: active.date, time: s.time })}>{s.time}</button>
          ))}
        </div>
      </>)}
    </div>
  );
}
