import { useEffect, useState } from "react";

// SweetAlert-style dialogs (the legacy portals used Swal.fire for every confirm / result).
// confirmDialog({...}) -> Promise<boolean>; notify({type, title, text}) -> Promise (closes on OK / auto-timer).
let push = null;
const queue = [];
const send = (d) => new Promise((resolve) => { const item = { ...d, resolve, id: Math.random() }; push ? push(item) : queue.push(item); });

export const confirmDialog = (o) => send({ kind: "confirm", ...o });
// Success / info / warning results go to stacked toasts; errors keep the blocking dialog
// so a failure is never missed on a clinical screen.
export const notify = (o) => (o.type === "error" || o.modal ? send({ kind: "notify", ...o }) : (toast(o), Promise.resolve(true)));

// ---------- toasts: stack, dedupe, auto-dismiss, closable ----------
let pushToast = null; const toastQueue = [];
export function toast({ type = "info", title, text, timer }) {
  const t = { type, title, text, id: Math.random(), key: `${type}|${title}|${text || ""}`, timer: timer || (type === "error" ? 8000 : type === "warning" ? 6000 : 4200) };
  pushToast ? pushToast(t) : toastQueue.push(t);
}
export function ToastHost() {
  const [list, setList] = useState([]);
  useEffect(() => {
    pushToast = (t) => setList((x) => (x.some((y) => y.key === t.key) ? x.map((y) => (y.key === t.key ? { ...y, n: (y.n || 1) + 1, id: t.id } : y)) : [...x, t].slice(-5)));
    toastQueue.splice(0).forEach(pushToast);
    return () => { pushToast = null; };
  }, []);
  const close = (id) => setList((x) => x.filter((t) => t.id !== id));
  return (
    <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
      {list.map((t) => <Toast key={t.key} t={t} onClose={() => close(t.id)} />)}
    </div>
  );
}
function Toast({ t, onClose }) {
  const [hover, setHover] = useState(false);
  useEffect(() => { if (hover) return undefined; const h = setTimeout(onClose, t.timer); return () => clearTimeout(h); }, [t.id, hover]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`toast ${t.type}`} role={t.type === "error" ? "alert" : "status"} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <span className="toast-icon" aria-hidden="true">{ICON[t.type] || "i"}</span>
      <div className="grow"><b>{t.title}{t.n > 1 && <em className="toast-n">×{t.n}</em>}</b>{t.text && <p>{t.text}</p>}</div>
      <button className="toast-x" onClick={onClose} aria-label="Dismiss">✕</button>
      {!hover && <i className="toast-bar" style={{ animationDuration: `${t.timer}ms` }} key={t.id} />}
    </div>
  );
}

const ICON = { success: "✓", error: "✕", warning: "!", info: "i", question: "?" };

