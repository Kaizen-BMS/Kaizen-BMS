"use client";
import { fmtDDMMYY } from "@/lib/dateFormat";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";

// Service Master + Tariff Master admin UI (CLAUDE.md "Pricing / Tariff").
// Deliberately plain — same "basic foundation, polish later" precedent as
// Module Instances/Connections. Two tabs instead of five disconnected
// pages (Staff Management's own precedent): Services (the catalog) and
// Tariffs (price + tax + effective-date, with history folded into the
// same GET ?serviceId= call rather than a separate route).

const SERVICE_TYPES = ["OPD", "CONSULTATION", "PROCEDURE", "IPD", "ROOM", "LAB", "RADIOLOGY", "EMERGENCY", "PHARMACY", "OTHER"];
const PATIENT_CATEGORIES = ["SELF_PAY", "INSURANCE", "CORPORATE", "GOVERNMENT_SCHEME", "AYUSHMAN_BHARAT", "OTHER"];

function money(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }) : v;
}

export default function PricingClient() {
  const [tab, setTab] = useState("services");
  const [msg, setMsg] = useState("");

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Pricing</h1>
        <p className="mt-1 text-sm text-slate-500">
          Service catalog and versioned tariffs (price + GST) that Billing draws from. Changing a price never
          alters a bill that already used the old one.
        </p>
      </div>

      {msg && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 whitespace-pre-line">{msg}</p>
      )}

      <div className="flex gap-2">
        {[
          { key: "services", label: "Services" },
          { key: "tariffs", label: "Tariffs" },
        ].map((t) => (
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

      {tab === "services" ? <ServicesTab setMsg={setMsg} /> : <TariffsTab setMsg={setMsg} />}
    </div>
  );
}

function ServicesTab({ setMsg }) {
  const [services, setServices] = useState(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [form, setForm] = useState({ code: "", name: "", serviceType: "OTHER", category: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);

  async function load() {
    setServices(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (typeFilter) params.set("serviceType", typeFilter);
      const { services } = await apiGet(`/api/services?${params.toString()}`);
      setServices(services);
    } catch (err) {
      setMsg(err.message);
    }
  }

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter]);

  async function createService(e) {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) return;
    setBusy(true);
    setMsg("");
    try {
      await apiSend("/api/services", "POST", form);
      setForm({ code: "", name: "", serviceType: "OTHER", category: "", description: "" });
      await load();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(svc) {
    setMsg("");
    try {
      await apiSend(`/api/services/${svc.id}`, "PATCH", { active: !svc.active });
      await load();
    } catch (err) {
      setMsg(err.message);
    }
  }

  async function saveEdit(id, patch) {
    setMsg("");
    try {
      await apiSend(`/api/services/${id}`, "PATCH", patch);
      setEditing(null);
      await load();
    } catch (err) {
      setMsg(err.message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Search name or code…"
          className="w-56 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button onClick={load} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
          Search
        </button>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All types</option>
          {SERVICE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {services === null ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
            ) : services.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">No services yet.</td></tr>
            ) : (
              services.map((s) =>
                editing === s.id ? (
                  <EditRow key={s.id} service={s} onCancel={() => setEditing(null)} onSave={(patch) => saveEdit(s.id, patch)} />
                ) : (
                  <tr key={s.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">{s.code}</td>
                    <td className="px-3 py-2">{s.name}</td>
                    <td className="px-3 py-2 text-slate-500">{s.serviceType}</td>
                    <td className="px-3 py-2 text-slate-500">{s.category || "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${s.active ? "border border-green-300 bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                        {s.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => setEditing(s.id)} className="mr-3 text-xs text-slate-400 hover:text-slate-700">edit</button>
                      <button onClick={() => toggleActive(s)} className="text-xs text-slate-400 hover:text-red-600">
                        {s.active ? "deactivate" : "reactivate"}
                      </button>
                    </td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>

        <form onSubmit={createService} className="grid grid-cols-1 gap-2 border-t border-slate-200 p-4 sm:grid-cols-5">
          <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Code (e.g. CONS-GEN)" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
          <select value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category (optional)" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <button disabled={busy} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm text-[var(--hms-btn-fg)] disabled:opacity-50 sm:col-span-5">
            + Add service
          </button>
        </form>
      </div>
    </div>
  );
}

function EditRow({ service, onCancel, onSave }) {
  const [name, setName] = useState(service.name);
  const [category, setCategory] = useState(service.category || "");
  return (
    <tr className="border-b border-slate-100 bg-slate-50 last:border-0">
      <td className="px-3 py-2 font-mono text-xs">{service.code}</td>
      <td className="px-3 py-2"><input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1 text-sm" /></td>
      <td className="px-3 py-2 text-slate-500">{service.serviceType}</td>
      <td className="px-3 py-2"><input value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1 text-sm" /></td>
      <td className="px-3 py-2 text-slate-500">{service.active ? "Active" : "Inactive"}</td>
      <td className="px-3 py-2 text-right">
        <button onClick={() => onSave({ name, category })} className="mr-3 text-xs text-slate-700 hover:underline">save</button>
        <button onClick={onCancel} className="text-xs text-slate-400 hover:text-slate-700">cancel</button>
      </td>
    </tr>
  );
}

function TariffsTab({ setMsg }) {
  const [services, setServices] = useState(null);
  const [serviceId, setServiceId] = useState("");
  const [tariffs, setTariffs] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    patientCategory: "SELF_PAY",
    context: "",
    price: "",
    taxInclusive: false,
    taxCategory: "",
    cgstRate: "0",
    sgstRate: "0",
    igstRate: "0",
    reason: "",
  });

  useEffect(() => {
    apiGet("/api/services?active=true").then(({ services }) => setServices(services)).catch((err) => setMsg(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTariffs(id) {
    setTariffs(null);
    if (!id) return;
    try {
      const { tariffs } = await apiGet(`/api/tariffs?serviceId=${id}`);
      setTariffs(tariffs);
    } catch (err) {
      setMsg(err.message);
    }
  }

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    loadTariffs(serviceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  async function createTariff(e) {
    e.preventDefault();
    if (!serviceId || !form.price) return;
    setBusy(true);
    setMsg("");
    try {
      await apiSend("/api/tariffs", "POST", { serviceId: Number(serviceId), ...form });
      setForm({ ...form, price: "", reason: "" });
      await loadTariffs(serviceId);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(id) {
    setMsg("");
    try {
      await apiSend(`/api/tariffs/${id}`, "PATCH", { active: false });
      await loadTariffs(serviceId);
    } catch (err) {
      setMsg(err.message);
    }
  }

  return (
    <div className="space-y-4">
      <select
        value={serviceId}
        onChange={(e) => setServiceId(e.target.value)}
        className="w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm sm:w-auto"
      >
        <option value="">Select a service…</option>
        {(services || []).map((s) => (
          <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
        ))}
      </select>

      {serviceId && (
        <>
          <div className="rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Tax</th>
                  <th className="px-3 py-2">Effective from</th>
                  <th className="px-3 py-2">Effective to</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {tariffs === null ? (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
                ) : tariffs.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">No pricing set yet for this service.</td></tr>
                ) : (
                  tariffs.map((t) => (
                    <tr key={t.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 text-slate-500">{t.patientCategory}</td>
                      <td className="px-3 py-2">{money(t.price)}</td>
                      <td className="px-3 py-2 text-slate-500">
                        {Number(t.cgstRate) + Number(t.sgstRate) + Number(t.igstRate) > 0
                          ? `${(Number(t.cgstRate) + Number(t.sgstRate) + Number(t.igstRate)).toFixed(2)}%${t.taxInclusive ? " (incl.)" : ""}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-500">{fmtDDMMYY(t.effectiveFrom)}</td>
                      <td className="px-3 py-2 text-slate-500">{t.effectiveTo ? fmtDDMMYY(t.effectiveTo) : "—"}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${t.current ? "border border-green-300 bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                          {t.current ? "Current" : t.active ? "Past" : "Deactivated"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {t.current && (
                          <button onClick={() => deactivate(t.id)} className="text-xs text-slate-400 hover:text-red-600">deactivate</button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <form onSubmit={createTariff} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4">
            <div className="col-span-2 text-sm font-medium sm:col-span-4">Set a new price (versions the current one)</div>
            <input required type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Price (₹)" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <select value={form.patientCategory} onChange={(e) => setForm({ ...form, patientCategory: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              {PATIENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input value={form.taxCategory} onChange={(e) => setForm({ ...form, taxCategory: e.target.value })} placeholder="Tax category (e.g. GST_18)" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={form.taxInclusive} onChange={(e) => setForm({ ...form, taxInclusive: e.target.checked })} />
              Price includes tax
            </label>
            <input type="number" min="0" step="0.01" value={form.cgstRate} onChange={(e) => setForm({ ...form, cgstRate: e.target.value })} placeholder="CGST %" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <input type="number" min="0" step="0.01" value={form.sgstRate} onChange={(e) => setForm({ ...form, sgstRate: e.target.value })} placeholder="SGST %" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <input type="number" min="0" step="0.01" value={form.igstRate} onChange={(e) => setForm({ ...form, igstRate: e.target.value })} placeholder="IGST %" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <input value={form.context} onChange={(e) => setForm({ ...form, context: e.target.value })} placeholder="Context (e.g. General OPD)" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Reason (optional)" className="col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-3" />
            <button disabled={busy} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm text-[var(--hms-btn-fg)] disabled:opacity-50">
              Save price
            </button>
          </form>
        </>
      )}
    </div>
  );
}
