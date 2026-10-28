import { useEffect, useState } from "react";
import { api } from "../../api";
import { Empty, ErrorBox, Loading, Modal, PageHead, Tabs, fmtDate } from "../../components/ui";

// Legacy lab-portal-details / pharma-portal-details (request), outgoing-*, pending-* (incoming), affiliated-*, cancelled-* pages
export default function Affiliations() {
  const [kind, setKind] = useState("lab"); const [tab, setTab] = useState("affiliated");
  const [data, setData] = useState(null); const [error, setError] = useState(false);
  const [msg, setMsg] = useState(null); const [rej, setRej] = useState(null); const [reason, setReason] = useState(""); const [q, setQ] = useState("");
  const load = async () => { const r = await api(`hospital/affiliations/${kind}`); r.ok ? setData(r.data) : setError(true); };
  useEffect(() => { setData(null); load(); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const label = kind === "lab" ? "laboratory" : "pharmacy";
  async function act(path, body, okText) {
    setMsg(null); const { data: r } = await api(`hospital/affiliations/${kind}/${path}`, { method: "POST", body: body || {} });
    if (r.affiliated) setData(r);
    setMsg({ ok: ["requested", "accepted", "rejected"].includes(r.status), text: { requested: okText, accepted: okText, rejected: okText, already_requested: "A request is already pending.",
      already_affiliated: "Already affiliated.", reason_required: "Please give a reason." }[r.status] || "Could not complete the action." });
  }
  const table = (items, cols, actions) => items.length === 0 ? <Empty title="Nothing here" /> : (
    <div className="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>City</th><th>Email</th><th>Phone</th>{cols.includes("date") && <th>Date</th>}{cols.includes("reason") && <th>Reason</th>}{actions && <th />}</tr></thead>
      <tbody>{items.map((x) => <tr key={x.permanentid}><td><b>{x.permanentid}</b></td><td>{x.name}</td><td>{[x.city, x.state].filter(Boolean).join(", ")}</td><td className="small">{x.email}</td><td>{x.land_phone || x.administration_no}</td>
        {cols.includes("date") && <td>{fmtDate(x.date)}</td>}{cols.includes("reason") && <td className="small">{x.cancel_reason}</td>}{actions && <td className="nowrap">{actions(x)}</td>}</tr>)}</tbody></table></div>);
  const avail = (data?.available || []).filter((x) => !q || `${x.permanentid} ${x.name} ${x.city}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack">
      <PageHead title="Affiliations" subtitle="Doctors can send orders only to affiliated laboratories and pharmacies" />
      <Tabs items={[["lab", "Laboratories"], ["pharmacy", "Pharmacies"]]} value={kind} onChange={(k) => { setKind(k); setMsg(null); }} />
      {msg && <div className={`alert ${msg.ok ? "info" : "error"}`}>{msg.text}</div>}
      {error ? <ErrorBox onRetry={load} /> : !data ? <Loading /> : <>
        <Tabs small items={[["affiliated", "Affiliated", data.affiliated.length], ["request", `Request ${label}`], ["outgoing", "Outgoing requests", data.outgoing.length + data.rejected_by_them.length],
          ["incoming", "Incoming requests", data.incoming.length], ["cancelled", "Cancelled list", data.rejected_by_me.length]]} value={tab} onChange={setTab} />
        {tab === "affiliated" && table(data.affiliated, [])}
        {tab === "request" && <><input className="search" placeholder={`Search approved ${label === "pharmacy" ? "pharmacies" : "laboratories"}`} value={q} onChange={(e) => setQ(e.target.value)} />
          {table(avail, [], (x) => <button className="btn primary sm" onClick={() => act(`${x.permanentid}/request`, null, `Request sent to ${x.name}.`)}>Send request</button>)}</>}
        {tab === "outgoing" && <><p className="label tight">Waiting for the {label}</p>{table(data.outgoing, ["date"])}
          <p className="label">Rejected by the {label}</p>{table(data.rejected_by_them, ["date", "reason"], (x) => <button className="btn ghost sm" onClick={() => act(`${x.permanentid}/request`, null, "Request sent again.")}>Request again</button>)}</>}
        {tab === "incoming" && table(data.incoming, ["date"], (x) => <><button className="btn primary sm" onClick={() => act(`${x.permanentid}/accept`, null, `You are now affiliated with ${x.name}.`)}>Accept</button>{" "}
          <button className="btn ghost sm" onClick={() => { setRej(x); setReason(""); }}>Reject</button></>)}
        {tab === "cancelled" && table(data.rejected_by_me, ["date", "reason"])}
      </>}
      <Modal open={!!rej} title={`Reject request from ${rej?.name}`} onClose={() => setRej(null)}>
        <label className="field"><span>Reason *</span><textarea maxLength={300} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <div className="row"><button className="btn ghost" onClick={() => setRej(null)}>Cancel</button>
          <button className="btn primary" disabled={!reason.trim()} onClick={async () => { await act(`${rej.permanentid}/reject`, { reason }, "Request rejected."); setRej(null); }}>Reject</button></div>
      </Modal>
    </div>
  );
}
