"use client";

/** MariaDB returns JSON columns as strings, MySQL 8 as parsed values — handle both. */
export function parseMaybeJson(v) {
  if (v == null) return null;
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}
