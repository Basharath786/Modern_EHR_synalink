const KEY = "cobalt.session";

export const session = {
  get: () => { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; } },
  set: (s) => sessionStorage.setItem(KEY, JSON.stringify(s)),
  clear: () => sessionStorage.removeItem(KEY),
};

function headers(isForm) {
  const s = session.get();
  return { ...(isForm ? {} : { "Content-Type": "application/json" }), ...(s?.token ? { Authorization: `Bearer ${s.token}` } : {}) };
}

function onUnauthorized(path, s, status) {
  if (status === 401 && s?.token && !path.startsWith("auth/login")) {
    session.clear();
    try { sessionStorage.setItem("cobalt.flash", "session"); } catch { /* storage blocked */ }
    window.location.href = "/login?reason=session";
  }
}

// Every create / update / approve / cancel ... asks for confirmation first and shows the result
// in a popup (legacy Swal.fire). Pass { confirm: false } when the screen already confirmed it
// (reason dialogs), { alert: false } to suppress the result popup.
const SILENT = [/^auth\/login/, /^auth\/me/, /^patient\/otp\//, /notifications\/read$/, /^doctor\/drug-interactions/, /^public\/registration-status$/,
  /^superadmin\/login/, /^superadmin\/status/, /^public\/(stats|reference|directory)/];
const NO_CONFIRM = [/\/verify$/, /\/resend$/, /^auth\/set-password\/request/, /^superadmin\/(code|setup)/, /^public\/registration-status\/code/];
let preConfirmed = 0;
export async function ask(text, opts = {}) {
  const { confirmDialog } = await import("./components/Dialogs");
  const yes = await confirmDialog({ title: text, ...opts });
  if (yes) preConfirmed = Date.now();
  return yes;
}

// Identical mutating requests already in flight share one promise (double-click protection).
const inflight = new Map();
export function api(path, opts = {}) {
  const m = opts.method || "GET";
  if (m === "GET" || opts.body instanceof FormData) return apiOnce(path, opts);
  const k = `${m} ${path} ${JSON.stringify(opts.body || null)}`;
  if (inflight.has(k)) return inflight.get(k);
  const pr = apiOnce(path, opts).finally(() => inflight.delete(k));
  inflight.set(k, pr); return pr;
}

// Network / connectivity alerts (shown once, never as a fake success)
async function toastOf(o) { const { toast } = await import("./components/Dialogs"); toast(o); }
if (typeof window !== "undefined") {
  window.addEventListener("offline", () => toastOf({ type: "warning", title: "You are offline", text: "Changes cannot be saved until the connection is back." }));
  window.addEventListener("online", () => toastOf({ type: "success", title: "Back online" }));
}

async function apiOnce(path, { method = "GET", body, confirm, alert } = {}) {
  const mutating = method !== "GET";
  const silent = mutating && SILENT.some((r) => r.test(path));
  // the button that started this action shows a spinner only while the request is really running
  const btn = mutating && !silent && typeof document !== "undefined" && document.activeElement?.tagName === "BUTTON" ? document.activeElement : null;
  if (mutating && !silent) {
    const recently = Date.now() - preConfirmed < 3000;
    preConfirmed = 0;
    // a reason / decision typed in a dialog is already the confirmation
    const typedReason = body && !(body instanceof FormData) && typeof body === "object" && (body.reason || body.decision);
    if (confirm !== false && !recently && !typedReason && !NO_CONFIRM.some((r) => r.test(path))) {
      const { confirmDialog, describe } = await import("./components/Dialogs");
      const [title, text, okText, danger] = describe(path, body);
      if (!(await confirmDialog({ title, text, okText, danger }))) return { ok: false, status: 0, cancelled: true, data: { status: "cancelled_by_user" } };
    }
  }
  if (btn) btn.setAttribute("aria-busy", "true");
  let out;
  try { out = await raw(path, method, body); } finally { if (btn) btn.removeAttribute("aria-busy"); }
  if (out.status === 0) { toastOf({ type: "error", title: "Network error", text: "The server could not be reached. Check your connection and try again." }); return out; }
  if (out.status === 403 && !mutating) toastOf({ type: "warning", title: "Not allowed", text: "Your account does not have access to this information." });
  if (out.status >= 500 && !mutating) toastOf({ type: "error", title: "Server error", text: "The server had a problem loading this. Please retry." });
  if (mutating && !silent && alert !== false && out.status !== 401) {
    const { notify, resultText } = await import("./components/Dialogs");
    notify(resultText(out.ok, out.data));
  }
  return out;
}

async function raw(path, method, body) {
  const s = session.get();
  const isForm = body instanceof FormData;
  let res;
  try { res = await fetch(`/api/v1/${path}`, { method, headers: headers(isForm), body: body ? (isForm ? body : JSON.stringify(body)) : undefined }); }
  catch { return { ok: false, status: 0, data: { status: "network_error" } }; }
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  onUnauthorized(path, s, res.status);
  return { ok: res.ok, status: res.status, data };
}

// Download/preview a protected file: fetch with the token, then open the blob.
export async function openFile(path) {
  const s = session.get();
  const res = await fetch(`/api/v1/${path}`, { headers: headers(false) });
  if (!res.ok) { onUnauthorized(path, s, res.status); return false; }
  const url = URL.createObjectURL(await res.blob());
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
