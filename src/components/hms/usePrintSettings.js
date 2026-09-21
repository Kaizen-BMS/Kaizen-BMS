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

export function openSlip(visitId, auto) {
  window.open(`/print/slip/${visitId}${auto ? "?auto=1" : ""}`, "_blank", "noopener");
}
