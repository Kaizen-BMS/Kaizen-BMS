"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "./icons";
import { apiGet } from "./api";
import { useRealtime } from "./useRealtime";

// Alerts & Notifications Center (the phase after Workflow Automation) —
// a computed, on-demand summary of business conditions that already exist
// elsewhere in the product (Pharmacy low-stock/expiry, Phase 9 workflow
// FAILED/WAITING, pending leave requests) but had nowhere central to
// surface. Deliberately a SEPARATE concept from the live "Activity" feed
// below (which only shows ephemeral "something just happened" events,
// resets on reload, no persistence) — Alerts are always re-fetched fresh
// from GET /api/alerts, so they're correct even right after a page load,
// and refreshed again (debounced) whenever a realtime event fires that
// could plausibly change one of these counts.
function countAlerts(categories) {
  if (!categories) return 0;
  const p = categories.pharmacy;
  const w = categories.workflows;
  const l = categories.leaveRequests;
  const r = categories.radiology;
  return (p?.lowStockCount || 0) + (w?.failedCount || 0) + (w?.waitingCount || 0) + (l?.pendingCount || 0) + (r?.pendingCount || 0);
}

// Maps a socket event to a notification line. Returns null to ignore.
function describe(event, payload) {
  switch (event) {
    case "prescription:created":
      return { icon: "pharmacy", text: "New prescription for pharmacy", href: "/dashboard/pharmacy" };
    case "laborder:created":
      return { icon: "lab", text: "New lab order", href: "/dashboard/lab" };
    case "lab:result":
      return { icon: "lab", text: "Lab result ready", href: "/dashboard/lab" };
    case "visit:created":
      return {
        icon: "registration",
        text: `Patient registered: ${payload?.visit?.patient_name || ""}`.trim(),
        href: "/dashboard/registration",
      };
    case "consultation:created":
      return { icon: "opd", text: "Consultation recorded", href: "/dashboard/opd" };
    default:
      return null;
  }
}

let seq = 0;

