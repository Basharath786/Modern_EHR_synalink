// Builds the "Symptom Questions" of the old patient-visit page (symptom-data.js) from the
// symptoms catalog (symptoms-json.js) and turns the doctor's answers into the same auto-text
// the old page produced (auto-text-json.js), e.g. "Symptom-Black Eye,Gradual onset.,In both eyes."
import { symptomKey } from "../../../lib/legacyData.js";

const human = (s) => String(s || "").replace(/-/g, " ").replace(/\s+/g, " ").trim();
const up = (s) => String(s || "").toUpperCase();
const ENTER_TEXT = ["ENTER-COUNTRY-NAME", "ENTER-SUBJECTIVE-DETAILS", "ENTER-PAST-HISTORY", "ENTER MEDICATION", "ENTER-MEDICATION", "ENTER-NAME", "ENTER NAME"];
const ENTER_NUM = ["ENTER AMOUNT", "ENTER-AMOUNT", "ENTER NUMBER", "ENTER-NUMBER"];
const MODEL = ["SELECT-AREA-ON-MODEL", "SELECT AREA ON MODEL", "QUADRANT CHOICE", "QUADRANT-CHOICE"];

export function findSymptom(catalog, name) {
  if (!catalog) return null;
  const k = symptomKey(name);
  return Object.keys(catalog).find((x) => symptomKey(x) === k) || null;
}

function phrase(auto, id) { return auto[String(id).toLowerCase()]; }

// One option of a top-level question (symptom-data.js rules)
function topOption(S, q, raw, auto) {
  const opt = String(raw).replace(/\s+/g, "-").replace(/ *\([^)]*\) */g, "");
  const id = `options-${S}-${q}-${opt}`;
  const U = up(opt), Q = up(q);
  if (ENTER_NUM.includes(U)) return { id, input: "number", label: "Enter amount", name: human(q) };
  if (ENTER_TEXT.includes(U)) return { id, input: "text", label: human(opt).replace(/^Enter /i, "Enter "), name: human(q) };
  if (U === "ENTER DATE" || U === "ENTER-DATE") return { id, input: "date", label: "Date", name: `${human(q)} on` };
  if (Q.includes("PAIN SCALE") || Q.includes("PAIN-SCALE")) return { id, input: "number", label: "1-10", min: 1, max: 10, name: human(q) };
  if (MODEL.includes(U)) return { id, input: "model", label: "Select area on model" };
  if (Q.includes("DURATION")) return { id, input: "duration", label: `Enter ${opt}`, name: human(opt) };
  const multi = Q.includes("SELECT-ALL-THAT-APPLY") || Q.includes("SELECT ALL THAT APPLY");
  if (multi && U === "MULTIPLE") return null;
  return { id, input: multi ? "check" : "radio", label: human(opt), text: phrase(auto, id) || `${human(q)}: ${human(opt)}` };
}

// One option inside a sub-question (the old "-Options" modal); ids drop the parent option name
function subOption(S, q, h, c, auto) {
  const id = `${S}-${q}-${h}-${c}`;
  const U = up(c), H = up(h);
  if (H.includes("DURATION")) return { id, input: "number", label: `Enter ${c}`, name: human(c) };
  if (ENTER_NUM.includes(U)) return { id, input: "text", label: "Enter amount", name: human(h) };
  if (["ENTER-COUNTRY-NAME", "ENTER MEDICATION", "ENTER-MEDICATION", "ENTER NAME", "ENTER-NAME"].includes(U)) return { id, input: "text", label: human(c), name: human(h) };
  if (H.includes("PAIN SCALE") || H.includes("PAIN-SCALE")) return { id, input: "number", label: "1-10", min: 1, max: 10, name: human(h) };
  if (U === "ENTER-DATE" || U === "ENTER DATE") return { id, input: "date", label: "Date", name: `${human(q)} on` };
  if (U === "SELECT-AREA-ON-MODEL") return { id, input: "model", label: "Select area on model" };
  const multi = H.includes("SELECT-ALL-THAT-APPLY") || H.includes("SELECT ALL THAT APPLY");
  if (multi && U === "MULTIPLE") return null;
  return { id, input: multi ? "check" : "radio", label: human(c), text: phrase(auto, id) || `${human(h)}: ${human(c)}` };
}

