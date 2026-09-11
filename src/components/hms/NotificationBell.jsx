"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "./icons";
import { useRealtime } from "./useRealtime";

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
  const ref = useRef(null);

  const unread = items.filter((n) => !n.read).length;

  function push(event, payload) {
    const d = describe(event, payload);
    if (!d) return;
    setItems((xs) =>
      [{ id: ++seq, ts: Date.now(), read: false, ...d }, ...xs].slice(0, 30),
    );
  }

  useRealtime({
    "prescription:created": (p) => push("prescription:created", p),
    "laborder:created": (p) => push("laborder:created", p),
    "lab:result": (p) => push("lab:result", p),
    "visit:created": (p) => push("visit:created", p),
    "consultation:created": (p) => push("consultation:created", p),
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

  return (
    <div ref={ref} className="relative">
      <button
        onClick={openList}
        className="relative rounded-md p-1.5 text-[var(--hms-ink-soft)] hover:bg-slate-100"
        aria-label="Notifications"
      >
        <Icon name="bell" size={18} />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-[var(--hms-danger)] px-0.5 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 w-80 overflow-hidden rounded-md border bg-white shadow-lg"
          style={{ borderColor: "var(--hms-border)" }}
        >
          <div
            className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--hms-ink-faint)]"
            style={{ borderColor: "var(--hms-border)" }}
          >
            Notifications
          </div>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-[var(--hms-ink-faint)]">
              Nothing yet — live events will appear here.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      setOpen(false);
                      router.push(n.href);
                    }}
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
