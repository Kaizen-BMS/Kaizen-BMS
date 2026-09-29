"use client";

import { RX_STATUS_LABEL, RX_STATUS_TONE } from "@/lib/rxStatus";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";
import AllergyBadge from "@/components/hms/AllergyBadge";
import PartnerSend from "@/components/hms/PartnerSend";
import MedicineInput from "@/components/hms/MedicineInput";
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
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold tracking-tight">Pharmacy</h1>
        <p className="text-sm text-slate-500">{category.hint}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-4 print:hidden">
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
        <div className="flex flex-wrap gap-1.5 rounded-xl bg-slate-100 p-1 text-sm print:hidden">
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
    </div>
  );
}

// ── Prescription queue / dispense ────────────────────────────────────

function QueueTab({ canDispense, onError }) {
  const [prescriptions, setPrescriptions] = useState([]);
  const [flashIds, setFlashIds] = useState(new Set());
  const [busyItemId, setBusyItemId] = useState(null);
  const [qtys, setQtys] = useState({}); // per-line "dispense this many now" (blank = everything remaining)
  // Per-line explicit substitute pick — {itemId: {id, name}}. Set only when
  // a pharmacist actively picks something from the suggestion list, never
  // guessed. Also doubles as "resolve this legacy line's catalog identity"
  // for an item that was never linked (see medicine_id on the dispense
  // route) — same one action either way.
  const [substitutes, setSubstitutes] = useState({});
  const [substOpenFor, setSubstOpenFor] = useState(null);
  // A prescription drops off this queue the moment it's fully dispensed
  // (server-side filter + the filter below) — without this, that felt like
  // it vanished into nowhere instead of flowing on to billing. Keep a
  // short, dismissible trail of what just finished, each linking straight
  // to that visit's OPD bill.
  const [justFulfilled, setJustFulfilled] = useState([]);

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
  function applyDispenseResult(item, prescriptionStatus) {
    flash(item.prescription_id);
    if (prescriptionStatus === "FULFILLED") {
      const pr = prescriptions.find((p) => p.id === item.prescription_id);
      setJustFulfilled((xs) => [
        { id: item.prescription_id, patientName: pr?.patient_name || "Patient", visitId: pr?.visit_id },
        ...xs.filter((x) => x.id !== item.prescription_id),
      ].slice(0, 5));
    }
    setPrescriptions((prev) =>
      prescriptionStatus === "FULFILLED"
        ? prev.filter((pr) => pr.id !== item.prescription_id)
        : prev.map((pr) =>
            pr.id !== item.prescription_id
              ? pr
              : { ...pr, status: prescriptionStatus, items: pr.items.map((it) => (it.id === item.id ? item : it)) },
          ),
    );
  }

  async function dispense(itemId, quantity) {
    setBusyItemId(itemId);
    onError("");
    try {
      const sub = substitutes[itemId];
      const { item, prescriptionStatus } = await apiSend(`/api/pharmacy/dispense/${itemId}`, "POST", {
        ...(quantity ? { quantity } : {}),
        ...(sub ? { medicineId: sub.id } : {}),
      });
      applyDispenseResult(item, prescriptionStatus);
      setSubstitutes((s) => { const n = { ...s }; delete n[itemId]; return n; });
      setSubstOpenFor((cur) => (cur === itemId ? null : cur));
    } catch (err) {
      onError(err.message);
    } finally {
      setBusyItemId(null);
    }
  }

  // "We don't have the rest — stop asking." Closes the outstanding balance
  // on this line without giving anything more (it never touches stock —
  // see the route's own comment). Only offered once at least a genuine
  // attempt/partial has happened, so it's a deliberate close, not a way to
  // skip dispensing altogether.
  async function closeRemainder(itemId) {
    setBusyItemId(itemId);
    onError("");
    try {
      const { item, prescriptionStatus } = await apiSend(`/api/pharmacy/dispense/${itemId}/close`, "POST", {});
      applyDispenseResult(item, prescriptionStatus);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusyItemId(null);
    }
  }

  return (
    <div className="space-y-3">
      {justFulfilled.length > 0 && (
        <div className="space-y-1.5">
          {justFulfilled.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-3 rounded-xl border border-green-300 bg-green-50 px-3 py-2 text-sm">
              <p className="text-green-800">
                ✓ <span className="font-medium">{f.patientName}</span>&apos;s prescription is fully dispensed.
              </p>
              <div className="flex shrink-0 items-center gap-2">
                {f.visitId ? (
                  <a href={`/dashboard/billing?visitId=${f.visitId}`} className="rounded-lg bg-[var(--hms-btn-bg)] px-3 py-1 text-xs font-medium text-[var(--hms-btn-fg)]">
                    Go to Billing →
                  </a>
                ) : null}
                <button onClick={() => setJustFulfilled((xs) => xs.filter((x) => x.id !== f.id))} className="text-green-700/60 hover:text-green-900" aria-label="Dismiss">
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {prescriptions.length === 0 && justFulfilled.length === 0 && (
        <p className="text-sm text-slate-400">Nothing waiting — the queue is empty.</p>
      )}
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
          <div className="mt-3 space-y-2">
            {pr.items.map((it) => {
              const outstanding = it.quantity - it.dispensed_quantity;
              const sub = substitutes[it.id];
              return (
                <div key={it.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {it.medicine_name} {it.dosage && <span className="text-slate-500">· {it.dosage}</span>}
                        {sub && <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">giving: {sub.name}</span>}
                      </p>
                      <p className="text-xs text-slate-500">
                        Required {it.quantity} · Dispensed {it.dispensed_quantity} · Remaining {outstanding}
                        {it.batch_number ? ` · batch ${it.batch_number}` : ""}
                      </p>
                    </div>
                    {outstanding > 0 ? (
                      canDispense && (
                        <div className="flex shrink-0 items-center gap-1.5">
                        <input
                          type="number" min="1" max={outstanding} placeholder={String(outstanding)}
                          value={qtys[it.id] || ""}
                          onChange={(e) => setQtys((q) => ({ ...q, [it.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            // Enter dispenses this line directly — a pharmacist typing a
                            // quantity shouldn't have to reach for the mouse to confirm it.
                            if (e.key === "Enter") { e.preventDefault(); dispense(it.id, Math.min(outstanding, Number(qtys[it.id]) || 0) || undefined); }
                          }}
                          aria-label="Quantity to dispense now" className="w-16 rounded-md border border-slate-300 px-1.5 py-1 text-xs" />
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

                  {outstanding > 0 && canDispense && (
                    <div className="mt-1.5">
                      {substOpenFor === it.id ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-56">
                            <MedicineInput
                              autoFocus
                              value={sub?.name || ""}
                              onChange={(t) => setSubstitutes((s) => ({ ...s, [it.id]: { id: s[it.id]?.id, name: t } }))}
                              onPick={(m) => { setSubstitutes((s) => ({ ...s, [it.id]: { id: m.id, name: m.name } })); setSubstOpenFor(null); }}
                              placeholder="Search a medicine to give instead…"
                              className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                            />
                          </div>
                          <button onClick={() => setSubstOpenFor(null)} className="text-xs text-slate-400 hover:text-slate-700">cancel</button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-3 text-[11px]">
                          <button onClick={() => setSubstOpenFor(it.id)} className="text-slate-500 underline hover:text-slate-800">
                            {sub ? "change substitute" : "don't have this — give another"}
                          </button>
                          {sub && (
                            <button onClick={() => setSubstitutes((s) => { const n = { ...s }; delete n[it.id]; return n; })} className="text-slate-400 hover:text-slate-700">
                              use original medicine instead
                            </button>
                          )}
                          {it.dispensed_quantity > 0 || it.status === "OUT_OF_STOCK" ? (
                            <button
                              onClick={() => { if (window.confirm(`Close this line without giving the remaining ${outstanding}? This won't be asked again.`)) closeRemainder(it.id); }}
                              disabled={busyItemId === it.id}
                              className="text-slate-400 hover:text-red-600 disabled:opacity-50"
                            >
                              can&apos;t give the rest — close
                            </button>
                          ) : null}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Orders sent BY a connected hospital, dispensed from THIS pharmacy's
          own stock — shown right alongside the hospital's own patients
          (not a separate tab) so a pharmacist works one list, not two. Each
          card carries a "From: <partner>" badge so it's still obvious which
          ones aren't a walk-in/registered patient here. */}
      <PartnerOrdersSection canDispense={canDispense} onError={onError} />
    </div>
  );
}

// ── Orders sent BY a connected hospital ───
// They arrive here (not created by this tenant's own doctors), are dispensed
// from THIS pharmacy's own stock, and the fulfilled quantity goes back to
// the sender. Rendered inline inside QueueTab, right alongside this
// hospital's own patients — not a separate tab (CLAUDE.md/owner feedback:
// a pharmacist should work one queue, not switch tabs to see who ordered
// what).
function PartnerOrdersSection({ canDispense, onError }) {
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

  return (
    <div className="space-y-3 border-t border-dashed border-slate-200 pt-4">
      <PartnerSend service="PHARMACY" />
      {orders === null ? (
        <p className="text-sm text-slate-400">Loading partner orders…</p>
      ) : orders.length === 0 ? null : (
        orders.map((o) => (
          <div key={o.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">
                {o.patientName || "Patient not named"} <span className="text-xs font-normal text-slate-400">#{o.id}</span>
              </p>
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
                🔗 From: {o.from}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
              <div>
                <p className="font-medium">
                  {o.medicineName} {o.dosage && <span className="text-slate-500">· {o.dosage}</span>}
                </p>
                <p className="text-xs text-slate-500">
                  Required {o.quantity} · In my stock <span className={o.inStock >= (o.quantity || 0) ? "text-emerald-700" : "text-amber-700"}>{o.inStock}</span>
                  {/* The order's own `status` field only flips to COMPLETED once the
                      sending hospital's webhook confirms receipt — a separate step
                      from the dispense itself, which can succeed (real stock
                      deducted, see `result`) even when that follow-up report is
                      still pending/failed. Showing "done" off `result` instead of
                      `status` means this card reflects what actually happened here,
                      not a cross-tenant reporting detail. */}
                  {o.result?.dispensed != null && ` · Dispensed (${o.result.dispensed})`}
                  {o.result?.quantityFulfilled != null && ` · Dispensed (${o.result.quantityFulfilled})`}
                  {o.result?.amount != null && ` · ₹${o.result.amount}`}
                </p>
              </div>
              {o.result == null && canDispense && o.connectionStatus === "ACTIVE" ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <input type="number" min="0" placeholder="₹ amount" value={amounts[o.id] || ""} onChange={(e) => setAmounts({ ...amounts, [o.id]: e.target.value })} className="w-24 rounded-md border border-slate-300 px-1.5 py-1 text-xs" />
                  <button onClick={() => dispense(o)} disabled={busyId === o.id || o.inStock <= 0} className="shrink-0 rounded-lg bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">
                    {busyId === o.id ? "Dispensing…" : "Dispense"}
                  </button>
                </div>
              ) : o.result != null ? (
                <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">done</span>
              ) : o.connectionStatus !== "ACTIVE" ? (
                <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">connection not active</span>
              ) : null}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
