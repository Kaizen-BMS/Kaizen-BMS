"use client";


import { wall } from "@/lib/wallClock";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

async function apiGet(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
async function apiPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    throw err;
  }
  return data;
}

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
  not_your_profile: "That profile doesn't belong to this account.",
  module_not_active: "Booking isn't available at this hospital.",
  doctor_not_found: "That doctor couldn't be found.",
};

export default function BookClient({ tenantSlug, profiles }) {
  const [doctors, setDoctors] = useState([]);
  const [doctorId, setDoctorId] = useState(null);
  const [view, setView] = useState("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [slots, setSlots] = useState([]);
  const [msg, setMsg] = useState("");
  const [confirmTarget, setConfirmTarget] = useState(null); // { slotTime }
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");

  useEffect(() => {
    apiGet("/api/patient/doctors")
      .then((d) => {
        setDoctors(d.doctors);
        setDoctorId((prev) => prev ?? d.doctors[0]?.id ?? null);
      })
      .catch((e) => setMsg(e.message));
  }, []);

  const range = useMemo(() => {
    if (view === "day") return { from: anchor, to: anchor };
    const s = startOfWeek(anchor);
    return { from: s, to: addDays(s, 6) };
  }, [view, anchor]);

  useEffect(() => {
    if (!doctorId) return;
    apiGet(`/api/patient/calendar?doctorId=${doctorId}&from=${toDateStr(range.from)}&to=${toDateStr(range.to)}`)
      .then((d) => setSlots(d.slots || []))
      .catch((e) => setMsg(e.message));
  }, [doctorId, range.from.getTime(), range.to.getTime()]);

  function goPrev() {
    setAnchor((d) => addDays(d, view === "day" ? -1 : -7));
  }
  function goNext() {
    setAnchor((d) => addDays(d, view === "day" ? 1 : 7));
  }
  function goToday() {
    setAnchor(new Date());
  }

  async function confirmBooking() {
    if (!confirmTarget || !profileId) return;
    setBusy(true);
    setMsg("");
    try {
      await apiPost("/api/patient/appointments/book", {
        patientId: profileId,
        doctorUserId: doctorId,
        slotTime: confirmTarget.slotTime,
        reason,
      });
      setSuccess("Appointment booked.");
      setConfirmTarget(null);
      setReason("");
      // Refresh the grid so the just-booked slot shows unavailable.
      const data = await apiGet(
        `/api/patient/calendar?doctorId=${doctorId}&from=${toDateStr(range.from)}&to=${toDateStr(range.to)}`,
      );
      setSlots(data.slots || []);
    } catch (err) {
      setMsg(ERRORS[err.message] || "Could not book that appointment.");
    } finally {
      setBusy(false);
    }
  }

  const days = view === "day" ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(range.from, i));
  const rowTimes = [...new Set(slots.map((s) => minutesOfDay(wall(s.slotTime))))].sort((a, b) => a - b);
  const byKey = new Map(slots.map((s) => [`${toDateStr(wall(s.slotTime))}|${minutesOfDay(wall(s.slotTime))}`, s]));

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Book an appointment</h1>
          <Link href={`/patient/${tenantSlug}/dashboard`} className="text-xs text-slate-500 underline">
            ← Back to my records
          </Link>
        </div>
      </div>

      {msg && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>}
      {success && <p className="mb-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{success}</p>}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={doctorId ?? ""}
          onChange={(e) => setDoctorId(Number(e.target.value))}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              Dr. {d.name}
            </option>
          ))}
        </select>
        <div className="flex overflow-hidden rounded-md border border-slate-300 text-sm">
          <button onClick={goPrev} className="px-2.5 py-1.5 hover:bg-slate-100">‹</button>
          <button onClick={goToday} className="border-x border-slate-300 px-2.5 py-1.5 hover:bg-slate-100">Today</button>
          <button onClick={goNext} className="px-2.5 py-1.5 hover:bg-slate-100">›</button>
        </div>
        <div className="flex overflow-hidden rounded-md border border-slate-300 text-sm">
          {["week", "day"].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 capitalize ${view === v ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {rowTimes.length === 0 ? (
        <p className="text-sm text-slate-400">No availability in this range.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
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
                        {cell.available ? (
                          <button
                            onClick={() => setConfirmTarget({ slotTime: cell.slotTime })}
                            className="w-full rounded border border-dashed border-slate-300 py-1 text-slate-400 hover:border-slate-900 hover:text-slate-700"
                          >
                            + book
                          </button>
                        ) : (
                          <div className="w-full rounded border border-slate-200 bg-slate-100 py-1 text-center text-slate-400">
                            Unavailable
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4" onMouseDown={() => setConfirmTarget(null)}>
          <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-4 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <p className="mb-3 text-sm font-semibold">{wall(confirmTarget.slotTime).toLocaleString()}</p>
            {profiles.length > 1 && (
              <label className="mb-2 block space-y-1">
                <span className="text-xs text-slate-500">For</span>
                <select
                  value={profileId ?? ""}
                  onChange={(e) => setProfileId(Number(e.target.value))}
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.age ? `· ${p.age}y` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="reason (optional)"
              className="mb-3 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmTarget(null)}
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmBooking}
                disabled={busy}
                className="flex-1 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? "Booking…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
