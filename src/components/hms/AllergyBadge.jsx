"use client";

import { parseMaybeJson } from "./json";

/**
 * Persistent, always-visible allergy flag — never behind a click or a tab.
 * Renders nothing if the patient has no recorded allergies.
 */
export default function AllergyBadge({ allergies, className = "" }) {
  const list = parseMaybeJson(allergies);
  if (!Array.isArray(list) || list.length === 0) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ${className}`}
      title={list.join(", ")}
    >
      ⚠ Allergies: {list.join(", ")}
    </span>
  );
}
