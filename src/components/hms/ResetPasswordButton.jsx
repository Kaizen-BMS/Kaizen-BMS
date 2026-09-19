"use client";

import { useState } from "react";
import { apiSend } from "./api";

// Admin-side password reset: issues a temporary password, shown once.
export default function ResetPasswordButton({ userId, name }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  async function reset() {
    if (!confirm(`Reset the password for ${name}? They will need the new temporary password to sign in.`)) return;
    setErr("");
    try {
      const r = await apiSend(`/api/admin/users/${userId}/reset-password`, "POST", {});
      setPw(r.tempPassword);
    } catch (e) {
      setErr(`Could not reset (${e.message}).`);
    }
  }
  if (pw)
    return (
      <span className="text-xs">
        New password: <code className="select-all rounded bg-slate-100 px-1.5 py-0.5 font-semibold">{pw}</code>
        <span className="ml-1 text-slate-400">(shown once — share it securely)</span>
      </span>
    );
  return (
    <span>
      <button onClick={reset} className="text-xs text-slate-500 underline hover:text-slate-800">Reset password</button>
      {err && <span className="ml-1 text-xs text-red-600">{err}</span>}
    </span>
  );
}
