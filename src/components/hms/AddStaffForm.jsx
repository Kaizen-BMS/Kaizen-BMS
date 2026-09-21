"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "./api";

const ERR = {
  email_taken: "That email already has a login. Use a different email.",
  role_not_available: "This facility does not have the module for that role.",
};

// Admin / owner creates a login: name, email, role (only roles for modules this
// facility really has) and a password — typed by them, or generated.
export default function AddStaffForm({ onCreated }) {
  const [roles, setRoles] = useState([]);
  const [f, setF] = useState({ name: "", email: "", role: "", password: "" });
  const [msg, setMsg] = useState({ error: "", ok: "", temp: "" });
  const [busy, setBusy] = useState(false);

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
      const r = await apiSend("/api/staff/accounts", "POST", { name: f.name, email: f.email, role: f.role, ...(f.password ? { password: f.password } : {}) });
      setMsg({ error: "", ok: `Login created for ${r.account.name}.`, temp: r.tempPassword || "" });
      setF((x) => ({ ...x, name: "", email: "", password: "" }));
      onCreated?.();
    } catch (err) {
      setMsg({ error: ERR[err.message] || `Could not create (${err.message}).`, ok: "", temp: "" });
    } finally {
      setBusy(false);
    }
  }

  const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm";
  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold">Add a person (login)</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs"><span className="block text-slate-500">Name</span><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={input} /></label>
        <label className="text-xs"><span className="block text-slate-500">Email (login id)</span><input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={input} /></label>
        <label className="text-xs">
          <span className="block text-slate-500">Role</span>
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className={input}>
            {roles.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
          </select>
        </label>
        <label className="text-xs"><span className="block text-slate-500">Password (blank = generate)</span><input type="text" minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className={input} autoComplete="off" /></label>
        <button disabled={busy || !f.role} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Create login</button>
      </div>
      <p className="text-xs text-slate-500">The role list only shows what this facility has (for example Pharmacist appears only if Pharmacy is on).</p>
      {msg.error && <p className="text-sm text-red-600">{msg.error}</p>}
      {msg.ok && (
        <p className="text-sm text-emerald-700">
          {msg.ok}
          {msg.temp && <> Password: <code className="select-all rounded bg-slate-100 px-1.5 py-0.5 font-semibold">{msg.temp}</code> (shown once)</>}
        </p>
      )}
    </form>
  );
}
