"use client";

import { useEffect, useRef, useState } from "react";
import { compressImageToDataUrl } from "./imageCompress";

// Opens the device camera in a small window (works on laptops as well as
// phones). If the camera cannot be used, the person can pick a file instead.
export default function CameraCapture({ title = "Take a photo", onCapture, onClose, maxWidth = 480 }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera support");
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      } catch {
        if (!cancelled) setErr("Camera could not be opened (allow camera access in the browser, or choose a file).");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const scale = Math.min(1, maxWidth / v.videoWidth);
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    // Smaller files: WebP where the browser can encode it, JPEG otherwise.
    const webp = c.toDataURL("image/webp", 0.7);
    onCapture(webp.startsWith("data:image/webp") ? webp : c.toDataURL("image/jpeg", 0.7));
  }

  async function pickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onCapture(await compressImageToDataUrl(file, maxWidth, 0.75));
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="mb-2 text-sm font-semibold">{title}</p>
        <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-md bg-slate-900">
          <video ref={videoRef} playsInline muted className={`h-full w-full object-cover ${ready ? "" : "invisible absolute"}`} onLoadedData={() => setReady(true)} style={{ transform: "scaleX(-1)" }} />
          {!ready && <p className="px-4 text-center text-xs text-slate-300">{err || "Starting camera…"}</p>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button onClick={() => fileRef.current?.click()} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Choose a file instead</button>
          <button onClick={onClose} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Cancel</button>
          <button onClick={snap} disabled={!ready} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Take photo</button>
        </div>
      </div>
    </div>
  );
}
