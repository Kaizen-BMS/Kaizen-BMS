"use client";

import { phoneDigitsInfo } from "@/lib/phone";

const inp = "w-full rounded-lg border bg-white px-2.5 py-1.5 text-sm focus:outline-none";

/**
 * One reusable phone field for every form in the product — label, placeholder, live "N / 10 digits"
 * counter, normalization (strips spaces/hyphens/+91 as you type), and error/success state. `value`
 * is always the plain digit string this stores; `onChange` receives that same normalized string.
 */
export default function PhoneInput({ label = "Phone Number", value, onChange, required, disabled, placeholder = "98765 43210", helperClassName = "" }) {
  const { digits, valid, tooLong } = phoneDigitsInfo(value);
  const touched = digits.length > 0;
  const showError = touched && !valid && !tooLong && digits.length === 10;
  const border = touched && valid ? "border-emerald-400 focus:border-emerald-500" : touched && (tooLong || showError) ? "border-red-400 focus:border-red-500" : "border-slate-300 focus:border-slate-500";

  return (
    <label className="block text-sm">
      {label && <span className="font-medium">{label}{required ? " *" : ""}</span>}
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        value={digits}
        onChange={(e) => onChange(phoneDigitsInfo(e.target.value).digits)}
        className={`${inp} ${border} mt-1 ${disabled ? "bg-slate-100 text-slate-400" : ""}`}
        aria-invalid={touched && !valid}
      />
      <span className={`mt-0.5 block text-[11px] ${valid ? "text-emerald-600" : tooLong ? "text-red-600" : "text-slate-400"} ${helperClassName}`}>
        {tooLong ? "Too many digits — enter a 10-digit mobile number." : `${digits.length} / 10 digits${valid ? " ✓" : ""}`}
      </span>
      {digits.length === 10 && !valid && (
        <span className="mt-0.5 block text-[11px] text-red-600">Enter a valid 10-digit mobile number (starts with 6, 7, 8 or 9).</span>
      )}
    </label>
  );
}
