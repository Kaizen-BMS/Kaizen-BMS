"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "./api";

// Always shows which facility you are working in. Becomes a switcher only
// when this identity may act in more than one facility (an owner). A switch
// re-issues the session server-side after a live ownership check.
export default function FacilitySwitcher({ fallbackName }) {
  const [facilities, setFacilities] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet("/api/org/facilities")
      .then((d) => setFacilities(d.facilities || []))
      .catch(() => setFacilities([]));
  }, []);

  const current = facilities?.find((f) => f.current);
  const name = current?.name || fallbackName;
  if (!name) return null;
  const selectable = (facilities || []).filter((f) => f.enabled);
  const multi = selectable.length > 1;

  async function pick(id) {
    setBusy(true);
    try {
      await apiSend("/api/org/switch", "POST", { tenantId: id });
      window.location.assign("/dashboard");
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-w-0 shrink">
      <button
        onClick={() => multi && setOpen((o) => !o)}
        className={`flex max-w-[8.5rem] items-center sm:max-w-[16rem] gap-1.5 rounded-md border px-2.5 py-1.5 text-xs ${multi ? "hover:bg-slate-50" : "cursor-default"}`}
        style={{ borderColor: "var(--hms-border)" }}
        title={multi ? "Switch facility" : "Current facility"}
      >
        <span className="truncate font-medium">{name}</span>
        {current && <span className="hidden text-[var(--hms-ink-faint)] sm:inline">{current.type.replace("_SOLO", "").toLowerCase()}</span>}
        {multi && <span aria-hidden>▾</span>}
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-1 w-64 rounded-md border bg-white p-1 shadow-lg" style={{ borderColor: "var(--hms-border)" }}>
          <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--hms-ink-faint)]">Switch facility</p>
          {selectable.map((f) => (
            <button
              key={f.id}
              disabled={busy || f.current}
              onClick={() => pick(f.id)}
              className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-slate-50 disabled:opacity-60"
            >
              <span className="truncate">{f.name}</span>
              <span className="ml-2 text-[11px] text-[var(--hms-ink-faint)]">{f.current ? "current" : f.type.replace("_SOLO", "").toLowerCase()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
