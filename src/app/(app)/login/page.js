"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Icon from "@/components/hms/icons";

const ERRORS = {
  invalid_credentials: "Wrong email or password.",
  invalid_input: "Please check the form and try again.",
  too_many_attempts: "Too many attempts. Wait 15 minutes and try again.",
  unauthorized: "Session expired. Please sign in again.",
  account_disabled: "This login has been switched off. Please contact your admin.",
  tenant_suspended: "This hospital's account is currently suspended. Contact Kaizen support.",
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-4 overflow-hidden px-4">
      <div className="hms-login-bg" aria-hidden="true">
        <div className="hms-login-blob" />
        <div className="hms-login-blob" />
      </div>

      <form
        onSubmit={onSubmit}
        className="relative z-10 w-full max-w-sm space-y-5 rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <div className="space-y-2 text-center">
          <Link href="/" className="inline-flex items-center justify-center gap-2" aria-label="Kaizen BMS home">
            <Image
              src="/images/KaizenBMS infinity logo.png"
              alt=""
              width={168}
              height={88}
              priority
              className="h-10 w-auto"
            />
          </Link>
          <div>
            <h1 className="text-xl font-semibold">Kaizen HMS</h1>
            <p className="text-sm text-slate-500">Staff sign in</p>
          </div>
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
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 pr-9 text-sm outline-none focus:border-slate-900"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400 hover:text-slate-700"
            >
              <Icon name={showPassword ? "eyeOff" : "eye"} size={16} />
            </button>
          </div>
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
          className="w-full rounded-md bg-[var(--hms-btn-bg)] px-4 py-2 text-sm font-medium text-[var(--hms-btn-fg)] hover:bg-[var(--hms-btn-bg-hover)] disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="text-center text-sm">
          <Link href="/forgot-password" className="text-slate-600 underline hover:text-slate-900">Forgot password?</Link>
        </p>

        <p className="text-center text-xs text-slate-400">
          Staff accounts are created by your hospital admin.
        </p>
      </form>

      <p className="relative z-10 text-xs text-slate-500">
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
