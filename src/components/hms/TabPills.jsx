"use client";

// One tab-bar look for the whole product — a grey tray with a white "lifted" pill for whichever tab
// is active (the same treatment Staff Management and Pharmacy's sub-tabs already established).
// `tabs` is [[key, label, badge?], ...] or [{ key, label, badge? }, ...]; `badge` renders a small
// count/pill next to the label when given (e.g. a queue length).
export default function TabPills({ tabs, value, onChange, className = "" }) {
  const items = tabs.map((t) => (Array.isArray(t) ? { key: t[0], label: t[1], badge: t[2] } : t));
  return (
    <div className={`flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 ${className}`}>
      {items.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition ${value === t.key ? "bg-white shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
        >
          {t.label}
          {t.badge != null && t.badge !== "" && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${value === t.key ? "bg-slate-100 text-slate-600" : "bg-white text-slate-500"}`}>{t.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}
