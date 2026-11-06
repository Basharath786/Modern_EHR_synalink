import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { api } from "../api";
import { PORTALS, modulesOf } from "../roles";
import { Grid, Key, Logout, Pulse } from "./Icons";
import ThemeToggle from "./ThemeToggle";
import { fmtDateTime, useApi } from "./ui";

export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const IDLE_MS = 15 * 60 * 1000;   // old portals logged out after 15 idle minutes

// ---- small line icons picked from the module name ----
const sv = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
const GLYPH = [
  [/book/i, <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18M12 14v4M10 16h4" /></>],
  [/appoint|slot/i, <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>],
  [/child/i, <><circle cx="12" cy="7" r="3" /><path d="M6 21v-2a6 6 0 0 1 12 0v2" /></>],
  [/case|report|file/i, <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>],
  [/problem|allerg/i, <><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" /></>],
  [/medic|pharm/i, <><rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-45 12 12)" /><path d="M9.5 9.5l5 5" /></>],
  [/lab/i, <><path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3" /></>],
  [/immun/i, <><path d="M18 2l4 4M15 5l4 4M14 6l-9 9-2 6 6-2 9-9" /></>],
  [/notif/i, <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10 20a2 2 0 0 0 4 0" /></>],
  [/profile/i, <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>],
  [/referr/i, <><path d="M4 12h12M12 6l6 6-6 6" /></>],
  [/depart/i, <><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" /></>],
  [/staff|doctor|nurse|recept|admin|user/i, <><circle cx="9" cy="8" r="3.5" /><path d="M2 21a7 7 0 0 1 14 0M16 4a3.5 3.5 0 0 1 0 7M22 21a7 7 0 0 0-4-6.3" /></>],
  [/valid|approv/i, <><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></>],
  [/register/i, <><circle cx="10" cy="8" r="4" /><path d="M3 21a7 7 0 0 1 12 0M19 8v6M16 11h6" /></>],
  [/hospital|directory|affil/i, <><path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16M2 21h20M12 7v6M9 10h6" /></>],
  [/integr/i, <><path d="M8 12h8M12 8v8" /><circle cx="12" cy="12" r="9" /></>],
];
const Glyph = ({ name }) => <svg {...sv} aria-hidden="true">{(GLYPH.find(([r]) => r.test(name)) || [, <circle cx="12" cy="12" r="3" />])[1]}</svg>;
const Bell = () => <svg {...sv}><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>;
const Search = () => <svg {...sv}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>;
const Menu = () => <svg {...sv}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
const Collapse = () => <svg {...sv}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 10l-2 2 2 2" /></svg>;

// Old doctor sidebar "today's queue" (doctor-login.js renderDoctorSidebarQueue)
function DoctorQueue() {
  const { data } = useApi("doctor/dashboard");
  const nav = useNavigate();
  if (!data) return null;
  return (<>
    <p className="nav-label">Today's queue <em className="nav-count">{data.queue.length}</em></p>
    {data.queue.length === 0 ? <p className="muted small nav-note">No patients waiting.</p> : data.queue.map((a) => (
      <button key={a.appointmentid} className="nav-item queue" onClick={() => nav(`/app/visit/${a.appointmentid}`)} title={a.appointmentid}>
        <span className="q-time">{a.time_of_booking.split("-")[0]}</span> <span className="grow nav-text">{a.fullname}</span></button>))}
  </>);
}

// ---- Notification centre: built only from real endpoints for the signed-in role ----
const SEEN = "cobalt.seen";
const readSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN)) || {}; } catch { return {}; } };
async function loadAlerts(role) {
  if (role === "PATIENT") {
    const r = await api("patient/notifications"); if (!r.ok) return null;
    return { patient: true, unread: r.data.unread_count || 0, items: (r.data.notifications || []).slice(0, 8).map((n) => ({
      id: `n${n.id}`, cat: n.type === "CHANGE_REQUEST" ? "Approval" : "Update", title: n.type === "CHANGE_REQUEST" ? (n.status === "PENDING" ? "Approval needed: update to your details" : "Update to your details") : n.title,
      when: n.created_at || n.date_time, to: "/app/notifications", unread: !n.is_read })) };
  }
  const tasks = [];
  const add = (key, n, cat, title, to) => n > 0 && tasks.push({ id: key, n, cat, title: `${n} ${title}`, to });
  if (role === "HOSPITAL") {
    const r = await api("hospital/dashboard"); if (!r.ok) return null; const d = r.data;
    add("hs", d.pending_staff, "Staff", "staff registration(s) waiting for approval", "/app/staff-approval");
    add("ha", (d.pending_affiliations?.lab || 0) + (d.pending_affiliations?.pharmacy || 0), "Affiliation", "lab / pharmacy affiliation request(s)", "/app/affiliations");
  } else if (role === "LAB" || role === "PHARMACY" || role === "LAB_STAFF" || role === "PHARMACY_STAFF") {
    const r = await api("org/dashboard"); if (!r.ok) return null; const d = r.data;
    add("op", d.orders?.PENDING || 0, "Orders", "new order(s) pending", "/app/orders");
    add("os", d.pending_staff || 0, "Staff", "staff registration(s) waiting for approval", "/app/staff");
    add("oa", d.incoming_affiliations || 0, "Affiliation", "hospital affiliation request(s)", "/app/affiliations");
  } else if (/ADMIN/.test(role)) {
    const r = await api("admin/dashboard"); if (!r.ok) return null; const d = r.data;
    add("ah", d.hospital?.pending || 0, "Review", "hospital(s) waiting for review", "/app/hospitals");
    add("al", d.lab?.pending || 0, "Review", "laborator(ies) waiting for review", "/app/labs");
    add("ap", d.pharmacy?.pending || 0, "Review", "pharmac(ies) waiting for review", "/app/pharmacies");
    if (d.admins) add("ai", d.admins.pending || 0, "Admins", "internal admin request(s)", "/app/internal-admins");
  } else return { none: true, items: [], unread: 0 };
  const seen = readSeen();
  const items = tasks.map((t) => ({ ...t, unread: seen[t.id] !== t.n }));
  return { items, unread: items.filter((i) => i.unread).length };
}

function NotificationCenter({ role }) {
  const [open, setOpen] = useState(false); const [st, setSt] = useState(undefined); const [cat, setCat] = useState("All");
  const nav = useNavigate(); const ref = useRef(null);
  const refresh = useCallback(async () => setSt(await loadAlerts(role)), [role]);
  useEffect(() => { refresh(); const t = setInterval(refresh, 120000); return () => clearInterval(t); }, [refresh]);
  useEffect(() => { if (!open) return undefined; const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; const k = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h); document.addEventListener("keydown", k); return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); }; }, [open]);
  if (st?.none) return null;
  const items = st?.items || []; const cats = ["All", ...new Set(items.map((i) => i.cat))];
  const shown = cat === "All" ? items : items.filter((i) => i.cat === cat);
  const markAll = async () => {
    if (st.patient) { const r = await api("patient/notifications/read", { method: "POST", body: {} }); if (!r.ok) return; }
    else { const s = readSeen(); items.forEach((i) => { s[i.id] = i.n; }); try { localStorage.setItem(SEEN, JSON.stringify(s)); } catch { /* ignore */ } }
    refresh();
  };
  const go = (i) => { if (!st.patient) { const s = readSeen(); s[i.id] = i.n; try { localStorage.setItem(SEEN, JSON.stringify(s)); } catch { /* ignore */ } } setOpen(false); nav(i.to); refresh(); };
  return (
    <div className="notif" ref={ref}>
      <button className="icon-btn bell" aria-label={`Notifications${st?.unread ? `, ${st.unread} unread` : ""}`} aria-expanded={open} onClick={() => { setOpen(!open); if (!open) refresh(); }}>
        <Bell />{st?.unread > 0 && <em className="bell-n">{st.unread > 9 ? "9+" : st.unread}</em>}</button>
      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-head"><b>Notifications</b>{st?.unread > 0 && <button className="link small" onClick={markAll}>Mark all read</button>}</div>
          {cats.length > 2 && <div className="notif-cats">{cats.map((c) => <button key={c} className={`chip-btn ${c === cat ? "on" : ""}`} onClick={() => setCat(c)}>{c}</button>)}</div>}
          {st === undefined ? <p className="muted small notif-empty">Loading…</p> : st === null ? <p className="muted small notif-empty">Could not load notifications. <button className="link small" onClick={refresh}>Retry</button></p>
            : shown.length === 0 ? <p className="muted small notif-empty">You're all caught up.</p>
            : <ul className="notif-list">{shown.map((i) => (
              <li key={i.id}><button className={i.unread ? "unread" : ""} onClick={() => go(i)}>
                <span className={`dot ${i.unread ? "on" : ""}`} /><span className="grow"><b>{i.title}</b><small className="muted">{i.cat}{i.when ? ` · ${fmtDateTime(i.when)}` : ""}</small></span></button></li>))}</ul>}
        </div>)}
    </div>);
}

