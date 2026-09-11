"use client";

import { useState } from "react";
import Link from "next/link";
import { apiSend } from "@/components/hms/api";

const TYPES = [
  { value: "HOSPITAL", label: "Hospital (Full Suite — pick modules)" },
  { value: "DOCTOR_SOLO", label: "Solo Doctor Pack (Doctor/OPD)" },
  { value: "PHARMACY_SOLO", label: "Solo Pharmacist Pack (Pharmacy)" },
  { value: "LAB_SOLO", label: "Solo Lab Pack (Lab)" },
];
const HOSPITAL_MODULES = ["DOCTOR_OPD", "PHARMACY", "LAB", "IPD", "BILLING"];

export default function CreateTenantClient() {
  const [form, setForm] = useState({ name: "", slug: "", type: "HOSPITAL", modules: [], ownerName: "", ownerEmail: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);

  function toggleModule(m) {
    setForm((s) => ({
      ...s,
      modules: s.modules.includes(m) ? s.modules.filter((x) => x !== m) : [...s.modules, m],
    }));
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { tenant, owner } = await apiSend("/api/admin/tenants", "POST", form);
      setCreated({ tenant, owner });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="max-w-lg space-y-4">
        <h1 className="text-xl font-semibold">Tenant created</h1>
        <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm">
          <p className="font-semibold">{created.tenant.name}</p>
          <p className="text-slate-600">/{created.tenant.slug} · {created.tenant.type}</p>
          <p className="mt-3 font-semibold">Owner login — share these once, they won&apos;t be shown again:</p>
          <p className="mt-1">Email: <span className="font-mono">{created.owner.email}</span></p>
          <p>Temp password: <span className="font-mono">{created.owner.tempPassword}</span></p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/dashboard/platform/tenants" className="text-slate-600 underline">Back to tenants</Link>
          <button
            onClick={() => { setCreated(null); setForm({ name: "", slug: "", type: "HOSPITAL", modules: [], ownerName: "", ownerEmail: "" }); }}
            className="text-slate-600 underline"
          >
            Create another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">Create Tenant</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form onSubmit={submit} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <Field label="Tenant name" value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} required />
        <Field label="Slug (public URL id)" value={form.slug} onChange={(v) => setForm((s) => ({ ...s, slug: v }))} required />
        <div>
          <label className="text-xs font-medium text-slate-600">Type</label>
          <select
            value={form.type}
            onChange={(e) => setForm((s) => ({ ...s, type: e.target.value, modules: [] }))}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        {form.type === "HOSPITAL" && (
          <div>
            <label className="text-xs font-medium text-slate-600">Modules</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {HOSPITAL_MODULES.map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => toggleModule(m)}
                  className={`rounded-full px-3 py-1 text-xs ${
                    form.modules.includes(m) ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}
        <Field label="Owner name" value={form.ownerName} onChange={(v) => setForm((s) => ({ ...s, ownerName: v }))} required />
        <Field label="Owner email" type="email" value={form.ownerEmail} onChange={(v) => setForm((s) => ({ ...s, ownerEmail: v }))} required />
        <button disabled={busy} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "Creating…" : "Create tenant"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
    </div>
  );
}
