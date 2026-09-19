"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "./api";
import { useRealtime } from "./useRealtime";
import PartnerSend from "./PartnerSend";

// Referrals: send a patient to a connected hospital/clinic, and receive
// patients others referred here (accepting registers them in OUR records and
// gives them a queue token).
export default function ReferralsPanel() {
  const [refs, setRefs] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);

  async function load() {
    setRefs((await apiGet("/api/registration/referrals")).referrals);
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(() => setRefs([]));
  }, []);
  useRealtime({ "partner:inbound": load, "partner:updated": load }, load);

  async function act(r, kind) {
    setBusy(r.id);
    setError("");
    try {
      await apiSend(`/api/registration/referrals/${r.id}/${kind}`, "POST", {});
      await load();
    } catch (e) {
      setError(e.message === "connection_not_active" ? "The connection with this facility is not active." : `Could not save (${e.message}).`);
    } finally {
      setBusy(null);
    }
  }

  const waiting = (refs || []).filter((r) => r.status === "RECEIVED");
  const done = (refs || []).filter((r) => r.status !== "RECEIVED");
  return (
    <div className="space-y-3">
      <PartnerSend service="REFERRAL" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {waiting.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold">Patients referred to us</p>
          <ul className="mt-2 space-y-2">
            {waiting.map((r) => (
              <li key={r.id} className="rounded-md bg-white p-3 text-sm">
                <p className="font-medium">{r.patientName}{r.patientAge != null ? ` · ${r.patientAge}y` : ""}{r.patientGender ? ` · ${r.patientGender.toLowerCase()}` : ""}</p>
                <p className="text-xs text-slate-500">From {r.from}{r.patientPhone ? ` · ${r.patientPhone}` : ""}</p>
                <p className="mt-1">{r.reason}</p>
                {r.summary && <p className="text-slate-600">{r.summary}</p>}
                {r.connectionStatus === "ACTIVE" && (
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => act(r, "accept")} disabled={busy === r.id} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1 text-xs font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Accept &amp; register</button>
                    <button onClick={() => act(r, "decline")} disabled={busy === r.id} className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-50">Decline</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {done.length > 0 && (
        <p className="text-xs text-slate-500">
          Earlier referrals: {done.map((r) => `${r.patientName} (${r.result?.accepted ? `accepted, token ${r.result.token}` : "declined"})`).join("; ")}
        </p>
      )}
    </div>
  );
}
