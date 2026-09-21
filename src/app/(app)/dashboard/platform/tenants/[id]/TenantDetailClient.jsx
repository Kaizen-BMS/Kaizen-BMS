"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import ResetPasswordButton from "@/components/hms/ResetPasswordButton";

const ALL_MODULES = ["DOCTOR_OPD", "PHARMACY", "LAB", "IPD", "BILLING", "APPOINTMENTS"];

export default function TenantDetailClient({ tenantId }) {
  const [tenant, setTenant] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { tenant } = await apiGet(`/api/admin/tenants/${tenantId}`);
    setTenant(tenant);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleModule(moduleName, isActive) {
    setBusy(true);
    try {
      await apiSend(`/api/admin/tenants/${tenantId}/modules`, "PATCH", { moduleName, isActive });
      await load();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    if (!confirm(tenant.active ? `Suspend ${tenant.name}? This blocks every login for this tenant immediately.` : `Reactivate ${tenant.name}?`)) return;
    setBusy(true);
    try {
      await apiSend(`/api/admin/tenants/${tenantId}`, "PATCH", { active: !tenant.active });
      await load();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!tenant) return <p className="text-sm text-slate-400">{msg || "Loading…"}</p>;

  const activeSet = new Set(tenant.modules.filter((m) => m.is_active).map((m) => m.module_name));
  const applicableModules = tenant.type === "HOSPITAL" ? ALL_MODULES : ALL_MODULES.filter((m) => activeSet.has(m) || m === "BILLING");

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{tenant.name}</h1>
          <p className="text-sm text-slate-500">/{tenant.slug} · {tenant.type}</p>
        </div>
        <button
          onClick={toggleActive}
          disabled={busy}
          className={`rounded-md px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50 ${
            tenant.active ? "bg-red-700" : "bg-green-700"
          }`}
        >
          {tenant.active ? "Suspend tenant" : "Reactivate tenant"}
        </button>
      </div>
      {msg && <p className="text-sm text-red-600">{msg}</p>}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold">Modules</p>
        <p className="text-xs text-slate-500">
          {tenant.type === "HOSPITAL" ? "Toggle any combination." : "Individual packs run one main module; Billing can be added on top."}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {applicableModules.map((m) => (
            <button
              key={m}
              disabled={busy}
              onClick={() => toggleModule(m, !activeSet.has(m))}
              className={`rounded-full px-3 py-1 text-xs disabled:opacity-50 ${
                activeSet.has(m) ? "bg-green-700 text-[var(--hms-btn-fg)]" : "bg-slate-100 text-slate-500"
              }`}
            >
              {m} {activeSet.has(m) ? "· rented" : "· off"}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold">Staff ({tenant.staff.length})</p>
        <table className="mt-2 w-full text-xs">
          <tbody>
            {tenant.staff.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="py-1.5 pr-2 font-medium">{u.name}</td>
                <td className="py-1.5 pr-2 text-slate-500">{u.email}</td>
                <td className="py-1.5 pr-2 text-slate-500">{u.role}</td>
                <td className="py-1.5"><ResetPasswordButton userId={u.id} name={u.name} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
