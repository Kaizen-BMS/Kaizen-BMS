"use client";

import { useState } from "react";

// MFD/Expiry are always printed on a pack as MM/YYYY -- no day -- so typing
// and showing a full DD/MM/YY date for them was asking for information the
// pack never gives. Typed and shown as MM/YYYY; value/onChange still carry
// a real ISO "YYYY-MM-DD" date underneath (storage stays a real DATE
// column, same as every other date in this schema), anchored to either the
// 1st of that month ("start", for MFD -- manufactured sometime that month,
// the exact day doesn't matter) or the LAST day of it ("end", for Expiry --
// valid through the whole printed month; anchoring to day 1 would make the
// system call a batch expired a day into the month it's still good for).
export function isoToMMYYYY(iso) {
  if (!iso) return "";
  const [y, m] = String(iso).slice(0, 10).split("-");
  return y && m ? `${m}/${y}` : "";
}

function lastDayOfMonth(yyyy, mm) {
  return new Date(Date.UTC(yyyy, mm, 0)).getUTCDate();
}

export function parseMMYYYY(text, mode = "start") {
  const m = String(text).trim().match(/^(\d{1,2})[/\-.](\d{2}|\d{4})$/);
  if (!m) return null;
  const mm = Number(m[1]);
  const yyyy = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  if (mm < 1 || mm > 12) return null;
  const dd = mode === "end" ? lastDayOfMonth(yyyy, mm) : 1;
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/** Slash inserted automatically after 2 digits -- typing "092028" alone becomes "09/2028". */
function autoSlash(raw) {
  const digits = raw.replace(/\D/g, "").slice(0, 6);
  return [digits.slice(0, 2), digits.slice(2)].filter(Boolean).join("/");
}

export default function MonthYearInput({ value, onChange, mode = "start", placeholder = "MM/YYYY", className = "", title }) {
  const [text, setText] = useState(isoToMMYYYY(value));
  const [lastValue, setLastValue] = useState(value);
  const [bad, setBad] = useState(false);
  // Parent reset (e.g. form cleared) -> refresh what is shown.
  if (value !== lastValue) {
    setLastValue(value);
    if (parseMMYYYY(text, mode) !== value) setText(isoToMMYYYY(value));
  }

  function commit(t) {
    if (!t.trim()) { setBad(false); setLastValue(""); onChange(""); return; }
    const iso = parseMMYYYY(t, mode);
    if (iso) { setBad(false); setText(isoToMMYYYY(iso)); setLastValue(iso); onChange(iso); }
    else setBad(true);
  }

  return (
    <input
      value={text}
      title={title}
      inputMode="numeric"
      placeholder={placeholder}
      onChange={(e) => {
        const formatted = autoSlash(e.target.value);
        setText(formatted);
        const iso = parseMMYYYY(formatted, mode);
        if (iso) { setBad(false); setLastValue(iso); onChange(iso); }
      }}
      onBlur={(e) => commit(e.target.value)}
      aria-invalid={bad}
      className={`${className} ${bad ? "border-red-400 bg-red-50" : ""}`}
    />
  );
}
