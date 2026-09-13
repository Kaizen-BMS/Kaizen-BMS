"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./icons";

/**
 * Cmd/Ctrl+K quick-jump. Sources: the live nav items the viewer can reach
 * (passed in) — no hardcoded list. Pure keyboard-first, no external lib.
 */
export default function CommandPalette({ navItems, onClose, onNavigate }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const inputRef = useRef(null);

  const options = useMemo(() => {
    const all = navItems.map((n) => ({
      label: n.label,
      section: n.section,
      href: n.route,
      icon: n.icon,
    }));
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter((o) => o.label.toLowerCase().includes(s));
  }, [navItems, q]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setI(0);
  }, [q]);

  function onKey(e) {
    if (e.key === "Escape") return onClose();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setI((v) => Math.min(v + 1, options.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setI((v) => Math.max(v - 1, 0));
    }
    if (e.key === "Enter" && options[i]) onNavigate(options[i].href);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--hms-btn-bg)]/30 p-4 pt-[12vh]"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border bg-white shadow-2xl"
        style={{ borderColor: "var(--hms-border)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-2 border-b px-3"
          style={{ borderColor: "var(--hms-border)" }}
        >
          <Icon name="command" size={16} className="text-[var(--hms-ink-faint)]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Jump to…"
            className="w-full py-3 text-sm outline-none"
          />
        </div>
        <ul className="max-h-80 overflow-y-auto p-1.5">
          {options.length === 0 && (
            <li className="px-3 py-3 text-sm text-[var(--hms-ink-faint)]">
              Nothing matches.
            </li>
          )}
          {options.map((o, idx) => (
            <li key={o.href}>
              <button
                onMouseEnter={() => setI(idx)}
                onClick={() => onNavigate(o.href)}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm ${
                  idx === i ? "bg-[var(--hms-accent-soft)] text-[var(--hms-accent)]" : ""
                }`}
              >
                <Icon name={o.icon} size={16} />
                <span className="flex-1">{o.label}</span>
                <span className="text-xs text-[var(--hms-ink-faint)]">
                  {o.section.toLowerCase()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
