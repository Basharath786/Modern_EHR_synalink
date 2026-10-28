// "Past History" modal of the old patient-visit page (#pastHistoryModal).
// Plain fields are saved as "A, B"; structured ones as JSON: radio groups -> one value, sub groups -> list.
const DISEASES = ["Heart Attack", "Diabetes", "Dwarfism", "Cretinism", "Kidney Disease", "Blood Disorders", "Lung Disease", "High Blood Pressure", "Asthma",
  "High Cholestrol", "Cancer", "Stroke", "Genetic Birth Disorder", "Dementia", "Alzeihmers", "Anemia", "Heart Defect", "Spinal Defect", "Liver Disorders"];

export const PH_FIELDS = [
  { key: "family_history", title: "Family Medical History", type: "list", options: DISEASES },
  { key: "self_medical_history", title: "Self Medical History", type: "list", options: [...DISEASES, "Surgeries", "Allergies"] },
  { key: "drug_history", title: "Drug History", type: "list", options: ["Opiods", "Cocaine", "Heroin", "LSD", "PCP", "Marijuana", "Long Standing Medication"] },
  { key: "social_history", title: "Social History", type: "list", options: ["Alcohol", "Smoking", "Chewing Tobacco"] },
  { key: "personal_history", title: "Personal History", type: "json", groups: [
    { key: "diet", title: "Diet", radio: true, options: ["Vegetarian", "Non-Vegetarian", "Vegan", "Mixed Diet", "Special Diet"] },
    { key: "appetite", title: "Appetite", radio: true, options: ["Normal Appetite", "Reduced Appetite", "Increased Appetite"] },
    { key: "physical_activity", title: "Physical Activity", radio: true, options: ["Sedentary", "Light Activity", "Moderate Activity", "Active", "Highly Active"] },
    { key: "sleep", title: "Sleep", options: ["Normal Sleep", "Insomnia", "Excessive Sleep", "Poor Sleep", "Snoring", "Sleep Apnea"] },
    { key: "bowel_habits", title: "Bowel Habits", radio: true, options: ["Normal Bowel", "Constipation", "Diarrhea", "Alternating Bowel", "Bowel Incontinence"] },
    { key: "urination", title: "Urination", radio: true, options: ["Normal Urination", "Frequent Urination", "Painful Urination", "Night-time Urination", "Urinary Urgency", "Urinary Incontinence"] },
  ] },
  { key: "surgical_history", title: "Surgical History", type: "json", groups: [
    { key: "surgeries", title: "General", options: ["Appendectomy", "Gallbladder Removal", "Hernia Repair", "Hemorrhoid Surgery"] },
    { key: "surgeries", title: "Abdominal", options: ["Bowel Surgery", "Stomach Surgery", "Liver Surgery", "Pancreatic Surgery"] },
    { key: "surgeries", title: "Cardiac", options: ["Angioplasty/Stent", "Bypass Surgery", "Pacemaker", "Valve Surgery", "Other Heart Surgery"] },
    { key: "surgeries", title: "Orthopedic", options: ["Fracture Surgery", "Knee Surgery", "Hip Surgery", "Spine Surgery", "Joint Replacement"] },
    { key: "surgeries", title: "ENT", options: ["Tonsillectomy", "Adenoidectomy", "Sinus Surgery", "Ear Surgery"] },
    { key: "surgeries", title: "Eye", options: ["Cataract Surgery", "LASIK/Refractive Surgery", "Retinal Surgery", "Other Eye Surgery"] },
    { key: "surgeries", title: "Urological", options: ["Kidney Stone Procedure", "Prostate Surgery", "Kidney Surgery"] },
    { key: "surgeries", title: "Gynecological", options: ["C-Section", "Hysterectomy", "Ovarian Surgery", "Fibroid Surgery", "Tubal Ligation"] },
    { key: "surgeries", title: "Other", options: ["Cancer Surgery", "Transplant", "Other Surgery/Procedure"] },
  ] },
  { key: "smoking_history", title: "Smoking / Tobacco", type: "json", groups: [
    { key: "status", title: "Smoking Status", radio: true, options: ["Never", "Current", "Former"] },
    { key: "types", title: "Type", options: ["Cigarettes", "Bidi", "Cigar", "Pipe", "Vape/E-cigarette", "Chewing Tobacco", "Gutka", "Paan with Tobacco", "Other"] },
  ] },
  { key: "alcohol_history", title: "Alcohol", type: "json", groups: [
    { key: "status", title: "Alcohol Status", radio: true, options: ["Never", "Occasional", "Current", "Former"] },
    { key: "type", title: "Type", options: ["Beer", "Wine", "Spirits/Liquor", "Other"] },
  ] },
  { key: "substance_use_history", title: "Substance Use", type: "json", groups: [
    { key: "status", title: "Status", radio: true, options: ["Never", "Current", "Former"] },
    { key: "substances", title: "Substance", options: ["Cannabis", "Opioids", "Cocaine", "Amphetamines/Stimulants", "Sedatives", "Hallucinogens", "Inhalants", "Other"] },
  ] },
  { key: "obstetric_history", title: "Obstetric History", type: "json", female: true, groups: [
    { key: "complications", title: "Complications", options: ["Gestational Diabetes", "High Blood Pressure", "Preeclampsia", "Premature Delivery", "Postpartum Hemorrhage"] },
  ] },
  { key: "menstrual_gyn_history", title: "Menstrual / Gynecological History", type: "json", female: true, groups: [
    { key: "problems", title: "Problems", options: ["Heavy Bleeding", "Painful Periods", "Irregular Bleeding", "Absent Periods", "Postmenopausal Bleeding"] },
    { key: "contraception", title: "Contraception", options: ["Contraception-None", "Condom", "Oral Pill", "IUD", "Implant", "Injection", "Sterilization", "Other"] },
  ] },
  { key: "sexual_history", title: "Sexual History", type: "json", groups: [
    { key: "activity", title: "Sexual Activity", radio: true, options: ["Not Currently Sexually Active", "Sexually Active", "Prefer Not to Say"] },
    { key: "partner_type", title: "Partner Type", options: ["Male Partner(s)", "Female Partner(s)", "Both Partners"] },
    { key: "sexual_health_history", title: "Sexual Health History", options: ["STI History", "High-Risk Exposure", "Pain During Sex", "Erectile Dysfunction", "Infertility", "Other Sexual Concern"] },
  ] },
  { key: "psychiatric_history", title: "Psychiatric History", type: "json", groups: [
    { key: "diagnosis", title: "Conditions", options: ["Depression", "Anxiety", "Bipolar Disorder", "Schizophrenia/Psychosis", "ADHD", "Eating Disorder", "Substance Use Disorder",
      "Previous Psychiatric Admission", "Previous Self-Harm", "Other"] },
  ] },
];