// ---- Command palette (Ctrl/⌘ K) over the real menu ----
function exportTable() {
  const t = document.querySelector(".content table"); if (!t) return false;
  const esc = (v) => `"${String(v).replace(/\s+/g, " ").trim().replace(/"/g, '""')}"`;
  const csv = [...t.querySelectorAll("tr")].map((tr) => [...tr.children].map((c) => esc(c.innerText)).join(",")).join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
  a.download = `${(document.querySelector(".page-head h1")?.innerText || "table").replace(/\W+/g, "-").toLowerCase()}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000); return true;
}
function Palette({ open, onClose, items }) {
  const [q, setQ] = useState(""); const [i, setI] = useState(0); const inp = useRef(null);
  useEffect(() => { if (open) { setQ(""); setI(0); setTimeout(() => inp.current?.focus(), 20); } }, [open]);
  const list = items.filter((x) => (x.label + " " + (x.hint || "")).toLowerCase().includes(q.toLowerCase()));
  if (!open) return null;
  const run = (x) => { onClose(); x.run(); };
  return (
    <div className="modal-back palette-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-in"><Search /><input ref={inp} value={q} placeholder="Jump to a screen or run an action…" aria-label="Search commands"
          onChange={(e) => { setQ(e.target.value); setI(0); }}
          onKeyDown={(e) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowDown") { e.preventDefault(); setI((v) => Math.min(v + 1, list.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setI((v) => Math.max(v - 1, 0)); } if (e.key === "Enter" && list[i]) run(list[i]); }} /><kbd>Esc</kbd></div>
        <ul className="palette-list" role="listbox">{list.length === 0 ? <li className="muted small" style={{ padding: 14 }}>No matches.</li> : list.map((x, k) => (
          <li key={x.label}><button role="option" aria-selected={k === i} className={k === i ? "on" : ""} onMouseEnter={() => setI(k)} onClick={() => run(x)}>
            <Glyph name={x.label} /><span className="grow">{x.label}</span><small className="muted">{x.hint}</small></button></li>))}</ul>
      </div>
    </div>);
}

export default function Shell() {
  const { user, signOut } = useAuth();
  const nav = useNavigate(); const loc = useLocation();
  const portal = PORTALS[user.portal];
  const initials = (user.name || user.permanentid).split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const [drawer, setDrawer] = useState(false); const [pal, setPal] = useState(false);
  const [mini, setMini] = useState(() => { try { return localStorage.getItem("cobalt.mini") === "1"; } catch { return false; } });
  const [density, setDensity] = useState(() => { try { return localStorage.getItem("cobalt.density") || "comfortable"; } catch { return "comfortable"; } });
  const [scale, setScale] = useState(() => { try { return localStorage.getItem("cobalt.scale") || "100"; } catch { return "100"; } });
  const timer = useRef(null);
  useEffect(() => {
    const reset = () => { clearTimeout(timer.current); timer.current = setTimeout(() => { signOut(); window.location.href = "/login?reason=idle"; }, IDLE_MS); };
    reset(); ["mousemove", "keydown", "click", "touchstart"].forEach((e) => window.addEventListener(e, reset));
    return () => { clearTimeout(timer.current); ["mousemove", "keydown", "click", "touchstart"].forEach((e) => window.removeEventListener(e, reset)); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setDrawer(false); window.scrollTo?.({ top: 0 }); }, [loc.pathname]);
  useEffect(() => { try { localStorage.setItem("cobalt.mini", mini ? "1" : "0"); } catch { /* ignore */ } }, [mini]);
  useEffect(() => { document.documentElement.dataset.density = density; try { localStorage.setItem("cobalt.density", density); } catch { /* ignore */ } }, [density]);
  useEffect(() => { document.documentElement.style.fontSize = `${scale}%`; try { localStorage.setItem("cobalt.scale", scale); } catch { /* ignore */ } }, [scale]);

  // mobile card-mode for tables: copy each header into data-label (attributes only, no DOM moves)
  useEffect(() => {
    const label = () => document.querySelectorAll(".content table").forEach((t) => {
      const h = [...t.querySelectorAll("thead th")].map((th) => th.innerText.trim());
      if (!h.length) return; t.classList.add("rtable");
      t.querySelectorAll("tbody tr").forEach((tr) => [...tr.children].forEach((td, k) => { if (h[k] && td.dataset.label !== h[k]) td.dataset.label = h[k]; }));
    });
    label(); const mo = new MutationObserver(label); const el = document.querySelector(".content");
    if (el) mo.observe(el, { childList: true, subtree: true }); return () => mo.disconnect();
  }, []);

  const signOutAsk = async () => { const { confirmDialog } = await import("./Dialogs"); if (await confirmDialog({ title: "Sign out?", text: "You will need to sign in again.", okText: "Yes, sign out" })) { signOut(); nav("/login"); } };
  const modules = modulesOf(user.portal, user);
  const commands = useMemo(() => [
    { label: "Dashboard", hint: "Home", run: () => nav("/app") },
    ...modules.filter((m) => m.path).map((m) => ({ label: m.name, hint: "Open", run: () => nav(`/app/${m.path}`) })),
    { label: "Export visible table (CSV)", hint: "Action", run: async () => { const { toast } = await import("./Dialogs"); toast(exportTable() ? { type: "success", title: "Table exported", text: "The CSV holds the rows shown on screen." } : { type: "info", title: "No table on this screen" }); } },
    { label: "Change password", hint: "Account", run: () => nav("/change-password") },
    { label: "Toggle compact density", hint: "Display", run: () => setDensity((d) => (d === "compact" ? "comfortable" : "compact")) },
    { label: "Sign out", hint: "Account", run: signOutAsk },
  ], [user.portal]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPal((v) => !v); }
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && !document.querySelector(".modal-back,.swal-backdrop")) { e.preventDefault(); setPal(true); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);
  const current = modules.find((m) => m.path && loc.pathname.startsWith(`/app/${m.path}`))?.name || (loc.pathname === "/app" ? "Dashboard" : "");

  return (
    <div className={`shell ${mini ? "mini" : ""} ${drawer ? "drawer-open" : ""}`}>
      <a className="skip" href="#main">Skip to content</a>
      <div className="scrim no-print" onClick={() => setDrawer(false)} aria-hidden="true" />
      <aside className="sidebar no-print" aria-label="Main navigation">
        <div className="side-top">
          <div className="brand"><span className="brand-mark"><Pulse /></span><div className="brand-text"><b>Cobalt</b><small>{portal.title}</small></div></div>
          <button className="icon-btn ghosty collapse-btn" onClick={() => setMini(!mini)} aria-label={mini ? "Expand sidebar" : "Collapse sidebar"} title={mini ? "Expand" : "Collapse"}><Collapse /></button>
        </div>
        <button className="side-search" onClick={() => setPal(true)}><Search /><span className="nav-text">Search</span><kbd>Ctrl K</kbd></button>
        <nav>
          <NavLink to="/app" end className="nav-item" title="Dashboard"><Grid /> <span className="nav-text">Dashboard</span></NavLink>
          <p className="nav-label">Modules</p>
          {modules.map(({ name, phase, path }) => (
            <NavLink key={name} to={`/app/${path || slug(name)}`} state={{ name, phase }} className="nav-item" title={name}>
              <Glyph name={name} /> <span className="nav-text">{name}</span>{!path && <em className="phase-tag">Soon</em>}
            </NavLink>
          ))}
          {user.role === "PATIENT" && user.validated === false && <p className="muted small nav-note">Medical menus open after a hospital, lab, pharmacy or receptionist validates your Permanent ID.</p>}
          {user.role === "DOCTOR" && <DoctorQueue />}
          <p className="nav-label">Account</p>
          <button className="nav-item" onClick={() => nav("/change-password")} title="Change password"><Key /> <span className="nav-text">Change password</span></button>
        </nav>
        <div className="side-user">
          <div className="avatar sm2" aria-hidden="true">{initials}</div>
          <div className="grow nav-text"><b className="ellipsis">{user.name || user.permanentid}</b><small className="muted ellipsis">{user.permanentid}</small></div>
          <button className="icon-btn ghosty" onClick={signOutAsk} aria-label="Sign out" title="Sign out"><Logout /></button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar no-print">
          <div className="top-left">
            <button className="icon-btn menu-btn" onClick={() => setDrawer(true)} aria-label="Open menu"><Menu /></button>
            <div><p className="crumb">{portal.title}</p><h2 className="top-title">{current || " "}</h2></div>
          </div>
          <div className="topbar-right">
            <button className="top-search" onClick={() => setPal(true)} aria-label="Search (Ctrl K)"><Search /><span>Search screens & actions</span><kbd>Ctrl K</kbd></button>
            {user.role === "PATIENT" && <NavLink className="btn primary sm hide-sm" to="/app/book-appointment">Book appointment</NavLink>}
            <NotificationCenter role={user.role} />
            <details className="prefs">
              <summary className="icon-btn" aria-label="Display settings" title="Display settings"><svg {...sv}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg></summary>
              <div className="prefs-panel">
                <p className="label tight">Theme</p><ThemeToggle />
                <p className="label tight">Density</p>
                <div className="seg">{["comfortable", "compact"].map((d) => <button key={d} className={density === d ? "on" : ""} onClick={() => setDensity(d)}>{d}</button>)}</div>
                <p className="label tight">Text size</p>
                <div className="seg">{["90", "100", "112"].map((s) => <button key={s} className={scale === s ? "on" : ""} onClick={() => setScale(s)}>{s === "90" ? "A−" : s === "100" ? "A" : "A+"}</button>)}</div>
              </div>
            </details>
            <div className="avatar" title={user.permanentid}>{initials}</div>
          </div>
        </header>
        <main id="main" className="content"><div className="route-fade" key={loc.pathname}><Outlet /></div></main>
      </div>
      <Palette open={pal} onClose={() => setPal(false)} items={commands} />
    </div>
  );
}