export default function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("alerts");
  const [alerts, setAlerts] = useState(null);
  const ref = useRef(null);

  const unread = items.filter((n) => !n.read).length;
  const alertsCount = countAlerts(alerts?.categories);
  const badgeCount = alertsCount > 0 ? alertsCount : unread;

  function push(event, payload) {
    const d = describe(event, payload);
    if (!d) return;
    setItems((xs) =>
      [{ id: ++seq, ts: Date.now(), read: false, ...d }, ...xs].slice(0, 30),
    );
  }

  const loadAlerts = () => apiGet("/api/alerts").then(setAlerts).catch(() => {});
  const debounceRef = useRef(null);
  const loadAlertsDebounced = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(loadAlerts, 400);
  };

  useEffect(() => {
    loadAlerts();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // A realtime event that could plausibly move one of these counts
  // (a batch was dispensed/stocked, a workflow step advanced, a leave
  // request was filed/decided) triggers one debounced re-fetch — never
  // per-field patching of computed aggregates, same "refetch on signal"
  // discipline the Dashboard widgets already use, so a burst of several
  // workflow-step events in quick succession only costs one request.
  useRealtime({
    "prescription:created": (p) => push("prescription:created", p),
    "laborder:created": (p) => push("laborder:created", p),
    "lab:result": (p) => push("lab:result", p),
    "visit:created": (p) => push("visit:created", p),
    "consultation:created": (p) => push("consultation:created", p),
    "stock:updated": loadAlertsDebounced,
    "workflow:updated": loadAlertsDebounced,
    "leaverequest:created": loadAlertsDebounced,
    "leaverequest:updated": loadAlertsDebounced,
    "radiologyorder:created": loadAlertsDebounced,
    "radiologyorder:updated": loadAlertsDebounced,
  });

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function openList() {
    setOpen((o) => {
      const next = !o;
      if (next) setItems((xs) => xs.map((n) => ({ ...n, read: true })));
      return next;
    });
  }

  function go(href) {
    setOpen(false);
    router.push(href);
  }

  const categories = alerts?.categories || {};
  const hasAnyAlerts = alertsCount > 0 || categories.pharmacy?.expiringSoonCount > 0 || categories.pharmacy?.expiredCount > 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={openList}
        className="relative rounded-md p-1.5 text-[var(--hms-ink-soft)] hover:bg-slate-100"
        aria-label="Notifications"
      >
        <Icon name="bell" size={18} />
        {badgeCount > 0 && (
          <span className="absolute right-0.5 top-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-[var(--hms-danger)] px-0.5 text-[10px] font-semibold text-[var(--hms-btn-fg)]">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 w-80 overflow-hidden rounded-md border bg-white shadow-lg"
          style={{ borderColor: "var(--hms-border)" }}
        >
          <div className="flex border-b text-xs font-semibold uppercase tracking-wide" style={{ borderColor: "var(--hms-border)" }}>
            <button
              onClick={() => setTab("alerts")}
              className={`flex-1 px-3 py-2 text-left ${tab === "alerts" ? "text-[var(--hms-ink)]" : "text-[var(--hms-ink-faint)]"}`}
            >
              Alerts{alertsCount > 0 ? ` (${alertsCount})` : ""}
            </button>
            <button
              onClick={() => setTab("activity")}
              className={`flex-1 px-3 py-2 text-left ${tab === "activity" ? "text-[var(--hms-ink)]" : "text-[var(--hms-ink-faint)]"}`}
            >
              Activity
            </button>
          </div>

          {tab === "alerts" ? (
            <div className="max-h-96 overflow-y-auto">
              {!hasAnyAlerts ? (
                <p className="px-3 py-6 text-center text-sm text-[var(--hms-ink-faint)]">
                  All clear — nothing needs attention.
                </p>
              ) : (
                <div className="divide-y" style={{ borderColor: "var(--hms-border)" }}>
                  {categories.pharmacy && (categories.pharmacy.lowStockCount > 0 || categories.pharmacy.expiringSoonCount > 0 || categories.pharmacy.expiredCount > 0) && (
                    <button onClick={() => go("/dashboard/pharmacy")} className="block w-full px-3 py-2.5 text-left hover:bg-slate-50">
                      <p className="flex items-center gap-2 text-sm">
                        <Icon name="pharmacy" size={15} className="text-[var(--hms-ink-faint)]" />
                        Pharmacy — {categories.pharmacy.instanceName}
                      </p>
                      <ul className="mt-1 space-y-0.5 pl-6 text-xs text-[var(--hms-ink-faint)]">
                        {categories.pharmacy.lowStockCount > 0 && <li>{categories.pharmacy.lowStockCount} medicine(s) low on stock</li>}
                        {categories.pharmacy.expiringSoonCount > 0 && <li>{categories.pharmacy.expiringSoonCount} medicine(s) with batches expiring soon</li>}
                        {categories.pharmacy.expiredCount > 0 && <li>{categories.pharmacy.expiredCount} medicine(s) with expired batches</li>}
                      </ul>
                    </button>
                  )}

                  {categories.workflows && (categories.workflows.failedCount > 0 || categories.workflows.waitingCount > 0) && (
                    <button onClick={() => go("/dashboard/admin/workflows")} className="block w-full px-3 py-2.5 text-left hover:bg-slate-50">
                      <p className="flex items-center gap-2 text-sm">
                        <Icon name="registry" size={15} className="text-[var(--hms-ink-faint)]" />
                        Workflows
                      </p>
                      <ul className="mt-1 space-y-0.5 pl-6 text-xs text-[var(--hms-ink-faint)]">
                        {categories.workflows.failedCount > 0 && <li>{categories.workflows.failedCount} workflow(s) failed</li>}
                        {categories.workflows.waitingCount > 0 && <li>{categories.workflows.waitingCount} workflow(s) waiting</li>}
                      </ul>
                    </button>
                  )}

                  {categories.radiology && categories.radiology.pendingCount > 0 && (
                    <button onClick={() => go("/dashboard/radiology")} className="block w-full px-3 py-2.5 text-left hover:bg-slate-50">
                      <p className="flex items-center gap-2 text-sm">
                        <Icon name="radiology" size={15} className="text-[var(--hms-ink-faint)]" />
                        Radiology
                      </p>
                      <ul className="mt-1 space-y-0.5 pl-6 text-xs text-[var(--hms-ink-faint)]">
                        <li>{categories.radiology.pendingCount} order(s) not yet started</li>
                      </ul>
                    </button>
                  )}

                  {categories.leaveRequests && categories.leaveRequests.pendingCount > 0 && (
                    <button onClick={() => go("/dashboard/staff")} className="block w-full px-3 py-2.5 text-left hover:bg-slate-50">
                      <p className="flex items-center gap-2 text-sm">
                        <Icon name="staff" size={15} className="text-[var(--hms-ink-faint)]" />
                        Staff
                      </p>
                      <ul className="mt-1 space-y-0.5 pl-6 text-xs text-[var(--hms-ink-faint)]">
                        <li>{categories.leaveRequests.pendingCount} leave request(s) awaiting a decision</li>
                      </ul>
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-[var(--hms-ink-faint)]">
              Nothing yet — live events will appear here.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => go(n.href)}
                    className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50"
                  >
                    <Icon
                      name={n.icon}
                      size={16}
                      className="mt-0.5 text-[var(--hms-ink-faint)]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{n.text}</p>
                      <p className="text-xs text-[var(--hms-ink-faint)]">
                        {timeAgo(n.ts)}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