// Accepts strict JSON (new + Java format) or the loose "{status:Current,types:[A,B]}" form.
export function parseJsonHistory(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try { const v = JSON.parse(raw); return v && typeof v === "object" ? v : {}; } catch { /* loose form */ }
  const s = String(raw).trim().replace(/^\{/, "").replace(/\}$/, "");
  const out = {}; let depth = 0, cur = ""; const parts = [];
  for (const ch of s) { if (ch === "[" || ch === "{") depth++; if (ch === "]" || ch === "}") depth--; if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch; }
  if (cur.trim()) parts.push(cur);
  for (const p of parts) {
    const i = p.indexOf(":"); if (i < 0) continue;
    const k = p.slice(0, i).trim(); const v = p.slice(i + 1).trim();
    out[k] = v.startsWith("[") ? v.slice(1, -1).split(",").map((x) => x.trim()).filter(Boolean) : v;
  }
  return out;
}

export const listOf = (raw) => String(raw || "").split(",").map((s) => s.trim()).filter(Boolean);

// state for the modal: { family_history: ["Diabetes"], personal_history: {diet: "Vegan", sleep: [...]}, ... }
export function historyState(h) {
  const st = {};
  for (const f of PH_FIELDS) st[f.key] = f.type === "list" ? listOf(h?.[f.key] ?? (f.key === "self_medical_history" ? h?.past_history : "")) : parseJsonHistory(h?.[f.key]);
  return st;
}

// what is sent to the API (plain lists joined by ", ", structured as objects)
export function historyPayload(st) {
  const out = {};
  for (const f of PH_FIELDS) out[f.key] = f.type === "list" ? (st[f.key] || []).join(", ") : (st[f.key] || {});
  return out;
}

export function historySummary(st, f) {
  const v = st[f.key];
  if (f.type === "list") return v?.length ? v.join(", ") : "None";
  const vals = Object.values(v || {}).flat().filter(Boolean);
  return vals.length ? vals.join(", ") : "None";
}
