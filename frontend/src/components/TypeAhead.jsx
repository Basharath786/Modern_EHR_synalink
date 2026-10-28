import { useEffect, useRef, useState } from "react";
import { api } from "../api";

// Search-as-you-type against a catalog endpoint. Items may be strings or {name, category}.
export default function TypeAhead({ endpoint, onPick, placeholder, allowCustom = true, clearOnPick = true }) {
  const [q, setQ] = useState(""); const [items, setItems] = useState([]); const [open, setOpen] = useState(false);
  const box = useRef(null); const picked = useRef(null);
  useEffect(() => {
    if (q.trim().length < 2) { setItems([]); return; }
    if (picked.current === q) return;   // value set by picking a suggestion: don't reopen the list
    const t = setTimeout(async () => { const { data } = await api(`${endpoint}?q=${encodeURIComponent(q.trim())}`); setItems(data.items || []); setOpen(true); }, 250);
    return () => clearTimeout(t);
  }, [q, endpoint]);
  useEffect(() => { const h = (e) => box.current && !box.current.contains(e.target) && setOpen(false); document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const pick = (v) => { onPick(v); setOpen(false); if (clearOnPick) setQ(""); else { picked.current = v; setQ(v); } };
  return (
    <div className="typeahead" ref={box}>
      <input className="search" value={q} placeholder={placeholder} onChange={(e) => { picked.current = null; setQ(e.target.value); }} onFocus={() => items.length && setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (allowCustom && q.trim()) pick(q.trim()); } }} />
      {open && items.length > 0 && (
        <ul className="suggest">{items.map((it, i) => { const name = typeof it === "string" ? it : it.name; return (
          <li key={i}><button type="button" onClick={() => pick(name)}>{name}{it.category && <em>{it.category}</em>}</button></li>); })}</ul>)}
    </div>
  );
}
