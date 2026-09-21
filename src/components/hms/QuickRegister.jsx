"use client";

import { useEffect, useRef, useState } from "react";
import { apiSend } from "./api";

const EMPTY = { name: "", age: "", gender: "", phone: "", reason: "", fee: "", mode: "CASH" };

// Register a patient and open the visit in one quick step — from any page
// (button in the top bar, or Alt + R). The consultation fee can be collected
// at the same moment by the front desk.
export default function QuickRegister({ canCollectFee, onClose }) {
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const nameRef = useRef(null);
  useEffect(() => nameRef.current?.focus(), []);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await apiSend("/api/registration/patients", "POST", {
        name: f.name,
        age: Number(f.age),
        ...(f.gender ? { gender: f.gender } : {}),
        phone: f.phone,
        reason: f.reason,
        openVisit: true,
      });
      let feeNote = "";
      if (canCollectFee && Number(f.fee) > 0 && r.visit?.id) {
        try {
          await apiSend("/api/billing/consult-fee", "POST", { visitId: r.visit.id, amount: Number(f.fee), mode: f.mode });
          feeNote = `Fee ₹${f.fee} collected.`;
        } catch {
          feeNote = "Registered, but the fee could not be recorded — collect it from Today's appointments or Billing.";
        }
      }
      setDone({ name: r.patient.name, token: r.visit?.token_number, feeNote });
    } catch (err) {
      setError(err.message === "invalid_input" ? "Please check the details." : `Could not register (${err.message}).`);
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose} role="dialog" aria-label="Quick registration">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Quick registration</h2>
          <button onClick={onClose} aria-label="Close" className="text-xl leading-none text-slate-400">×</button>
        </div>
        {done ? (
          <div className="space-y-3 text-sm">
            <p className="rounded-md bg-emerald-50 p-3 text-emerald-800">
              <span className="font-semibold">{done.name}</span> is registered.{done.token != null && <> Token number <span className="text-lg font-bold">{done.token}</span>.</>} {done.feeNote}
            </p>
            <div className="flex gap-2">
              <button onClick={() => { setDone(null); setF(EMPTY); }} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm font-medium text-[var(--hms-btn-fg)]">Register another</button>
              <button onClick={onClose} className="rounded-md border border-slate-300 px-3 py-2 text-sm">Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input ref={nameRef} required placeholder="Patient name" value={f.name} onChange={set("name")} className={input} />
            <div className="grid grid-cols-3 gap-2">
              <input required type="number" min="0" max="150" placeholder="Age" value={f.age} onChange={set("age")} className={input} />
              <select value={f.gender} onChange={set("gender")} className={input}><option value="">Gender</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option></select>
              <input required placeholder="Phone" value={f.phone} onChange={set("phone")} className={input} />
            </div>
            <input placeholder="Reason for visit" value={f.reason} onChange={set("reason")} className={input} />
            {canCollectFee && (
              <div className="grid grid-cols-2 gap-2">
                <input type="number" min="0" placeholder="Consultation fee ₹ (optional)" value={f.fee} onChange={set("fee")} className={input} />
                <select value={f.mode} onChange={set("mode")} className={input}><option>CASH</option><option>UPI</option><option>CARD</option></select>
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button disabled={busy} className="w-full rounded-md bg-[var(--hms-btn-bg)] px-4 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">{busy ? "Registering…" : "Register & open visit"}</button>
            <p className="text-center text-xs text-slate-400">Shortcut: Alt + R · Esc to close</p>
          </form>
        )}
      </div>
    </div>
  );
}
