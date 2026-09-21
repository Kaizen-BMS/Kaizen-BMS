"use client";


import { wall } from "@/lib/wallClock";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "./api";

// A compact single-doctor Week/Day slot picker — reuses the exact same
// calendar data source (GET /api/appointments/calendar) and booking
// endpoint (POST /api/appointments, backed by the shared bookAppointment()
// double-booking-prevention logic) as the full staff Appointments screen.
// Not a second booking mechanism: same API, same time-grid-table rendering
// language, just scoped to one doctor and one already-known patient — the
// shape a "Schedule Follow-up" action from a consultation screen needs,
// reusable anywhere else a single-doctor picker is needed later.

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfWeek(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function minutesOfDay(d) {
  return d.getHours() * 60 + d.getMinutes();
}
function minutesToHHMM12(m) {
  const h24 = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm} ${h24 < 12 ? "AM" : "PM"}`;
}
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const ERRORS = {
  slot_taken: "That slot was just taken — please pick another.",
  slot_not_available: "That slot is no longer available.",
  doctor_not_found: "Doctor not found.",
};

export default function DoctorSlotPicker({ doctorUserId, patientId, onBooked, onClose }) {
  const [anchor, setAnchor] = useState(() => new Date());
  const [slots, setSlots] = useState([]);
  const [msg, setMsg] = useState("");
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const range = useMemo(() => {
    const s = startOfWeek(anchor);
    return { from: s, to: addDays(s, 6) };
  }, [anchor]);

  useEffect(() => {
    apiGet(`/api/appointments/calendar?doctorId=${doctorUserId}&from=${toDateStr(range.from)}&to=${toDateStr(range.to)}`)
      .then((d) => setSlots(d.slots || []))
      .catch((e) => setMsg(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorUserId, range.from.getTime(), range.to.getTime()]);

  async function confirmBooking() {
    if (!confirmTarget) return;
    setBusy(true);
    setMsg("");
    try {
      await apiSend("/api/appointments", "POST", {
        doctorUserId,
        patientId,
        slotTime: confirmTarget.slotTime,
        reason,
      });
      onBooked();
    } catch (err) {
      setMsg(ERRORS[err.message] || "Could not book that follow-up.");
    } finally {
      setBusy(false);
    }
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(range.from, i));
  const rowTimes = [...new Set(slots.map((s) => minutesOfDay(wall(s.slotTime))))].sort((a, b) => a - b);
  const byKey = new Map(slots.map((s) => [`${toDateStr(wall(s.slotTime))}|${minutesOfDay(wall(s.slotTime))}`, s]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--hms-btn-bg)]/30 p-4" onMouseDown={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">Schedule follow-up</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">×</button>
        </div>

        {msg && <p className="mb-2 text-sm text-red-600">{msg}</p>}

        <div className="mb-3 flex items-center gap-2">
          <button onClick={() => setAnchor((d) => addDays(d, -7))} className="rounded-md border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-50">‹</button>
          <button onClick={() => setAnchor(new Date())} className="rounded-md border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-50">Today</button>
          <button onClick={() => setAnchor((d) => addDays(d, 7))} className="rounded-md border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-50">›</button>
          <span className="text-xs text-slate-400">
            {range.from.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – {range.to.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        </div>

        {rowTimes.length === 0 ? (
          <p className="text-sm text-slate-400">No availability set up for this range.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="w-16 border-b border-slate-200 p-2 text-left text-slate-400">Time</th>
                  {days.map((d) => (
                    <th key={toDateStr(d)} className="border-b border-l border-slate-200 p-2 text-center font-medium">
                      {WEEKDAY_NAMES[d.getDay()]} {d.getDate()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowTimes.map((t) => (
                  <tr key={t}>
                    <td className="border-b border-slate-100 p-1.5 text-slate-400">{minutesToHHMM12(t)}</td>
                    {days.map((d) => {
                      const cell = byKey.get(`${toDateStr(d)}|${t}`);
                      if (!cell) return <td key={toDateStr(d)} className="border-b border-l border-slate-100 bg-slate-50/60 p-1" />;
                      return (
                        <td key={toDateStr(d)} className="border-b border-l border-slate-100 p-1">
                          {!cell.appointment ? (
                            <button
                              onClick={() => setConfirmTarget({ slotTime: cell.slotTime })}
                              className="w-full rounded border border-dashed border-slate-300 py-1 text-slate-400 hover:border-[var(--hms-accent)] hover:text-slate-700"
                            >
                              + pick
                            </button>
                          ) : (
                            <div className="w-full rounded border border-slate-200 bg-slate-100 py-1 text-center text-slate-400">
                              Booked
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {confirmTarget && (
          <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
            <p className="text-sm font-medium">{wall(confirmTarget.slotTime).toLocaleString()}</p>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="reason (optional)"
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <div className="flex gap-2">
              <button onClick={() => setConfirmTarget(null)} className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm">
                Cancel
              </button>
              <button
                onClick={confirmBooking}
                disabled={busy}
                className="flex-1 rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
              >
                {busy ? "Booking…" : "Confirm follow-up"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
