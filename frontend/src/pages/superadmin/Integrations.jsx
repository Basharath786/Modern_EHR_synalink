import { useState } from "react";
import { api } from "../../api";
import { Badge, ErrorBox, Loading, PageHead, useApi } from "../../components/ui";

// Phase 6: status of the e-mail (SMTP) and WhatsApp integrations, with a test send.
export default function Integrations() {
  const { data, loading, error, reload } = useApi("superadmin/integrations");
  const [to, setTo] = useState({ email: "", whatsapp: "" }); const [msg, setMsg] = useState(null); const [busy, setBusy] = useState("");
  if (loading) return <Loading />; if (error) return <ErrorBox onRetry={reload} />;
  async function test(channel) {
    setBusy(channel); setMsg(null);
    const { data: r } = await api("superadmin/integrations/test", { method: "POST", body: { channel, to: to[channel] } }); setBusy("");
    setMsg({ ok: r.status === "sent", text: r.status === "sent" ? `Test ${channel} sent.` : r.status === "not_configured" ? `${channel} is not configured in backend/.env.` : r.message || `Test ${channel} failed.` });
  }
  const Row = ({ k, v }) => <div><dt>{k}</dt><dd>{v === true ? "Yes" : v === false ? "No" : v || "—"}</dd></div>;
  const e = data.email, w = data.whatsapp, a = data.app;
  return (
    <div className="stack">
      <PageHead title="Integrations" subtitle="E-mail and WhatsApp delivery used for OTPs, approvals, orders and appointment notices" />
      {msg && <div className={`alert ${msg.ok ? "info" : "error"}`}>{msg.text}</div>}
      <section className="card"><div className="card-head"><h3>E-mail (SMTP)</h3><Badge tone={e.configured ? "green" : "amber"}>{e.configured ? "Configured" : "Not configured"}</Badge></div>
        <dl className="kv"><Row k="Host" v={e.host} /><Row k="Port" v={String(e.port)} /><Row k="TLS" v={e.tls} /><Row k="User" v={e.user} /><Row k="From" v={e.from} /></dl>
        <div className="row" style={{ justifyContent: "flex-start" }}><input className="search" placeholder="Send test to e-mail" value={to.email} onChange={(ev) => setTo({ ...to, email: ev.target.value })} />
          <button className="btn primary sm" disabled={!to.email || busy === "email"} onClick={() => test("email")}>Send test</button></div></section>
      <section className="card"><div className="card-head"><h3>WhatsApp (AiSensy)</h3><Badge tone={w.configured ? "green" : "amber"}>{w.configured ? "Configured" : "Not configured"}</Badge></div>
        <dl className="kv"><Row k="API URL" v={w.url} /><Row k="API key" v={w.key} /><Row k="OTP campaign" v={w.otp_campaign} /><Row k="New ID campaign" v={w.id_campaign} /><Row k="Password-expired campaign" v={w.expired_campaign} /></dl>
        <div className="row" style={{ justifyContent: "flex-start" }}><input className="search" placeholder="Mobile number" value={to.whatsapp} onChange={(ev) => setTo({ ...to, whatsapp: ev.target.value.replace(/\D/g, "") })} />
          <button className="btn primary sm" disabled={to.whatsapp.length < 10 || busy === "whatsapp"} onClick={() => test("whatsapp")}>Send test</button></div></section>
      <section className="card"><div className="card-head"><h3>Application</h3></div>
        <dl className="kv"><Row k="Frontend URL (links in mails)" v={a.frontend_url} /><Row k="Debug mode" v={a.debug} /><Row k="OTP printed to console (DEV_ECHO_OTP)" v={a.dev_echo_otp} />
          <Row k="Patient login OTP skipped (DEV_SKIP_PATIENT_OTP)" v={a.dev_skip_patient_otp} /><Row k="Super admin ID" v={a.super_admin_id} /></dl>
        {(a.debug || a.dev_echo_otp || a.dev_skip_patient_otp) && <div className="alert error">Development switches are on. Turn DJANGO_DEBUG, DEV_ECHO_OTP and DEV_SKIP_PATIENT_OTP off before go-live.</div>}</section>
    </div>
  );
}
