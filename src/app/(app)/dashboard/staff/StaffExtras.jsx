"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";
import { fmtDDMMYY } from "@/lib/dateFormat";
import DateInput from "@/components/hms/DateInput";
import Avatar from "@/components/hms/Avatar";

const inp = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first

export const fmtMins = (m) => {
  const n = Math.max(0, Math.round(m || 0));
  const h = Math.floor(n / 60);
  const r = n % 60;
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
};
const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—");
const todayIso = () => new Date().toISOString().slice(0, 10);
const addDaysIso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

/** Hours between two "HH:MM" values (a night shift wraps past midnight). */
export function dutyHours(start, end) {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 1440;
  return mins / 60;
}
export const hoursText = (h) => (h == null ? "—" : `${Number.isInteger(h) ? h : h.toFixed(1)} hour${h === 1 ? "" : "s"}`);

// ── Overview: today at a glance ─────────────────────────────────────
const CARDS = [
  ["present", "Present Today", "bg-emerald-50 text-emerald-700 border-emerald-200", (p) => p.status === "PRESENT"],
  ["absent", "Absent Today", "bg-red-50 text-red-700 border-red-200", (p) => p.status === "ABSENT"],
  ["late", "Late Today", "bg-orange-50 text-orange-700 border-orange-200", (p) => p.late],
  ["onLeave", "On Leave", "bg-sky-50 text-sky-700 border-sky-200", (p) => p.status === "ON_LEAVE"],
  ["overtime", "Overtime Today", "bg-violet-50 text-violet-700 border-violet-200", (p) => p.overtime],
  ["total", "Total Staff", "bg-slate-50 text-slate-700 border-slate-200", () => true],
];

