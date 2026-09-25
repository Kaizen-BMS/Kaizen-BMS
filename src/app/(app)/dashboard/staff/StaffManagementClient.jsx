"use client";


import ResetPasswordButton from "@/components/hms/ResetPasswordButton";
import AddStaffForm from "@/components/hms/AddStaffForm";
import Avatar from "@/components/hms/Avatar";
import PersonDetailsFields, { EMPTY_DETAILS } from "@/components/hms/PersonDetailsFields";
import AccessButton from "@/components/hms/AccessButton";
import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";
import AttendanceClient from "../attendance/AttendanceClient";
import { StaffOverviewTab, WeeklySchedules, AttendanceHistoryTab, StaffHistoryTab, hoursText, dutyHours } from "./StaffExtras";
import { fmtDDMMYY } from "@/lib/dateFormat";

const TABS = [
  { key: "overview", label: "Today", adminOnly: true },
  { key: "directory", label: "Directory", adminOnly: true },
  { key: "roster", label: "Duty Roster" },
  { key: "leave", label: "Leave Requests" },
  { key: "attendance", label: "My Attendance" },
  { key: "history", label: "Attendance History", adminOnly: true },
  { key: "reports", label: "Reports", adminOnly: true },
  { key: "timeline", label: "Staff History", adminOnly: true },
];

