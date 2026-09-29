"use client";

import { useCallback, useRef, useState } from "react";

/**
 * A small, generic "X saved" confirmation toast — separate from Toasts.jsx,
 * which is the realtime event feed (new prescriptions, new orders, …). This
 * one is for a screen to fire itself right after ITS OWN save succeeds, no
 * socket event involved. Any client component can use it:
 *   const [toast, showToast] = useToast();
 *   ... showToast("Details saved.") ...
 *   return <>{toast && <ToastBanner text={toast} />}...</>
 */
export function useToast(duration = 2600) {
  const [text, setText] = useState("");
  const timer = useRef(null);

  const show = useCallback(
    (t) => {
      setText(t);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setText(""), duration);
    },
    [duration],
  );

  return [text, show];
}

export function ToastBanner({ text }) {
  if (!text) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[70]" role="status" aria-live="polite">
      <div className="pointer-events-auto rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800 shadow-lg">
        ✓ {text}
      </div>
    </div>
  );
}
