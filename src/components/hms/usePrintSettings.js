"use client";

import { useEffect, useState } from "react";
import { apiGet } from "./api";

/** The facility's print settings (auto-print after registering, etc.). */
export function usePrintSettings() {
  const [settings, setSettings] = useState(null);
  useEffect(() => {
    apiGet("/api/print-settings").then((d) => setSettings(d.settings)).catch(() => {});
  }, []);
  return settings;
}

/**
 * Auto-print always fires from inside an async submit handler, after
 * `await`ing the registration API call — by the time that resolves, most
 * browsers no longer treat a fresh `window.open()` as a direct result of
 * the click and silently block it (no error, nothing visibly happens,
 * which is exactly what "auto-print doesn't work" looks like from the
 * outside). The fix is the standard one: open a blank tab SYNCHRONOUSLY,
 * before any `await`, while the click is still "fresh" — see
 * openBlankPrintTab() below — then just navigate that already-open tab
 * here once the real visit id is known. `existingTab` is optional so
 * every other caller (the manual "Print slip" button, which fires
 * directly from its own onClick with no await in between) keeps working
 * exactly as before.
 */
export function openSlip(visitId, auto, existingTab) {
  const url = `/print/slip/${visitId}${auto ? "?auto=1" : ""}`;
  if (existingTab && !existingTab.closed) {
    existingTab.location = url;
    return existingTab;
  }
  return window.open(url, "_blank", "noopener");
}

/** Call this FIRST, synchronously inside the click/submit handler, before any `await` — see openSlip()'s comment. */
export function openBlankPrintTab() {
  try {
    return window.open("", "_blank", "noopener");
  } catch {
    return null;
  }
}