export default function StaffManagementClient({ canManage, canProxyAttendance, ownUserId }) {
  const availableTabs = TABS.filter((t) => !t.adminOnly || canManage);
  const [tab, setTab] = useState(availableTabs[0].key);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Staff Management</h1>
        <p className="text-sm text-slate-500">People, duty hours, attendance and leave — worked out for you.</p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {availableTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition ${tab === t.key ? "bg-white shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && canManage && <StaffOverviewTab />}
      {tab === "directory" && canManage && <DirectoryTab ownUserId={ownUserId} />}
      {tab === "history" && canManage && <AttendanceHistoryTab />}
      {tab === "timeline" && canManage && <StaffHistoryTab />}
      {tab === "roster" && <DutyRosterTab canManage={canManage} />}
      {tab === "leave" && <LeaveRequestsTab canManage={canManage} ownUserId={ownUserId} />}
      {tab === "attendance" && <AttendanceClient canProxy={canProxyAttendance} canManageStaff={canManage} />}
      {tab === "reports" && canManage && <ReportsTab />}
    </div>
  );
}

function DirectoryTab({ ownUserId }) {
  const [staff, setStaff] = useState(null);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null); // staff row being edited
  const [form, setForm] = useState(EMPTY_DETAILS);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(null);
  const [onlyNoPhoto, setOnlyNoPhoto] = useState(false);

  async function load() {
    const { staff } = await apiGet("/api/staff/profiles");
    setStaff(staff);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, []);

  async function toggleActive(s) {
    setMsg("");
    try {
      await apiSend(`/api/staff/accounts/${s.userId}`, "PATCH", { active: !s.active });
      await load();
    } catch (err) {
      setMsg(err.message === "cannot_disable_owner" ? "An owner's login cannot be switched off." : err.message);
    }
  }

  function startEdit(s) {
    setEditing(s);
    setForm({
      phone: s.phone || "", designation: s.designation || "", joinDate: s.joinDate ? s.joinDate.slice(0, 10) : "", address: s.address || "",
      nativePlace: s.nativePlace || "", emergencyContact: s.emergencyContact || "", bloodGroup: s.bloodGroup || "", aadhaarNo: s.aadhaarNo || "", photoDataUrl: "", photo: s.photo || "",
      employeeId: s.employeeId || "", department: s.department || "", dutyType: s.dutyType || "FIXED", dutyStart: s.dutyStart || "", dutyEnd: s.dutyEnd || "",
    });
  }

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      const { photo: _keep, ...rest } = form;
      await apiSend(`/api/staff/profiles/${editing.userId}`, "PATCH", rest.photoDataUrl === "" ? { ...rest, photoDataUrl: undefined } : rest);
      setEditing(null);
      await load();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!staff) return <p className="text-sm text-slate-400">{msg || "Loading…"}</p>;

  return (
    <div className="space-y-3">
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      <AddStaffForm onCreated={load} />
      {staff.some((s) => !s.photo && s.active) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>{staff.filter((s) => !s.photo && s.active).length} of {staff.filter((s) => s.active).length} people have no photo — attendance photos cannot be matched for them.</span>
          <button onClick={() => setOnlyNoPhoto((v) => !v)} className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs">{onlyNoPhoto ? "Show everyone" : "Show only who need a photo"}</button>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Department</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Duty</th>
              <th className="px-3 py-2">Joined</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {staff.filter((s) => !onlyNoPhoto || (!s.photo && s.active)).map((s) => (
              <tr key={s.userId} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={s.name} src={s.photo} size={36} onClick={s.photo ? () => setZoom(s) : undefined} title={s.photo ? "View photo" : undefined} />
                    <div>
                      <p>{s.name}{s.employeeId && <span className="ml-1.5 text-xs text-slate-400">#{s.employeeId}</span>}{!s.active && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">switched off</span>}</p>
                      <p className="text-xs text-slate-400">{s.email}{s.designation ? ` · ${s.designation}` : ""}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-slate-500">{s.role}</td>
                <td className="px-3 py-2 text-slate-600">{s.department || "—"}</td>
                <td className="px-3 py-2">{s.phone || "—"}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{s.dutyStart && s.dutyEnd ? `${s.dutyStart}–${s.dutyEnd} · ${hoursText(dutyHours(s.dutyStart, s.dutyEnd))}` : "—"}{!s.photo && <p className="text-amber-600">no photo yet</p>}</td>
                <td className="px-3 py-2 tabular-nums">{fmtDDMMYY(s.joinDate)}</td>
                <td className="px-3 py-2">
                  <button onClick={() => startEdit(s)} className={`mr-3 text-xs underline ${s.photo ? "text-slate-600" : "font-semibold text-amber-700"} hover:text-slate-900`}>{s.photo ? "Details & photo" : "Add photo & details"}</button>
                  <a href={`/print/staff-card/${s.userId}`} target="_blank" rel="noreferrer" className="mr-3 text-xs text-slate-600 underline hover:text-slate-900">Print card</a>
                  <ResetPasswordButton userId={s.userId} name={s.name} />
                  {s.role !== "HOSPITAL_ADMIN" && <AccessButton userId={s.userId} name={s.name} />}
                  {s.userId !== ownUserId && (
                    <button onClick={() => toggleActive(s)} className={`ml-3 text-xs underline ${s.active ? "text-red-600" : "text-emerald-700"}`}>
                      {s.active ? "Switch off" : "Switch on"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setEditing(null)}>
          <div className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 text-sm font-semibold">{editing.name} — details</p>
            <PersonDetailsFields name={editing.name} value={form} onChange={setForm} showWork />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Cancel</button>
              <button onClick={save} disabled={busy} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}
      {zoom && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom.photo} alt={zoom.name} className="max-h-[80vh] rounded-lg" />
        </div>
      )}
    </div>
  );
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
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function fmtTime(t) {
  return new Date(t).toISOString().slice(11, 16);
}

function DutyRosterTab({ canManage }) {
  const [view, setView] = useState("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [shifts, setShifts] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [msg, setMsg] = useState("");
  const [showAssign, setShowAssign] = useState(null); // date string
  const [assignForm, setAssignForm] = useState({ userId: "", startTime: "09:00", endTime: "17:00" });
  const [busy, setBusy] = useState(false);

  const range =
    view === "week"
      ? { from: startOfWeek(anchor), to: addDays(startOfWeek(anchor), 6) }
      : { from: startOfMonth(anchor), to: endOfMonth(anchor) };

  async function load() {
    const { shifts } = await apiGet(`/api/staff/duty-shifts?from=${toDateStr(range.from)}&to=${toDateStr(range.to)}`);
    setShifts(shifts);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
    if (canManage) apiGet("/api/staff/profiles").then((d) => setStaffList(d.staff)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, anchor.getTime()]);

  useRealtime(
    { "dutyshift:created": () => load(), "dutyshift:deleted": () => load() },
    load,
  );

  async function assign(dateStr) {
    setBusy(true);
    setMsg("");
    try {
      await apiSend("/api/staff/duty-shifts", "POST", {
        userId: Number(assignForm.userId),
        shiftDate: dateStr,
        startTime: assignForm.startTime,
        endTime: assignForm.endTime,
      });
      setShowAssign(null);
      await load();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    try {
      await apiSend(`/api/staff/duty-shifts/${id}`, "DELETE");
      await load();
    } catch (err) {
      setMsg(err.message);
    }
  }

  const byDate = new Map();
  for (const s of shifts) {
    const key = toDateStr(new Date(s.shift_date));
    byDate.set(key, [...(byDate.get(key) || []), s]);
  }

  const days =
    view === "week"
      ? Array.from({ length: 7 }, (_, i) => addDays(range.from, i))
      : (() => {
          const gridStart = startOfWeek(range.from);
          const gridEnd = addDays(startOfWeek(range.to), 6);
          const arr = [];
          for (let d = new Date(gridStart); d <= gridEnd; d = addDays(d, 1)) arr.push(new Date(d));
          return arr;
        })();

  return (
    <div className="space-y-3">
      <WeeklySchedules canManage={canManage} />
      <p className="pt-2 text-sm font-semibold">One-off changes for a specific date</p>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setAnchor((d) => addDays(d, view === "week" ? -7 : -30))} className="rounded-md border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-50">‹</button>
        <button onClick={() => setAnchor(new Date())} className="rounded-md border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-50">Today</button>
        <button onClick={() => setAnchor((d) => addDays(d, view === "week" ? 7 : 30))} className="rounded-md border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-50">›</button>
        <div className="flex overflow-hidden rounded-md border border-slate-300 text-sm">
          {["week", "month"].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 capitalize ${view === v ? "bg-[var(--hms-btn-bg)] text-[var(--hms-btn-fg)]" : "hover:bg-slate-50"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className={`grid gap-2 ${view === "week" ? "grid-cols-1 sm:grid-cols-7" : "grid-cols-7"}`}>
        {days.map((d) => {
          const key = toDateStr(d);
          const dayShifts = byDate.get(key) || [];
          const inMonth = view === "week" || d.getMonth() === anchor.getMonth();
          return (
            <div key={key} className={`rounded-md border border-slate-200 p-2 text-xs ${inMonth ? "bg-white" : "bg-slate-50 text-slate-300"}`}>
              <p className="mb-1 font-semibold">{WEEKDAY_NAMES[d.getDay()]} {d.getDate()}</p>
              {view === "month" ? (
                dayShifts.length > 0 && (
                  <p className="rounded bg-[var(--hms-accent-soft)] px-1 py-0.5 text-center">{dayShifts.length} shift{dayShifts.length > 1 ? "s" : ""}</p>
                )
              ) : (
                <div className="space-y-1">
                  {dayShifts.map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded bg-slate-50 px-1.5 py-1">
                      <span>{s.user_name} · {fmtTime(s.start_time)}–{fmtTime(s.end_time)}</span>
                      {canManage && (
                        <button onClick={() => remove(s.id)} className="text-slate-400 hover:text-red-600">×</button>
                      )}
                    </div>
                  ))}
                  {canManage && (
                    <button onClick={() => setShowAssign(showAssign === key ? null : key)} className="text-slate-400 underline">
                      + assign
                    </button>
                  )}
                  {showAssign === key && (
                    <div className="mt-1 space-y-1 rounded border border-amber-200 bg-amber-50 p-1.5">
                      <select
                        value={assignForm.userId}
                        onChange={(e) => setAssignForm((f) => ({ ...f, userId: e.target.value }))}
                        className="w-full rounded border border-slate-300 px-1 py-1 text-xs"
                      >
                        <option value="">staff…</option>
                        {staffList.map((s) => (
                          <option key={s.userId} value={s.userId}>{s.name}</option>
                        ))}
                      </select>
                      <div className="flex gap-1">
                        <input type="time" value={assignForm.startTime} onChange={(e) => setAssignForm((f) => ({ ...f, startTime: e.target.value }))} className="w-full rounded border border-slate-300 px-1 py-1 text-xs" />
                        <input type="time" value={assignForm.endTime} onChange={(e) => setAssignForm((f) => ({ ...f, endTime: e.target.value }))} className="w-full rounded border border-slate-300 px-1 py-1 text-xs" />
                      </div>
                      <button
                        onClick={() => assign(key)}
                        disabled={busy || !assignForm.userId}
                        className="w-full rounded bg-[var(--hms-btn-bg)] px-1.5 py-1 text-xs font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
                      >
                        Confirm
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeaveRequestsTab({ canManage, ownUserId }) {
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ fromDate: "", toDate: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [range] = useState(() => {
    const from = addDays(new Date(), -30);
    const to = addDays(new Date(), 30);
    return { from: toDateStr(from), to: toDateStr(to) };
  });

  async function load() {
    const { leaveRequests } = await apiGet(`/api/staff/leave-requests?from=${range.from}&to=${range.to}`);
    setRows(leaveRequests);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRealtime(
    { "leaverequest:created": () => load(), "leaverequest:updated": () => load() },
    load,
  );

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      await apiSend("/api/staff/leave-requests", "POST", form);
      setForm({ fromDate: "", toDate: "", reason: "" });
      await load();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function decide(id, status) {
    try {
      await apiSend(`/api/staff/leave-requests/${id}`, "PATCH", { status });
      await load();
    } catch (err) {
      setMsg(err.message);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-4">
        <p className="col-span-full text-sm font-semibold">Request leave</p>
        <input type="date" required value={form.fromDate} onChange={(e) => setForm((f) => ({ ...f, fromDate: e.target.value }))} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        <input type="date" required value={form.toDate} onChange={(e) => setForm((f) => ({ ...f, toDate: e.target.value }))} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        <input required value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="reason" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm sm:col-span-2" />
        <button disabled={busy} className="col-span-full rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50 sm:col-span-1">
          Submit
        </button>
      </form>

      {msg && <p className="text-sm text-red-600">{msg}</p>}

      <div className="space-y-2">
        {!rows && <p className="text-sm text-slate-400">Loading…</p>}
        {rows?.length === 0 && <p className="text-sm text-slate-400">No leave requests in range.</p>}
        {rows?.map((r) => {
          const isOwn = String(r.user_id) === String(ownUserId);
          return (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
              <div>
                <p className="font-medium">
                  {r.user_name} · {fmtDDMMYY(r.from_date)} – {fmtDDMMYY(r.to_date)}
                </p>
                <p className="text-xs text-slate-500">
                  {r.reason != null ? r.reason : isOwn || canManage ? "" : "(reason private to this staff member)"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{r.status}</span>
                {canManage && r.status === "PENDING" && (
                  <>
                    <button onClick={() => decide(r.id, "APPROVED")} className="text-xs text-green-700 underline">approve</button>
                    <button onClick={() => decide(r.id, "REJECTED")} className="text-xs text-red-600 underline">reject</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReportsTab() {
  const [range, setRange] = useState(() => ({ from: toDateStr(addDays(new Date(), -30)), to: toDateStr(new Date()) }));
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState("");

  async function load() {
    const d = await apiGet(`/api/staff/reports?from=${range.from}&to=${range.to}`);
    setData(d);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        <span className="text-slate-400">to</span>
        <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
      </div>

      {msg && <p className="text-sm text-red-600">{msg}</p>}
      {!data ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="px-3 py-2">Staff</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Attendance</th>
                  <th className="px-3 py-2">Leave days taken</th>
                </tr>
              </thead>
              <tbody>
                {data.staff.map((s) => (
                  <tr key={s.userId} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2">{s.name}</td>
                    <td className="px-3 py-2 text-slate-500">{s.role}</td>
                    <td className="px-3 py-2">{s.attendancePct}% <span className="text-slate-400">({s.daysPresent}/{data.totalDays}d)</span></td>
                    <td className="px-3 py-2">{s.leaveDaysTaken}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-xs text-slate-400">
              &quot;Leave remaining&quot; isn&apos;t shown — there&apos;s no leave-quota/entitlement policy configured anywhere yet, so it isn&apos;t honestly computable.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-sm font-semibold">Shifts with zero doctors scheduled</p>
            {data.understaffedShifts.length === 0 ? (
              <p className="mt-1 text-sm text-slate-400">None in this range.</p>
            ) : (
              <div className="mt-2 space-y-1 text-sm">
                {data.understaffedShifts.map((s, i) => (
                  <p key={i} className="text-amber-700">
                    {fmtDDMMYY(s.shift_date)} · {fmtTime(s.start_time)}–{fmtTime(s.end_time)} · {s.total_count} staff, 0 doctors
                  </p>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
