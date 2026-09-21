"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";

const TYPES = [
  ["CONSULTATION", "Consultation"],
  ["PROCEDURE", "Procedure"],
  ["LAB", "Lab test"],
  ["RADIOLOGY", "Scan / X-Ray"],
  ["ROOM", "Room / Bed (per day)"],
  ["PHARMACY", "Medicine / Product"],
  ["OTHER", "Other"],
];
const TYPE_LABEL = Object.fromEntries(TYPES);
const GST = [0, 5, 12, 18, 28];
const money = (n) => `₹${Number(n).toLocaleString("en-IN")}`;
const slug = (s) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "ITEM";

// "What do we charge?" — one plain list. Add an item with a price and GST; change a
// price any time (bills already made keep the price they had).
export default function SimplePriceList() {
  const [services, setServices] = useState([]);
  const [tariffs, setTariffs] = useState({});
  const [f, setF] = useState({ name: "", type: "CONSULTATION", price: "", gst: 0, inclusive: false });
  const [edit, setEdit] = useState(null); // { id, price }
  const [msg, setMsg] = useState({ error: "", ok: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [s, t] = await Promise.all([apiGet("/api/services?pageSize=100"), apiGet("/api/tariffs?patientCategory=SELF_PAY")]);
    setServices(s.services);
    setTariffs(Object.fromEntries(t.tariffs.map((x) => [String(x.serviceId), x])));
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e) => setMsg({ error: e.message, ok: "" }));
  }, [load]);

  const tariffBody = (serviceId, price, gst, inclusive) => ({
    serviceId,
    patientCategory: "SELF_PAY",
    price: Number(price),
    taxInclusive: !!inclusive,
    cgstRate: gst / 2,
    sgstRate: gst / 2,
    igstRate: 0,
  });

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    setMsg({ error: "", ok: "" });
    try {
      let created = null;
      for (let i = 0; i < 4 && !created; i++) {
        try {
          created = (await apiSend("/api/services", "POST", { code: `${slug(f.name)}-${Math.floor(100 + Math.random() * 900)}`, name: f.name, serviceType: f.type })).service;
        } catch (err) {
          if (err.message !== "code_already_in_use") throw err;
        }
      }
      if (!created) throw new Error("try_again");
      await apiSend("/api/tariffs", "POST", tariffBody(created.id, f.price, Number(f.gst), f.inclusive));
      setF({ name: "", type: f.type, price: "", gst: f.gst, inclusive: f.inclusive });
      setMsg({ error: "", ok: `${created.name} added to the price list.` });
      await load();
    } catch (err) {
      setMsg({ error: `Could not add (${err.message}).`, ok: "" });
    } finally {
      setBusy(false);
    }
  }

  async function savePrice(s) {
    const cur = tariffs[String(s.id)];
    const gst = cur ? Number(cur.cgstRate) + Number(cur.sgstRate) + Number(cur.igstRate) : 0;
    try {
      await apiSend("/api/tariffs", "POST", tariffBody(s.id, edit.price, gst, cur?.taxInclusive));
      setEdit(null);
      setMsg({ error: "", ok: "Price updated. Old bills keep their old price.", });
      await load();
    } catch (err) {
      setMsg({ error: `Could not change (${err.message}).`, ok: "" });
    }
  }

  async function toggle(s) {
    try {
      await apiSend(`/api/services/${s.id}`, "PATCH", { active: !s.active });
      await load();
    } catch (err) {
      setMsg({ error: `Could not update (${err.message}).`, ok: "" });
    }
  }

  const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm";
  return (
    <div className="space-y-4">
      <form onSubmit={add} className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold">Add something you charge for</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs"><span className="block text-slate-500">Name</span><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Consultation, ECG, CBC" className={`${input} w-56`} /></label>
          <label className="text-xs"><span className="block text-slate-500">Type</span>
            <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className={input}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          <label className="text-xs"><span className="block text-slate-500">Price ₹</span><input required type="number" min="0" step="any" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} className={`${input} w-28`} /></label>
          <label className="text-xs"><span className="block text-slate-500">GST</span>
            <select value={f.gst} onChange={(e) => setF({ ...f, gst: e.target.value })} className={input}>{GST.map((g) => <option key={g} value={g}>{g === 0 ? "No GST" : `${g}%`}</option>)}</select>
          </label>
          {Number(f.gst) > 0 && <label className="flex items-center gap-1.5 pb-2 text-xs"><input type="checkbox" checked={f.inclusive} onChange={(e) => setF({ ...f, inclusive: e.target.checked })} /> Price already includes GST</label>}
          <button disabled={busy} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Add to price list</button>
        </div>
        {msg.error && <p className="text-sm text-red-600">{msg.error}</p>}
        {msg.ok && <p className="text-sm text-emerald-700">{msg.ok}</p>}
      </form>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Price</th><th className="px-3 py-2">GST</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody>
            {services.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">Nothing here yet. Add your first item above.</td></tr>}
            {services.map((s) => {
              const t = tariffs[String(s.id)];
              const gst = t ? Number(t.cgstRate) + Number(t.sgstRate) + Number(t.igstRate) : 0;
              return (
                <tr key={s.id} className={`border-b border-slate-100 last:border-0 ${s.active ? "" : "text-slate-400"}`}>
                  <td className="px-3 py-2 font-medium">{s.name}{!s.active && <span className="ml-2 text-xs">(hidden)</span>}</td>
                  <td className="px-3 py-2">{TYPE_LABEL[s.serviceType] || s.serviceType}</td>
                  <td className="px-3 py-2">
                    {edit?.id === s.id ? (
                      <span className="flex items-center gap-1"><input type="number" min="0" step="any" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} className={`${input} w-24`} /><button onClick={() => savePrice(s)} className="rounded-md bg-[var(--hms-btn-bg)] px-2 py-1 text-xs text-[var(--hms-btn-fg)]">Save</button><button onClick={() => setEdit(null)} className="text-xs">Cancel</button></span>
                    ) : t ? money(t.price) : <span className="text-amber-700">No price yet</span>}
                  </td>
                  <td className="px-3 py-2">{t ? (gst ? `${gst}%${t.taxInclusive ? " incl." : ""}` : "—") : "—"}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {edit?.id !== s.id && <button onClick={() => setEdit({ id: s.id, price: t?.price || "" })} className="mr-2 text-xs">Change price</button>}
                    <button onClick={() => toggle(s)} className="text-xs">{s.active ? "Hide" : "Show"}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
