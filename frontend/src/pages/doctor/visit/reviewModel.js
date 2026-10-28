// System review (old system-review-symptoms.html + modals.html, converted to /legacy/data/sysrev.json).
// Answers: { radio: {name: optionId}, check: {id: true}, value: {id: v}, model: {"modal|id": [parts]}, fig: {system: [parts]} }
export const emptyReview = () => ({ radio: {}, check: {}, value: {}, model: {}, fig: {} });
const ORGANS = ["renalSystemModals", "femalaReproductionSystemModals", "femalaBreastSystemModals"];
export const isOrgan = (m) => ORGANS.includes(m);
export const groupKey = (g, scope) => g.name || `${scope}:${g.title}`;

function modalItems(data, id, ans, seen) {
  const m = data.modals[id];
  if (!m || seen.has(id)) return [];
  seen.add(id);
  const out = [];
  for (const g of m.groups) out.push(...groupItems(data, g, ans, seen, id));
  return out;
}

export function groupItems(data, g, ans, seen = new Set(), scope = "") {
  const out = [];
  const key = groupKey(g, scope);
  for (const o of g.options) {
    const t = o.type || "radio";
    if (t === "radio") {
      if (ans.radio[key] !== o.id) continue;
      if (o.value) out.push(o.value);
      if (o.modal) out.push(...modalItems(data, o.modal, ans, seen));
    } else if (t === "checkbox") {
      if (ans.check[o.id] && o.value) out.push(o.value);
    } else if (t === "number") {
      const v = String(ans.value[o.id] || "").trim();
      if (v) out.push(`${g.title || "Value"}: ${v}`);
    } else if (t === "model") {
      (ans.model[`${scope}|${o.id}`] || []).forEach((p) => out.push(`Located on ${p.toLowerCase()}`));
    } else if (t === "button" && o.modal) {
      out.push(...modalItems(data, o.modal, ans, seen));
    }
  }
  return out;
}

function walk(data, nodes, ans, out, seen) {
  for (const n of nodes) {
    if (n.type === "tabs") n.tabs.forEach((t) => walk(data, t.children, ans, out, seen));
    else if (n.type === "group") out.push(...groupItems(data, n, ans, seen));
  }
}

export function systemItems(data, sys, ans) {
  const out = [];
  walk(data, sys.children, ans, out, new Set());
  (ans.fig[sys.id] || []).forEach((p) => out.push(`Located on ${p.toLowerCase()}`));
  return [...new Set(out.map((x) => x.replace(/\s+/g, " ").trim().replace(/,$/, "")).filter(Boolean))];
}

// Stored in patient_reportfile_data.system_review: "Symptom-HEENT,With Lesions,Without Trauma,..."
export function reviewText(data, ans) {
  if (!data) return "";
  const parts = [];
  for (const s of data.systems) {
    const items = systemItems(data, s, ans);
    if (items.length) parts.push(`Symptom-${s.label}`, ...items);
  }
  return parts.join(",");
}
