"use client";

import { useState } from "react";
import { apiGet, apiSend } from "./api";

// Admin decides which parts of the system this person may use.
export default function AccessButton({ userId, name }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [deny, setDeny] = useState([]);
  const [msg, setMsg] = useState("");

  async function show() {
    setMsg("");
    setOpen(true);
    try {
      const d = await apiGet(`/api/staff/accounts/${userId}/access`);
      setData(d);
      setDeny(d.deny);
    } catch (e) {
      setMsg(`Could not load (${e.message}).`);
    }
  }
  const toggle = (k) => setDeny((d) => (d.includes(k) ? d.filter((x) => x !== k) : [...d, k]));

  async function save() {
    try {
      await apiSend(`/api/staff/accounts/${userId}/access`, "PATCH", { deny });
      setMsg("Saved. It applies within a few seconds.");
    } catch (e) {
      setMsg(`Could not save (${e.message}).`);
    }
  }

  return (
    <>
      <button onClick={show} className="ml-3 text-xs text-slate-500 underline hover:text-slate-800">Access</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setOpen(false)} role="dialog" aria-label="Access">
          <div className="w-full max-w-md rounded-lg bg-white p-5 text-left shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold">What can {name} use?</h2>
            <p className="text-xs text-slate-500">Untick anything this person should not open. Their role still sets the basics.</p>
            {!data ? (
              <p className="mt-3 text-sm text-slate-400">{msg || "Loading…"}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.features.map((f) => (
                  <li key={f.key}>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={!deny.includes(f.key)} onChange={() => toggle(f.key)} />
                      {f.label}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {msg && data && <p className="mt-2 text-sm text-emerald-700">{msg}</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={save} disabled={!data} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Save</button>
              <button onClick={() => setOpen(false)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
