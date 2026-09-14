"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Deliberately no "no email on file" entry here — that response doesn't
// exist anymore (see request-otp/route.js's comment): it would let a
// visitor learn "this phone has an account" just by which message came
// back, reintroducing the exact enumeration this whole response shape
// exists to prevent. The equivalent guidance is the static help line
// below the phone field instead — always shown, never a function of what
// the lookup found.
const ERRORS = {
  invalid_input: "Please check the form and try again.",
  tenant_not_found: "We couldn't find this hospital's patient portal.",
  too_soon: "Please wait before requesting another code.",
  invalid_or_expired_code: "That code is wrong or has expired.",
  too_many_attempts: "Too many attempts. Request a new code.",
  email_send_failed: "We couldn't send the code right now. Please try again in a moment.",
};

function LoginForm({ tenantSlug }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || `/patient/${tenantSlug}/dashboard`;

  const [step, setStep] = useState("phone"); // "phone" | "code"
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestOtp(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/patient-auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantSlug, phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(ERRORS[data.error] || "Could not send a code.");
        return;
      }
      setInfo(data.message || "Code sent.");
      setStep("code");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/patient-auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantSlug, phone, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(ERRORS[data.error] || "Could not verify that code.");
        return;
      }
      router.replace(next);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <form
        onSubmit={step === "phone" ? requestOtp : verifyOtp}
        className="w-full max-w-sm space-y-5 rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <div className="text-center">
          <h1 className="text-xl font-semibold">Patient Portal</h1>
          <p className="text-sm text-slate-500">Sign in with your phone number</p>
        </div>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {!error && info && step === "code" && (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{info}</p>
        )}

        {step === "phone" ? (
          <>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Phone number</span>
              <input
                type="tel"
                required
                autoFocus
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="the number registered with this hospital"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </label>
            {/* Always shown, regardless of what's typed or what any lookup
                would find — never conditional on a response, so it can't
                itself become a signal about whether a number is
                registered. */}
            <p className="text-center text-xs text-slate-400">
              Don&apos;t have an account, or haven&apos;t added your email yet? Visit the front desk.
            </p>
          </>
        ) : (
          <>
            <label className="block space-y-1">
              <span className="text-sm font-medium">6-digit code</span>
              <input
                type="text"
                inputMode="numeric"
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="sent to your email"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-center text-lg tracking-widest outline-none focus:border-slate-900"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setCode("");
                setError("");
              }}
              className="text-xs text-slate-500 underline"
            >
              Use a different number
            </button>
          </>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? "Please wait…" : step === "phone" ? "Send code" : "Verify & sign in"}
        </button>
      </form>
    </div>
  );
}

export default function LoginClient({ tenantSlug }) {
  return (
    <Suspense fallback={null}>
      <LoginForm tenantSlug={tenantSlug} />
    </Suspense>
  );
}
