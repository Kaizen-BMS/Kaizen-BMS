"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "./api";
import { useRealtime } from "./useRealtime";
import PartnerReviewCard, { loadCatalogs } from "./PartnerReviewCard";

// Pops up for facility admins/owners when another organization asks to
// connect. Backed by the database (`/api/partners/pending`), fetched on every
// page load — so a request sent while this facility was offline is still
// waiting here at next login. The socket event only makes it appear instantly.
export default function PartnerRequestPopup({ enabled }) {
  const [pending, setPending] = useState([]);
  const [catalogs, setCatalogs] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  const load = useCallback(() => {
    if (!enabled) return;
    apiGet("/api/partners/pending")
      .then((d) => {
        setPending(d.requests || []);
        setDismissed(false);
      })
      .catch(() => {});
  }, [enabled]);

  useEffect(load, [load]);
  useEffect(() => {
    if (enabled) loadCatalogs().then(setCatalogs).catch(() => {});
  }, [enabled]);

  useRealtime({ "partner:request": load, "partner:updated": load }, load);

  if (!enabled || dismissed || pending.length === 0 || !catalogs) return null;
  const first = pending[0];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">New connection request</h2>
          <button onClick={() => setDismissed(true)} className="text-sm text-[var(--hms-ink-soft)] hover:underline">
            Decide later
          </button>
        </div>
        <PartnerReviewCard key={first.id} request={first} catalogs={catalogs} onDone={load} />
        {pending.length > 1 && <p className="mt-2 text-xs text-[var(--hms-ink-soft)]">{pending.length - 1} more waiting after this one.</p>}
      </div>
    </div>
  );
}
