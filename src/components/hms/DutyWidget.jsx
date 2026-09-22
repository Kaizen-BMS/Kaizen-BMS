"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiSend } from "./api";
import { useRealtime } from "./useRealtime";
import Avatar from "./Avatar";

const STATUS_LABEL = { NOT_CHECKED_IN: "Not checked in", CHECKED_IN: "On duty", OUT: "Stepped out", CHECKED_OUT: "Checked out" };
const STATUS_DOT = { CHECKED_IN: "bg-emerald-500", OUT: "bg-amber-500", CHECKED_OUT: "bg-slate-300", NOT_CHECKED_IN: "bg-slate-300" };

// A live clock: elapsed time since a start instant, minus any PERSONAL break
// time already elapsed, ticking every second. Same math as
// computeWorkedMinutes (src/lib/attendance.js) but running client-side so it
// visibly counts up instead of only updating on a refetch.
function useTicker() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function liveSeconds(log, breaks, now) {
  if (!log?.check_in_at) return 0;
  const end = log.check_out_at ? new Date(log.check_out_at).getTime() : now;
  let secs = Math.max(0, (end - new Date(log.check_in_at).getTime()) / 1000);
  for (const b of breaks || []) {
    if (b.category !== "PERSONAL") continue;
    const bEnd = b.in_at ? new Date(b.in_at).getTime() : now;
    secs -= Math.max(0, (bEnd - new Date(b.out_at).getTime()) / 1000);
  }
  return Math.max(0, Math.floor(secs));
}

function fmtHms(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// My own duty timer — ticks live, with the same in/out/step-out actions the
// full Attendance page has, right on the Overview.
export function MyDutyCard() {
  const [mine, setMine] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const now = useTicker();

  const load = () => apiGet("/api/attendance/today").then(setMine);
  useEffect(() => {
    load().catch((e) => setMsg(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useRealtime({ "attendance:updated": load }, load);

  async function act(fn) {
    setBusy(true);
    setMsg("");
    try {
      await fn();
      await load();
    } catch (err) {
      setMsg(err.message === "already_checked_in" ? "Already checked in." : err.message === "close_break_first" ? "Come back from your break first." : err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!mine) return null;
  const status = mine.status;
  const seconds = liveSeconds(mine.log, mine.breaks, now);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">My duty today</p>
        <Link href="/dashboard/attendance" className="text-xs text-slate-400 hover:text-slate-700">open →</Link>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[status]} ${status === "CHECKED_IN" ? "animate-pulse" : ""}`} />
        <span className="text-2xl font-semibold tabular-nums">{fmtHms(seconds)}</span>
        <span className="text-xs text-slate-500">{STATUS_LABEL[status]}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {status === "NOT_CHECKED_IN" && <button disabled={busy} onClick={() => act(() => apiSend("/api/attendance/check-in", "POST"))} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Check in</button>}
        {status === "CHECKED_IN" && <button disabled={busy} onClick={() => act(() => apiSend("/api/attendance/check-out", "POST"))} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Check out</button>}
        {status === "OUT" && <button disabled={busy} onClick={() => act(() => apiSend("/api/attendance/breaks/end", "POST"))} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">I&rsquo;m back</button>}
        {status === "CHECKED_OUT" && <button disabled={busy} onClick={() => act(() => apiSend("/api/attendance/check-in", "POST"))} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Back at work</button>}
      </div>
      {msg && <p className="mt-2 text-xs text-red-600">{msg}</p>}
    </div>
  );
}

// Admin / receptionist view: everyone currently on duty, each with their own
// live-ticking timer — a glance at who's in without opening the full page.
export function TeamDutyCard() {
  const [roster, setRoster] = useState(null);
  const now = useTicker();

  const load = () => apiGet("/api/attendance/proxy").then((d) => setRoster(d.roster));
  useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useRealtime({ "attendance:updated": load, "staffmember:created": load, "staffmember:updated": load }, load);

  if (!roster) return null;
  const onDuty = roster.filter((p) => p.status === "CHECKED_IN" || p.status === "OUT");
  const inCount = onDuty.length;
  const notIn = roster.length - inCount - roster.filter((p) => p.status === "CHECKED_OUT").length;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">Who&rsquo;s on duty</p>
        <Link href="/dashboard/attendance" className="text-xs text-slate-400 hover:text-slate-700">open →</Link>
      </div>
      <p className="mt-1 text-xs text-slate-500">{inCount} on duty now · {notIn} not yet in</p>
      <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto">
        {onDuty.length === 0 && <p className="text-sm text-slate-400">No one on duty yet.</p>}
        {onDuty.map((p) => (
          <div key={`${p.kind}:${p.id}`} className="flex items-center gap-2.5">
            <Avatar name={p.name} src={p.photo} size={26} />
            <span className="flex-1 truncate text-sm">{p.name}</span>
            <span className={`h-1.5 w-1.5 rounded-full ${p.status === "OUT" ? "bg-amber-500" : "bg-emerald-500"}`} />
            <span className="tabular-nums text-xs text-slate-500">{fmtHms(liveSeconds(p.log, p.breaks, now))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