export function StaffOverviewTab() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [pick, setPick] = useState("present");

  const load = () => apiGet("/api/staff/overview").then(setData);
  useEffect(() => { load().catch((e) => setErr(e.message)); }, []);
  useRealtime({ "attendance:updated": load, "leaverequest:updated": load }, load);

  if (err) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>;
  if (!data) return <p className="text-sm text-slate-400">Loading today&apos;s picture…</p>;
  const active = CARDS.find((c) => c[0] === pick) || CARDS[0];
  const list = data.people.filter(active[3]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {CARDS.map(([key, label, cls]) => (
          <button key={key} onClick={() => setPick(key)} className={`rounded-2xl border p-4 text-left shadow-sm transition hover:shadow-md ${cls} ${pick === key ? "ring-2 ring-slate-400" : ""}`}>
            <p className="text-3xl font-semibold tabular-nums">{data.counts[key]}</p>
            <p className="text-xs font-medium">{label}</p>
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <p className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold">{active[1]} <span className="font-normal text-slate-400">· {fmtDDMMYY(data.date)}</span></p>
        <table className="w-full text-sm">
          <thead className="bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-2">Employee</th><th className="px-4 py-2">Duty</th><th className="px-4 py-2">In</th><th className="px-4 py-2">Out</th><th className="px-4 py-2">Status</th></tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Nobody in this list today.</td></tr>}
            {list.map((p) => (
              <tr key={`${p.kind}${p.id}`} className="border-t border-slate-100">
                <td className="px-4 py-2"><span className="font-medium">{p.name}</span><span className="ml-2 text-xs text-slate-400">{p.role}</span></td>
                <td className="px-4 py-2 text-slate-600">{p.duty}</td>
                <td className="px-4 py-2 tabular-nums">{clock(p.checkIn)}</td>
                <td className="px-4 py-2 tabular-nums">{clock(p.checkOut)}</td>
                <td className="px-4 py-2 text-xs">
                  {p.status === "ABSENT" && <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700">Absent</span>}
                  {p.status === "ON_LEAVE" && <span className="rounded-full bg-sky-100 px-2 py-0.5 font-medium text-sky-700">On leave</span>}
                  {p.status === "OFF" && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">Off / not scheduled</span>}
                  {p.status === "PRESENT" && <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">Present</span>}
                  {p.late && <span className="ml-1 rounded-full bg-orange-100 px-2 py-0.5 font-medium text-orange-700">🟠 Late {fmtMins(p.lateMinutes)}</span>}
                  {p.overtime && <span className="ml-1 rounded-full bg-violet-100 px-2 py-0.5 font-medium text-violet-700">OT {fmtMins(p.overtimeMinutes)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">Absent only counts people who were scheduled to work today — owners or managers with no duty schedule are never marked absent.</p>
    </div>
  );
}

// ── Weekly schedules + reusable shifts (configure once) ─────────────
export function WeeklySchedules({ canManage }) {
  const [staff, setStaff] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [edit, setEdit] = useState(null); // { userId, name, days }
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [tf, setTf] = useState({ name: "", start: "09:00", end: "17:00" });

  const load = () => Promise.all([apiGet("/api/staff/schedules").then((d) => setStaff(d.staff)), apiGet("/api/staff/shift-templates").then((d) => setTemplates(d.templates))]);
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, []);
  useRealtime({ "dutyshift:created": load }, load);

  const setDay = (dow, patch) => setEdit((e) => ({ ...e, days: e.days.map((d) => (d.dow === dow ? { ...d, ...patch } : d)) }));
  const applyTemplate = (t, dows) => setEdit((e) => ({ ...e, days: e.days.map((d) => (dows.includes(d.dow) ? { ...d, off: false, start: t.start, end: t.end } : d)) }));

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      await apiSend(`/api/staff/schedules/${edit.userId}`, "PUT", { days: edit.days.map((d) => ({ dow: d.dow, off: d.off, start: d.off ? null : d.start, end: d.off ? null : d.end })) });
      setEdit(null);
      await load();
    } catch (err) {
      setMsg(`Could not save (${err.message}).`);
    } finally {
      setBusy(false);
    }
  }
  async function addTemplate(e) {
    e.preventDefault();
    try {
      await apiSend("/api/staff/shift-templates", "POST", tf);
      setTf({ name: "", start: "09:00", end: "17:00" });
      await load();
    } catch (err) {
      setMsg(err.message === "template_already_exists" ? "A shift with that name already exists." : `Could not add (${err.message}).`);
    }
  }
  async function toggleTemplate(t) {
    await apiSend(`/api/staff/shift-templates/${t.id}`, "PATCH", { active: !t.active }).catch((e) => setMsg(e.message));
    await load();
  }

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <p className="text-sm font-semibold">Weekly duty schedule</p>
        <p className="text-xs text-slate-400">Set once — attendance is checked against it automatically every day.</p>
      </div>
      {msg && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>}

      {canManage && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-3">
          <div className="flex flex-wrap gap-1.5">
            {templates.filter((t) => t.active).map((t) => <span key={t.id} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs">{t.name} · {t.start}–{t.end} · {t.hours}h</span>)}
            {templates.length === 0 && <span className="text-xs text-slate-400">No shift templates yet.</span>}
          </div>
          <form onSubmit={addTemplate} className="flex flex-wrap items-end gap-2">
            <label className="text-[11px] font-medium text-slate-500">New shift<input required placeholder="Evening Shift" value={tf.name} onChange={(e) => setTf({ ...tf, name: e.target.value })} className={`${inp} mt-0.5 w-40`} /></label>
            <input type="time" aria-label="Shift start" value={tf.start} onChange={(e) => setTf({ ...tf, start: e.target.value })} className={`${inp} w-28`} />
            <input type="time" aria-label="Shift end" value={tf.end} onChange={(e) => setTf({ ...tf, end: e.target.value })} className={`${inp} w-28`} />
            <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-50">Save shift</button>
          </form>
          {templates.filter((t) => !t.active).length > 0 && (
            <p className="text-[11px] text-slate-400">Switched off: {templates.filter((t) => !t.active).map((t) => <button key={t.id} onClick={() => toggleTemplate(t)} className="mr-1 underline">{t.name}</button>)}</p>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-xs">
          <thead className="text-left text-slate-500"><tr><th className="py-1.5 pr-3">Employee</th>{ORDER.map((d) => <th key={d} className="px-2 py-1.5">{DAYS[d]}</th>)}<th /></tr></thead>
          <tbody>
            {staff === null && <tr><td colSpan={9} className="py-6 text-center text-slate-400">Loading…</td></tr>}
            {staff?.map((s) => (
              <tr key={s.userId} className="border-t border-slate-100">
                <td className="py-2 pr-3 font-medium">{s.name}<span className="ml-1 text-slate-400">{s.role}</span></td>
                {ORDER.map((d) => {
                  const day = s.days[d];
                  return <td key={d} className={`px-2 py-2 tabular-nums ${day.off ? "text-slate-300" : ""}`}>{day.off ? (day.configured ? "Off" : "—") : `${day.start}–${day.end}`}</td>;
                })}
                <td className="py-2 text-right">{canManage && <button onClick={() => setEdit({ userId: s.userId, name: s.name, days: s.days.map((d) => ({ ...d, start: d.start || "09:00", end: d.end || "17:00" })) })} className="rounded-md px-2 py-0.5 hover:bg-slate-100">Edit</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setEdit(null)}>
          <div className="max-h-[92vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-semibold">{edit.name} — weekly schedule</p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-500">Apply a shift to Mon–Sat:</span>
              {templates.filter((t) => t.active).map((t) => <button key={t.id} onClick={() => applyTemplate(t, [1, 2, 3, 4, 5, 6])} className="rounded-full border border-slate-300 px-2.5 py-1 hover:bg-slate-50">{t.name}</button>)}
            </div>
            <div className="mt-3 space-y-1.5">
              {ORDER.map((d) => {
                const day = edit.days.find((x) => x.dow === d);
                return (
                  <div key={d} className="flex items-center gap-2 text-sm">
                    <span className="w-10 font-medium">{DAYS[d]}</span>
                    <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={day.off} onChange={(e) => setDay(d, { off: e.target.checked })} /> Off</label>
                    <input type="time" disabled={day.off} value={day.start} onChange={(e) => setDay(d, { start: e.target.value })} className={`${inp} w-28 disabled:bg-slate-100`} aria-label={`${DAYS[d]} start`} />
                    <span className="text-slate-400">→</span>
                    <input type="time" disabled={day.off} value={day.end} onChange={(e) => setDay(d, { end: e.target.value })} className={`${inp} w-28 disabled:bg-slate-100`} aria-label={`${DAYS[d]} end`} />
                    <span className="w-14 text-right text-xs text-slate-400">{day.off ? "" : hoursText(dutyHours(day.start, day.end))}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setEdit(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button>
              <button onClick={save} disabled={busy} className="rounded-lg bg-[var(--hms-btn-bg)] px-4 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">{busy ? "Saving…" : "Save schedule"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Attendance history (admin / owner) ──────────────────────────────
export function AttendanceHistoryTab() {
  const [from, setFrom] = useState(addDaysIso(-13));
  const [to, setTo] = useState(todayIso());
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [zoom, setZoom] = useState(null);
  const [fix, setFix] = useState(null); // row being corrected
  const [fixForm, setFixForm] = useState({ checkIn: "", checkOut: "", reason: "" });
  const [fixBusy, setFixBusy] = useState(false);

  async function saveFix() {
    setFixBusy(true);
    setErr("");
    try {
      await apiSend(`/api/staff/attendance-log/${fix.id}`, "PATCH", { ...(fixForm.checkIn ? { checkIn: fixForm.checkIn } : {}), ...(fixForm.checkOut ? { checkOut: fixForm.checkOut } : {}), reason: fixForm.reason });
      setFix(null);
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setFixBusy(false);
    }
  }

  const load = () => {
    setRows(null);
    return apiGet(`/api/staff/attendance-history?from=${from}&to=${to}`).then((d) => setRows(d.rows));
  };
  useEffect(() => {
    load().catch((e) => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-600">From<DateInput value={from} onChange={setFrom} className={`${inp} mt-1 w-32`} /></label>
        <label className="text-xs font-medium text-slate-600">To<DateInput value={to} onChange={setTo} className={`${inp} mt-1 w-32`} /></label>
      </div>
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2.5">Employee</th><th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">Duty</th><th className="px-3 py-2.5">In</th>
              <th className="px-3 py-2.5">Late</th><th className="px-3 py-2.5">Out</th><th className="px-3 py-2.5">Worked</th><th className="px-3 py-2.5">Shortfall</th>
              <th className="px-3 py-2.5">Overtime</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Photo</th><th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows === null && <tr><td colSpan={12} className="px-3 py-8 text-center text-slate-400">Loading…</td></tr>}
            {rows?.length === 0 && <tr><td colSpan={12} className="px-3 py-8 text-center text-slate-400">No attendance in this period.</td></tr>}
            {rows?.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-3 py-2 font-medium">{r.name}{r.proxy && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-500">marked by staff</span>}</td>
                <td className="px-3 py-2 tabular-nums">{fmtDDMMYY(r.date)}</td>
                <td className="px-3 py-2 tabular-nums text-slate-600">{r.scheduledStart ? `${r.scheduledStart}–${r.scheduledEnd}` : r.offDay ? "Off day" : "—"}</td>
                <td className="px-3 py-2 tabular-nums">{clock(r.checkIn)}</td>
                <td className="px-3 py-2">{r.lateMinutes > 0 ? <span className="font-medium text-orange-700">🟠 {fmtMins(r.lateMinutes)}</span> : r.scheduledStart ? <span className="text-slate-400">—</span> : ""}</td>
                <td className="px-3 py-2 tabular-nums">{clock(r.checkOut)}</td>
                <td className="px-3 py-2 tabular-nums">{fmtMins(r.workedMinutes)}</td>
                <td className="px-3 py-2">{r.checkOut && r.shortfallMinutes > 0 ? <span className="font-medium text-red-700">{fmtMins(r.shortfallMinutes)}</span> : <span className="text-slate-300">—</span>}</td>
                <td className="px-3 py-2">{r.overtimeMinutes > 0 ? <span className="font-medium text-emerald-700">{fmtMins(r.overtimeMinutes)}</span> : <span className="text-slate-300">—</span>}</td>
                <td className="px-3 py-2 text-xs">{r.open ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">Working</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">Done</span>}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    {r.hasInPhoto && <button onClick={() => setZoom(`/api/staff/attendance-photo/${r.id}?type=in`)} title="Check-in photo" className="h-9 w-9 overflow-hidden rounded-lg border border-slate-200"><img src={`/api/staff/attendance-photo/${r.id}?type=in`} alt="Check-in" className="h-full w-full object-cover" /></button>}
                    {r.hasOutPhoto && <button onClick={() => setZoom(`/api/staff/attendance-photo/${r.id}?type=out`)} title="Check-out photo" className="h-9 w-9 overflow-hidden rounded-lg border border-slate-200"><img src={`/api/staff/attendance-photo/${r.id}?type=out`} alt="Check-out" className="h-full w-full object-cover" /></button>}
                    {!r.hasInPhoto && !r.hasOutPhoto && <span className="text-slate-300">—</span>}
                  </div>
                </td>
                <td className="px-3 py-2 text-right"><button onClick={() => { setFix(r); setFixForm({ checkIn: "", checkOut: "", reason: "" }); }} className="rounded-md px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100">Correct</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {fix && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setFix(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-semibold">Correct attendance — {fix.name}</p>
            <p className="text-xs text-slate-500">{fmtDDMMYY(fix.date)} · now in {clock(fix.checkIn)} / out {clock(fix.checkOut)}. Fill only what needs changing.</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="text-xs font-medium text-slate-600">Correct check-in<input type="time" value={fixForm.checkIn} onChange={(e) => setFixForm({ ...fixForm, checkIn: e.target.value })} className={`${inp} mt-1`} /></label>
              <label className="text-xs font-medium text-slate-600">Correct check-out<input type="time" value={fixForm.checkOut} onChange={(e) => setFixForm({ ...fixForm, checkOut: e.target.value })} className={`${inp} mt-1`} /></label>
            </div>
            <label className="mt-3 block text-xs font-medium text-slate-600">Reason (required)<input value={fixForm.reason} onChange={(e) => setFixForm({ ...fixForm, reason: e.target.value })} placeholder="Forgot to check out" className={`${inp} mt-1`} /></label>
            <p className="mt-1 text-[11px] text-slate-400">Saved in the person&apos;s Staff History with the old and new times.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setFix(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button>
              <button onClick={saveFix} disabled={fixBusy || fixForm.reason.trim().length < 3 || (!fixForm.checkIn && !fixForm.checkOut)} className="rounded-lg bg-[var(--hms-btn-bg)] px-4 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">{fixBusy ? "Saving…" : "Save correction"}</button>
            </div>
          </div>
        </div>
      )}
      {zoom && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setZoom(null)}>
          
          <img src={zoom} alt="Attendance photo" className="max-h-[85vh] rounded-2xl shadow-2xl" />
        </div>
      )}
    </div>
  );
}

// ── Staff history: one person's whole story ─────────────────────────
export function StaffHistoryTab() {
  const [staff, setStaff] = useState([]);
  const [userId, setUserId] = useState("");
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiGet("/api/staff/profiles").then((d) => { setStaff(d.staff); if (d.staff[0]) setUserId(String(d.staff[0].userId)); }).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => {
    if (!userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    apiGet(`/api/staff/history?userId=${userId}`).then(setData).catch((e) => setErr(e.message));
  }, [userId]);

  const person = staff.find((s) => String(s.userId) === userId);
  const ICON = { ATTENDANCE: "bg-emerald-500", LEAVE: "bg-sky-500", DUTY_CHANGED: "bg-violet-500", ROSTER_CHANGED: "bg-violet-500", STAFF_ADDED: "bg-slate-500", ATTENDANCE_CORRECTED: "bg-amber-500" };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {person && <Avatar name={person.name} src={person.photo} size={40} />}
        <select value={userId} onChange={(e) => setUserId(e.target.value)} className={`${inp} w-64`} aria-label="Employee">
          {staff.map((s) => <option key={s.userId} value={s.userId}>{s.name}</option>)}
        </select>
      </div>
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {!data && <p className="text-sm text-slate-400">Loading history…</p>}
        {data?.timeline.length === 0 && <p className="text-sm text-slate-400">Nothing recorded yet.</p>}
        <ol className="space-y-2.5">
          {data?.timeline.map((e, i) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ICON[e.type] || "bg-slate-400"}`} />
              <span className="w-20 shrink-0 tabular-nums text-xs text-slate-400">{fmtDDMMYY(e.at)}</span>
              <span>{e.text}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
