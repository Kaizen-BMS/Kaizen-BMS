"use client";


import Link from "next/link";
import { wall } from "@/lib/wallClock";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";

const STATUS_COLOR = {
  BOOKED: "border-blue-300 bg-blue-50 text-blue-800",
  CONFIRMED: "border-green-300 bg-green-50 text-green-800",
  CANCELLED: "border-slate-200 bg-slate-50 text-slate-400 line-through",
  COMPLETED: "border-slate-300 bg-slate-100 text-slate-600",
  NO_SHOW: "border-red-300 bg-red-50 text-red-700",
};
const STATUS_LABEL = {
  BOOKED: "Booked",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
  NO_SHOW: "No-show",
};
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
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

export default function AppointmentsClient({ canBook, canUpdate, canManageSlots, isDoctor, ownUserId }) {
  const [view, setView] = useState("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctorIds, setSelectedDoctorIds] = useState([]);
  const [slots, setSlots] = useState([]);
  const [msg, setMsg] = useState("");
  const [bookingTarget, setBookingTarget] = useState(null); // { doctorUserId, slotTime }
  const [detailsSlot, setDetailsSlot] = useState(null); // merged slot entry with .appointment
  const [showSlotManager, setShowSlotManager] = useState(false);

  useEffect(() => {
    apiGet("/api/appointments/doctors")
      .then((d) => {
        setDoctors(d.doctors);
        setSelectedDoctorIds((prev) => {
          if (prev.length) return prev;
          if (isDoctor) return [ownUserId];
          return d.doctors[0] ? [d.doctors[0].id] : [];
        });
      })
      .catch((e) => setMsg(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const range = useMemo(() => {
    if (view === "day") return { from: anchor, to: anchor };
    if (view === "week") {
      const s = startOfWeek(anchor);
      return { from: s, to: addDays(s, 6) };
    }
    return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
  }, [view, anchor]);

  async function load() {
    if (selectedDoctorIds.length === 0) {
      setSlots([]);
      return;
    }
    const results = await Promise.all(
      selectedDoctorIds.map((id) =>
        apiGet(`/api/appointments/calendar?from=${toDateStr(range.from)}&to=${toDateStr(range.to)}&doctorId=${id}`),
      ),
    );
    setSlots(results.flatMap((r) => r.slots));
  }

  // useRealtime subscribes once on mount, so its handlers would otherwise
  // close over the FIRST render's `load` (and therefore the first render's
  // range/doctor selection) forever. Routing every call through a ref that
  // is refreshed on every render keeps realtime updates using the current
  // filters without re-subscribing the socket.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, anchor.getTime(), selectedDoctorIds.join(",")]);

  useRealtime(
    {
      "appointment:booked": () => loadRef.current(),
      "appointment:cancelled": () => loadRef.current(),
      "appointment:updated": () => loadRef.current(),
    },
    () => loadRef.current(),
  );

  function toggleDoctor(id) {
    setSelectedDoctorIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function goPrev() {
    setAnchor((d) => {
      if (view === "day") return addDays(d, -1);
      if (view === "week") return addDays(d, -7);
      const x = new Date(d);
      x.setMonth(x.getMonth() - 1);
      return x;
    });
  }
  function goNext() {
    setAnchor((d) => {
      if (view === "day") return addDays(d, 1);
      if (view === "week") return addDays(d, 7);
      const x = new Date(d);
      x.setMonth(x.getMonth() + 1);
      return x;
    });
  }
  function goToday() {
    setAnchor(new Date());
  }

  function openBooking(doctorUserId, slotTime) {
    if (!canBook) return;
    setBookingTarget({ doctorUserId, slotTime });
  }

  const rangeLabel =
    view === "month"
      ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : view === "week"
        ? `${range.from.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${range.to.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
        : anchor.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Appointments</h1>
          <p className="text-sm text-slate-500">{rangeLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/dashboard/appointments/today" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">Day list (with patient details) →</Link>
          {canManageSlots && (
            <button
              onClick={() => setShowSlotManager((s) => !s)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              {showSlotManager ? "Close" : "Manage my availability"}
            </button>
          )}
          <div className="flex overflow-hidden rounded-md border border-slate-300">
            <button onClick={goPrev} className="px-2.5 py-1.5 text-sm hover:bg-slate-50">
              ‹
            </button>
            <button onClick={goToday} className="border-x border-slate-300 px-2.5 py-1.5 text-sm hover:bg-slate-50">
              Today
            </button>
            <button onClick={goNext} className="px-2.5 py-1.5 text-sm hover:bg-slate-50">
              ›
            </button>
          </div>
          <div className="flex overflow-hidden rounded-md border border-slate-300 text-sm">
            {["month", "week", "day"].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 capitalize ${view === v ? "bg-[var(--hms-btn-bg)] text-[var(--hms-btn-fg)]" : "hover:bg-slate-50"}`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {doctors.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-400">
            {view === "day" ? "Show doctors side by side:" : "Doctor:"}
          </span>
          {doctors.map((d) => (
            <button
              key={d.id}
              onClick={() =>
                view === "day"
                  ? toggleDoctor(d.id)
                  : setSelectedDoctorIds([d.id])
              }
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                selectedDoctorIds.includes(d.id)
                  ? "border-[var(--hms-accent)] bg-[var(--hms-accent-soft)]"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              {d.name}
            </button>
          ))}
          {view !== "day" && (
            <span className="text-xs text-slate-400">— switch to Day view to compare doctors side by side</span>
          )}
        </div>
      )}

      {msg && <p className="text-sm text-red-600">{msg}</p>}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        {Object.entries(STATUS_LABEL).map(([status, label]) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-full border ${STATUS_COLOR[status]}`} />
            {label}
          </span>
        ))}
      </div>

      {showSlotManager && canManageSlots && (
        <SlotManager onError={setMsg} doctors={doctors} isDoctor={isDoctor} ownUserId={ownUserId} defaultDoctorId={selectedDoctorIds[0]} onChanged={() => loadRef.current()} />
      )}

      {view === "month" && (
        <MonthGrid anchor={anchor} slots={slots} onDayClick={(d) => { setAnchor(d); setView("day"); }} />
      )}
      {view === "week" && (
        <WeekGrid
          weekStart={range.from}
          doctorUserId={selectedDoctorIds[0]}
          slots={slots}
          onEmptyClick={openBooking}
          onApptClick={setDetailsSlot}
        />
      )}
      {view === "day" && (
        <DayGrid
          date={anchor}
          doctors={doctors.filter((d) => selectedDoctorIds.includes(d.id))}
          slots={slots}
          onEmptyClick={openBooking}
          onApptClick={setDetailsSlot}
        />
      )}

      {bookingTarget && (
        <BookingPopover
          target={bookingTarget}
          onClose={() => setBookingTarget(null)}
          onBooked={() => {
            setBookingTarget(null);
            load();
          }}
          onError={setMsg}
        />
      )}
      {detailsSlot && (
        <DetailsPopover
          slot={detailsSlot}
          canUpdate={canUpdate}
          onClose={() => setDetailsSlot(null)}
          onChanged={() => {
            setDetailsSlot(null);
            load();
          }}
          onError={setMsg}
        />
      )}
    </div>
  );
}

function MonthGrid({ anchor, slots, onDayClick }) {
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = addDays(startOfWeek(monthEnd), 6);

  const days = [];
  for (let d = new Date(gridStart); d <= gridEnd; d = addDays(d, 1)) days.push(new Date(d));

  const countsByDay = new Map();
  for (const s of slots) {
    if (!s.appointment || s.appointment.status === "CANCELLED") continue;
    const key = toDateStr(wall(s.slotTime));
    countsByDay.set(key, (countsByDay.get(key) || 0) + 1);
  }
  const todayKey = toDateStr(new Date());

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {WEEKDAY_NAMES.map((d) => (
        <div key={d} className="text-center text-xs font-semibold text-slate-400">
          {d}
        </div>
      ))}
      {days.map((d) => {
        const inMonth = d.getMonth() === anchor.getMonth();
        const key = toDateStr(d);
        const count = countsByDay.get(key) || 0;
        return (
          <button
            key={key}
            onClick={() => onDayClick(d)}
            className={`aspect-square rounded-md border p-1.5 text-left text-xs hover:bg-slate-50 ${
              inMonth ? "bg-white" : "bg-slate-50 text-slate-300"
            } ${key === todayKey ? "border-[var(--hms-accent)]" : "border-slate-200"}`}
          >
            <p className="font-medium">{d.getDate()}</p>
            {count > 0 && (
              <p className="mt-1 rounded bg-[var(--hms-accent-soft)] px-1 py-0.5 text-center text-[10px] text-slate-700">
                {count} appt{count > 1 ? "s" : ""}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}

function TimeGridTable({ rowTimes, columns, cellFor, onEmptyClick, onApptClick }) {
  if (rowTimes.length === 0) {
    return <p className="text-sm text-slate-400">No availability set up for this range yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="w-16 border-b border-slate-200 p-2 text-left text-slate-400">Time</th>
            {columns.map((c) => (
              <th key={c.key} className="border-b border-l border-slate-200 p-2 text-center font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowTimes.map((t) => (
            <tr key={t}>
              <td className="border-b border-slate-100 p-1.5 text-slate-400">{minutesToHHMM12(t)}</td>
              {columns.map((c) => {
                const cell = cellFor(c, t);
                if (!cell) {
                  return <td key={c.key} className="border-b border-l border-slate-100 bg-slate-50/60 p-1" />;
                }
                if (cell.appointment) {
                  return (
                    <td key={c.key} className="border-b border-l border-slate-100 p-1">
                      <button
                        onClick={() => onApptClick(cell)}
                        className={`w-full rounded border px-1.5 py-1 text-left ${STATUS_COLOR[cell.appointment.status]}`}
                      >
                        <p className="truncate font-medium">{cell.appointment.patientName}</p>
                        <p className="truncate text-[10px] opacity-70">{STATUS_LABEL[cell.appointment.status]}</p>
                      </button>
                    </td>
                  );
                }
                return (
                  <td key={c.key} className="border-b border-l border-slate-100 p-1">
                    <button
                      onClick={() => onEmptyClick(cell.doctorUserId, cell.slotTime)}
                      className="w-full rounded border border-dashed border-slate-200 py-1 text-slate-300 hover:border-[var(--hms-accent)] hover:text-slate-500"
                    >
                      + book
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WeekGrid({ weekStart, doctorUserId, slots, onEmptyClick, onApptClick }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const byKey = new Map(
    slots.map((s) => [`${toDateStr(wall(s.slotTime))}|${minutesOfDay(wall(s.slotTime))}`, s]),
  );
  const rowTimes = [...new Set(slots.map((s) => minutesOfDay(wall(s.slotTime))))].sort((a, b) => a - b);
  const columns = days.map((d) => ({
    key: toDateStr(d),
    label: `${WEEKDAY_NAMES[d.getDay()]} ${d.getDate()}`,
    doctorUserId,
  }));

  function cellFor(col, t) {
    return byKey.get(`${col.key}|${t}`) || null;
  }

  if (!doctorUserId) return <p className="text-sm text-slate-400">Select a doctor to view their week.</p>;
  return <TimeGridTable rowTimes={rowTimes} columns={columns} cellFor={cellFor} onEmptyClick={onEmptyClick} onApptClick={onApptClick} />;
}

function DayGrid({ date, doctors, slots, onEmptyClick, onApptClick }) {
  const dateKey = toDateStr(date);
  const relevant = slots.filter((s) => toDateStr(wall(s.slotTime)) === dateKey);
  const byKey = new Map(relevant.map((s) => [`${s.doctorUserId}|${minutesOfDay(wall(s.slotTime))}`, s]));
  const rowTimes = [...new Set(relevant.map((s) => minutesOfDay(wall(s.slotTime))))].sort((a, b) => a - b);
  const columns = doctors.map((d) => ({ key: String(d.id), label: d.name, doctorUserId: d.id }));

  function cellFor(col, t) {
    return byKey.get(`${col.doctorUserId}|${t}`) || null;
  }

  if (doctors.length === 0) return <p className="text-sm text-slate-400">Select at least one doctor above.</p>;
  return <TimeGridTable rowTimes={rowTimes} columns={columns} cellFor={cellFor} onEmptyClick={onEmptyClick} onApptClick={onApptClick} />;
}

function BookingPopover({ target, onClose, onBooked, onError }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [newPatient, setNewPatient] = useState({ name: "", age: "", phone: "" });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function search() {
    if (q.trim().length < 2) return;
    try {
      const { patients } = await apiGet(`/api/registration/patients?q=${encodeURIComponent(q.trim())}`);
      setResults(patients);
    } catch (err) {
      onError(err.message);
    }
  }

  async function book(patientId) {
    setBusy(true);
    try {
      await apiSend("/api/appointments", "POST", {
        doctorUserId: target.doctorUserId,
        slotTime: target.slotTime,
        reason,
        ...(patientId
          ? { patientId }
          : { name: newPatient.name, age: newPatient.age || undefined, phone: newPatient.phone }),
      });
      onBooked();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Book ${wall(target.slotTime).toLocaleString()}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold">Find existing patient</p>
          <div className="mt-1 flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="name or phone"
              className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button onClick={search} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs text-[var(--hms-btn-fg)]">
              Find
            </button>
          </div>
          {results?.map((p) => (
            <div key={p.id} className="mt-2 flex items-center justify-between rounded-md border border-slate-200 px-2 py-1.5 text-sm">
              <span>{p.name} · {p.age}y · {p.phone}</span>
              <button onClick={() => book(p.id)} disabled={busy} className="rounded-md border border-slate-300 px-2 py-1 text-xs">
                Book
              </button>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 pt-3">
          <p className="text-sm font-semibold">Or a new patient</p>
          <div className="mt-1 grid grid-cols-3 gap-2">
            <input
              placeholder="name"
              value={newPatient.name}
              onChange={(e) => setNewPatient((s) => ({ ...s, name: e.target.value }))}
              className="col-span-3 rounded-md border border-slate-300 px-2 py-1.5 text-sm sm:col-span-1"
            />
            <input
              placeholder="age"
              type="number"
              value={newPatient.age}
              onChange={(e) => setNewPatient((s) => ({ ...s, age: e.target.value }))}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <input
              placeholder="phone"
              value={newPatient.phone}
              onChange={(e) => setNewPatient((s) => ({ ...s, phone: e.target.value }))}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>

        <input
          placeholder="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />

        <button
          onClick={() => book(null)}
          disabled={busy || !newPatient.name || !newPatient.phone}
          className="w-full rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
        >
          Book new patient
        </button>
      </div>
    </Modal>
  );
}

function DetailsPopover({ slot, canUpdate, onClose, onChanged, onError }) {
  const [busy, setBusy] = useState(false);
  const appt = slot.appointment;

  async function setStatus(status) {
    setBusy(true);
    try {
      await apiSend(`/api/appointments/${appt.id}`, "PATCH", { status });
      onChanged();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const finalized = ["CANCELLED", "COMPLETED", "NO_SHOW"].includes(appt.status);

  return (
    <Modal title={wall(slot.slotTime).toLocaleString()} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="font-medium">{appt.patientName} · {appt.patientAge}y</p>
        {appt.reason && <p className="text-slate-500">Reason: {appt.reason}</p>}
        <p>
          Status:{" "}
          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[appt.status]}`}>
            {STATUS_LABEL[appt.status]}
          </span>
        </p>

        {canUpdate && !finalized && (
          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
            {appt.status === "BOOKED" && (
              <button onClick={() => setStatus("CONFIRMED")} disabled={busy} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50">
                Confirm
              </button>
            )}
            <button onClick={() => setStatus("COMPLETED")} disabled={busy} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50">
              Mark completed
            </button>
            <button onClick={() => setStatus("NO_SHOW")} disabled={busy} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50">
              No-show
            </button>
            <button onClick={() => setStatus("CANCELLED")} disabled={busy} className="rounded-md border border-red-300 px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-50">
              Cancel
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function SlotManager({ onError, doctors, isDoctor, ownUserId, defaultDoctorId, onChanged }) {
  const [doctorId, setDoctorId] = useState(isDoctor ? ownUserId : defaultDoctorId || doctors[0]?.id || "");
  const [slots, setSlots] = useState([]);
  // The doctor list / selection can arrive after this panel opens.
  useEffect(() => {
    if (!isDoctor && !doctorId) {
      const first = defaultDoctorId || doctors[0]?.id;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (first) setDoctorId(first);
    }
  }, [doctors, defaultDoctorId, doctorId, isDoctor]);
  const [form, setForm] = useState({ dayOfWeek: "1", startTime: "09:00", endTime: "13:00", slotMinutes: "15" });
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!doctorId) return setSlots([]);
    const { slots } = await apiGet(`/api/appointments/slots?doctorId=${doctorId}`);
    setSlots(slots);
  }

  useEffect(() => {
    load().catch((e) => onError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiSend("/api/appointments/slots", "POST", {
        ...(isDoctor ? {} : { doctorUserId: Number(doctorId) }),
        dayOfWeek: Number(form.dayOfWeek),
        startTime: form.startTime,
        endTime: form.endTime,
        slotMinutes: Number(form.slotMinutes),
      });
      await load();
      onChanged?.();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(slot) {
    try {
      await apiSend(`/api/appointments/slots/${slot.id}`, "PATCH", { active: !slot.active });
      await load();
      onChanged?.();
    } catch (err) {
      onError(err.message);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Weekly availability</p>
        {!isDoctor && (
          <label className="flex items-center gap-2 text-xs text-slate-500">
            Doctor
            <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900">
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="space-y-1.5">
        {slots.length === 0 && <p className="text-sm text-slate-400">No availability set up yet.</p>}
        {slots.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-md border border-slate-200 px-2.5 py-1.5 text-sm">
            <span className={s.active ? "" : "text-slate-400 line-through"}>
              {WEEKDAY_NAMES[s.day_of_week]} · {new Date(s.start_time).toISOString().slice(11, 16)}–
              {new Date(s.end_time).toISOString().slice(11, 16)} · {s.slot_minutes} min slots
            </span>
            <button onClick={() => toggleActive(s)} className="text-xs text-slate-500 underline">
              {s.active ? "Deactivate" : "Activate"}
            </button>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 sm:grid-cols-4">
        <select
          value={form.dayOfWeek}
          onChange={(e) => setForm((s) => ({ ...s, dayOfWeek: e.target.value }))}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          {WEEKDAY_NAMES.map((d, i) => (
            <option key={d} value={i}>{d}</option>
          ))}
        </select>
        <input
          type="time"
          value={form.startTime}
          onChange={(e) => setForm((s) => ({ ...s, startTime: e.target.value }))}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <input
          type="time"
          value={form.endTime}
          onChange={(e) => setForm((s) => ({ ...s, endTime: e.target.value }))}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <input
          type="number"
          min="5"
          max="240"
          value={form.slotMinutes}
          onChange={(e) => setForm((s) => ({ ...s, slotMinutes: e.target.value }))}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <button disabled={busy} className="col-span-2 rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50 sm:col-span-4">
          Add availability
        </button>
      </form>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--hms-btn-bg)]/30 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-4 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">{title}</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