export function buildQuestions(catalog, auto, S) {
  const root = (catalog?.[S] || [])[0];
  if (!root || typeof root !== "object") return [];
  return Object.keys(root).map((q) => {
    const group = `${S}-${q}`;
    const options = [];
    for (const raw of root[q] || []) {
      if (typeof raw === "string") { const o = topOption(S, q, raw, auto); if (o) options.push(o); continue; }
      if (raw && typeof raw === "object") {
        for (const d of Object.keys(raw)) {
          const v = raw[d];
          if (Array.isArray(v) && v.length === 1 && v[0] && typeof v[0] === "object") {
            const sub = Object.keys(v[0]).map((h) => ({
              key: h, title: human(h), group: `${S}-${q}-${h}`,
              options: (v[0][h] || []).filter((c) => typeof c === "string").map((c) => subOption(S, q, h, c, auto)).filter(Boolean),
            }));
            options.push({ id: `${S}-${q}-${d}`, input: "sub", label: human(d), sub });
          } else {
            const id = `${S}-${q}-${d}`;
            options.push({ id, input: "radio", label: human(d), text: phrase(auto, id) || `${human(q)}: ${human(d)}` });
          }
        }
      }
    }
    const multi = up(q).includes("SELECT-ALL-THAT-APPLY") || up(q).includes("SELECT ALL THAT APPLY");
    return { key: q, title: human(q).replace(/select all that apply/i, "(select all that apply)"), group, multi, options };
  });
}

// answers: { radio: {group: optionId}, check: {id: true}, value: {id: "text"}, model: {id: [parts]} }
export const emptyAnswers = () => ({ radio: {}, check: {}, value: {}, model: {} });

function optionItems(o, ans, groupName) {
  const out = [];
  if (o.input === "radio") { if (ans.radio[groupName] === o.id && o.text) out.push(o.text); }
  else if (o.input === "check") { if (ans.check[o.id] && o.text) out.push(o.text); }
  else if (o.input === "text") { const v = (ans.value[o.id] || "").trim(); if (v) out.push(`with ${v} ${o.name}`); }
  else if (o.input === "duration") { const v = (ans.value[o.id] || "").trim(); if (v) out.push(`with ${v} ${o.name}`); }
  else if (o.input === "number") { const v = (ans.value[o.id] || "").trim(); if (v) out.push(`${v} ${o.name}`); }
  else if (o.input === "date") { const v = (ans.value[o.id] || "").trim(); if (v) out.push(`${o.name} ${v}`); }
  else if (o.input === "model") { (ans.model[o.id] || []).forEach((p) => out.push(`Located on ${p.toLowerCase()}`)); }
  return out;
}

export function itemsFor(questions, ans) {
  const out = [];
  for (const q of questions) {
    for (const o of q.options) {
      if (o.input === "sub") {
        if (ans.radio[q.group] !== o.id) continue;
        for (const s of o.sub) for (const so of s.options) out.push(...optionItems(so, ans, s.group));
      } else out.push(...optionItems(o, ans, q.group));
    }
  }
  return [...new Set(out.map((x) => x.replace(/\s+/g, " ").trim().replace(/\.$/, "")).filter(Boolean))];
}

// Final string stored in patient_reportfile_data.subjective_symptoms (same layout as Java)
export function subjectiveText(blocks) {
  const parts = [];
  for (const b of blocks) {
    if (!b.items.length && !b.custom.length) continue;
    parts.push(`Symptom-${human(b.name)}`);
    b.items.forEach((i) => parts.push(`${i}.`));
    if (b.custom.length) { parts.push("Add Custom Descriptions List:"); b.custom.forEach((c) => parts.push(c)); }
  }
  return parts.join(",");
}
