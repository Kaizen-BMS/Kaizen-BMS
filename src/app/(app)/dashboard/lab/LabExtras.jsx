"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";

const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm";
const newKey = (id) => `${id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const rupee = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

// Take the money for a lab bill right here: whole amount or part, cash / card / UPI.
export function PayBox({ orderId, bill, onPaid }) {
  const [mode, setMode] = useState("CASH");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!bill) return null;
  if (bill.due <= 0) return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Paid {rupee(bill.total)}</span>;

  async function pay() {
    setBusy(true);
    setErr("");
    try {
      const r = await apiSend(`/api/lab/orders/${orderId}/pay`, "POST", { mode, ...(amount ? { amount: Number(amount) } : {}), idempotencyKey: newKey(orderId) });
      setAmount("");
      onPaid?.(r.bill);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="font-medium text-amber-700">Due {rupee(bill.due)}</span>
      <select value={mode} onChange={(e) => setMode(e.target.value)} className="rounded border border-slate-300 px-1.5 py-1">
        <option value="CASH">Cash</option><option value="CARD">Card</option><option value="UPI">UPI</option>
      </select>
      <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`₹ ${bill.due}`} className="w-20 rounded border border-slate-300 px-1.5 py-1" />
      <button onClick={pay} disabled={busy} className="rounded-md bg-[var(--hms-btn-bg)] px-2.5 py-1 font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Take payment</button>
      <a href={`/print/receipt/${bill.id}`} target="_blank" rel="noreferrer" className="underline text-slate-500">bill</a>
      {err && <span className="text-red-600">{err}</span>}
    </div>
  );
}

// A person walks in, or an outside doctor sent them: pick tests, bill, done.
export function WalkInTab({ onDone }) {
  const [tests, setTests] = useState(null);
  const [f, setF] = useState({ customerName: "", phone: "", age: "", gender: "", referredBy: "" });
  const [picked, setPicked] = useState([]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(null);
  const [payBill, setPayBill] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet("/api/lab/tests").then((d) => setTests(d.tests.filter((t) => t.active && t.price != null))).catch((e) => setMsg(e.message));
  }, []);

  const shown = useMemo(() => (tests || []).filter((t) => !q || t.name.toLowerCase().includes(q.toLowerCase())), [tests, q]);
  const chosen = (tests || []).filter((t) => picked.includes(t.serviceId));
  const total = chosen.reduce((s, t) => s + t.price * (1 + t.gst / 100), 0);
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function submit(e) {
    e.preventDefault();
    if (!picked.length) return setMsg("Pick at least one test.");
    setBusy(true);
    setMsg("");
    try {
      const r = await apiSend("/api/lab/walk-in", "POST", {
        customerName: f.customerName,
        phone: f.phone,
        referredBy: f.referredBy,
        ...(f.age ? { age: Number(f.age) } : {}),
        ...(f.gender ? { gender: f.gender } : {}),
        serviceIds: picked,
      });
      setDone(r);
    } catch (err) {
      setMsg(err.message === "no_active_tariff" ? "One of the tests has no price yet — set it in Tests & prices." : `Could not create (${err.message}).`);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
        <p className="font-semibold text-emerald-800">Order created and billed — {rupee(done.total)}</p>
        <PayBox orderId={done.orderId} bill={payBill || { id: done.billId, total: done.total, due: done.total }} onPaid={setPayBill} />
        <div className="flex flex-wrap gap-2">
          <a href={`/print/receipt/${done.billId}`} target="_blank" rel="noreferrer" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs">Print bill</a>
          <button onClick={onDone} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs text-[var(--hms-btn-fg)]">Go to lab queue</button>
        </div>
      </div>
    );
  }
  if (!tests) return <p className="text-sm text-slate-400">{msg || "Loading…"}</p>;
  if (tests.length === 0) return <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">Add your tests and prices first (Tests &amp; prices tab).</p>;

  return (
    <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold">Who is it for?</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input required placeholder="Patient / customer name" value={f.customerName} onChange={(e) => setF({ ...f, customerName: e.target.value })} className={input} />
          <input placeholder="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={input} />
          <input type="number" min="0" placeholder="Age" value={f.age} onChange={(e) => setF({ ...f, age: e.target.value })} className={input} />
          <select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })} className={input}>
            <option value="">Gender</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>
          <input placeholder="Sent by doctor (optional)" value={f.referredBy} onChange={(e) => setF({ ...f, referredBy: e.target.value })} className={`${input} sm:col-span-2`} />
        </div>
        <p className="pt-2 text-sm font-semibold">Tests</p>
        <input placeholder="Search tests" value={q} onChange={(e) => setQ(e.target.value)} className={`${input} w-full`} />
        <div className="grid max-h-72 gap-1 overflow-auto sm:grid-cols-2">
          {shown.map((t) => (
            <label key={t.id} className={`flex cursor-pointer items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm ${picked.includes(t.serviceId) ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}>
              <span className="flex items-center gap-2"><input type="checkbox" checked={picked.includes(t.serviceId)} onChange={() => toggle(t.serviceId)} />{t.name}</span>
              <span className="text-xs text-slate-500">{rupee(t.price)}</span>
            </label>
          ))}
        </div>
      </div>
      <aside className="h-fit space-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <p className="font-semibold">Bill</p>
        {picked.length === 0 && <p className="text-xs text-slate-400">No tests picked.</p>}
        {chosen.map((t) => <p key={t.id} className="flex justify-between text-xs"><span>{t.name}</span><span>{rupee(t.price)}</span></p>)}
        <p className="flex justify-between border-t border-slate-200 pt-2 font-semibold"><span>Total (with GST)</span><span>{rupee(Math.round(total * 100) / 100)}</span></p>
        <button disabled={busy || !picked.length} className="w-full rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Create order &amp; bill</button>
        {msg && <p className="text-xs text-red-600">{msg}</p>}
      </aside>
    </form>
  );
}

