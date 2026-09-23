"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Scan a barcode with the device camera using the browser's native
 * BarcodeDetector API (built into Chrome/Edge/Android WebView — no library
 * to load). Where it isn't available (Firefox, Safari as of this writing),
 * falls back to a plain manual-entry box rather than pretending to scan —
 * honest about the real browser support gap instead of silently failing.
 */
export default function BarcodeScanner({ title = "Scan a barcode", onDetected, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [supported, setSupported] = useState(null); // null = checking
  const [err, setErr] = useState("");
  const [manual, setManual] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (typeof window === "undefined" || !("BarcodeDetector" in window)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSupported(false);
      return;
    }
    setSupported(true);
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] });
        const tick = async () => {
          if (cancelled || !videoRef.current || videoRef.current.readyState < 2) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              onDetected(codes[0].rawValue);
              return;
            }
          } catch {
            // transient decode error — keep trying
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) setErr("Camera could not be opened (allow camera access, or type the barcode below).");
      }
    })();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submitManual(e) {
    e.preventDefault();
    if (manual.trim()) onDetected(manual.trim());
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="mb-2 text-sm font-semibold">{title}</p>
        {supported && (
          <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-md bg-slate-900">
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
          </div>
        )}
        {supported === false && (
          <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">
            This browser can&rsquo;t scan a barcode with the camera (supported on Chrome / Edge / Android). Type it in instead.
          </p>
        )}
        {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
        <form onSubmit={submitManual} className="mt-3 flex gap-2">
          <input autoFocus placeholder="Or type the barcode" value={manual} onChange={(e) => setManual(e.target.value)} className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <button className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)]">Use</button>
        </form>
        <div className="mt-3 flex justify-end">
          <button onClick={onClose} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}
