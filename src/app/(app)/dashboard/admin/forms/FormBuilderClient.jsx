"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";

const FORM_TYPES = ["PATIENT_REGISTRATION", "CONSULTATION", "LAB_ORDER", "BILLING"];
const FIELD_TYPES = ["text", "textarea", "number", "date", "select", "checkbox", "phone"];

const blank = (order) => ({
  fieldName: "",
  label: "",
  type: "text",
  required: false,
  order,
  options: [],
});

export default function FormBuilderClient() {
  const [forms, setForms] = useState(null);
  const [tab, setTab] = useState(FORM_TYPES[0]);
  const [draft, setDraft] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet("/api/admin/form-templates")
      .then((d) => setForms(d.forms))
      .catch((e) => setMsg(e.message));
  }, []);

  useEffect(() => {
    // Sync the editable draft when the loaded templates or active tab change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (forms) setDraft(forms[tab].extra.map((f) => ({ ...f, options: f.options || [] })));
  }, [forms, tab]);

  if (!forms) return <p className="text-sm text-slate-400">{msg || "Loading…"}</p>;

  const core = forms[tab].core;

  function edit(i, patch) {
    setDraft((d) => d.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  }

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      const fields = draft.map((f, i) => ({
        fieldName: f.fieldName.trim(),
        label: f.label.trim(),
        type: f.type,
        required: !!f.required,
        order: i,
        ...(f.type === "select" ? { options: f.options.filter(Boolean) } : {}),
      }));
      const { form } = await apiSend("/api/admin/form-templates", "PUT", {
        formType: tab,
        fields,
      });
      setForms((fs) => ({ ...fs, [tab]: form }));
      setMsg("Saved. Staff forms update immediately — no deploy, no migration.");
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-xl font-semibold">Form builder</h1>

      <div className="flex gap-1 text-sm">
        {FORM_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 ${
              t === tab ? "bg-[var(--hms-btn-bg)] text-white" : "bg-slate-100"
            }`}
          >
            {t.replace(/_/g, " ").toLowerCase()}
          </button>
        ))}
      </div>

      {msg && (
        <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
          {msg}
        </p>
      )}

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Core fields (fixed)
        </p>
        <ul className="mt-1 space-y-1 text-sm text-slate-500">
          {core.map((f) => (
            <li key={f.fieldName}>
              {f.label} — {f.type}
              {f.required ? " · required" : ""}
            </li>
          ))}
          {core.length === 0 && <li>none</li>}
        </ul>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Your added fields
        </p>
        {draft.map((f, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_1fr_8rem_5rem_2rem] items-center gap-2 rounded-md border border-slate-200 bg-white p-2 text-sm"
          >
            <input
              placeholder="field_name"
              value={f.fieldName}
              onChange={(e) => edit(i, { fieldName: e.target.value })}
              className="rounded border border-slate-300 px-2 py-1"
            />
            <input
              placeholder="Label"
              value={f.label}
              onChange={(e) => edit(i, { label: e.target.value })}
              className="rounded border border-slate-300 px-2 py-1"
            />
            <select
              value={f.type}
              onChange={(e) => edit(i, { type: e.target.value })}
              className="rounded border border-slate-300 px-2 py-1"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={f.required}
                onChange={(e) => edit(i, { required: e.target.checked })}
              />
              req
            </label>
            <button
              onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}
              className="text-slate-400 hover:text-red-600"
            >
              ×
            </button>
            {f.type === "select" && (
              <input
                placeholder="comma,separated,options"
                value={f.options.join(",")}
                onChange={(e) =>
                  edit(i, { options: e.target.value.split(",").map((s) => s.trim()) })
                }
                className="col-span-5 rounded border border-slate-300 px-2 py-1"
              />
            )}
          </div>
        ))}
        <button
          onClick={() => setDraft((d) => [...d, blank(d.length)])}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          + add field
        </button>
      </div>

      <button
        onClick={save}
        disabled={busy}
        className="rounded-md bg-[var(--hms-btn-bg)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Save {tab.replace(/_/g, " ").toLowerCase()} form
      </button>
    </div>
  );
}
