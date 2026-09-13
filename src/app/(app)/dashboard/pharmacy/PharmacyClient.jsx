"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";
import AllergyBadge from "@/components/hms/AllergyBadge";

export default function PharmacyClient({ permissions }) {
  const [tab, setTab] = useState("queue");
  const [msg, setMsg] = useState("");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pharmacy</h1>
        <div className="flex gap-1 text-sm">
          {[
            ["queue", "Prescription queue"],
            ["inventory", "Inventory"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-md px-3 py-1.5 ${
                tab === key ? "bg-[var(--hms-btn-bg)] text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      {tab === "queue" ? (
        <QueueTab canDispense={permissions.canDispense} onError={setMsg} />
      ) : (
        <InventoryTab
          canStockIn={permissions.canStockIn}
          canAdjust={permissions.canAdjust}
          onError={setMsg}
        />
      )}
    </div>
  );
}

// ── Prescription queue / dispense ────────────────────────────────────

function QueueTab({ canDispense, onError }) {
  const [prescriptions, setPrescriptions] = useState([]);
  const [flashIds, setFlashIds] = useState(new Set());

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

  async function dispense(itemId, quantity) {
    try {
      await apiSend(`/api/pharmacy/dispense/${itemId}`, "POST", quantity ? { quantity } : {});
    } catch (err) {
      onError(err.message);
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
                        className="shrink-0 rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs font-medium text-white"
                      >
                        Dispense {outstanding}
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

// ── Inventory: stock-in, batches, thresholds, adjustments, alerts ───

function InventoryTab({ canStockIn, canAdjust, onError }) {
  const [medicines, setMedicines] = useState([]);
  const [stockForm, setStockForm] = useState({ medicineName: "", batchNumber: "", expiryDate: "", quantity: "" });
  const [busy, setBusy] = useState(false);
  const [adjusting, setAdjusting] = useState(null); // batch id being adjusted
  const [adjustForm, setAdjustForm] = useState({ delta: "", reason: "" });

  async function load() {
    const { medicines } = await apiGet("/api/pharmacy/inventory");
    setMedicines(medicines);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e) => onError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRealtime(
    {
      "stock:updated": load,
      "dispense:created": load,
      "threshold:updated": load,
    },
    load,
  );

  async function submitStockIn(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiSend("/api/pharmacy/stock", "POST", stockForm);
      setStockForm({ medicineName: "", batchNumber: "", expiryDate: "", quantity: "" });
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveThreshold(medicineName, value) {
    try {
      await apiSend("/api/pharmacy/thresholds", "PUT", {
        medicineName,
        lowStockThreshold: value,
      });
    } catch (err) {
      onError(err.message);
    }
  }

  async function submitAdjustment(batchId) {
    setBusy(true);
    try {
      await apiSend(`/api/pharmacy/stock/${batchId}`, "PATCH", {
        delta: Number(adjustForm.delta),
        reason: adjustForm.reason,
      });
      setAdjusting(null);
      setAdjustForm({ delta: "", reason: "" });
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const lowStock = medicines.filter((m) => m.lowStock);
  const expiring = medicines.flatMap((m) =>
    m.batches.filter((b) => (b.expired || b.expiringSoon) && b.quantity > 0).map((b) => ({ ...b, medicineName: m.medicineName })),
  );

  return (
    <div className="space-y-6">
      {(lowStock.length > 0 || expiring.length > 0) && (
        <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          {lowStock.length > 0 && (
            <p>⚠ Low stock: {lowStock.map((m) => `${m.medicineName} (${m.totalQuantity})`).join(", ")}</p>
          )}
          {expiring.length > 0 && (
            <p>
              ⏳ Nearing/past expiry:{" "}
              {expiring
                .map((b) => `${b.medicineName} batch ${b.batch_number}${b.expired ? " (EXPIRED)" : ""}`)
                .join(", ")}
            </p>
          )}
        </div>
      )}

      {canStockIn && (
        <form
          onSubmit={submitStockIn}
          className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-5"
        >
          <p className="col-span-2 text-sm font-semibold sm:col-span-5">Stock-in</p>
          <input
            placeholder="medicine"
            required
            value={stockForm.medicineName}
            onChange={(e) => setStockForm((s) => ({ ...s, medicineName: e.target.value }))}
            className="col-span-2 rounded-md border border-slate-300 px-2 py-1.5 text-sm sm:col-span-1"
          />
          <input
            placeholder="batch #"
            required
            value={stockForm.batchNumber}
            onChange={(e) => setStockForm((s) => ({ ...s, batchNumber: e.target.value }))}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <input
            type="date"
            value={stockForm.expiryDate}
            onChange={(e) => setStockForm((s) => ({ ...s, expiryDate: e.target.value }))}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <input
            type="number"
            min="1"
            placeholder="qty"
            required
            value={stockForm.quantity}
            onChange={(e) => setStockForm((s) => ({ ...s, quantity: e.target.value }))}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <button
            disabled={busy}
            className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Add
          </button>
        </form>
      )}

      <div className="space-y-3">
        {medicines.length === 0 && <p className="text-sm text-slate-400">No stock recorded yet.</p>}
        {medicines.map((m) => (
          <div key={m.medicineName} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">
                {m.medicineName}{" "}
                <span className={`ml-1 text-xs font-normal ${m.lowStock ? "text-red-600" : "text-slate-400"}`}>
                  {m.totalQuantity} in stock
                </span>
              </p>
              {canAdjust && (
                <label className="flex items-center gap-1 text-xs text-slate-500">
                  low-stock threshold
                  <input
                    type="number"
                    min="0"
                    defaultValue={m.threshold}
                    onBlur={(e) => saveThreshold(m.medicineName, Number(e.target.value))}
                    className="w-16 rounded border border-slate-300 px-1 py-0.5"
                  />
                </label>
              )}
            </div>
            <table className="mt-2 w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="py-1 pr-2">Batch</th>
                  <th className="py-1 pr-2">Expiry</th>
                  <th className="py-1 pr-2">Qty</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {m.batches.map((b) => (
                  <tr key={b.id} className="border-t border-slate-100">
                    <td className="py-1.5 pr-2">{b.batch_number || "—"}</td>
                    <td className="py-1.5 pr-2">
                      {b.expiry_date || "—"}{" "}
                      {b.expired && <span className="text-red-600">expired</span>}
                      {!b.expired && b.expiringSoon && <span className="text-amber-600">soon</span>}
                    </td>
                    <td className="py-1.5 pr-2">{b.quantity}</td>
                    <td className="py-1.5">
                      {canAdjust &&
                        (adjusting === b.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              placeholder="± qty"
                              value={adjustForm.delta}
                              onChange={(e) => setAdjustForm((s) => ({ ...s, delta: e.target.value }))}
                              className="w-16 rounded border border-slate-300 px-1 py-0.5"
                            />
                            <input
                              placeholder="reason"
                              value={adjustForm.reason}
                              onChange={(e) => setAdjustForm((s) => ({ ...s, reason: e.target.value }))}
                              className="w-28 rounded border border-slate-300 px-1 py-0.5"
                            />
                            <button
                              onClick={() => submitAdjustment(b.id)}
                              disabled={busy || !adjustForm.delta || !adjustForm.reason}
                              className="rounded bg-[var(--hms-btn-bg)] px-2 py-0.5 text-white disabled:opacity-50"
                            >
                              save
                            </button>
                            <button onClick={() => setAdjusting(null)} className="text-slate-400">
                              cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setAdjusting(b.id)}
                            className="text-slate-400 underline hover:text-slate-700"
                          >
                            adjust
                          </button>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

