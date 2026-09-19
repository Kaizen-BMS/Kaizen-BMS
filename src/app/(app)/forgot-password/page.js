"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      if (!r.ok) throw new Error();
      setSent(true);
    } catch {
      setError("Please enter a valid email address.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold">Forgot password</h1>
        {sent ? (
          <p className="text-sm text-slate-600">
            If an account exists for that email, a reset link has been sent. It is valid for 30 minutes. No email? Ask your hospital admin to reset it for you.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label className="block space-y-1">
              <span className="text-sm font-medium">Your email</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={busy} className="w-full rounded-md bg-[var(--hms-btn-bg)] px-4 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}
        <Link href="/login" className="block text-center text-sm text-slate-500 underline">Back to sign in</Link>
      </div>
    </div>
  );
}
