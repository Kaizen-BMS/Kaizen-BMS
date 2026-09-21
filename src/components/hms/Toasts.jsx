"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRealtime } from "./useRealtime";

// Live pop-up notifications (bottom-right). They appear the moment something
// happens that concerns THIS person's screens — a new prescription for the
// pharmacy, a new appointment for the front desk, a partner request … — and
// disappear by themselves. (The bell keeps the longer list.)
const has = (keys, ...want) => want.some((k) => keys.has(k));

const RULES = {
  "prescription:created": { show: (k) => has(k, "pharmacy"), text: () => "New prescription for the pharmacy", href: "/dashboard/pharmacy" },
  "laborder:created": { show: (k) => has(k, "lab"), text: () => "New lab order", href: "/dashboard/lab" },
  "lab:result": { show: (k) => has(k, "opd") && !has(k, "lab"), text: () => "A lab result is ready", href: "/dashboard/opd" },
  "visit:created": { show: (k) => has(k, "opd") && !has(k, "registration"), text: (p) => `New patient in the queue${p?.visit?.patient_name ? `: ${p.visit.patient_name}` : ""}`, href: "/dashboard/opd" },
  "appointment:booked": { show: (k) => has(k, "todayAppointments", "appointments"), text: () => "New appointment booked", href: "/dashboard/appointments/today" },
  "radiologyorder:created": { show: (k) => has(k, "radiology"), text: () => "New radiology order", href: "/dashboard/radiology" },
  "partner:request": { show: (k) => has(k, "partnerOrganizations"), text: () => "A new partner connection request is waiting", href: "/dashboard/admin/partners" },
  "partner:inbound": { show: (k) => has(k, "pharmacy", "lab", "registration", "partnerOrganizations"), text: () => "A partner sent you a new order or referral", href: "/dashboard/admin/partners" },
};

export default function Toasts({ navKeys }) {
  const router = useRouter();
  const keys = useRef(new Set(navKeys));
  useEffect(() => {
    keys.current = new Set(navKeys);
  }, [navKeys]);
  const [items, setItems] = useState([]);
  const seq = useRef(0);
  const last = useRef({});

  const push = useCallback((event, payload) => {
    const rule = RULES[event];
    if (!rule || !rule.show(keys.current)) return;
    const text = rule.text(payload);
    // same message twice within 2s (several events for one action) = one toast
    const now = Date.now();
    if (last.current[text] && now - last.current[text] < 2000) return;
    last.current[text] = now;
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-3), { id, text, href: rule.href }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 7000);
  }, []);

  // Handlers only read refs when an event fires, never during render.
  // eslint-disable-next-line react-hooks/refs
  useRealtime(Object.fromEntries(Object.keys(RULES).map((e) => [e, (p) => push(e, p)])));

  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="pointer-events-auto flex items-start gap-2 rounded-lg border bg-white p-3 shadow-lg" style={{ borderColor: "var(--hms-border)" }} role="status">
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--hms-accent)]" />
          <button className="hms-plain flex-1 text-left text-sm" onClick={() => { setItems((xs) => xs.filter((x) => x.id !== t.id)); router.push(t.href); }}>
            {t.text}
            <span className="block text-xs text-[var(--hms-ink-faint)]">Click to open</span>
          </button>
          <button aria-label="Close" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))} className="text-lg leading-none text-[var(--hms-ink-faint)]">×</button>
        </div>
      ))}
    </div>
  );
}
