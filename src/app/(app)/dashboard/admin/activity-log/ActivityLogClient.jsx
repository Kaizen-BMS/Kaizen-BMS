"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@/components/hms/api";

const AREA = { registration: "Registration", opd: "Doctor / OPD", pharmacy: "Pharmacy", lab: "Lab", billing: "Billing", appointments: "Appointments", ipd: "IPD", radiology: "Radiology", staff: "Staff", partners: "Partners", admin: "Settings", account: "Sign-in" };

// One trail for the whole facility — hospital, pharmacy, lab, billing and
// everything else. Only who / what / when; no patient details are stored.
export default function ActivityLogClient() {
  const [f, setF] = useState({ userId: "", feature: "", from: "", to: "" });
  const [data, setData] = useState({ entries: [], people: [], areas: [], hasMore: false });
  const [more, setMore] = useState([]);
  const [error, setError] = useState("");

  const q = useCallback(
    (extra = "") => {
      const p = new URLSearchParams();
      Object.entries(f).forEach(([k, v]) => v && p.set(k, v));
      return `/api/admin/activity-log?${p.toString()}${extra}`;
    },
    [f],
  );
  useEffect(() => {
    apiGet(q())
      .then((d) => {
        setData(d);
        setMore([]);
      })
      .catch((e) => setError(e.message));
  }, [q]);

  async function loadMore() {
    const all = [...data.entries, ...more];
    const d = await apiGet(q(`&before=${all[all.length - 1].id}`));
    setMore((m) => [...m, ...d.entries]);
    setData((x) => ({ ...x, hasMore: d.hasMore }));
  }

  const rows = [...data.entries, ...more];
  const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm";
  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Activity log</h1>
        <p className="text-sm text-slate-500">Who did what, and when — for the whole facility.</p>
      </div>
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <label className="text-xs">
          <span className="block text-slate-500">Person</span>
          <select value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })} className={input}>
            <option value="">Everyone</option>
            {data.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="text-xs">
          <span className="block text-slate-500">Area</span>
          <select value={f.feature} onChange={(e) => setF({ ...f, feature: e.target.value })} className={input}>
            <option value="">All areas</option>
            {data.areas.map((a) => <option key={a} value={a}>{AREA[a] || a}</option>)}
          </select>
        </label>
        <label className="text-xs"><span className="block text-slate-500">From</span><input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className={input} /></label>
        <label className="text-xs"><span className="block text-slate-500">To</span><input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className={input} /></label>
        <button onClick={() => setF({ userId: "", feature: "", from: "", to: "" })} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Clear filters</button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Person</th><th className="px-3 py-2">Area</th><th className="px-3 py-2">What they did</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">Nothing recorded yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="whitespace-nowrap px-3 py-2 text-slate-500">{new Date(r.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</td>
                <td className="px-3 py-2">{r.person || "—"}<p className="text-xs text-slate-400">{(r.role || "").replace(/_/g, " ").toLowerCase()}</p></td>
                <td className="px-3 py-2">{AREA[r.area] || r.area || "—"}</td>
                <td className="px-3 py-2">{r.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.hasMore && <button onClick={loadMore} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Load older</button>}
    </div>
  );
}
