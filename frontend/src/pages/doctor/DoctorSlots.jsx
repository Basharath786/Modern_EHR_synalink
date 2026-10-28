import { useEffect, useState } from "react";
import { api } from "../../api";
import { Badge, Empty, ErrorBox, Loading, PageHead, Tabs, useApi } from "../../components/ui";

const MSG = {
  date_out_of_range: "Choose a date between today and the next 15 days.", date_has_slots: "This date already has slots. Use Add More Slots.",
  no_default_slots: "There are no default slots for this weekday yet. Ask your hospital admin to add them first.", create_first: "No slots on this date yet. Use Create Slots first.",
  select_slots: "Select at least one slot.", slot_not_allowed: "One of the selected slots is not allowed (maybe already over).", slot_booked: "A selected slot is already booked by a patient.",
  too_many: "Too many slots for this date (max 20).", no_active_slots: "There are no date-specific slots on this date.",
};
const iso = (d) => d.toISOString().slice(0, 10);

function SlotChoice({ items, value, onChange, empty }) {
  if (!items.length) return <p className="muted small">{empty}</p>;
  return <div className="time-row">{items.map((s) => {
    const on = value.includes(s.time);
    return <button key={s.time} type="button" disabled={s.past} title={s.past ? "Already over" : s.booked ? "Booked" : ""} className={`time-chip ${on ? "on" : ""} ${s.booked ? "booked" : ""}`}
      onClick={() => onChange(on ? value.filter((x) => x !== s.time) : [...value, s.time])}>{s.time}{s.booked ? " · booked" : ""}</button>;
  })}</div>;
}

// Old update-active-slots.html: Create Slots / Add More Slots / Remove Slots for one date (today .. +15 days)
function DateManager({ mode }) {
  const [date, setDate] = useState(""); const [st, setSt] = useState(null); const [sel, setSel] = useState([]); const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
  const min = iso(new Date()); const max = iso(new Date(Date.now() + 15 * 86400000));
  useEffect(() => { setSel([]); setMsg(null); if (!date) { setSt(null); return; }
    api(`doctor/slots/date?date=${date}`).then(({ data }) => { if (data.status) { setSt(null); setMsg({ ok: false, text: MSG[data.status] || "Could not load slots." }); } else setSt(data); }); }, [date]);
  async function go(action) {
    if (action === "clear" && !window.confirm("Clear this entire date?")) return;
    if (action === "remove" && !window.confirm("Remove the selected slots?")) return;
    setBusy(true); setMsg(null);
    const { data } = await api(`doctor/slots/${action}`, { method: "POST", body: { date, slots: sel } });
    setBusy(false);
    if (["created", "added", "removed", "cleared"].includes(data.status)) { setSt(data); setSel([]); setMsg({ ok: true, text: { created: "The slots have been created for this date.", added: "The new slots have been added for this date.", removed: "The selected slots have been removed.", cleared: "All slots have been removed for this date." }[data.status] }); }
    else setMsg({ ok: false, text: MSG[data.status] || "Something went wrong. Please try again." });
  }
  const info = st && (mode === "create" ? (st.active ? MSG.date_has_slots : !st.default_slots.length ? MSG.no_default_slots : !st.create_options.length ? "Your default schedule already covers every slot for this date." : null)
    : mode === "add" ? (!st.active ? MSG.create_first : !st.add_options.length ? "No more slots can be added for this date." : null)
      : (!st.active ? MSG.no_active_slots : null));
  return (
    <section className="card">
      <label className="field" style={{ maxWidth: 280 }}><span>Select date</span><input type="date" min={min} max={max} value={date} onChange={(e) => setDate(e.target.value)} /></label>
      {msg && <div className={`alert ${msg.ok ? "info" : "error"}`}>{msg.text}</div>}
      {st && (<>
        <p className="label">{st.weekday} — default slots ({st.default_slots.length})</p>
        <div className="time-row">{st.default_slots.length ? st.default_slots.map((s) => <span key={s.time} className={`time-chip static ${s.booked ? "booked" : ""}`}>{s.time}</span>) : <span className="muted small">None</span>}</div>
        {st.active && <><p className="label">Date-specific slots ({st.active.slots.length})</p><div className="time-row">{st.active.slots.map((s) => <span key={s.time} className={`time-chip static ${s.booked ? "booked" : ""}`}>{s.time}</span>)}</div></>}
        {info ? <div className="alert info">{info}</div> : (<>
          <p className="label">{mode === "create" ? "Select the slots to create" : mode === "add" ? `Select slots to add (${st.free_columns} free)` : "Select slots to remove"}</p>
          <SlotChoice items={mode === "create" ? st.create_options : mode === "add" ? st.add_options : st.remove_options} value={sel} onChange={setSel} empty="No slots." />
          <div className="row">
            {mode === "remove" && <button className="btn ghost" disabled={busy} onClick={() => go("clear")}>Clear entire date</button>}
            <button className="btn primary" disabled={busy || !sel.length} onClick={() => go(mode)}>{busy ? <span className="spinner" /> : mode === "create" ? "Create slots" : mode === "add" ? "Add slots" : "Remove slots"}</button>
          </div></>)}
      </>)}
    </section>
  );
}

