"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/components/hms/api";

// Data Contracts — view-only (Phase 8B — CLAUDE.md "Master data + data
// contract foundation", Part 19). Contracts are system-defined this
// phase; there is deliberately no "create contract" form here — an admin
// can see which data relationships exist between modules, not invent new
// ones. Reuses the exact CONNECTION_TYPES catalog the Connection Center
// already governs connections with (GET /api/data-contracts) — one
// source of truth, not a parallel definition.
const MODULE_LABEL = {
  PHARMACY: "Pharmacy",
  DOCTOR_OPD: "OPD",
  LAB: "Lab",
  BILLING: "Billing",
  IPD: "IPD",
  APPOINTMENTS: "Appointments",
};

export default function ContractsClient() {
  const [contracts, setContracts] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiGet("/api/data-contracts")
      .then(({ contracts }) => setContracts(contracts))
      .catch((e) => setErr(e.message));
  }, []);

  const connectable = contracts?.filter((c) => c.connectable !== false) || [];
  const reference = contracts?.filter((c) => c.connectable === false) || [];

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Data Contracts</h1>
        <p className="mt-1 text-sm text-slate-500">
          Which data relationships exist between modules — system-defined, not editable here.
        </p>
      </div>

      {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      {contracts === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Module-to-module</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {connectable.map((c) => (
                <ContractCard key={c.key} c={c} />
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Reference shapes <span className="font-normal normal-case text-slate-400">(not tied to a specific connection)</span>
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {reference.map((c) => (
                <ContractCard key={c.key} c={c} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function ContractCard({ c }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-slate-900">{c.label}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${c.status === "ACTIVE" ? "border border-green-300 bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
          {c.status}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-slate-400">Version {c.version}</p>
      {c.sourceModule && c.targetModule && (
        <p className="mt-2 text-sm text-slate-600">
          {MODULE_LABEL[c.sourceModule] || c.sourceModule}
          <span className="mx-1.5 text-slate-400">→</span>
          {MODULE_LABEL[c.targetModule] || c.targetModule}
        </p>
      )}
      <p className="mt-2 text-xs text-slate-500">{c.purpose || c.description}</p>
      <div className="mt-3 rounded-md border border-slate-100 bg-slate-50 p-2.5 text-xs text-slate-500">
        <p className="font-medium text-slate-600">Allowed fields</p>
        <p className="mt-1">{c.fields.join(", ")}</p>
        {c.restrictedFields?.length > 0 && (
          <>
            <p className="mt-2 font-medium text-slate-600">Restricted</p>
            <p className="mt-1">{c.restrictedFields.join(", ")}</p>
          </>
        )}
      </div>
    </div>
  );
}
