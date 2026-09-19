"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiSend } from "./api";

const COPY = {
  LAB: { select: "Select Laboratory", none: "No connected laboratory is available.", connect: "Connect Laboratory", send: "Send to laboratory" },
  PHARMACY: { select: "Select Pharmacy", none: "No connected pharmacy is available.", connect: "Connect Pharmacy", send: "Send to pharmacy" },
};

// Sends one lab order / prescription line to a connected external provider.
// One valid provider -> auto-selected; several -> a name dropdown; none ->
// a message with a link to connect one. Provider ids never show in the UI.
export default function ExternalSend({ type, url, onSent }) {
  const c = COPY[type];
  const [providers, setProviders] = useState(null);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    apiGet(`/api/external/send-options?type=${type}`)
      .then((d) => {
        setProviders(d.providers || []);
        if ((d.providers || []).length === 1) setChoice(String(d.providers[0].id));
      })
      .catch(() => setProviders([]));
  }, [type]);

  if (!providers) return null;
  if (providers.length === 0) {
    return (
      <p className="mt-1 text-xs text-slate-500">
        {c.none}{" "}
        <Link href="/dashboard/admin/partners" className="font-medium underline">{c.connect}</Link>
      </p>
    );
  }
  const selected = providers.find((p) => String(p.id) === choice);

  async function send() {
    setBusy(true);
    setMsg("");
    try {
      const r = await apiSend(url, "POST", { providerId: Number(choice) });
      setMsg(r.alreadySent ? `Already sent to ${selected.name}.` : `Sent to ${selected.name}.`);
      onSent?.();
    } catch (e) {
      setMsg(e.message === "data_not_approved" ? "The partner has not approved all the information this order needs." : `Could not send (${e.message}).`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
      {providers.length > 1 ? (
        <label className="flex items-center gap-1">
          {c.select}:
          <select value={choice} onChange={(e) => setChoice(e.target.value)} className="rounded border border-slate-300 px-1.5 py-1">
            <option value="">Choose…</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      ) : (
        <span className="text-slate-500">{providers[0].name}</span>
      )}
      <button onClick={send} disabled={busy || !choice} className="rounded border border-slate-300 px-2 py-1 font-medium hover:bg-white disabled:opacity-50">
        {c.send}
      </button>
      {msg && <span className="text-slate-600">{msg}</span>}
    </div>
  );
}
