"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";

const TYPES = ["RMP", "LOCAL_DOCTOR", "CAMP", "INSURANCE", "HEALTH_CARD", "OTHER"];
const TYPE_LABEL = {
  RMP: "RMP",
  LOCAL_DOCTOR: "Local doctor",
  CAMP: "Health camp",
  INSURANCE: "Insurance",
  HEALTH_CARD: "Health card",
  OTHER: "Other",
};

// Tenant-managed master data — this list belongs entirely to this tenant;
// nothing here is code-defined except the `type` categories. See
// CLAUDE.md "Referral sources" / migrations/013_referral_sources.sql.
export default function ReferralSourcesClient() {
  const [sources, setSources] = useState(null);
  const [form, setForm] = useState({ name: "", type: "RMP", contactPhone: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const { sources } = await apiGet("/api/referral-sources?all=1");
    setSources(sources);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e) => setMsg(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRealtime(
    {
      "referralsource:created": load,
      "referralsource:updated": load,
    },
    load,
  );

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      await apiSend("/api/referral-sources", "POST", form);
      setForm({ name: "", type: "RMP", contactPhone: "", notes: "" });
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(source) {
    try {
      await apiSend(`/api/referral-sources/${source.id}`, "PATCH", { active: !source.active });
    } catch (err) {
      setMsg(err.message);
    }
  }

  const grouped = TYPES.map((type) => ({
    type,
    items: (sources || []).filter((s) => s.type === type),
  })).filter((g) => g.items.length > 0 || sources === null);

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Referral sources</h1>
        <p className="text-sm text-slate-500">
          RMP/local doctors, health camps, insurance companies, health-card schemes — whoever refers
          patients here. Add your own list; nothing is pre-filled or hardcoded.
        </p>
      </div>
      {msg && <p className="text-sm text-red-600">{msg}</p>}

      <form onSubmit={submit} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4">
        <input
          placeholder="Name"
          required
          value={form.name}
          onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
          className="col-span-2 rounded-md border border-slate-300 px-2 py-1.5 text-sm sm:col-span-1"
        />
        <select
          value={form.type}
          onChange={(e) => setForm((s) => ({ ...s, type: e.target.value }))}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>{TYPE_LABEL[t]}</option>
          ))}
        </select>
        <input
          placeholder="Contact phone (optional)"
          value={form.contactPhone}
          onChange={(e) => setForm((s) => ({ ...s, contactPhone: e.target.value }))}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <button disabled={busy} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          Add
        </button>
      </form>

      <div className="space-y-4">
        {sources === null && <p className="text-sm text-slate-400">Loading…</p>}
        {sources !== null && sources.length === 0 && (
          <p className="text-sm text-slate-400">No referral sources yet — add your first one above.</p>
        )}
        {grouped.map((g) => (
          <div key={g.type}>
            <p className="text-xs font-semibold uppercase text-slate-500">{TYPE_LABEL[g.type]}</p>
            <div className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {g.items.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <p className={s.active ? "font-medium" : "font-medium text-slate-400 line-through"}>{s.name}</p>
                    {s.contact_phone && <p className="text-xs text-slate-400">{s.contact_phone}</p>}
                  </div>
                  <button
                    onClick={() => toggleActive(s)}
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      s.active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {s.active ? "active" : "inactive"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
