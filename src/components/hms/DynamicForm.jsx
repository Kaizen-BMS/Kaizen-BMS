"use client";

const INPUT =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900";

/**
 * Renders a flat list of field descriptors (core + owner-added) as form
 * controls. `values` is a plain object keyed by fieldName; `onChange(name,
 * value)` is called on every edit. The parent decides which keys are core
 * (own columns) vs custom (custom_fields JSON) at submit time.
 */
export default function DynamicForm({ fields, values, onChange, idPrefix = "f" }) {
  return (
    <div className="space-y-3">
      {fields.map((f) => {
        const id = `${idPrefix}-${f.fieldName}`;
        const val = values[f.fieldName] ?? "";
        const set = (v) => onChange(f.fieldName, v);

        let control;
        if (f.type === "textarea") {
          control = (
            <textarea
              id={id}
              rows={2}
              required={f.required}
              value={val}
              onChange={(e) => set(e.target.value)}
              className={INPUT}
            />
          );
        } else if (f.type === "checkbox") {
          control = (
            <input
              id={id}
              type="checkbox"
              checked={!!values[f.fieldName]}
              onChange={(e) => set(e.target.checked)}
              className="h-4 w-4"
            />
          );
        } else if (f.type === "select") {
          control = (
            <select
              id={id}
              required={f.required}
              value={val}
              onChange={(e) => set(e.target.value)}
              className={INPUT}
            >
              <option value="">—</option>
              {(f.options || []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          );
        } else {
          const type =
            f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "phone" ? "tel" : "text";
          control = (
            <input
              id={id}
              type={type}
              required={f.required}
              value={val}
              onChange={(e) => set(e.target.value)}
              className={INPUT}
            />
          );
        }

        return (
          <label key={f.fieldName} htmlFor={id} className="block space-y-1 text-sm">
            <span className="font-medium">
              {f.label}
              {f.required ? " *" : ""}
              {f.core ? (
                <span className="ml-2 text-xs font-normal text-slate-400">core</span>
              ) : null}
            </span>
            {control}
          </label>
        );
      })}
    </div>
  );
}

/** Split a values object into { core, custom } given the resolved form. */
export function splitValues(form, values) {
  const coreNames = new Set(form.core.map((f) => f.fieldName));
  const core = {};
  const custom = {};
  for (const [k, v] of Object.entries(values)) {
    (coreNames.has(k) ? core : custom)[k] = v;
  }
  return { core, custom };
}
