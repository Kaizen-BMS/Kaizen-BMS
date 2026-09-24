"use client";

import { useEffect, useId, useRef, useState } from "react";
import { apiGet } from "./api";

// Type-ahead for one medicine identity ("Cap Cefixime 200 mg"). Suggestions
// appear from the first character; click (or Enter) picks one. Stale
// responses are dropped so a slow earlier keystroke never overwrites a later one.
export default function MedicineInput({ value, onChange, onPick, endpoint = "/api/pharmacy/medicines/suggest", placeholder = "Start typing a medicine…", className = "", autoFocus = false }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [loading, setLoading] = useState(false);
  const reqRef = useRef(0);
  const timer = useRef(null);
  const boxRef = useRef(null);
  const listId = useId();

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function search(text) {
    clearTimeout(timer.current);
    if (!text.trim()) { setItems([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      const id = ++reqRef.current;
      setLoading(true);
      try {
        const d = await apiGet(`${endpoint}?q=${encodeURIComponent(text.trim())}`);
        if (reqRef.current === id) { setItems(d.items || []); setHi(0); setOpen(true); }
      } catch {
        if (reqRef.current === id) setItems([]);
      } finally {
        if (reqRef.current === id) setLoading(false);
      }
    }, 90);
  }

  function pick(it) {
    onChange(it.name);
    onPick?.(it);
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        value={value}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); search(e.target.value); }}
        onFocus={() => items.length && setOpen(true)}
        onKeyDown={(e) => {
          if (!open || !items.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, items.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); pick(items[hi]); }
          else if (e.key === "Escape") setOpen(false);
        }}
        className={className}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
      />
      {open && (
        <ul id={listId} className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg" role="listbox">
          {items.length === 0 && !loading && <li className="px-3 py-2 text-xs text-slate-400">No matching medicine in your list.</li>}
          {items.map((it, i) => (
            <li key={it.id} role="option" aria-selected={i === hi}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(it)}
                onMouseEnter={() => setHi(i)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-1.5 text-left text-sm ${i === hi ? "bg-slate-100" : ""}`}
              >
                <span>
                  <span className="block font-medium">{it.name}</span>
                  <span className="block text-xs text-slate-400">{[it.type, it.strength, it.generic].filter(Boolean).join(" · ")}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${it.stock > 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                  {it.stock > 0 ? `Stock: ${it.stock}` : "Out of stock"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