// The lab's own test list with prices: what it offers.
export function TestsTab({ canManage }) {
  const [tests, setTests] = useState(null);
  const [msg, setMsg] = useState("");
  const blank = { name: "", price: "", gst: "0", sampleType: "", units: "", referenceRange: "", turnaroundHours: "" };
  const [f, setF] = useState(blank);
  const [edit, setEdit] = useState(null);

  const load = () => apiGet("/api/lab/tests").then((d) => setTests(d.tests));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e) => setMsg(e.message));
  }, []);

  const body = (x) => ({
    name: x.name,
    price: Number(x.price),
    gst: Number(x.gst || 0),
    sampleType: x.sampleType || "",
    units: x.units || "",
    referenceRange: x.referenceRange || "",
    ...(x.turnaroundHours !== "" && x.turnaroundHours != null ? { turnaroundHours: Number(x.turnaroundHours) } : {}),
  });

  async function add(e) {
    e.preventDefault();
    setMsg("");
    try {
      await apiSend("/api/lab/tests", "POST", body(f));
      setF(blank);
      await load();
    } catch (err) {
      setMsg(`Could not add (${err.message}).`);
    }
  }
  async function save() {
    setMsg("");
    try {
      await apiSend(`/api/lab/tests/${edit.id}`, "PATCH", body(edit));
      setEdit(null);
      await load();
    } catch (err) {
      setMsg(`Could not save (${err.message}).`);
    }
  }
  async function toggle(t) {
    try {
      await apiSend(`/api/lab/tests/${t.id}`, "PATCH", { active: !t.active });
      await load();
    } catch (err) {
      setMsg(err.message);
    }
  }

  if (!tests) return <p className="text-sm text-slate-400">{msg || "Loading…"}</p>;
  return (
    <div className="space-y-4">
      {canManage && (
        <form onSubmit={add} className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold">Add a test you offer</p>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
            <input required placeholder="Test name (e.g. CBC)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={`${input} sm:col-span-2`} />
            <input required type="number" min="0" placeholder="Price ₹" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} className={input} />
            <select value={f.gst} onChange={(e) => setF({ ...f, gst: e.target.value })} className={input}>{[0, 5, 12, 18].map((g) => <option key={g} value={g}>GST {g}%</option>)}</select>
            <input placeholder="Sample (blood, urine…)" value={f.sampleType} onChange={(e) => setF({ ...f, sampleType: e.target.value })} className={input} />
            <input placeholder="Units (g/dL…)" value={f.units} onChange={(e) => setF({ ...f, units: e.target.value })} className={input} />
            <input placeholder="Normal range" value={f.referenceRange} onChange={(e) => setF({ ...f, referenceRange: e.target.value })} className={input} />
            <input type="number" min="0" placeholder="Report in (hours)" value={f.turnaroundHours} onChange={(e) => setF({ ...f, turnaroundHours: e.target.value })} className={input} />
          </div>
          <button className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)]">Add test</button>
          <p className="text-xs text-slate-500">Units and normal range fill in automatically when you enter results.</p>
        </form>
      )}
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Test</th><th className="px-3 py-2">Price</th><th className="px-3 py-2">Sample</th><th className="px-3 py-2">Range</th><th className="px-3 py-2">Report in</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody>
            {tests.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-slate-400">No tests yet.</td></tr>}
            {tests.map((t) => edit?.id === t.id ? (
              <tr key={t.id} className="border-b border-slate-100 bg-slate-50">
                <td className="px-3 py-2"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={`${input} w-full`} /></td>
                <td className="px-3 py-2"><input type="number" value={edit.price ?? ""} onChange={(e) => setEdit({ ...edit, price: e.target.value })} className={`${input} w-24`} /></td>
                <td className="px-3 py-2"><input value={edit.sampleType || ""} onChange={(e) => setEdit({ ...edit, sampleType: e.target.value })} className={`${input} w-24`} /></td>
                <td className="px-3 py-2"><input value={edit.referenceRange || ""} onChange={(e) => setEdit({ ...edit, referenceRange: e.target.value })} className={`${input} w-28`} /></td>
                <td className="px-3 py-2"><input type="number" value={edit.turnaroundHours ?? ""} onChange={(e) => setEdit({ ...edit, turnaroundHours: e.target.value })} className={`${input} w-20`} /></td>
                <td className="px-3 py-2 text-right"><button onClick={save} className="mr-2 text-xs font-medium">Save</button><button onClick={() => setEdit(null)} className="text-xs text-slate-400">Cancel</button></td>
              </tr>
            ) : (
              <tr key={t.id} className={`border-b border-slate-100 last:border-0 ${t.active ? "" : "opacity-50"}`}>
                <td className="px-3 py-2 font-medium">{t.name}{t.gst ? <span className="ml-1 text-xs text-slate-400">GST {t.gst}%</span> : null}</td>
                <td className="px-3 py-2">{t.price != null ? rupee(t.price) : "—"}</td>
                <td className="px-3 py-2">{t.sampleType || "—"}</td>
                <td className="px-3 py-2">{t.referenceRange ? `${t.referenceRange} ${t.units || ""}` : "—"}</td>
                <td className="px-3 py-2">{t.turnaroundHours ? `${t.turnaroundHours} h` : "—"}</td>
                <td className="px-3 py-2 text-right">
                  {canManage && (
                    <>
                      <button onClick={() => setEdit({ ...t, gst: String(t.gst) })} className="mr-2 text-xs underline">Edit</button>
                      <button onClick={() => toggle(t)} className="text-xs text-slate-500">{t.active ? "Switch off" : "Switch on"}</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Finished reports and where each one goes.
export function ReportsTab() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const load = () => apiGet("/api/lab/reports").then((d) => setRows(d.reports));
  const reload = () => load().catch(() => {});
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e) => setErr(e.message));
  }, []);
  useRealtime({ "laborder:updated": load, "lab:result": load }, load);

  if (!rows) return <p className="text-sm text-slate-400">{err || "Loading…"}</p>;
  const toDoctor = rows.filter((r) => r.doctor).length;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {[["Reports ready", rows.length], ["Sent to doctors", toDoctor], ["To print & hand over", rows.length - toDoctor]].map(([l, v]) => (
          <div key={l} className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">{l}</p><p className="text-2xl font-semibold tabular-nums">{v}</p></div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Patient</th><th className="px-3 py-2">Tests</th><th className="px-3 py-2">Ready</th><th className="px-3 py-2">Goes to</th><th className="px-3 py-2">Bill</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-slate-400">No finished reports yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 font-medium">{r.patient}<p className="text-xs font-normal text-slate-400">{r.phone}</p></td>
                <td className="px-3 py-2 text-xs">{r.tests.join(", ")}</td>
                <td className="px-3 py-2 text-xs">{new Date(r.resultedAt).toLocaleString()}</td>
                <td className="px-3 py-2 text-xs">{r.delivery}{r.referredBy ? ` (sent by ${r.referredBy})` : ""}</td>
                <td className="px-3 py-2 text-xs">{r.bill ? <PayBox orderId={r.id} bill={r.bill} onPaid={reload} /> : "at hospital billing"}</td>
                <td className="px-3 py-2 text-right"><a href={`/print/lab-report/${r.id}`} target="_blank" rel="noreferrer" className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">Print</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
