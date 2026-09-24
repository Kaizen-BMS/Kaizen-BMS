"use client";

import { useState } from "react";

// Dates are typed and shown as DD/MM/YY (storage stays a real ISO date).
// value/onChange use "YYYY-MM-DD"; an unfinished or invalid entry is flagged, not silently dropped.
export function isoToDDMMYY(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y.slice(2)}` : "";
}

export function parseDDMMYY(text) {
  const m = String(text).trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const dt = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (dt.getUTCFullYear() !== yyyy || dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== dd) return null;
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

export default function DateInput({ value, onChange, placeholder = "DD/MM/YY", className = "", title }) {
  const [text, setText] = useState(isoToDDMMYY(value));
  const [lastValue, setLastValue] = useState(value);
  const [bad, setBad] = useState(false);
  // Parent reset (e.g. form cleared) -> refresh what is shown.
  if (value !== lastValue) {
    setLastValue(value);
    if (parseDDMMYY(text) !== value) setText(isoToDDMMYY(value));
  }

  function commit(t) {
    if (!t.trim()) { setBad(false); setLastValue(""); onChange(""); return; }
    const iso = parseDDMMYY(t);
    if (iso) { setBad(false); setText(isoToDDMMYY(iso)); setLastValue(iso); onChange(iso); }
    else setBad(true);
  }

  return (
    <input
      value={text}
      title={title}
      inputMode="numeric"
      placeholder={placeholder}
      onChange={(e) => { setText(e.target.value); const iso = parseDDMMYY(e.target.value); if (iso) { setBad(false); setLastValue(iso); onChange(iso); } }}
      onBlur={(e) => commit(e.target.value)}
      aria-invalid={bad}
      className={`${className} ${bad ? "border-red-400 bg-red-50" : ""}`}
    />
  );
}
