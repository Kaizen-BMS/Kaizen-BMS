/**
 * One place Indian mobile numbers are normalized and validated — client (PhoneInput) and server
 * (zod schemas) both call this, so a number typed as "+91 98765-43210" is the same "9876543210"
 * everywhere it's stored or compared. Configurable rather than hardcoded to 10 digits everywhere,
 * because a few fields in this project (suppliers, landlines) legitimately take a longer/foreign
 * number — those pass { strict: false } and only get whitespace/punctuation cleanup, never rejected.
 */

const IN_MOBILE_RE = /^[6-9]\d{9}$/;

/** Strip spaces, hyphens, brackets and a leading +91 / 91 / 0 — never touches the actual digits that matter. */
function stripToDigits(raw) {
  let d = String(raw || "").replace(/[^\d+]/g, "");
  d = d.replace(/^\+/, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}

/** { digits, valid, tooLong } for the live counter under a PhoneInput — never throws. */
export function phoneDigitsInfo(raw) {
  const digits = stripToDigits(raw).slice(0, 10);
  const tooLong = stripToDigits(raw).length > 10;
  return { digits, valid: IN_MOBILE_RE.test(digits), tooLong };
}

/** The canonical stored form: a plain 10-digit string, or null if it doesn't normalize to one. */
export function normalizeIndianPhone(raw) {
  const digits = stripToDigits(raw);
  return IN_MOBILE_RE.test(digits) ? digits : null;
}

export function isValidIndianPhone(raw) {
  return normalizeIndianPhone(raw) != null;
}

/**
 * A zod refinement for a required Indian mobile field, normalizing as it validates. `optional`
 * allows an empty string through unchanged (many forms treat phone as optional at that field).
 * Existing, already-stored numbers that predate this validator are never touched — this only
 * gates what a form can newly submit.
 */
export function phoneField(z, { optional = false } = {}) {
  return z
    .string()
    .trim()
    .transform((v) => (v ? normalizeIndianPhone(v) ?? v : v))
    .refine((v) => (optional && !v) || isValidIndianPhone(v || ""), "Enter a valid 10-digit mobile number.");
}
