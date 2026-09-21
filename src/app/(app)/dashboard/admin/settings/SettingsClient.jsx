"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiSend } from "@/components/hms/api";
import PrintingSettings from "@/components/hms/PrintingSettings";

// One simple page for facility-level switches. Nothing technical here.
export default function SettingsClient() {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    apiGet("/api/admin/settings").then(setS).catch((e) => setMsg(e.message));
  }, []);

  async function toggle(v) {
    setMsg("");
    try {
      await apiSend("/api/admin/settings", "PATCH", { showStockToDoctors: v });
      setS((x) => ({ ...x, showStockToDoctors: v }));
      setMsg("Saved.");
    } catch (e) {
      setMsg(`Could not save (${e.message}).`);
    }
  }
  if (!s) return <p className="text-sm text-slate-400">{msg || "Loading…"}</p>;
  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-slate-500">{s.name}</p>
      </div>
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold">Your organization code</p>
        <p className="mt-1 text-lg font-mono">{s.publicCode}</p>
        <p className="text-xs text-slate-500">Give this code to another hospital, lab or pharmacy so they can send you a connection request. It contains no private information.</p>
      </section>
      {s.hasPharmacy && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1" checked={s.showStockToDoctors} onChange={(e) => toggle(e.target.checked)} />
            <span>
              <span className="font-medium">Show my pharmacy stock to my doctors</span>
              <span className="block text-xs text-slate-500">While writing a prescription, doctors see whether a medicine is available in your pharmacy. Only &quot;available / not available&quot; is shown — never quantities.</span>
            </span>
          </label>
        </section>
      )}
      <PrintingSettings />
      <p className="text-sm text-slate-500">
        Connections with other hospitals, labs and pharmacies are in <Link href="/dashboard/admin/partners" className="underline">Partners</Link>.
      </p>
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
    </div>
  );
}
