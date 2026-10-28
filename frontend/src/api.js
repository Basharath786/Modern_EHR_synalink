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
    window.location.href = "/login?reason=session";
  }
}

export async function api(path, { method = "GET", body } = {}) {
  const s = session.get();
  const isForm = body instanceof FormData;
  const res = await fetch(`/api/v1/${path}`, { method, headers: headers(isForm), body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
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
