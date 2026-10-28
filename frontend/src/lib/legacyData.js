// Large clinical catalogs converted from the old jQuery app (public/legacy/data).
// Loaded once, on demand, and cached for the session.
const cache = {};
export function loadLegacy(name) {
  if (!cache[name]) cache[name] = fetch(`/legacy/data/${name}.json`).then((r) => { if (!r.ok) throw new Error(name); return r.json(); });
  return cache[name];
}

import { useEffect, useState } from "react";
export function useLegacy(name) {
  const [state, set] = useState({ data: null, error: false });
  useEffect(() => { let on = true; loadLegacy(name).then((d) => on && set({ data: d, error: false })).catch(() => on && set({ data: null, error: true })); return () => { on = false; }; }, [name]);
  return state;
}

// "Acid Reflux (Heartburn)" / "Acid-Reflux" -> "ACID REFLUX" (same rule as the old getSelectedSymptomKey)
export const symptomKey = (s) => String(s || "").replace(/ *\([^)]*\) */g, " ").replace(/[-\s]+/g, " ").trim().toUpperCase();

// Clean an SVG element id ("Groin_1_", "Right Eye ") into the body-part text the old app showed
export const partName = (id) => String(id || "").replace(/_x2F_/g, "/").replace(/_\d+_$/, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
