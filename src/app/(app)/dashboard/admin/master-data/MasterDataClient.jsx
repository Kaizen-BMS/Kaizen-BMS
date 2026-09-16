"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiSend } from "@/components/hms/api";

// Master Data (Phase 8B — CLAUDE.md "Master data + data contract
// foundation" / docs/hms-master-data-phase8b.md). Departments is the one
// genuinely new master-data entity this phase added — real CRUD lives
// here. Services/Pharmacy Products/Lab Tests all already have a real
// owner screen (the Pricing admin page, Phase 6/7) — this page shows a
// READ-ONLY preview of each (so "Master Data" is one real landing spot,
// not a maze of empty tabs) and links straight to the Service Master for
// anything beyond viewing, rather than duplicating that UI.
const TABS = [
  { key: "departments", label: "Departments" },
  { key: "services", label: "Services" },
  { key: "pharmacy", label: "Pharmacy Products" },
  { key: "lab", label: "Lab Tests" },
];

export default function MasterDataClient() {
  const [tab, setTab] = useState("departments");
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Master Data</h1>
        <p className="mt-1 text-sm text-slate-500">
          The shared reference data every module builds on — one source of truth per entity.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              tab === t.key
                ? "border-[var(--hms-btn-bg)] bg-[var(--hms-btn-bg)] text-[var(--hms-btn-fg)]"
                : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "departments" && <DepartmentsTab />}
      {tab === "services" && <ServicePreviewTab serviceType="" title="All priced services" />}
      {tab === "pharmacy" && <ServicePreviewTab serviceType="PHARMACY" title="Pharmacy products" />}
      {tab === "lab" && <ServicePreviewTab serviceType="LAB" title="Lab tests" />}
    </div>
  );
}

function DepartmentsTab() {
  const [departments, setDepartments] = useState(null);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ code: "", name: "" });
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const { departments } = await apiGet("/api/departments?all=1");
      setDepartments(departments);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    load();
  }, []);

  async function create(e) {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) return;
    setBusy(true);
    setErr("");
    try {
      await apiSend("/api/departments", "POST", form);
      setForm({ code: "", name: "" });
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(d) {
    setErr("");
    try {
      await apiSend(`/api/departments/${d.id}`, "PATCH", { active: !d.active });
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="space-y-4">
      {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {departments === null ? (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
            ) : departments.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">No departments configured yet.</td></tr>
            ) : (
              departments.map((d) => (
                <tr key={d.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{d.code}</td>
                  <td className="px-3 py-2">{d.name}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${d.active ? "border border-green-300 bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                      {d.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => toggleActive(d)} className="text-xs text-slate-400 hover:text-slate-700">
                      {d.active ? "deactivate" : "reactivate"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <form onSubmit={create} className="flex flex-wrap gap-2 border-t border-slate-200 p-4">
          <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Code (e.g. CARDIO)" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name (e.g. Cardiology)" className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <button disabled={busy} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm text-[var(--hms-btn-fg)] disabled:opacity-50">
            + Add department
          </button>
        </form>
      </div>
    </div>
  );
}

function ServicePreviewTab({ serviceType, title }) {
  const [services, setServices] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const params = new URLSearchParams({ active: "true" });
    if (serviceType) params.set("serviceType", serviceType);
    apiGet(`/api/services?${params.toString()}`)
      .then(({ services }) => setServices(services))
      .catch((e) => setErr(e.message));
  }, [serviceType]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        <Link href="/dashboard/admin/pricing" className="text-xs font-medium text-slate-600 hover:underline">
          Manage in Service Master →
        </Link>
      </div>
      {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Category</th>
            </tr>
          </thead>
          <tbody>
            {services === null ? (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
            ) : services.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                  Nothing here yet — add one in the Service Master.
                </td>
              </tr>
            ) : (
              services.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{s.code}</td>
                  <td className="px-3 py-2">{s.name}</td>
                  <td className="px-3 py-2 text-slate-500">{s.serviceType}</td>
                  <td className="px-3 py-2 text-slate-500">{s.category || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
