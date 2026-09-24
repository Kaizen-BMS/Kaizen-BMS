"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "./api";
import PersonDetailsFields, { EMPTY_DETAILS, detailsPayload } from "./PersonDetailsFields";

const ERR = {
  email_taken: "That email already has a login. Use a different email.",
  role_not_available: "This facility does not have the module for that role.",
};

const input = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none";
const label = "block text-xs font-medium text-slate-600";
const help = "mt-0.5 block text-[11px] font-normal leading-tight text-slate-400";

// Admin / owner adds a person: Basic Information first, then Working Hours
// (total duty hours are worked out automatically and become their weekly
// schedule — no daily hour-entry afterwards). Roles offered are only those
// this facility really has.
export default function AddStaffForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState([]);
  const [f, setF] = useState({ name: "", email: "", role: "", password: "" });
  const [msg, setMsg] = useState({ error: "", ok: "", temp: "" });
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState(EMPTY_DETAILS);

  useEffect(() => {
    apiGet("/api/staff/accounts").then((d) => {
      setRoles(d.roles);
      setF((x) => ({ ...x, role: d.roles[0]?.role || "" }));
    }).catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg({ error: "", ok: "", temp: "" });
    try {
      const r = await apiSend("/api/staff/accounts", "POST", { name: f.name, email: f.email, role: f.role, ...(f.password ? { password: f.password } : {}), ...detailsPayload(details) });
      setMsg({ error: "", ok: `${r.account.name} added.`, temp: r.tempPassword || "" });
      setF((x) => ({ ...x, name: "", email: "", password: "" }));
      setDetails(EMPTY_DETAILS);
      onCreated?.();
    } catch (err) {
      setMsg({ error: ERR[err.message] || `Could not add (${err.message}).`, ok: "", temp: "" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-left text-sm font-semibold">
        <span>Add Staff</span><span className="text-slate-400">{open ? "−" : "+"}</span>
      </button>
      {msg.ok && (
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {msg.ok}
          {msg.temp && <> Login password: <code className="select-all rounded bg-white px-1.5 py-0.5 font-semibold">{msg.temp}</code> (shown once)</>}
        </p>
      )}
      {open && (
        <form onSubmit={submit} className="mt-4 space-y-5">
          <div>
            <p className="mb-2 text-sm font-semibold">Basic Information</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className={label}>Full Name<input required placeholder="Rahul Sharma" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={`${input} mt-1`} /></label>
              <label className={label}>Email<input required type="email" placeholder="rahul@hospital.com" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={`${input} mt-1`} /><span className={help}>They log in with this email.</span></label>
              <label className={label}>Role
                <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className={`${input} mt-1`}>
                  {roles.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
                </select>
                <span className={help}>Only roles this facility has are shown.</span>
              </label>
              <label className={label}>Password<input type="text" minLength={8} placeholder="Leave empty to generate" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="off" className={`${input} mt-1`} /></label>
            </div>
            <div className="mt-3"><PersonDetailsFields name={f.name} value={details} onChange={setDetails} showWork parts={["photo", "basic"]} /></div>
          </div>
          <PersonDetailsFields name={f.name} value={details} onChange={setDetails} showWork parts={["work"]} />
          <details className="rounded-xl border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-medium">More details (address, Aadhaar, emergency contact)</summary>
            <div className="mt-3"><PersonDetailsFields name={f.name} value={details} onChange={setDetails} parts={["more"]} /></div>
          </details>
          {msg.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg.error}</p>}
          <button disabled={busy || !f.role} className="rounded-lg bg-[var(--hms-btn-bg)] px-4 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">{busy ? "Adding…" : "Add staff member"}</button>
        </form>
      )}
    </div>
  );
}
