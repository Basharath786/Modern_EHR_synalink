import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";

export function useApi(path) {
  const [state, set] = useState({ data: null, loading: true, error: false });
  const load = useCallback(async () => {
    set((s) => ({ ...s, loading: true, error: false }));
    const r = await api(path);
    set({ data: r.ok ? r.data : null, loading: false, error: !r.ok });
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

export const PageHead = ({ title, subtitle, action }) => (
  <div className="page-head"><div><h1>{title}</h1>{subtitle && <p className="muted">{subtitle}</p>}</div>{action}</div>
);
export const Badge = ({ tone = "gray", children }) => <span className={`badge ${tone}`}>{children}</span>;
export const Empty = ({ title, text }) => (<div className="empty-box"><b>{title}</b>{text && <p className="muted">{text}</p>}</div>);
export const Loading = () => <div className="loading"><span className="spinner dark" /> Loading…</div>;
export const ErrorBox = ({ onRetry }) => (<div className="alert error">Could not load data. <button className="link" onClick={onRetry}>Retry</button></div>);

export function Modal({ open, title, onClose, children, wide, xl }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    if (open) document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""} ${xl ? "xl" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Close">✕</button></div>
        {children}
      </div>
    </div>,
    document.body
  );
}

export const fmtDate = (v) => (v ? new Date(v).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const fmtDateTime = (v) => (v ? new Date(v).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export const APPT = {
  consult: ["Consult", "blue"], followup: ["Follow-up", "blue"], "consult-rescheduled": ["Rescheduled", "violet"], "followup-rescheduled": ["Follow-up rescheduled", "violet"],
  "referral-rescheduled": ["Referral rescheduled", "violet"], completed: ["Completed", "green"],
  cancelled: ["Cancelled", "red"], dns: ["Did not show", "amber"], referral: ["Referral", "violet"], referral_appointment: ["Referred out", "gray"],
};

export const initials = (name = "") => name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
export const OPEN_TYPES = ["consult", "consult-rescheduled", "followup", "followup-rescheduled", "referral", "referral-rescheduled"];
export const RESCHEDULABLE = OPEN_TYPES;
export const STATUS_TEXT = (s, fallback = "Something went wrong. Please try again.") => ({
  not_validated: "Your patient account is not validated yet. Please visit a Hospital, Laboratory, Pharmacy or Receptionist.",
  reason_required: "Please give a reason.", reason_too_long: "The reason is too long.", not_found: "Not found.", forbidden: "You don't have access to this.",
  slot_unavailable: "That slot was just taken. Please pick another time.", patient_conflict: "There is already an appointment at that time.",
  busy: "The system is busy. Please try again.", missing_fields: "Please fill in all required fields.",
}[s] || fallback);
export const Tabs = ({ items, value, onChange, small }) => (
  <div className={`tabs ${small ? "small" : ""}`}>{items.map(([k, l, n]) => <button key={k} type="button" className={value === k ? "on" : ""} onClick={() => onChange(k)}>{l}{n !== undefined && <em className="count">{n}</em>}</button>)}</div>
);
export const DateChip = ({ value }) => {
  const d = value ? new Date(value) : null;
  return <div className="date-chip"><b>{d ? d.getDate() : "—"}</b><span>{d ? d.toLocaleString(undefined, { month: "short" }) : ""}</span></div>;
};
