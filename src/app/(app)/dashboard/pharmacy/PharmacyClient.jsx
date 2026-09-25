"use client";

import { RX_STATUS_LABEL, RX_STATUS_TONE } from "@/lib/rxStatus";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";
import AllergyBadge from "@/components/hms/AllergyBadge";
import PartnerSend from "@/components/hms/PartnerSend";
import { fmtDDMMYY } from "@/lib/dateFormat";
import InventoryTab from "./InventoryTab";
import { MedicinesTab, SuppliersTab, GrnTab, TransferTab, ReturnsTab, SellTab } from "./PharmacyExtras";
import { PurchaseHistoryTab } from "./PurchaseHistoryTab";
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

// Three plain business areas — what a pharmacist actually thinks in.
// (No module / instance / connection jargon anywhere in this screen.)
const CATEGORIES = [
  {
    key: "customer", label: "Customers & Sales", hint: "Prescriptions, dispensing, billing, returns",
    tabs: [
      ["queue", "Prescriptions & Dispensing"],
      ["sell", "Sales / Billing"],
      ["returns", "Returns"],
      ["history", "Purchase History"],
      ["partner", "Partner Orders"],
    ],
  },
  {
    key: "inventory", label: "Inventory", hint: "Medicines, stock, batches, expiry",
    tabs: [
      ["medicines", "Medicine List"],
      ["inventory", "Stock & Batches"],
      ["movement", "Stock Movement"],
      ["transfer", "Stock Transfer"],
      ["adjustments", "Stock Adjustment"],
    ],
  },
  {
    key: "purchase", label: "Suppliers & Purchase", hint: "Suppliers, orders, goods received",
    tabs: [
      ["suppliers", "Suppliers"],
      ["po", "Purchase Orders"],
      ["grn", "Goods Received"],
      ["purchase-history", "Purchase History"],
      ["supplier-returns", "Supplier Returns"],
    ],
  },
  { key: "reports", label: "Reports", hint: "All pharmacy reports", tabs: [["reports", "All Reports"]] },
];
const categoryOf = (tab) => CATEGORIES.find((c) => c.tabs.some(([k]) => k === tab)) || CATEGORIES[0];

