"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";
import AllergyBadge from "@/components/hms/AllergyBadge";
import PartnerSend from "@/components/hms/PartnerSend";
import { fmtDDMMYY } from "@/lib/dateFormat";
import { MEDICINE_TYPES } from "@/lib/medicineTypes";
import { MedicinesTab, SuppliersTab, GrnTab, TransferTab, ReturnsTab, SellTab } from "./PharmacyExtras";
import { PurchaseOrdersTab, PharmacyReportsTab } from "./PharmacyExtras2";

// Reads ?tab=&filter= once (from the Dashboard's alert cards / notification
// bell deep-links) so the right tab + filter are open immediately —
// wrapped in Suspense per Next's useSearchParams() requirement.
function useInitialTabAndFilter() {
  const params = useSearchParams();
  return { tab: params.get("tab"), filter: params.get("filter") };
}

function TabParamsReader({ onReady }) {
  const { tab, filter } = useInitialTabAndFilter();
  useEffect(() => {
    onReady(tab, filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

const TABS = [
  ["queue", "Prescription queue"],
  ["sell", "Sell (walk-in)"],
  ["inventory", "Inventory"],
  ["medicines", "Medicines"],
  ["po", "Purchase Orders"],
  ["grn", "Receive stock (GRN)"],
  ["transfer", "Transfer"],
  ["returns", "Returns"],
  ["suppliers", "Suppliers"],
  ["reports", "Reports"],
  ["partner", "Partner orders"],
];

export default function PharmacyClient({ permissions }) {
  const [tab, setTab] = useState("queue");
  const [initialFilter, setInitialFilter] = useState(null);
  const [receiveFor, setReceiveFor] = useState(null);
  const [msg, setMsg] = useState("");

  const visibleTabs = TABS.filter(([key]) => {
    if (key === "sell") return permissions.canSell;
    if (key === "medicines") return permissions.canManageMedicines || true; // read access always allowed via stock:read
    if (key === "po") return permissions.canGrn;
    if (key === "grn") return permissions.canGrn;
    if (key === "transfer") return permissions.canTransfer;
    if (key === "returns") return permissions.canReturn;
    if (key === "suppliers") return permissions.canManageSuppliers || true;
    return true;
  });

  return (
    <div className="space-y-4">
      <Suspense fallback={null}>
        <TabParamsReader onReady={(t, f) => { if (t) setTab(t); if (f) setInitialFilter(f); }} />
      </Suspense>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Pharmacy</h1>
        <div className="flex flex-wrap gap-1 text-sm">
          {visibleTabs.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-md px-3 py-1.5 ${
                tab === key ? "bg-[var(--hms-btn-bg)] text-[var(--hms-btn-fg)]" : "bg-slate-100 text-slate-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      {tab === "queue" && <QueueTab canDispense={permissions.canDispense} onError={setMsg} />}
      {tab === "sell" && <SellTab onError={setMsg} />}
      {tab === "inventory" && (
        <InventoryTab canStockIn={permissions.canStockIn} canAdjust={permissions.canAdjust} initialFilter={initialFilter} onError={setMsg} />
      )}
      {tab === "medicines" && <MedicinesTab canManage={permissions.canManageMedicines} onError={setMsg} />}
      {tab === "po" && <PurchaseOrdersTab canManage={permissions.canGrn} onError={setMsg} onReceive={(po) => { setReceiveFor(po); setTab("grn"); }} />}
      {tab === "grn" && <GrnTab onError={setMsg} receiveFor={receiveFor} onConsumedReceiveFor={() => setReceiveFor(null)} />}
      {tab === "transfer" && <TransferTab onError={setMsg} />}
      {tab === "returns" && <ReturnsTab onError={setMsg} />}
      {tab === "suppliers" && <SuppliersTab canManage={permissions.canManageSuppliers} onError={setMsg} />}
      {tab === "reports" && <PharmacyReportsTab />}
      {tab === "partner" && <PartnerOrdersTab canDispense={permissions.canDispense} onError={setMsg} />}
    </div>
  );
}

// ── Prescription queue / dispense ────────────────────────────────────

function QueueTab({ canDispense, onError }) {
  const [prescriptions, setPrescriptions] = useState([]);
  const [flashIds, setFlashIds] = useState(new Set());
  const [busyItemId, setBusyItemId] = useState(null);

  function flash(id) {
    setFlashIds((s) => new Set(s).add(id));
    setTimeout(() => setFlashIds((s) => { const n = new Set(s); n.delete(id); return n; }), 2000);
  }

  async function load() {
    const { prescriptions } = await apiGet("/api/pharmacy/queue");
    setPrescriptions(prescriptions);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e) => onError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRealtime(
    {
      "prescription:created": ({ prescription }) => {
        flash(prescription.id);
        load();
      },
      "dispense:created": ({ item }) => {
        flash(item.prescription_id);
        load();
      },
    },
    load,
  );

  // Apply the server's own response straight to local state — instant for
  // the pharmacist who clicked, no waiting on the realtime round trip (that
  // still fires, for every OTHER open tab/screen watching this queue).
  async function dispense(itemId, quantity) {
    setBusyItemId(itemId);
    onError("");
    try {
      const { item, prescriptionStatus } = await apiSend(`/api/pharmacy/dispense/${itemId}`, "POST", quantity ? { quantity } : {});
      flash(item.prescription_id);
      setPrescriptions((prev) =>
        prescriptionStatus === "FULFILLED"
          ? prev.filter((pr) => pr.id !== item.prescription_id)
          : prev.map((pr) =>
              pr.id !== item.prescription_id
                ? pr
                : { ...pr, status: prescriptionStatus, items: pr.items.map((it) => (it.id === item.id ? item : it)) },
            ),
      );
    } catch (err) {
      onError(err.message);
    } finally {
      setBusyItemId(null);
    }
  }

  if (prescriptions.length === 0) {
    return <p className="text-sm text-slate-400">Nothing waiting — the queue is empty.</p>;
  }

  return (
    <div className="space-y-3">
      {prescriptions.map((pr) => (
        <div
          key={pr.id}
          className={`rounded-lg border border-slate-200 bg-white p-4 ${
            flashIds.has(pr.id) ? "hms-flash" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">
              {pr.patient_name} <span className="text-xs font-normal text-slate-400">#{pr.id}</span>
            </p>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {pr.status.replace(/_/g, " ")}
            </span>
          </div>
          <AllergyBadge allergies={pr.patient_allergies} className="mt-1" />
          <AvailabilityPanel prescriptionId={pr.id} onError={onError} />
          <div className="mt-3 space-y-2">
            {pr.items.map((it) => {
              const outstanding = it.quantity - it.dispensed_quantity;
              return (
                <div
                  key={it.id}
                  className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {it.medicine_name} {it.dosage && <span className="text-slate-500">· {it.dosage}</span>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {it.dispensed_quantity} / {it.quantity} dispensed
                      {it.batch_number ? ` · batch ${it.batch_number}` : ""}
                    </p>
                  </div>
                  {outstanding > 0 ? (
                    canDispense && (
                      <button
                        onClick={() => dispense(it.id)}
                        disabled={busyItemId === it.id}
                        className="shrink-0 rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
                      >
                        {busyItemId === it.id ? "Dispensing…" : `Dispense ${outstanding}`}
                      </button>
                    )
                  ) : (
                    <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                      done
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Availability check (Phase 8C — CLAUDE.md "First real cross-module
// data exchange — Prescription → Pharmacy"). Read-only: never deducts
// stock, never a substitute for the "Dispense" buttons already in this
// same card, which remain the one real dispensing action (unchanged FEFO
// flow). Requires an ACTIVE Clinical → Pharmacy connection — if none
// exists yet, or more than one Pharmacy instance is connected, this says
// so plainly instead of guessing. ────────────────────────────────────

const AVAILABILITY_STATUS_STYLE = {
  AVAILABLE: "border border-green-300 bg-green-50 text-green-700",
  FULFILLED: "border border-green-300 bg-green-50 text-green-700",
  PARTIAL: "border border-amber-300 bg-amber-50 text-amber-700",
  OUT_OF_STOCK: "border border-red-300 bg-red-50 text-red-700",
  UNMAPPED: "bg-slate-100 text-slate-500",
};

function AvailabilityPanel({ prescriptionId, onError }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [options, setOptions] = useState(null);
  const [notice, setNotice] = useState("");
  const [selectedInstance, setSelectedInstance] = useState("");
  const [loading, setLoading] = useState(false);

  async function check(instanceId) {
    setLoading(true);
    setNotice("");
    setOptions(null);
    try {
      const q = instanceId ? `?pharmacyInstanceId=${instanceId}` : "";
      const res = await apiGet(`/api/pharmacy/prescriptions/${prescriptionId}/availability${q}`);
      setData(res);
    } catch (err) {
      if (err.status === 409 && err.message === "no_active_connection") {
        setNotice("No connected pharmacy instance yet — connect Clinical to Pharmacy in the Connection Center.");
      } else if (err.status === 409 && err.message === "pharmacy_instance_required") {
        // apiSend/apiGet's parse() only surfaces `data.error` as the
        // message today, not the accompanying `options` array — re-fetch
        // the raw body once, here, rather than changing that shared
        // helper's contract for every other caller in this codebase.
        try {
          const raw = await fetch(`/api/pharmacy/prescriptions/${prescriptionId}/availability`).then((r) => r.json());
          setOptions(raw.options || []);
        } catch {
          setNotice("Multiple pharmacy instances are connected — pick one to continue.");
        }
      } else {
        onError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          check();
        }}
        className="mt-2 text-xs font-medium text-slate-500 hover:text-slate-800 hover:underline"
      >
        Check pharmacy availability
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
      <div className="flex items-center justify-between">
        <p className="font-medium text-slate-600">Pharmacy availability</p>
        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">
          close
        </button>
      </div>

      {loading && <p className="mt-2 text-slate-400">Checking…</p>}
      {notice && <p className="mt-2 text-slate-500">{notice}</p>}

      {options && (
        <div className="mt-2 flex items-center gap-2">
          <select
            value={selectedInstance}
            onChange={(e) => setSelectedInstance(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-xs"
          >
            <option value="">— select pharmacy —</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <button
            disabled={!selectedInstance}
            onClick={() => check(selectedInstance)}
            className="rounded bg-[var(--hms-btn-bg)] px-2 py-1 text-[var(--hms-btn-fg)] disabled:opacity-50"
          >
            Check
          </button>
        </div>
      )}

      {data && (
        <div className="mt-2">
          <p className="text-slate-500">Pharmacy: {data.pharmacyInstanceName}</p>
          <table className="mt-1.5 w-full">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="py-1 pr-2">Medicine</th>
                <th className="py-1 pr-2">Requested</th>
                <th className="py-1 pr-2">Available</th>
                <th className="py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it) => (
                <tr key={it.prescriptionItemId} className="border-t border-slate-200">
                  <td className="py-1.5 pr-2">{it.medicineName}</td>
                  <td className="py-1.5 pr-2">{it.outstandingQuantity} of {it.requestedQuantity}</td>
                  <td className="py-1.5 pr-2">{it.availableQuantity ?? "—"}</td>
                  <td className="py-1.5">
                    <span className={`rounded-full px-2 py-0.5 ${AVAILABILITY_STATUS_STYLE[it.status]}`}>
                      {it.status.replace(/_/g, " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1.5 text-slate-400">Use the Dispense button below to actually fulfill an item.</p>
        </div>
      )}
    </div>
  );
}

// ── Inventory: stock-in, batches, thresholds, adjustments, alerts ───

const STATUS_BADGE = {
  EXPIRED: "bg-red-100 text-red-700",
  EXPIRY_SOON: "bg-orange-100 text-orange-700",
  LOW_STOCK: "bg-amber-100 text-amber-700",
  OUT_OF_STOCK: "bg-slate-200 text-slate-600",
  IN_STOCK: "bg-emerald-100 text-emerald-700",
};
const STATUS_TEXT = {
  EXPIRED: "🔴 Expired",
  EXPIRY_SOON: "🟠 Expiry Soon",
  LOW_STOCK: "🟡 Low Stock",
  OUT_OF_STOCK: "Out of Stock",
  IN_STOCK: "In Stock",
};
const QUICK_FILTERS = [
  ["", "All"],
  ["low", "Low Stock"],
  ["expiring", "Expiry Soon"],
  ["expired", "Expired"],
  ["in", "In Stock"],
  ["out", "Out of Stock"],
];

// One line per batch — every field a pharmacist needs (type, strength,
// batch, expiry, stock, MRP, purchase rate, rack, status) without opening
// another screen. Dates are DD/MM/YY throughout (storage stays real dates).
function InventoryTab({ canStockIn, canAdjust, initialFilter, onError }) {
  const [rows, setRows] = useState([]);
  const [medicineOptions, setMedicineOptions] = useState([]);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [filter, setFilter] = useState(initialFilter || "");
  const [stockForm, setStockForm] = useState({ medicineId: "", batchNumber: "", manufacturingDate: "", expiryDate: "", quantity: "", purchaseRate: "", mrp: "", sellingRate: "", rack: "", shelf: "", bin: "" });
  const [busy, setBusy] = useState(false);
  const [adjusting, setAdjusting] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ delta: "", reason: "", category: "OTHER" });

  // A quick keystroke can make an earlier, slower search request resolve
  // AFTER a later one and overwrite it — guard by request identity, same
  // fix as the Reports tab's report-switching race.
  const searchGenRef = useRef(0);
  async function load() {
    const gen = ++searchGenRef.current;
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (type) params.set("type", type);
    if (filter) params.set("filter", filter);
    const d = await apiGet(`/api/pharmacy/inventory?${params.toString()}`);
    if (searchGenRef.current === gen) setRows(d.rows);
  }
  async function loadMedicines() {
    const d = await apiGet("/api/pharmacy/medicines?active=true");
    setMedicineOptions(d.medicines);
  }

  useEffect(() => {
    load().catch((e) => onError(e.message));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMedicines().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    load().catch((e) => onError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, type, filter]);

  useRealtime({ "stock:updated": load, "dispense:created": load, "threshold:updated": load }, load);

  async function submitStockIn(e) {
    e.preventDefault();
    setBusy(true);
    onError("");
    try {
      const medicine = medicineOptions.find((m) => String(m.id) === String(stockForm.medicineId));
      if (!medicine) throw new Error("pick_a_medicine");
      await apiSend("/api/pharmacy/stock", "POST", {
        medicineName: medicine.name,
        medicineId: medicine.id,
        batchNumber: stockForm.batchNumber,
        manufacturingDate: stockForm.manufacturingDate,
        expiryDate: stockForm.expiryDate,
        quantity: stockForm.quantity,
        ...(stockForm.purchaseRate ? { purchaseRate: Number(stockForm.purchaseRate) } : {}),
        ...(stockForm.mrp ? { mrp: Number(stockForm.mrp) } : {}),
        ...(stockForm.sellingRate ? { sellingRate: Number(stockForm.sellingRate) } : {}),
        ...(stockForm.rack ? { rack: stockForm.rack } : {}),
        ...(stockForm.shelf ? { shelf: stockForm.shelf } : {}),
        ...(stockForm.bin ? { bin: stockForm.bin } : {}),
      });
      setStockForm({ medicineId: "", batchNumber: "", manufacturingDate: "", expiryDate: "", quantity: "", purchaseRate: "", mrp: "", sellingRate: "", rack: "", shelf: "", bin: "" });
      await load();
    } catch (err) {
      onError(err.message === "pick_a_medicine" ? "Pick a medicine from the Medicines list first." : err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveThreshold(medicineName, value) {
    try {
      await apiSend("/api/pharmacy/thresholds", "PUT", { medicineName, lowStockThreshold: value });
      await load();
    } catch (err) {
      onError(err.message);
    }
  }

  async function submitAdjustment(stockId) {
    setBusy(true);
    try {
      await apiSend(`/api/pharmacy/stock/${stockId}`, "PATCH", {
        delta: Number(adjustForm.delta),
        reason: adjustForm.reason,
        category: adjustForm.category,
      });
      setAdjusting(null);
      setAdjustForm({ delta: "", reason: "", category: "OTHER" });
      await load();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm";

  return (
    <div className="space-y-4">
      {canStockIn && (
        <form onSubmit={submitStockIn} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-5">
          <p className="col-span-2 text-sm font-semibold sm:col-span-5">Add stock (batch)</p>
          {medicineOptions.length === 0 ? (
            <p className="col-span-2 text-xs text-amber-700 sm:col-span-5">Add a medicine to the Medicines list first, then stock it in here.</p>
          ) : (
            <select required value={stockForm.medicineId} onChange={(e) => setStockForm((s) => ({ ...s, medicineId: e.target.value }))} className={`${input} col-span-2 sm:col-span-2`}>
              <option value="">— pick medicine —</option>
              {medicineOptions.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.medicineType})</option>)}
            </select>
          )}
          <input placeholder="Batch #" required value={stockForm.batchNumber} onChange={(e) => setStockForm((s) => ({ ...s, batchNumber: e.target.value }))} className={input} />
          <label className="text-xs"><span className="block text-slate-500">Mfg date</span><input type="date" value={stockForm.manufacturingDate} onChange={(e) => setStockForm((s) => ({ ...s, manufacturingDate: e.target.value }))} className={`${input} w-full`} /></label>
          <label className="text-xs"><span className="block text-slate-500">Expiry date</span><input type="date" value={stockForm.expiryDate} onChange={(e) => setStockForm((s) => ({ ...s, expiryDate: e.target.value }))} className={`${input} w-full`} /></label>
          <label className="text-xs"><span className="block text-slate-500">Quantity</span><input type="number" min="1" required value={stockForm.quantity} onChange={(e) => setStockForm((s) => ({ ...s, quantity: e.target.value }))} className={`${input} w-full`} /></label>
          <label className="text-xs"><span className="block text-slate-500">Purchase rate ₹</span><input type="number" min="0" step="0.01" value={stockForm.purchaseRate} onChange={(e) => setStockForm((s) => ({ ...s, purchaseRate: e.target.value }))} className={`${input} w-full`} /></label>
          <label className="text-xs"><span className="block text-slate-500">MRP ₹</span><input type="number" min="0" step="0.01" value={stockForm.mrp} onChange={(e) => setStockForm((s) => ({ ...s, mrp: e.target.value }))} className={`${input} w-full`} /></label>
          <label className="text-xs"><span className="block text-slate-500">Selling rate ₹</span><input type="number" min="0" step="0.01" value={stockForm.sellingRate} onChange={(e) => setStockForm((s) => ({ ...s, sellingRate: e.target.value }))} className={`${input} w-full`} /></label>
          <label className="text-xs"><span className="block text-slate-500">Rack</span><input value={stockForm.rack} onChange={(e) => setStockForm((s) => ({ ...s, rack: e.target.value }))} className={`${input} w-full`} /></label>
          <label className="text-xs"><span className="block text-slate-500">Shelf</span><input value={stockForm.shelf} onChange={(e) => setStockForm((s) => ({ ...s, shelf: e.target.value }))} className={`${input} w-full`} /></label>
          <label className="text-xs"><span className="block text-slate-500">Bin</span><input value={stockForm.bin} onChange={(e) => setStockForm((s) => ({ ...s, bin: e.target.value }))} className={`${input} w-full`} /></label>
          <button disabled={busy || medicineOptions.length === 0} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Add to stock</button>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <input placeholder="Search medicine, generic, brand, batch, barcode, rack…" value={q} onChange={(e) => setQ(e.target.value)} className={`${input} min-w-[16rem] flex-1`} />
        <select value={type} onChange={(e) => setType(e.target.value)} className={input}>
          <option value="">All types</option>
          {MEDICINE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="flex flex-wrap gap-1">
          {QUICK_FILTERS.map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-2.5 py-1 text-xs ${filter === k ? "bg-[var(--hms-btn-bg)] text-[var(--hms-btn-fg)]" : "bg-slate-100 text-slate-600"}`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Medicine</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Strength</th>
              <th className="px-3 py-2">Batch</th>
              <th className="px-3 py-2">Expiry</th>
              <th className="px-3 py-2">Stock</th>
              <th className="px-3 py-2">MRP</th>
              <th className="px-3 py-2">Purchase Rate</th>
              <th className="px-3 py-2">Rack</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={11} className="px-3 py-6 text-center text-slate-400">No batches match.</td></tr>}
            {rows.map((r) => (
              <tr key={r.stockId} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 font-medium">{r.medicineName}</td>
                <td className="px-3 py-2">{r.type}</td>
                <td className="px-3 py-2">{r.strength || "—"}</td>
                <td className="px-3 py-2">{r.batchNumber || "—"}</td>
                <td className="px-3 py-2">{fmtDDMMYY(r.expiryDate)}</td>
                <td className="px-3 py-2 tabular-nums">
                  {r.quantity}
                  {canAdjust && (
                    <button onClick={() => setAdjusting(adjusting === r.stockId ? null : r.stockId)} className="ml-1.5 text-xs text-slate-400 underline hover:text-slate-700">adjust</button>
                  )}
                </td>
                <td className="px-3 py-2">{r.mrp != null ? `₹${r.mrp}` : "—"}</td>
                <td className="px-3 py-2">{r.purchaseRate != null ? `₹${r.purchaseRate}` : "—"}</td>
                <td className="px-3 py-2">{[r.rack, r.shelf, r.bin].filter(Boolean).join("-") || "—"}</td>
                <td className="px-3 py-2"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status]}`}>{STATUS_TEXT[r.status]}</span></td>
                <td className="px-3 py-2">
                  {canAdjust && (
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      reorder at
                      <input type="number" min="0" defaultValue={r.reorderLevel} onBlur={(e) => saveThreshold(r.medicineName, Number(e.target.value))} className="w-14 rounded border border-slate-300 px-1 py-0.5" />
                    </label>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adjusting != null && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <p className="font-semibold">Stock adjustment</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-xs"><span className="block text-slate-500">± Quantity</span><input type="number" value={adjustForm.delta} onChange={(e) => setAdjustForm((s) => ({ ...s, delta: e.target.value }))} className={`${input} w-24`} /></label>
            <label className="text-xs"><span className="block text-slate-500">Category</span>
              <select value={adjustForm.category} onChange={(e) => setAdjustForm((s) => ({ ...s, category: e.target.value }))} className={input}>
                <option value="DAMAGED">Damaged</option>
                <option value="EXPIRED_WRITEOFF">Expired write-off</option>
                <option value="COUNT_CORRECTION">Count correction</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label className="text-xs flex-1"><span className="block text-slate-500">Reason</span><input value={adjustForm.reason} onChange={(e) => setAdjustForm((s) => ({ ...s, reason: e.target.value }))} className={`${input} w-full`} /></label>
            <button onClick={() => submitAdjustment(adjusting)} disabled={busy || !adjustForm.delta || !adjustForm.reason} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Save</button>
            <button onClick={() => setAdjusting(null)} className="text-xs text-slate-400">Cancel</button>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">Before: {rows.find((r) => r.stockId === adjusting)?.quantity ?? "—"} → After: {rows.find((r) => r.stockId === adjusting) ? rows.find((r) => r.stockId === adjusting).quantity + (Number(adjustForm.delta) || 0) : "—"}</p>
        </div>
      )}
    </div>
  );
}


// ── Prescriptions sent by connected hospitals ───
// They arrive here (not in the hospital's own queue), are dispensed from THIS
// pharmacy's own stock, and the fulfilled quantity goes back to the sender.
function PartnerOrdersTab({ canDispense, onError }) {
  const [orders, setOrders] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [amounts, setAmounts] = useState({});

  async function load() {
    const d = await apiGet("/api/pharmacy/partner-orders");
    setOrders(d.orders);
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e) => onError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useRealtime({ "partner:inbound": load, "partner:updated": load, "stock:updated": load }, load);

  async function dispense(o) {
    setBusyId(o.id);
    onError("");
    try {
      await apiSend(`/api/pharmacy/partner-orders/${o.id}/dispense`, "POST", amounts[o.id] ? { amount: Number(amounts[o.id]) } : {});
      await load();
    } catch (e) {
      onError(e.message === "out_of_stock" ? "This medicine is out of stock." : e.message === "connection_not_active" ? "The connection with this hospital is not active." : `Could not dispense (${e.message}).`);
    } finally {
      setBusyId(null);
    }
  }

  if (!orders) return <p className="text-sm text-slate-400">Loading…</p>;
  return (
    <div className="space-y-4">
    <PartnerSend service="PHARMACY" />
    {orders.length === 0 ? <p className="text-sm text-slate-400">No requests from partners yet.</p> : (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">From</th>
            <th className="px-3 py-2">Patient</th>
            <th className="px-3 py-2">Medicine</th>
            <th className="px-3 py-2">Qty</th>
            <th className="px-3 py-2">In my stock</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-b border-slate-100 last:border-0">
              <td className="px-3 py-2">{o.from}</td>
              <td className="px-3 py-2">{o.patientName || "—"}</td>
              <td className="px-3 py-2">{o.medicineName}<p className="text-xs text-slate-400">{o.dosage}</p></td>
              <td className="px-3 py-2">{o.quantity}</td>
              <td className={`px-3 py-2 ${o.inStock >= (o.quantity || 0) ? "text-emerald-700" : "text-amber-700"}`}>{o.inStock}</td>
              <td className="px-3 py-2">{o.status === "COMPLETED" ? `Dispensed${o.result?.quantityFulfilled != null ? ` (${o.result.quantityFulfilled})` : ""}${o.result?.amount != null ? ` · ₹${o.result.amount}` : ""}` : "Waiting"}</td>
              <td className="px-3 py-2 text-right">
                {o.status === "RECEIVED" && canDispense && o.connectionStatus === "ACTIVE" && (
                  <span className="inline-flex items-center gap-1">
                    <input type="number" min="0" placeholder="₹ amount" value={amounts[o.id] || ""} onChange={(e) => setAmounts({ ...amounts, [o.id]: e.target.value })} className="w-24 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                    <button onClick={() => dispense(o)} disabled={busyId === o.id || o.inStock <= 0} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1 text-xs font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">
                      Dispense
                    </button>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    )}
    </div>
  );
}