export function DialogHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    push = (d) => setItems((x) => [...x, d]);
    queue.splice(0).forEach(push);
    return () => { push = null; };
  }, []);
  const d = items[0];
  const close = (val) => { d.resolve(val); setItems((x) => x.slice(1)); };
  useEffect(() => {
    if (!d) return undefined;
    const onKey = (e) => { if (e.key === "Escape") close(false); if (e.key === "Enter") close(true); };
    window.addEventListener("keydown", onKey);
    const t = d.kind === "notify" && d.type === "success" ? setTimeout(() => close(true), d.timer || 2600) : null;
    return () => { window.removeEventListener("keydown", onKey); if (t) clearTimeout(t); };
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return null;
  const type = d.kind === "confirm" ? (d.danger ? "warning" : "question") : d.type || "info";
  return (
    <div className="swal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && d.kind === "notify") close(true); }}>
      <div className="swal" role="alertdialog" aria-modal="true" aria-labelledby="swal-title">
        <div className={`swal-icon ${type}`}>{ICON[type]}</div>
        <h2 id="swal-title">{d.title}</h2>
        {d.text && <p>{d.text}</p>}
        <div className="swal-actions">
          {d.kind === "confirm" && <button className="btn ghost" onClick={() => close(false)}>{d.cancelText || "No, go back"}</button>}
          <button autoFocus className={`btn ${d.danger ? "danger" : "primary"}`} onClick={() => close(true)}>{d.kind === "confirm" ? d.okText || "Yes, continue" : "OK"}</button>
        </div>
        {d.kind === "notify" && d.type === "success" && <div className="swal-timer" style={{ animationDuration: `${d.timer || 2600}ms` }} />}
      </div>
    </div>
  );
}

// ---------- automatic wording for every API action ----------
const words = (path) => path.split("?")[0].split("/").filter((s) => /^[a-z-]+$/.test(s));

export function describe(path, body) {
  const p = path.split("?")[0];
  const seg = words(p);
  const last = seg[seg.length - 1] || "";
  const b = body instanceof FormData ? Object.fromEntries(body.entries()) : body || {};
  const has = (s) => p.includes(s);
  if (has("set-password/complete") || has("superadmin/password")) return ["Save new password?", "You will use this password to sign in.", "Yes, save"];
  if (has("change-password")) return ["Change your password?", "", "Yes, change"];
  if (has("public/register") || p === "desk/register-patient" || (p.startsWith("hospital/staff/") && seg.length === 3) || p === "org/staff" || p === "hospital/departments")
    return ["Submit this registration?", "Please check that all details are correct.", "Yes, submit"];
  if (has("integrations/test")) return ["Send a test message?", "", "Yes, send"];
  if (has("change-request")) return ["Send change request?", "The patient must approve it before anything changes.", "Yes, send"];
  if (has("org/orders") && last === "status") return [`${(b.action || "update").replace(/^./, (c) => c.toUpperCase())} this order?`, "The patient will be notified.", "Yes"];
  if (has("org/orders") && last === "report") return ["Upload this report?", "The test will be marked completed and the patient notified.", "Yes, upload"];
  if (has("doctor/appointments") && last === "report") return ["Submit the case file?", "Reports are sent to the patient.", "Yes, submit"];
  if (last === "prescription") return ["Send prescription?", "The medicines go to the selected pharmacy.", "Yes, send"];
  if (last === "lab-order") return ["Send lab order?", "The tests go to the selected laboratory.", "Yes, send"];
  if (last === "followup") return ["Book follow-up?", "", "Yes, book"];
  if (has("superadmin/admins") && last === "status") return [`${b.status === "INACTIVE" ? "Deactivate" : "Activate"} this admin?`, b.status === "INACTIVE" ? "An inactive admin cannot sign in." : "", "Yes"];
  if (has("doctor/appointments") && last === "status") return ["Change status?", "", "Yes, change"];
  if (has("slots")) return [b.action === "clear" || last === "clear" ? "Remove all slots?" : b.action === "remove" || last === "remove" ? "Remove selected slots?" : "Save slot changes?", "", "Yes", b.action === "clear" || b.action === "remove" || /clear|remove|cancel/.test(last)];
  if (has("loadouts") && last === "delete") return ["Delete this loadout?", "", "Yes, delete", true];
  const MAP = {
    approve: ["Approve this account?", "A set-password link will be e-mailed.", "Yes, approve"],
    validate: ["Validate this patient?", "Confirm you have checked the Govt ID.", "Yes, validate"],
    reject: ["Reject this?", "", "Yes, reject", true], decline: ["Decline this referral?", "", "Yes, decline", true],
    cancel: ["Cancel this?", "This cannot be undone.", "Yes, cancel", true], accept: ["Accept this request?", "", "Yes, accept"],
    request: ["Send affiliation request?", "", "Yes, send"], hold: ["Put this registration on hold?", "", "Yes, hold"],
    respond: ["Submit your decision?", "", "Yes"], book: ["Book this appointment?", "", "Yes, book"], reschedule: ["Reschedule this appointment?", "", "Yes, reschedule"],
    delete: ["Delete this?", "This cannot be undone.", "Yes, delete", true], remove: ["Remove this?", "", "Yes, remove", true],
    add: ["Save this record?", "", "Yes, save"], update: ["Save these changes?", "", "Yes, save"], symptoms: ["Save symptoms?", "", "Yes, save"],
    allergies: ["Save allergies?", "", "Yes, save"], children: ["Register this child?", "", "Yes, register"], reorder: ["Re-order?", "", "Yes, re-order"],
    complete: ["Mark as completed?", "", "Yes"], history: ["Save history?", "", "Yes, save"],
  };
  return MAP[last] || ["Are you sure?", "Do you want to continue?", "Yes, continue"];
}

const DONE = {
  approved: "Approved successfully", validated: "Patient validated", rejected: "Rejected", declined: "Declined", cancelled: "Cancelled", accepted: "Accepted",
  requested: "Request sent", on_hold: "Put on hold", registered: "Registered successfully", updated: "Updated successfully", uploaded: "Uploaded successfully",
  added: "Added successfully", removed: "Removed", cleared: "Cleared", deleted: "Deleted", booked: "Appointment booked", rescheduled: "Appointment rescheduled",
  password_set: "Password saved", password_changed: "Password changed", sent: "Sent", code_sent: "Code sent", otp_sent: "OTP sent", verified: "Verified", matched: "Verified",
  saved: "Saved successfully", submitted: "Submitted successfully", success: "Done",
};
const FAIL = {
  reason_required: "Please give a reason.", invalid: "Please correct the highlighted fields.", not_found: "Record not found.", forbidden: "You are not allowed to do this.",
  weak_password: "The password does not meet the policy.", mismatch: "Passwords do not match.", otp_invalid: "Incorrect code.", otp_expired: "The code expired. Request a new one.",
  token_expired: "This step expired. Please start again.", slot_booked: "There are booked appointments in these slots.", overlap: "Slots overlap.", already_requested: "A request is already pending.",
  already_affiliated: "Already affiliated.", not_pending: "Already done.", too_soon: "Please wait a little before trying again.", send_failed: "Could not send. Please try again later.",
  not_configured: "This integration is not configured.", select_items: "Select at least one item.", invalid_transition: "This action is not allowed in the current status.",
};

export function resultText(ok, data) {
  const st = data?.status || data?.output;
  if (ok) return { type: "success", title: DONE[st] || "Success", text: data?.message || (data?.permanentid ? `Permanent ID: ${data.permanentid}` : "") };
  const fields = data?.errors ? Object.values(data.errors).filter(Boolean) : [];
  return { type: "error", title: "Oops…", text: data?.message || FAIL[st] || (fields.length ? fields.slice(0, 3).join(" · ") : data?.detail || "Something went wrong. Please try again.") };
}
