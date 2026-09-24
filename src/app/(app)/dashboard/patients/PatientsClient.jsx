"use client";
import { fmtDDMMYY } from "@/lib/dateFormat";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/components/hms/api";

const COLS = [
  ["name", "Patient"],
  ["age", "Age"],
  [null, "Phone"],
  ["visits", "Visits"],
  ["lastVisit", "Last visit"],
  ["registered", "Registered"],
];
const fmt = (d) => fmtDDMMYY(d);

// Every patient who has come to this facility — with how many times and when
// they last came. Click a column heading to sort, click a name for the profile.
export default function PatientsClient() {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [sort, setSort] = useState("registered");
  const [dir, setDir] = useState("desc");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setTerm(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const p = new URLSearchParams({ sort, dir, page: String(page), ...(term ? { q: term } : {}) });
    apiGet(`/api/patients?${p}`).then(setData).catch((e) => setError(e.message));
  }, [sort, dir, page, term]);

  function headClick(key) {
    if (!key) return;
    if (sort === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir(key === "name" ? "asc" : "desc");
    }
    setPage(1);
  }
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Patients</h1>
          <p className="text-sm text-slate-500">{data ? `${data.total} patient${data.total === 1 ? "" : "s"}` : "Loading…"}</p>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone" className="w-64 rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              {COLS.map(([key, label]) => (
                <th key={label} className="px-3 py-2">
                  {key ? (
                    <button onClick={() => headClick(key)} className="hms-plain inline-flex items-center gap-1 font-semibold uppercase">
                      {label}
                      <span className={sort === key ? "text-slate-900" : "text-slate-300"}>{sort === key ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
                    </button>
                  ) : label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data && data.patients.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">No patients found.</td></tr>}
            {(data?.patients || []).map((p) => (
              <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-3 py-2"><Link href={`/dashboard/patients/${p.id}`} className="font-medium underline-offset-2 hover:underline">{p.name}</Link>{p.gender && <span className="ml-2 text-xs text-slate-400">{p.gender.toLowerCase()}</span>}</td>
                <td className="px-3 py-2">{p.age ?? "—"}</td>
                <td className="px-3 py-2">{p.phone}</td>
                <td className="px-3 py-2">{p.visits}</td>
                <td className="px-3 py-2">{fmt(p.lastVisit)}</td>
                <td className="px-3 py-2 text-slate-500">{fmt(p.registeredAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-between text-sm">
          <button disabled={page <= 1} onClick={() => setPage((x) => x - 1)} className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40">← Previous</button>
          <span className="text-slate-500">Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage((x) => x + 1)} className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40">Next →</button>
        </div>
      )}
    </div>
  );
}
