"use client";

// Thin JSON fetch helpers for the HMS client screens. All same-origin, so
// the session cookie rides along automatically.

async function parse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function apiGet(url) {
  return fetch(url, { headers: { accept: "application/json" } }).then(parse);
}

export function apiSend(url, method, body) {
  return fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  }).then(parse);
}
