"use client";

const inp = "w-full rounded-lg border bg-white px-2.5 py-1.5 text-sm focus:outline-none";

/** Digits only, capped at 12 — same "strip as you type" shape as phoneDigitsInfo. */
export function aadhaarDigitsInfo(raw) {
  const all = String(raw || "").replace(/\D/g, "");
  return { digits: all.slice(0, 12), tooLong: all.length > 12, valid: all.slice(0, 12).length === 12 };
}

/**
 * Aadhaar field: only digits can ever land in the box (letters/hyphens are
 * silently dropped as you type, never rejected after the fact), capped at
 * 12, with the same live "N / 12 digits" counter PhoneInput already uses —
 * one consistent pattern for every "just a number, N digits long" field.
 */
export default function AadhaarInput({ label = "Aadhaar number", value, onChange, className = "" }) {
  const { digits, valid } = aadhaarDigitsInfo(value);
  const touched = digits.length > 0;
  const border = touched && valid ? "border-emerald-400 focus:border-emerald-500" : "border-slate-300 focus:border-slate-500";

  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="12 digits"
        value={digits}
        onChange={(e) => onChange(aadhaarDigitsInfo(e.target.value).digits)}
        className={`${inp} ${border} mt-1 ${className}`}
        aria-invalid={touched && !valid}
      />
      <span className={`mt-0.5 block text-[11px] ${valid ? "text-emerald-600" : "text-slate-400"}`}>
        {digits.length} / 12 digits{valid ? " ✓" : ""}
      </span>
    </label>
  );
}