export default function DoctorSlots() {
  const [tab, setTab] = useState("view");
  const { data, loading, error, reload } = useApi("doctor/slots");
  const defs = useApi("doctor/slots/defaults");
  useEffect(() => { if (tab === "view") { reload(); defs.reload(); } }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="stack">
      <PageHead title="My availability" subtitle="Weekly schedule (set by your hospital) plus date-specific active slots for the next 16 days." />
      <Tabs items={[["view", "My slots"], ["create", "Create Slots"], ["add", "Add More Slots"], ["remove", "Remove Slots"], ["weekly", "Weekly schedule"]]} value={tab} onChange={setTab} />
      {tab === "view" && (loading ? <Loading /> : error ? <ErrorBox onRetry={reload} /> : data.days.length === 0 ? <Empty title="No slots configured" text="Ask your hospital to set your weekly schedule." /> : data.days.map((d) => (
        <section className="card" key={d.date}>
          <div className="card-head"><h3>{d.weekday}, {new Date(d.date + "T00:00:00").toLocaleDateString(undefined, { day: "2-digit", month: "short" })}</h3>
            <span className="muted small">{d.slots.filter((s) => s.booked).length} booked · {d.slots.filter((s) => !s.booked).length} free</span></div>
          <div className="time-row">{d.slots.map((s) => <span key={s.time} className={`time-chip static ${s.booked ? "booked" : ""}`}>{s.time}{s.booked && " · booked"}</span>)}</div>
        </section>)))}
      {["create", "add", "remove"].includes(tab) && <DateManager key={tab} mode={tab} />}
      {tab === "weekly" && (defs.loading ? <Loading /> : (<>
        <section className="card"><h3>Default weekly slots</h3>
          {defs.data.defaults.length === 0 ? <p className="muted">No weekly schedule.</p> : defs.data.defaults.map((d) => (
            <div key={d.day} style={{ marginTop: 12 }}><p className="label tight">{d.day}</p><div className="time-row">{d.slots.map((s) => <span key={s} className="time-chip static">{s}</span>)}</div></div>))}</section>
        <section className="card"><h3>Upcoming date-specific slots</h3>
          {defs.data.active_dates.length === 0 ? <p className="muted">None.</p> : defs.data.active_dates.map((d) => (
            <div key={d.available_date} style={{ marginTop: 12 }}><p className="label tight">{d.available_date} <Badge tone="blue">{d.status}</Badge></p><div className="time-row">{d.slots.map((s) => <span key={s} className="time-chip static">{s}</span>)}</div></div>))}</section>
      </>))}
    </div>
  );
}
