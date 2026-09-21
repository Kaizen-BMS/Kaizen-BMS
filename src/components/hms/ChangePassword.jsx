"use client";

import { useState } from "react";
import { apiSend } from "./api";

// "Change my password" — anyone, any time (the current password is required).
export default function ChangePassword({ onClose }) {
  const [f, setF] = useState({ current: "", next: "", again: "" });
  const [msg, setMsg] = useState({ error: "", ok: false });
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (f.next !== f.again) return setMsg({ error: "The two new passwords do not match.", ok: false });
    if (f.next.length < 8) return setMsg({ error: "Use at least 8 characters.", ok: false });
    setBusy(true);
    try {
      await apiSend("/api/auth/change-password", "POST", { currentPassword: f.current, newPassword: f.next });
      setMsg({ error: "", ok: true });
    } catch (err) {
      setMsg({ error: err.message === "wrong_current_password" ? "Your current password is not correct." : `Could not change (${err.message}).`, ok: false });
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose} role="dialog" aria-label="Change password">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-base font-semibold">Change password</h2>
        {msg.ok ? (
          <p className="text-sm text-emerald-700">Password changed.</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-xs"><span className="text-slate-500">Current password</span><input type="password" required autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} className={input} /></label>
            <label className="block text-xs"><span className="text-slate-500">New password</span><input type="password" required minLength={8} autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} className={input} /></label>
            <label className="block text-xs"><span className="text-slate-500">Repeat new password</span><input type="password" required minLength={8} autoComplete="new-password" value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} className={input} /></label>
            {msg.error && <p className="text-sm text-red-600">{msg.error}</p>}
            <button disabled={busy} className="w-full rounded-md bg-[var(--hms-btn-bg)] px-4 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">{busy ? "Saving…" : "Change password"}</button>
          </form>
        )}
        <button onClick={onClose} className="mt-3 w-full text-center text-sm text-slate-500 underline">Close</button>
      </div>
    </div>
  );
}
