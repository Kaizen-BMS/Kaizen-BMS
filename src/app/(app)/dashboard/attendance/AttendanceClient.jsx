"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";
import Icon from "@/components/hms/icons";
import CameraCapture from "@/components/hms/CameraCapture";
import Avatar from "@/components/hms/Avatar";
import PersonDetailsFields, { EMPTY_DETAILS, detailsPayload } from "@/components/hms/PersonDetailsFields";
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
          {status === "CHECKED_OUT" && (
            <button
              disabled={busy}
              onClick={() => act(() => apiSend("/api/attendance/check-in", "POST"))}
              className="rounded-md bg-[var(--hms-btn-bg)] px-4 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
            >
              I&rsquo;m back at work
            </button>
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

// Everyone's attendance today, in one list: people with a login AND people
// without. The front desk / admin / owner marks anyone in or out — nobody needs
// a computer or a login of their own. A photo is optional (📷 button).
function ProxyRoster({ canManageStaff }) {
  const [roster, setRoster] = useState([]);
  const [msg, setMsg] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [photoTarget, setPhotoTarget] = useState(null);
  const [breakTarget, setBreakTarget] = useState(null);
  const [category, setCategory] = useState("PERSONAL");
  const [reason, setReason] = useState("");
  const [q, setQ] = useState("");
  const [compare, setCompare] = useState(null);
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

  const who = (p) => (p.kind === "USER" ? { userId: p.id } : { staffMemberId: p.id });
  const key = (p) => `${p.kind}:${p.id}`;

  async function call(url, p, extra = {}) {
    setMsg("");
    try {
      await apiSend(url, "POST", { ...who(p), ...extra });
      await load();
    } catch (err) {
      setMsg(err.message === "already_checked_in" ? "Already marked in today." : err.message === "close_break_first" ? "Bring them back from their break first." : err.message);
    }
  }
  const mark = (p, action) => call(`/api/attendance/proxy/${action}`, p);

  function openPhotoCapture(p, action) {
    setPhotoTarget({ p, action });
  }
  async function onPhotoChosen(photoDataUrl) {
    const target = photoTarget;
    setPhotoTarget(null);
    if (!target) return;
    await call(`/api/attendance/proxy/${target.action}`, target.p, { photoDataUrl });
  }

  async function startBreak(p) {
    if (!reason.trim()) return;
    await call("/api/attendance/proxy/breaks/start", p, { category, reason: reason.trim() });
    setBreakTarget(null);
    setReason("");
  }

  async function markAll() {
    if (!confirm("Mark everyone who is not yet in as present now?")) return;
    for (const p of roster.filter((x) => x.status === "NOT_CHECKED_IN")) await call("/api/attendance/proxy/check-in", p);
  }

  async function removeMember(id) {
    try {
      await apiSend(`/api/attendance/staff-members/${id}`, "PATCH", { active: false });
      await load();
    } catch (err) {
      setMsg(err.message);
    }
  }

  const shown = roster.filter((p) => !q || `${p.name} ${p.subtitle}`.toLowerCase().includes(q.toLowerCase()));
  const count = (s) => roster.filter((p) => p.status === s).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Everyone&apos;s attendance today</h2>
          <p className="text-xs text-slate-400">
            Mark anyone in or out — with or without a login. {count("CHECKED_IN") + count("OUT")} in · {count("CHECKED_OUT")} left · {count("NOT_CHECKED_IN")} not yet in
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="w-36 rounded-md border border-slate-300 px-2 py-1 text-xs" />
          {count("NOT_CHECKED_IN") > 0 && (
            <button onClick={markAll} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50">Mark everyone present</button>
          )}
          {canManageStaff && (
            <button onClick={() => setShowAdd((s) => !s)} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50">
              {showAdd ? "Close" : "+ Add a person without login"}
            </button>
          )}
        </div>
      </div>

      {msg && <p className="mt-2 text-sm text-red-600">{msg}</p>}
      {showAdd && canManageStaff && <AddStaffMemberForm onAdded={load} onError={setMsg} />}
      {compare && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setCompare(null)}>
          <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 text-sm font-semibold">{compare.name} — is it the same person?</p>
            <div className="grid grid-cols-2 gap-3 text-center text-xs text-slate-500">
              {[["On file", compare.photo], ["Today's attendance photo", compare.log?.check_in_photo_url]].map(([label, src]) => (
                <div key={label}>
                  <div className="grid aspect-square place-items-center overflow-hidden rounded-md bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {src ? <img src={src} alt={label} className="h-full w-full object-cover" /> : <span className="px-2">{label === "On file" ? "No photo on file — add one in Staff › Details" : "No photo taken today"}</span>}
                  </div>
                  <p className="mt-1">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {photoTarget && <CameraCapture title={`Photo — ${photoTarget.p.name}`} onCapture={onPhotoChosen} onClose={() => setPhotoTarget(null)} />}

      <div className="mt-3 space-y-2">
        {shown.length === 0 && <p className="text-sm text-slate-400">No one found.</p>}
        {shown.map((p) => (
          <div key={key(p)} className="hms-card flex flex-wrap items-center gap-3 p-3 text-sm">
            <Avatar name={p.name} src={p.photo} size={44} onClick={() => setCompare(p)} title="Compare photos" />
            <div className="min-w-[8rem] flex-1">
              <p className="font-medium">{p.name}</p>
              <p className="text-xs text-slate-500">{p.subtitle}{p.kind === "STAFF_MEMBER" ? " · no login" : ""}</p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
            {p.log?.check_in_at && (
              <span className="text-xs text-slate-500">
                In {fmtTime(p.log.check_in_at)}
                {p.log.check_out_at ? ` · Out ${fmtTime(p.log.check_out_at)}` : ""} · {fmtMinutes(p.workedMinutes)}
              </span>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              {p.status === "NOT_CHECKED_IN" && (
                <>
                  <button onClick={() => mark(p, "check-in")} className="rounded-md bg-[var(--hms-btn-bg)] px-2.5 py-1 text-xs font-medium text-[var(--hms-btn-fg)]">Mark in</button>
                  <button onClick={() => openPhotoCapture(p, "check-in")} title="Mark in with a photo" aria-label="Mark in with a photo" className="rounded-md border border-slate-300 px-2 py-1 text-xs"><Icon name="camera" size={13} /></button>
                </>
              )}
              {p.status === "CHECKED_IN" && (
                <>
                  <button onClick={() => setBreakTarget(breakTarget === key(p) ? null : key(p))} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50">Step out</button>
                  <button onClick={() => mark(p, "check-out")} className="rounded-md bg-[var(--hms-btn-bg)] px-2.5 py-1 text-xs font-medium text-[var(--hms-btn-fg)]">Mark out</button>
                  <button onClick={() => openPhotoCapture(p, "check-out")} title="Mark out with a photo" aria-label="Mark out with a photo" className="rounded-md border border-slate-300 px-2 py-1 text-xs"><Icon name="camera" size={13} /></button>
                </>
              )}
              {p.status === "CHECKED_OUT" && (
                <>
                  <button onClick={() => mark(p, "check-in")} className="rounded-md bg-[var(--hms-btn-bg)] px-2.5 py-1 text-xs font-medium text-[var(--hms-btn-fg)]">Back at work</button>
                  <button onClick={() => openPhotoCapture(p, "check-in")} title="Back at work, with a photo" aria-label="Back at work, with a photo" className="rounded-md border border-slate-300 px-2 py-1 text-xs"><Icon name="camera" size={13} /></button>
                </>
              )}
              {p.status === "OUT" && (
                <button onClick={() => call("/api/attendance/proxy/breaks/end", p)} className="rounded-md bg-[var(--hms-btn-bg)] px-2.5 py-1 text-xs font-medium text-[var(--hms-btn-fg)]">Back</button>
              )}
              {canManageStaff && p.kind === "STAFF_MEMBER" && (
                <button onClick={() => removeMember(p.id)} className="rounded-md border border-slate-300 px-2 py-1 text-xs text-red-600">Remove</button>
              )}
            </div>

            {breakTarget === key(p) && (
              <div className="mt-2 flex w-full flex-wrap items-center gap-2 border-t border-slate-200 pt-2">
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-xs">
                  <option value="PERSONAL">Personal</option>
                  <option value="HOSPITAL_WORK">Work</option>
                </select>
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="reason" className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                <button onClick={() => startBreak(p)} disabled={!reason.trim()} className="rounded-md bg-[var(--hms-btn-bg)] px-2.5 py-1 text-xs font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Confirm</button>
              </div>
            )}

            {p.status === "CHECKED_OUT" && p.breaks?.length > 0 && (
              <div className="mt-1 w-full space-y-0.5 text-xs text-slate-500">
                {p.breaks.map((b) => (
                  <p key={b.id}>
                    Out {fmtTime(b.out_at)}–{fmtTime(b.in_at)} · {b.category === "PERSONAL" ? "Personal" : "Work"} · {b.reason}
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
  const [details, setDetails] = useState(EMPTY_DETAILS);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { joinDate: _j, emergencyContact: _e, ...d } = detailsPayload(details); // eslint-disable-line no-unused-vars
      await apiSend("/api/attendance/staff-members", "POST", { ...d, name: form.name, designation: d.designation || form.designation, phone: d.phone || form.phone });
      setForm({ name: "", designation: "", phone: "" });
      setDetails(EMPTY_DETAILS);
      onAdded();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="my-3 space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input required placeholder="name" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
      </div>
      <PersonDetailsFields name={form.name} value={details} onChange={setDetails} showJoin={false} showEmergency={false} />
      <button disabled={busy} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">
        Add person
      </button>
    </form>
  );
}
