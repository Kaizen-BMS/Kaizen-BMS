"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";
import AllergyBadge from "@/components/hms/AllergyBadge";
import PartnerSend from "@/components/hms/PartnerSend";

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
            ["partner", "Partner orders"],
            ["inventory", "Inventory"],
          ].map(([key, label]) => (
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
      {tab === "queue" ? (
        <QueueTab canDispense={permissions.canDispense} onError={setMsg} />
      ) : tab === "partner" ? (
        <PartnerOrdersTab canDispense={permissions.canDispense} onError={setMsg} />
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
                        className="shrink-0 rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs font-medium text-[var(--hms-btn-fg)]"
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

function InventoryTab({ canStockIn, canAdjust, onError }) {
  const [medicines, setMedicines] = useState([]);
  const [stockForm, setStockForm] = useState({ form: "Tablet", medicineName: "", strength: "", batchNumber: "", expiryDate: "", quantity: "" });
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
      // Same structure as a prescription line: Type / Medicine / Strength. The
      // stored name is the readable composition, so doctors who pick it from
      // the availability hint prescribe exactly what is in stock.
      const name = [stockForm.medicineName.trim(), stockForm.strength.trim(), ["Tablet", "Capsule"].includes(stockForm.form) ? "" : stockForm.form].filter(Boolean).join(" ");
      await apiSend("/api/pharmacy/stock", "POST", { medicineName: name, batchNumber: stockForm.batchNumber, expiryDate: stockForm.expiryDate, quantity: stockForm.quantity });
      setStockForm((f) => ({ ...f, medicineName: "", strength: "", batchNumber: "", expiryDate: "", quantity: "" }));
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
          className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-7"
        >
          <p className="col-span-2 text-sm font-semibold sm:col-span-7">Add medicine to stock</p>
          <select
            aria-label="Type"
            value={stockForm.form}
            onChange={(e) => setStockForm((s) => ({ ...s, form: e.target.value }))}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            {["Tablet", "Capsule", "Syrup", "Injection", "Cream/Ointment", "Drops", "Inhaler", "Powder", "Other"].map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <input
            placeholder="Medicine name"
            required
            list="stock-known-medicines"
            value={stockForm.medicineName}
            onChange={(e) => setStockForm((s) => ({ ...s, medicineName: e.target.value }))}
            className="col-span-2 rounded-md border border-slate-300 px-2 py-1.5 text-sm sm:col-span-1"
          />
          <datalist id="stock-known-medicines">
            {medicines.map((m) => <option key={m.medicineName} value={m.medicineName} />)}
          </datalist>
          <input
            placeholder="Strength e.g. 500mg"
            value={stockForm.strength}
            onChange={(e) => setStockForm((s) => ({ ...s, strength: e.target.value }))}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
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
            className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
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
                              className="rounded bg-[var(--hms-btn-bg)] px-2 py-0.5 text-[var(--hms-btn-fg)] disabled:opacity-50"
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
