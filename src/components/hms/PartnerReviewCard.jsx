"use client";

import { useState } from "react";
import { apiGet, apiSend } from "./api";

// Receiver-side review of a connection request. The receiving organization
// can NARROW what is shared (uncheck items) before accepting — only what is
// ticked here becomes active. Used by the Partner Organizations page and
// the request popup, so both behave identically.
export default function PartnerReviewCard({ request, catalogs, onDone }) {
  const cat = catalogs?.[request.serviceType];
  const required = new Set(cat?.requiredCategories || []);
  const [picked, setPicked] = useState(() => new Set(request.requestedCategories));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = (k) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  async function decide(decision) {
    setBusy(true);
    setError("");
    try {
      await apiSend(`/api/partners/connections/${request.id}/decision`, "POST", {
        decision,
        approvedCategories: decision === "ACCEPT" ? [...picked] : undefined,
      });
      onDone?.();
    } catch (e) {
      setError(
        e.message === "server_not_configured"
          ? "This server is missing its security key (EXTERNAL_INTEGRATION_KEY). Ask whoever hosts the app to add it, then try again."
          : e.message === "internal_error"
          ? "The server was slow and did not finish. Nothing was changed — please press Approve again."
          : e.message === "cannot_approve_own_request"
            ? "A request cannot be approved by the organization that sent it."
            : `Could not save (${e.message}).`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border p-4" style={{ borderColor: "var(--hms-border)" }}>
      <p className="text-sm font-semibold">{request.counterparty?.name || "An organization"} wants to connect</p>
      <p className="text-xs text-[var(--hms-ink-soft)]">
        {request.counterparty?.type?.replace("_", " ")} · {request.counterparty?.publicCode} · {request.serviceLabel}
      </p>
      <p className="mt-1 text-xs text-[var(--hms-ink-soft)]">Purpose: {request.purpose}</p>

      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--hms-ink-faint)]">
        Information they asked for — untick anything you do not want to share
      </p>
      <ul className="mt-1 space-y-1">
        {(cat?.categories || [])
          .filter((c) => request.requestedCategories.includes(c.key))
          .map((c) => (
            <li key={c.key}>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={picked.has(c.key)} onChange={() => toggle(c.key)} disabled={busy} />
                <span>
                  <span className="font-medium">{c.label}</span>
                  {required.has(c.key) && <span className="ml-1 text-[11px] text-amber-700">(needed for this service to work)</span>}
                  <span className="block text-xs text-[var(--hms-ink-soft)]">{c.description}</span>
                </span>
              </label>
            </li>
          ))}
      </ul>
      <p className="mt-2 text-xs text-[var(--hms-ink-soft)]">
        Nothing else is ever shared — staff, billing, clinical notes and stock stay private.
      </p>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => decide("ACCEPT")}
          disabled={busy || picked.size === 0}
          className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={() => decide("REJECT")}
          disabled={busy}
          className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          style={{ borderColor: "var(--hms-border)" }}
        >
          Reject
        </button>
      </div>
    </div>
  );
}

export async function loadCatalogs() {
  const d = await apiGet("/api/partners/catalog");
  return d.services;
}