export default function PharmacyClient({ permissions }) {
  const [tab, setTab] = useState("queue");
  const [initialFilter, setInitialFilter] = useState(null);
  const [receiveFor, setReceiveFor] = useState(null);
  const [msg, setMsg] = useState("");

  const allowed = (key) => {
    if (key === "sell") return permissions.canSell;
    if (key === "history") return permissions.canSell;
    if (key === "po" || key === "grn") return permissions.canGrn;
    if (key === "transfer") return permissions.canTransfer;
    if (key === "returns" || key === "supplier-returns") return permissions.canReturn;
    return true;
  };
  const category = categoryOf(tab);
  const visibleCategories = CATEGORIES.filter((c) => c.tabs.some(([k]) => allowed(k)));
  const subTabs = category.tabs.filter(([k]) => allowed(k));

  return (
    <div className="space-y-5">
      <Suspense fallback={null}>
        <TabParamsReader onReady={(t, f) => { if (t) setTab(t); if (f) setInitialFilter(f); }} />
      </Suspense>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pharmacy</h1>
        <p className="text-sm text-slate-500">{category.hint}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        {visibleCategories.map((c) => (
          <button
            key={c.key}
            onClick={() => setTab(c.tabs.find(([k]) => allowed(k))[0])}
            className={`rounded-2xl border px-4 py-3 text-left shadow-sm transition ${
              category.key === c.key ? "border-transparent bg-[var(--hms-btn-bg)] text-[var(--hms-btn-fg)] shadow-md" : "border-slate-200 bg-white hover:border-slate-300 hover:shadow"
            }`}
          >
            <p className="text-sm font-semibold">{c.label}</p>
            <p className={`text-xs ${category.key === c.key ? "opacity-80" : "text-slate-400"}`}>{c.hint}</p>
          </button>
        ))}
      </div>
      {subTabs.length > 1 && (
        <div className="flex flex-wrap gap-1.5 rounded-xl bg-slate-100 p-1 text-sm">
          {subTabs.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-lg px-3 py-1.5 transition ${tab === key ? "bg-white font-medium shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {msg && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>}
      {tab === "queue" && <QueueTab canDispense={permissions.canDispense} onError={setMsg} />}
      {tab === "sell" && <SellTab onError={setMsg} />}
      {tab === "history" && <PurchaseHistoryTab />}
      {tab === "inventory" && (
        <InventoryTab canStockIn={permissions.canStockIn} canAdjust={permissions.canAdjust} initialFilter={initialFilter} onError={setMsg} />
      )}
      {tab === "medicines" && <MedicinesTab canManage={permissions.canManageMedicines} onError={setMsg} />}
      {tab === "movement" && <PharmacyReportsTab key="movement" only={["stock-movement"]} />}
      {tab === "adjustments" && (
        <div className="space-y-3">
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">Every correction to a stock count is listed here with who did it and why. To adjust a count, open <button onClick={() => setTab("inventory")} className="font-medium underline">Stock &amp; Batches</button> → Details on the batch.</p>
          <PharmacyReportsTab key="adjustments" only={["stock-adjustments"]} />
        </div>
      )}
      {tab === "po" && <PurchaseOrdersTab canManage={permissions.canGrn} onError={setMsg} onReceive={(po) => { setReceiveFor(po); setTab("grn"); }} />}
      {tab === "grn" && <GrnTab onError={setMsg} receiveFor={receiveFor} onConsumedReceiveFor={() => setReceiveFor(null)} />}
      {tab === "purchase-history" && <PharmacyReportsTab key="purchase-history" only={["purchases", "grns", "supplier-purchases"]} />}
      {tab === "transfer" && <TransferTab onError={setMsg} />}
      {tab === "returns" && <ReturnsTab mode="customer" onError={setMsg} />}
      {tab === "supplier-returns" && <ReturnsTab mode="supplier" onError={setMsg} />}
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
  const [qtys, setQtys] = useState({}); // per-line "dispense this many now" (blank = everything remaining)

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
          className={`rounded-2xl border border-slate-200 bg-white shadow-sm p-4 ${
            flashIds.has(pr.id) ? "hms-flash" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">
              {pr.patient_name} <span className="text-xs font-normal text-slate-400">#{pr.id}</span>
            </p>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RX_STATUS_TONE[pr.status] || "bg-slate-100 text-slate-600"}`}>
              {RX_STATUS_LABEL[pr.status] || pr.status.replace(/_/g, " ")}
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
                      Required {it.quantity} · Dispensed {it.dispensed_quantity} · Remaining {outstanding}
                      {it.batch_number ? ` · batch ${it.batch_number}` : ""}
                    </p>
                  </div>
                  {outstanding > 0 ? (
                    canDispense && (
                      <div className="flex shrink-0 items-center gap-1.5">
                      <input type="number" min="1" max={outstanding} placeholder={String(outstanding)} value={qtys[it.id] || ""} onChange={(e) => setQtys((q) => ({ ...q, [it.id]: e.target.value }))} aria-label="Quantity to dispense now" className="w-16 rounded-md border border-slate-300 px-1.5 py-1 text-xs" />
                      <button
                        onClick={() => dispense(it.id, Math.min(outstanding, Number(qtys[it.id]) || 0) || undefined)}
                        disabled={busyItemId === it.id}
                        className="shrink-0 rounded-lg bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
                      >
                        {busyItemId === it.id ? "Dispensing…" : qtys[it.id] ? `Dispense ${Math.min(outstanding, Number(qtys[it.id]))}` : it.dispensed_quantity > 0 ? `Dispense remaining (${outstanding})` : `Dispense ${outstanding}`}
                      </button>
                      </div>
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
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-500">
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
                    <input type="number" min="0" placeholder="₹ amount" value={amounts[o.id] || ""} onChange={(e) => setAmounts({ ...amounts, [o.id]: e.target.value })} className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                    <button onClick={() => dispense(o)} disabled={busyId === o.id || o.inStock <= 0} className="rounded-lg bg-[var(--hms-btn-bg)] px-3 py-1 text-xs font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">
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
