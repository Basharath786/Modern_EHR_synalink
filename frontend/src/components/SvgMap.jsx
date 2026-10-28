import { useEffect, useRef } from "react";
import { partName } from "../lib/legacyData";

import anatomyMaleFront from "../assets/models/anatomy_male_front.svg?raw";
import anatomyMaleBack from "../assets/models/anatomy_male_back.svg?raw";
import anatomyFemaleFront from "../assets/models/anatomy_female_front.svg?raw";
import anatomyFemaleBack from "../assets/models/anatomy_female_back.svg?raw";
import bodyMaleFront from "../assets/models/body_male_front.svg?raw";
import bodyMaleBack from "../assets/models/body_male_back.svg?raw";
import bodyFemaleFront from "../assets/models/body_female_front.svg?raw";
import bodyFemaleBack from "../assets/models/body_female_back.svg?raw";
import organMale from "../assets/models/organ_male.svg?raw";
import organFemale from "../assets/models/organ_female.svg?raw";
import organBreast from "../assets/models/organ_breast.svg?raw";

// The same drawings the old portal used (3dmodel_male.html / 3dmodel_female2.html for the
// detailed anatomy, appointment-booking.html for the body-part map, organ modals of patient-visit.html).
export const MODELS = {
  anatomy: { male: [anatomyMaleFront, anatomyMaleBack], female: [anatomyFemaleFront, anatomyFemaleBack] },
  body: { male: [bodyMaleFront, bodyMaleBack], female: [bodyFemaleFront, bodyFemaleBack] },
  organ: { renalSystemModals: organMale, femalaReproductionSystemModals: organFemale, femalaBreastSystemModals: organBreast },
};
export const genderKey = (g) => (String(g || "").toLowerCase().startsWith("f") ? "female" : "male");

// Renders a legacy SVG; clicking any region with an id calls onPick(cleanName, rawId).
export default function SvgMap({ svg, selected = [], onPick, className = "" }) {
  const box = useRef(null);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const want = new Set(selected.map((s) => s.toLowerCase()));
    el.querySelectorAll("[id]").forEach((n) => {
      if (n.tagName.toLowerCase() === "svg") return;
      n.classList.toggle("sel", want.has(partName(n.id).toLowerCase()));
    });
  }, [selected, svg]);
  function click(e) {
    let n = e.target;
    while (n && n !== box.current) {
      if (n.id && n.tagName && n.tagName.toLowerCase() !== "svg") { onPick?.(partName(n.id), n.id); return; }
      n = n.parentNode;
    }
  }
  return <div ref={box} className={`svgmap ${className}`} onClick={click} dangerouslySetInnerHTML={{ __html: svg }} role="img" aria-label="Body model, click a region" />;
}
