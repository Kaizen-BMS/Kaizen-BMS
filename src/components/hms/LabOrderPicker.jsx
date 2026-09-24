"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "./api";
import { LAB_TEST_GROUPS } from "@/lib/labTestCatalog";

const inp = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none";

// Doctor's lab ordering: pick WHICH laboratory (ours or a connected partner),
// then search that laboratory's own tests and test sets. Same-named tests at
// two labs are never mixed up — every row says whose it is.
export default function LabOrderPicker({ consultationId, onOrdered, onError }) {
  const [providers, setProviders] = useState(null);
  const [providerId, setProviderId] = useState("");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState([]); // [{ kind: 'test'|'panel', name, serviceId?, tests? }]
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    apiGet("/api/lab/order-catalog")
      .then((d) => {
        setProviders(d.providers);
        if (d.providers.length) setProviderId(d.providers[0].id);
      })
      .catch(() => setProviders([]));
  }, []);

  const provider = providers?.find((p) => p.id === providerId) || null;
  const rows = useMemo(() => {
    if (!provider) return [];
    const term = q.trim().toLowerCase();
    const panels = provider.panels.map((p) => ({ kind: "panel", key: `p${p.id}`, name: p.name, sampleType: p.sampleType, tests: p.tests, price: null }));
    const tests = provider.tests.map((t) => ({ kind: "test", key: `t${t.name}`, name: t.name, serviceId: t.serviceId, sampleType: t.sampleType, turnaroundHours: t.turnaroundHours, price: t.price }));
    return [...panels, ...tests].filter((r) => !term || r.name.toLowerCase().includes(term) || (r.kind === "panel" && r.tests.some((t) => t.name.toLowerCase().includes(term)))).slice(0, 30);
  }, [provider, q]);

  const has = (r) => picked.some((x) => x.kind === r.kind && x.name === r.name);
  const toggle = (r) => setPicked((xs) => (has(r) ? xs.filter((x) => !(x.kind === r.kind && x.name === r.name)) : [...xs, r]));
  const switchProvider = (id) => { setProviderId(id); setPicked([]); setQ(""); setNote(""); };

  async function send() {
    const extra = custom.trim();
    if (picked.length === 0 && !extra) return;
    setBusy(true);
    onError?.("");
    setNote("");
    try {
      if (!provider || provider.own) {
        // One order at our own lab; test sets expand to their component tests, never duplicated.
        const names = new Set();
        const tests = [];
        const add = (name, serviceId) => {
          const k = name.toLowerCase();
          if (names.has(k)) return;
          names.add(k);
          tests.push(serviceId ? { name, serviceId } : name);
        };
        for (const p of picked) {
          if (p.kind === "panel") p.tests.forEach((t) => add(t.name, t.serviceId));
          else add(p.name, p.serviceId);
        }
        if (extra) add(extra);
        const { labOrder } = await apiSend(`/api/opd/consultations/${consultationId}/lab-orders`, "POST", { tests });
        onOrdered(labOrder);
        setNote(`Sent ${tests.length} test${tests.length === 1 ? "" : "s"} to ${provider?.name || "the lab"}.`);
      } else {
        // A partner lab takes one test / test set per order.
        const items = [...picked.map((p) => p.name), ...(extra ? [extra] : [])];
        for (const name of items) {
          const { labOrder } = await apiSend(`/api/opd/consultations/${consultationId}/lab-orders`, "POST", { tests: [name] });
          await apiSend(`/api/lab/orders/${labOrder.id}/send-external`, "POST", { providerId: Number(provider.id) });
          onOrdered(labOrder);
        }
        setNote(`Sent ${items.length} order${items.length === 1 ? "" : "s"} to ${provider.name}.`);
      }
      setPicked([]);
      setCustom("");
    } catch (err) {
      onError?.(err.message === "data_not_approved" ? "The partner lab has not approved all the information this order needs." : `Could not send (${err.message}).`);
    } finally {
      setBusy(false);
    }
  }

  if (!providers) return <p className="mt-3 text-xs text-slate-400">Loading laboratories…</p>;

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs">
        <span className="font-medium text-slate-500">Sending to:</span>
        {provider ? (
          <span className="rounded-full bg-white px-2.5 py-0.5 font-semibold shadow-sm">{provider.name}{provider.own ? " (our lab)" : " (partner lab)"}</span>
        ) : (
          <span className="text-amber-700">No laboratory is connected — the order is recorded for the lab desk.</span>
        )}
      </div>
      {providers.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-[14rem_1fr]">
          <label className="text-xs font-medium text-slate-600">Send to laboratory
            <select value={providerId} onChange={(e) => switchProvider(e.target.value)} className={`${inp} mt-1`} aria-label="Laboratory">
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}{p.own ? "" : " (partner)"}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">Search tests &amp; test sets
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="CBC, liver, thyroid…" className={`${inp} mt-1`} />
          </label>
        </div>
      ) : (
        <p className="text-xs text-slate-500">No laboratory catalog set up yet — type the test name below.</p>
      )}

      {provider && (
        <div className="max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white">
          {rows.length === 0 && <p className="px-3 py-3 text-xs text-slate-400">No tests match at {provider.name}.</p>}
          {rows.map((r) => (
            <button key={r.key} type="button" onClick={() => toggle(r)} className={`flex w-full items-start justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50 ${has(r) ? "bg-emerald-50" : ""}`}>
              <span>
                <span className="block font-medium">{r.name}{r.kind === "panel" && <span className="ml-1.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">Test Set</span>}</span>
                <span className="block text-xs text-slate-500">{provider.name}{r.sampleType ? ` · ${r.sampleType}` : ""}{r.turnaroundHours ? ` · ${r.turnaroundHours}h` : ""}</span>
                {r.kind === "panel" && <span className="block text-[11px] text-slate-400">{r.tests.map((t) => t.name).join(", ")}</span>}
              </span>
              <span className="shrink-0 text-right text-xs">
                {r.price != null && <span className="block font-medium">₹{r.price}</span>}
                <span className={has(r) ? "text-emerald-700" : "text-slate-400"}>{has(r) ? "✓ Selected" : "Available"}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {(!provider || provider.own) ? (
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Other test not in the list (type name)" className={inp} />
        ) : (
          <p className="self-center text-[11px] text-slate-400">Partner labs take tests from their own list above, or from the common tests here.</p>
        )}
        <select
          aria-label="Add a common test"
          value=""
          onChange={(e) => { const v = e.target.value; if (v) setPicked((xs) => (xs.some((x) => x.name === v) ? xs : [...xs, { kind: "test", name: v }])); }}
          className={inp}
        >
          <option value="">Common tests (basics)…</option>
          {Object.entries(LAB_TEST_GROUPS).map(([g, list]) => (
            <optgroup key={g} label={g}>{list.map((t) => <option key={t} value={t}>{t}</option>)}</optgroup>
          ))}
        </select>
      </div>

      {picked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {picked.map((p) => (
            <span key={`${p.kind}-${p.name}`} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs">
              {p.name}{p.kind === "panel" ? ` (${p.tests.length} tests)` : ""}
              <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setPicked((xs) => xs.filter((x) => x !== p))} className="text-slate-400 hover:text-red-600">×</button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={send} disabled={busy || (picked.length === 0 && !custom.trim())} className="rounded-lg bg-[var(--hms-btn-bg)] px-4 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">
          {busy ? "Sending…" : provider && !provider.own ? `Send to ${provider.name}` : "Send to lab"}
        </button>
        {note && <span className="text-xs text-emerald-700">{note}</span>}
      </div>
    </div>
  );
}
