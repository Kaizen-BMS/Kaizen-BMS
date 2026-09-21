"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";
import { wall } from "@/lib/wallClock";
import AllergyBadge from "@/components/hms/AllergyBadge";

const STATUS = {
  BOOKED: ["Booked", "bg-blue-100 text-blue-700"],
  CONFIRMED: ["Confirmed", "bg-emerald-100 text-emerald-700"],
  COMPLETED: ["Completed", "bg-slate-200 text-slate-700"],
  NO_SHOW: ["No-show", "bg-red-100 text-red-700"],
};
const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const time = (iso) => wall(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// The front desk's working list for the day: who is coming, when, to which
// doctor — with the patient's full details, check-in and fee collection.
export default function TodayClient({ canUpdate, canCheckIn, canCollectFee }) {
  const [date, setDate] = useState(() => localDate());
  const [items, setItems] = useState(null);
  const [doctor, setDoctor] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");
  const [fee, setFee] = useState({});
  const [busy, setBusy] = useState(null);
  const loadRef = useRef(null);

  const load = useCallback(() => {
    apiGet(`/api/appointments/today?date=${date}`).then((d) => setItems(d.appointments)).catch((e) => setError(e.message));
  }, [date]);
  useEffect(() => {
    loadRef.current = load;
    load();
  }, [load]);
  useRealtime({ "appointment:booked": () => loadRef.current(), "appointment:cancelled": () => loadRef.current(), "appointment:updated": () => loadRef.current(), "visit:created": () => loadRef.current(), "bill:updated": () => loadRef.current() }, () => loadRef.current());

  const doctors = useMemo(() => [...new Set((items || []).map((a) => a.doctor).filter(Boolean))], [items]);
  const shown = (items || []).filter((a) => (!doctor || a.doctor === doctor) && (!status || a.status === status) && (!search || `${a.patient.name} ${a.patient.phone}`.toLowerCase().includes(search.toLowerCase())));
  const stat = (s) => (items || []).filter((a) => a.status === s).length;

  async function run(id, fn) {
    setBusy(id);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message === "fee_already_collected" ? "The fee for this visit is already collected." : `Could not do that (${e.message}).`);
    } finally {
      setBusy(null);
    }
  }
  const setApptStatus = (a, s) => run(a.id, () => apiSend(`/api/appointments/${a.id}`, "PATCH", { status: s }));
  const checkIn = (a) => run(a.id, () => apiSend("/api/registration/visits", "POST", { patientId: a.patient.id, reason: a.reason || "Appointment" }));
  async function collect(a) {
    const f = fee[a.id] || {};
    await run(a.id, async () => {
      let visitId = a.visit?.id;
      if (!visitId) visitId = (await apiSend("/api/registration/visits", "POST", { patientId: a.patient.id, reason: a.reason || "Appointment" })).visit?.id;
      await apiSend("/api/billing/consult-fee", "POST", { visitId, amount: Number(f.amount), mode: f.mode || "CASH" });
    });
  }

  const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm";
  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Today&apos;s appointments</h1>
          <p className="text-sm text-slate-500">{wall(`${date}T00:00:00.000Z`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-center">
          {[["Total", (items || []).length], ["Confirmed", stat("CONFIRMED")], ["Completed", stat("COMPLETED")], ["No-show", stat("NO_SHOW")]].map(([l, n]) => (
            <div key={l} className="min-w-[5.5rem] rounded-lg border border-slate-200 bg-white px-3 py-1.5"><p className="text-lg font-semibold leading-tight">{n}</p><p className="text-[11px] text-slate-500">{l}</p></div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <label className="text-xs"><span className="block text-slate-500">Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} /></label>
        <button onClick={() => setDate(localDate())} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Today</button>
        <label className="text-xs"><span className="block text-slate-500">Doctor</span>
          <select value={doctor} onChange={(e) => setDoctor(e.target.value)} className={input}><option value="">All doctors</option>{doctors.map((d) => <option key={d}>{d}</option>)}</select>
        </label>
        <label className="text-xs"><span className="block text-slate-500">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={input}><option value="">Any</option>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label className="text-xs"><span className="block text-slate-500">Search patient</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or phone" className={input} /></label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!items ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">No appointments for this day.</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((a) => {
            const p = a.patient;
            const [sl, sc] = STATUS[a.status] || [a.status, "bg-slate-100 text-slate-600"];
            const due = a.fee ? Math.max(0, (a.fee.total || 0) - a.fee.paid) : null;
            return (
              <li key={a.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="w-20 shrink-0 text-base font-semibold">{time(a.slotTime)}</p>
                  <div className="min-w-[12rem] flex-1">
                    <p className="font-medium">{p.name} <span className="text-sm font-normal text-slate-500">· {p.age}y{p.gender ? ` · ${p.gender.toLowerCase()}` : ""} · {p.phone}</span></p>
                    <p className="text-xs text-slate-500">Dr. {a.doctor}{a.reason ? ` · ${a.reason}` : ""}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sc}`}>{sl}</span>
                  {a.visit ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Arrived · token {a.visit.token ?? "—"}</span> : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">Not arrived</span>}
                  {a.fee ? (
                    <span className={`rounded-full px-2 py-0.5 text-xs ${due === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{due === 0 ? `Fee paid ₹${a.fee.paid}` : `Due ₹${due}`}</span>
                  ) : canCollectFee ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Fee not collected</span> : null}
                  <button onClick={() => setOpen(open === a.id ? null : a.id)} className="rounded-md border border-slate-300 px-3 py-1 text-xs">{open === a.id ? "Hide details" : "Patient details"}</button>
                </div>

                {open === a.id && (
                  <div className="mt-3 grid gap-3 rounded-md bg-slate-50 p-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <div><p className="text-xs text-slate-500">Name</p><p>{p.name}</p></div>
                    <div><p className="text-xs text-slate-500">Age / gender</p><p>{p.age} years · {p.gender ? p.gender.toLowerCase() : "not recorded"}</p></div>
                    <div><p className="text-xs text-slate-500">Phone</p><p>{p.phone}</p></div>
                    <div><p className="text-xs text-slate-500">Email</p><p>{p.email || "—"}</p></div>
                    <div><p className="text-xs text-slate-500">ABHA ID</p><p>{p.abhaId || "—"}</p></div>
                    <div><p className="text-xs text-slate-500">Payment</p><p>{p.paymentCategory.replace(/_/g, " ").toLowerCase()}{p.hasInsurance ? " · insured" : ""}</p></div>
                    <div><p className="text-xs text-slate-500">Visits so far</p><p>{p.visitsSoFar}</p></div>
                    <div><p className="text-xs text-slate-500">Allergies</p>{p.allergies.length ? <AllergyBadge allergies={JSON.stringify(p.allergies)} /> : <p>None recorded</p>}</div>
                    <div><p className="text-xs text-slate-500">Reason for visit</p><p>{a.reason || "—"}</p></div>
                    <div><p className="text-xs text-slate-500">Booked by</p><p>{a.bookedBy}</p></div>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {canCheckIn && !a.visit && a.status !== "COMPLETED" && a.status !== "NO_SHOW" && (
                    <button onClick={() => checkIn(a)} disabled={busy === a.id} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Check in (get token)</button>
                  )}
                  {canUpdate && a.status === "BOOKED" && <button onClick={() => setApptStatus(a, "CONFIRMED")} disabled={busy === a.id} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs">Confirm</button>}
                  {canUpdate && ["BOOKED", "CONFIRMED"].includes(a.status) && (
                    <>
                      <button onClick={() => setApptStatus(a, "COMPLETED")} disabled={busy === a.id} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs">Mark completed</button>
                      <button onClick={() => setApptStatus(a, "NO_SHOW")} disabled={busy === a.id} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs">No-show</button>
                    </>
                  )}
                  {canCollectFee && !a.fee && (
                    <span className="ml-auto flex flex-wrap items-center gap-1.5">
                      <input type="number" min="1" placeholder="Consultation fee ₹" value={fee[a.id]?.amount || ""} onChange={(e) => setFee({ ...fee, [a.id]: { ...fee[a.id], amount: e.target.value } })} className={`${input} w-40`} />
                      <select value={fee[a.id]?.mode || "CASH"} onChange={(e) => setFee({ ...fee, [a.id]: { ...fee[a.id], mode: e.target.value } })} className={input}><option>CASH</option><option>UPI</option><option>CARD</option></select>
                      <button onClick={() => collect(a)} disabled={busy === a.id || !(Number(fee[a.id]?.amount) > 0)} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Collect fee</button>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
