"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";
import Icon from "@/components/hms/icons";
import { compressImageToDataUrl as compressPhoto } from "@/components/hms/imageCompress";

const STATUS_LABEL = {
  NOT_CHECKED_IN: "Not checked in",
  CHECKED_IN: "Checked in",
  OUT: "Stepped out",
  CHECKED_OUT: "Checked out",
};
const STATUS_STYLE = {
  NOT_CHECKED_IN: "bg-slate-100 text-slate-600",
  CHECKED_IN: "border border-green-300 bg-green-50 text-green-700",
  OUT: "border border-amber-300 bg-amber-50 text-amber-700",
  CHECKED_OUT: "bg-slate-100 text-slate-500",
};

function fmtTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
}
function fmtMinutes(mins) {
  const h = Math.floor((mins || 0) / 60);
  const m = Math.round(mins || 0) % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function AttendanceClient({ canProxy, canManageStaff }) {
  const [mine, setMine] = useState(null);
  const [msg, setMsg] = useState("");
  const [breakFormOpen, setBreakFormOpen] = useState(false);
  const [category, setCategory] = useState("PERSONAL");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadMine() {
    const data = await apiGet("/api/attendance/today");
    setMine(data);
  }

  useEffect(() => {
    loadMine().catch((e) => setMsg(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRealtime({ "attendance:updated": () => loadMine() }, loadMine);

  async function act(fn) {
    setBusy(true);
    setMsg("");
    try {
      await fn();
      await loadMine();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  const status = mine?.status || "NOT_CHECKED_IN";
  const openBreak = mine?.breaks?.find((b) => !b.in_at);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Attendance</h1>
        <p className="text-sm text-slate-500">Check in when you arrive, check out when you leave.</p>
      </div>

      {msg && <p className="text-sm text-red-600">{msg}</p>}

      <div className="hms-card max-w-md p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[status]}`}>
            {STATUS_LABEL[status]}
          </span>
          {mine?.log?.check_in_at && (
            <span className="text-xs text-slate-500">
              In {fmtTime(mine.log.check_in_at)}
              {mine.log.check_out_at ? ` · Out ${fmtTime(mine.log.check_out_at)}` : ""}
              {" · "}
              {fmtMinutes(mine.workedMinutes)} worked
            </span>
          )}
        </div>

        {status === "OUT" && openBreak && (
          <p className="mt-3 text-sm text-amber-700">
            Stepped out ({openBreak.category === "PERSONAL" ? "personal" : "hospital work"}) — {openBreak.reason}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {status === "NOT_CHECKED_IN" && (
            <button
              disabled={busy}
              onClick={() => act(() => apiSend("/api/attendance/check-in", "POST"))}
              className="rounded-md bg-[var(--hms-btn-bg)] px-4 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
            >
              Check in
            </button>
          )}
          {status === "CHECKED_IN" && (
            <>
              <button
                disabled={busy}
                onClick={() => setBreakFormOpen((s) => !s)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
              >
                Step out
              </button>
              <button
                disabled={busy}
                onClick={() => act(() => apiSend("/api/attendance/check-out", "POST"))}
                className="rounded-md bg-[var(--hms-btn-bg)] px-4 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
              >
                Check out
              </button>
            </>
          )}
          {status === "OUT" && (
            <button
              disabled={busy}
              onClick={() => act(() => apiSend("/api/attendance/breaks/end", "POST"))}
              className="rounded-md bg-[var(--hms-btn-bg)] px-4 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
            >
              I&rsquo;m back
            </button>
          )}
        </div>

        {breakFormOpen && status === "CHECKED_IN" && (
          <div className="mt-4 space-y-2 border-t border-slate-200 pt-3">
            <div className="flex gap-3 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={category === "PERSONAL"} onChange={() => setCategory("PERSONAL")} />
                Personal
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={category === "HOSPITAL_WORK"} onChange={() => setCategory("HOSPITAL_WORK")} />
                Hospital work
              </label>
            </div>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="reason"
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
            <button
              disabled={busy || !reason.trim()}
              onClick={() =>
                act(async () => {
                  await apiSend("/api/attendance/breaks/start", "POST", { category, reason: reason.trim() });
                  setBreakFormOpen(false);
                  setReason("");
                })
              }
              className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
            >
              Confirm
            </button>
          </div>
        )}

        {status === "CHECKED_OUT" && mine?.breaks?.length > 0 && (
          <div className="mt-3 space-y-0.5 border-t border-slate-200 pt-3 text-xs text-slate-500">
            {mine.breaks.map((b) => (
              <p key={b.id}>
                Out {fmtTime(b.out_at)}–{fmtTime(b.in_at)} · {b.category === "PERSONAL" ? "Personal" : "Hospital work"} · {b.reason}
              </p>
            ))}
          </div>
        )}
      </div>

      {canProxy && <ProxyRoster canManageStaff={canManageStaff} />}
    </div>
  );
}

function ProxyRoster({ canManageStaff }) {
  const [roster, setRoster] = useState([]);
  const [msg, setMsg] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [photoTarget, setPhotoTarget] = useState(null);
  const [breakTarget, setBreakTarget] = useState(null);
  const [category, setCategory] = useState("PERSONAL");
  const [reason, setReason] = useState("");
  const fileInputRef = useRef(null);

  async function load() {
    const data = await apiGet("/api/attendance/proxy");
    setRoster(data.roster);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRealtime(
    {
      "attendance:updated": () => load(),
      "staffmember:created": () => load(),
      "staffmember:updated": () => load(),
    },
    load,
  );

  function openPhotoCapture(memberId, action) {
    setPhotoTarget({ memberId, action });
    fileInputRef.current?.click();
  }

  async function onPhotoChosen(e) {
    const file = e.target.files?.[0];
    const target = photoTarget;
    e.target.value = "";
    setPhotoTarget(null);
    if (!file || !target) return;
    try {
      const photoDataUrl = await compressPhoto(file, 480);
      const url =
        target.action === "check-in" ? "/api/attendance/proxy/check-in" : "/api/attendance/proxy/check-out";
      await apiSend(url, "POST", { staffMemberId: target.memberId, photoDataUrl });
      await load();
    } catch (err) {
      setMsg(err.message);
    }
  }

  async function endBreak(memberId) {
    try {
      await apiSend("/api/attendance/proxy/breaks/end", "POST", { staffMemberId: memberId });
      await load();
    } catch (err) {
      setMsg(err.message);
    }
  }

  async function startBreak(memberId) {
    if (!reason.trim()) return;
    try {
      await apiSend("/api/attendance/proxy/breaks/start", "POST", {
        staffMemberId: memberId,
        category,
        reason: reason.trim(),
      });
      setBreakTarget(null);
      setReason("");
      await load();
    } catch (err) {
      setMsg(err.message);
    }
  }

  async function removeMember(memberId) {
    try {
      await apiSend(`/api/attendance/staff-members/${memberId}`, "PATCH", { active: false });
      await load();
    } catch (err) {
      setMsg(err.message);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Staff without login</h2>
        {canManageStaff && (
          <button
            onClick={() => setShowAdd((s) => !s)}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50"
          >
            {showAdd ? "Close" : "+ Add"}
          </button>
        )}
      </div>
      <p className="text-xs text-slate-400">
        For employees with no system login (e.g. housekeeping) — mark their attendance here with a photo.
      </p>

      {msg && <p className="mt-2 text-sm text-red-600">{msg}</p>}

      {showAdd && canManageStaff && <AddStaffMemberForm onAdded={load} onError={setMsg} />}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPhotoChosen}
      />

      <div className="mt-3 space-y-2">
        {roster.length === 0 && <p className="text-sm text-slate-400">No staff added yet.</p>}
        {roster.map(({ member, status, log, breaks, workedMinutes }) => (
          <div key={member.id} className="hms-card flex flex-wrap items-center gap-3 p-3 text-sm">
            <div className="min-w-[8rem] flex-1">
              <p className="font-medium">{member.name}</p>
              <p className="text-xs text-slate-500">{member.designation || "—"}</p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>
              {STATUS_LABEL[status]}
            </span>
            {log?.check_in_at && (
              <span className="text-xs text-slate-500">
                In {fmtTime(log.check_in_at)}
                {log.check_out_at ? ` · Out ${fmtTime(log.check_out_at)}` : ""} · {fmtMinutes(workedMinutes)}
              </span>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              {status === "NOT_CHECKED_IN" && (
                <button
                  onClick={() => openPhotoCapture(member.id, "check-in")}
                  className="flex items-center gap-1 rounded-md bg-[var(--hms-btn-bg)] px-2.5 py-1 text-xs font-medium text-[var(--hms-btn-fg)]"
                >
                  <Icon name="camera" size={13} /> Check in
                </button>
              )}
              {status === "CHECKED_IN" && (
                <>
                  <button
                    onClick={() => setBreakTarget(breakTarget === member.id ? null : member.id)}
                    className="rounded-md border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50"
                  >
                    Step out
                  </button>
                  <button
                    onClick={() => openPhotoCapture(member.id, "check-out")}
                    className="flex items-center gap-1 rounded-md bg-[var(--hms-btn-bg)] px-2.5 py-1 text-xs font-medium text-[var(--hms-btn-fg)]"
                  >
                    <Icon name="camera" size={13} /> Check out
                  </button>
                </>
              )}
              {status === "OUT" && (
                <button
                  onClick={() => endBreak(member.id)}
                  className="rounded-md bg-[var(--hms-btn-bg)] px-2.5 py-1 text-xs font-medium text-[var(--hms-btn-fg)]"
                >
                  Back
                </button>
              )}
              {canManageStaff && (
                <button onClick={() => removeMember(member.id)} className="text-xs text-slate-400 underline hover:text-red-600">
                  Remove
                </button>
              )}
            </div>

            {breakTarget === member.id && (
              <div className="mt-2 flex w-full flex-wrap items-center gap-2 border-t border-slate-200 pt-2">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                >
                  <option value="PERSONAL">Personal</option>
                  <option value="HOSPITAL_WORK">Hospital work</option>
                </select>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="reason"
                  className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
                />
                <button
                  onClick={() => startBreak(member.id)}
                  disabled={!reason.trim()}
                  className="rounded-md bg-[var(--hms-btn-bg)] px-2.5 py-1 text-xs font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
                >
                  Confirm
                </button>
              </div>
            )}

            {status === "CHECKED_OUT" && breaks?.length > 0 && (
              <div className="mt-1 w-full space-y-0.5 text-xs text-slate-500">
                {breaks.map((b) => (
                  <p key={b.id}>
                    Out {fmtTime(b.out_at)}–{fmtTime(b.in_at)} · {b.category === "PERSONAL" ? "Personal" : "Hospital work"} ·{" "}
                    {b.reason}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AddStaffMemberForm({ onAdded, onError }) {
  const [form, setForm] = useState({ name: "", designation: "", phone: "" });
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiSend("/api/attendance/staff-members", "POST", form);
      setForm({ name: "", designation: "", phone: "" });
      onAdded();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="my-3 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-4">
      <input
        required
        placeholder="name"
        value={form.name}
        onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      <input
        placeholder="designation (e.g. Sweeper)"
        value={form.designation}
        onChange={(e) => setForm((s) => ({ ...s, designation: e.target.value }))}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      <input
        placeholder="phone (optional)"
        value={form.phone}
        onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      <button disabled={busy} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">
        Add
      </button>
    </form>
  );
}
