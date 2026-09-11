"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

const ERRORS = {
  invalid_credentials: "Wrong email or password.",
  invalid_input: "Please check the form and try again.",
  too_many_attempts: "Too many attempts. Wait 15 minutes and try again.",
  unauthorized: "Session expired. Please sign in again.",
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          ...(tenantSlug ? { tenantSlug } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(ERRORS[data.error] || "Could not sign in.");
        return;
      }
      router.replace(next.startsWith("/") ? next : "/dashboard");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-5 rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <div className="space-y-1">
          <Link href="/" className="text-xs text-slate-400 hover:text-slate-600">
            ← Kaizen BMS
          </Link>
          <h1 className="text-xl font-semibold">Kaizen HMS</h1>
          <p className="text-sm text-slate-500">Staff sign in</p>
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <label className="block space-y-1">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">
            Clinic / hospital code{" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </span>
          <input
            type="text"
            value={tenantSlug}
            onChange={(e) => setTenantSlug(e.target.value)}
            placeholder="only if your email is used at more than one clinic"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="text-center text-xs text-slate-400">
          Staff accounts are created by your hospital admin.
        </p>
      </form>

      <p className="text-xs text-slate-500">
        Want Kaizen HMS for your hospital?{" "}
        <Link
          href="/services/hospital-management#contact"
          className="underline hover:text-slate-800"
        >
          Book a consultation
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
