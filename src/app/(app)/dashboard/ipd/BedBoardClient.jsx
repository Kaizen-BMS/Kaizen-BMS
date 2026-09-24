"use client";
import { fmtDDMMYYTime, fmtDDMMYY } from "@/lib/dateFormat";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";

const STATUS_LABEL = {
  VACANT: "Vacant — ready for a new patient",
  OCCUPIED: "Occupied",
  CLEANING: "Being cleaned after discharge",
  MAINTENANCE: "Out of service",
};
const STATUS_STYLE = {
  VACANT: "bg-green-50 border-green-300 text-green-800",
  OCCUPIED: "bg-red-50 border-red-300 text-red-800",
  CLEANING: "bg-amber-50 border-amber-300 text-amber-800",
  MAINTENANCE: "bg-slate-100 border-slate-300 text-slate-500",
};
const LEGEND = [
  ["VACANT", "Vacant — click to admit a patient"],
  ["OCCUPIED", "Occupied — click to view / discharge"],
  ["CLEANING", "Being cleaned after discharge"],
  ["MAINTENANCE", "Out of service"],
];

function upsertBed(list, bed) {
  return list.some((b) => b.id === bed.id)
    ? list.map((b) => (b.id === bed.id ? { ...b, ...bed } : b))
    : [...list, bed];
}

export default function BedBoardClient({ permissions }) {
  const { canAdmit, canDischarge, canManageBeds } = permissions;
  const [beds, setBeds] = useState([]);
  const [wards, setWards] = useState([]);
  const [msg, setMsg] = useState("");
  const [admitBed, setAdmitBed] = useState(null); // bed being admitted onto
  const [summaryBed, setSummaryBed] = useState(null); // occupied bed clicked
  const [maintenanceBed, setMaintenanceBed] = useState(null); // bed being set to/cleared from maintenance
  const [showManage, setShowManage] = useState(false);
  const [showWards, setShowWards] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [flashIds, setFlashIds] = useState(new Set());

  const wardLabel = (code) => {
    const w = wards.find((w) => w.code === code);
    return w ? (w.floor ? `${w.name} · ${w.floor}` : w.name) : code;
  };
  const wardName = (code) => wards.find((w) => w.code === code)?.name || code;

  function flash(id) {
    setFlashIds((s) => new Set(s).add(id));
    setTimeout(() => {
      setFlashIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }, 2000);
  }

  async function load() {
    const { beds } = await apiGet("/api/ipd/beds");
    setBeds(beds);
  }

  async function loadWards() {
    const { wards } = await apiGet("/api/ipd/wards?all=1");
    setWards(wards);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e) => setMsg(e.message));
    loadWards().catch((e) => setMsg(e.message));
  }, []);

  useRealtime(
    {
      "bed:updated": ({ bed }) => {
        flash(bed.id);
        setBeds((bs) => upsertBed(bs, bed));
      },
      "admission:created": () => load(),
      "admission:discharged": () => load(),
      "ward:updated": () => loadWards(),
    },
    load,
  );

  async function markReady(bedId, e) {
    e.stopPropagation();
    try {
      await apiSend(`/api/ipd/beds/${bedId}`, "PATCH", { status: "VACANT" });
    } catch (err) {
      setMsg(err.message);
    }
  }

  async function clearMaintenance(bedId) {
    try {
      await apiSend(`/api/ipd/beds/${bedId}`, "PATCH", { status: "VACANT" });
    } catch (err) {
      setMsg(err.message);
    }
  }

  // Group by every ward_type actually present on a bed — covers both an
  // active ward's beds and a since-deactivated ward's beds (deactivating a
  // ward is blocked while it still has beds, but this keeps the board
  // correct even for older data / a direct DB edit).
  const wardCodes = [...new Set(beds.map((b) => b.ward_type))].sort((a, b) => {
    const oa = wards.find((w) => w.code === a)?.display_order ?? 999;
    const ob = wards.find((w) => w.code === b)?.display_order ?? 999;
    return oa - ob || a.localeCompare(b);
  });
  const wardGroups = wardCodes.map((w) => ({
    ward: w,
    beds: beds.filter((b) => b.ward_type === w),
  }));

  const counts = beds.reduce((acc, b) => {
    acc[b.status] = (acc[b.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">IPD / Beds</h1>
          <p className="text-sm text-slate-500">
            {beds.length} beds total
            {beds.length > 0 && (
              <>
                {" · "}
                <span className="text-green-700">{counts.VACANT || 0} vacant</span>
                {" · "}
                <span className="text-red-700">{counts.OCCUPIED || 0} occupied</span>
                {counts.CLEANING > 0 && (
                  <>
                    {" · "}
                    <span className="text-amber-700">{counts.CLEANING} being cleaned</span>
                  </>
                )}
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowReport((s) => !s)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            {showReport ? "Hide occupancy report" : "Occupancy report"}
          </button>
          {canManageBeds && (
            <button
              onClick={() => setShowWards((s) => !s)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              {showWards ? "Close" : "Manage wards"}
            </button>
          )}
          {canManageBeds && (
            <button
              onClick={() => setShowManage((s) => !s)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              {showManage ? "Close" : "+ Add / manage beds"}
            </button>
          )}
        </div>
      </div>

      {msg && <p className="text-sm text-red-600">{msg}</p>}

      {showReport && <OccupancyReport wardName={wardName} />}

      {showWards && canManageBeds && (
        <ManageWardsPanel wards={wards} onChanged={loadWards} onError={setMsg} />
      )}

      {showManage && canManageBeds && (
        <AddBedForm wards={wards} onAdded={() => { load(); }} onError={setMsg} />
      )}

      {/* Legend — what the colors mean, up front, not left for staff to guess */}
      {beds.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 rounded-lg border border-slate-200 bg-white p-3 text-xs">
          {LEGEND.map(([status, label]) => (
            <span key={status} className="flex items-center gap-1.5">
              <span className={`inline-block h-2.5 w-2.5 rounded-full border ${STATUS_STYLE[status]}`} />
              {label}
            </span>
          ))}
        </div>
      )}

      {beds.length === 0 && !msg && (
        <p className="text-sm text-slate-400">
          No beds set up yet.{" "}
          {canManageBeds ? "Click “+ Add / manage beds” above to add your first one." : "Ask your hospital admin to add beds."}
        </p>
      )}

      {wardGroups.map((g) => (
        <div key={g.ward}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {wardLabel(g.ward)}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {g.beds.map((b) => {
              const clickable =
                (b.status === "VACANT" && canAdmit) || b.status === "OCCUPIED";
              return (
                <button
                  key={b.id}
                  onClick={() =>
                    b.status === "VACANT" && canAdmit
                      ? setAdmitBed(b)
                      : b.status === "OCCUPIED"
                        ? setSummaryBed(b)
                        : null
                  }
                  title={STATUS_LABEL[b.status]}
                  className={`rounded-lg border-2 p-3 text-left text-sm transition ${STATUS_STYLE[b.status]} ${
                    flashIds.has(b.id) ? "hms-flash" : ""
                  } ${clickable ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
                >
                  <p className="font-semibold">{b.bed_number}</p>
                  <p className="text-xs">{b.status.charAt(0) + b.status.slice(1).toLowerCase()}</p>
                  {b.status === "OCCUPIED" && (
                    <p className="mt-1 truncate text-xs">{b.patient_name}</p>
                  )}
                  {b.status === "MAINTENANCE" && b.maintenance_reason && (
                    <p className="mt-1 truncate text-xs" title={b.maintenance_reason}>
                      {b.maintenance_reason}
                      {b.maintenance_until && ` · till ${fmtDDMMYY(b.maintenance_until)}`}
                    </p>
                  )}
                  {Number(b.daily_rate) > 0 && b.status !== "OCCUPIED" && (
                    <p className="mt-1 text-xs opacity-70">₹{Number(b.daily_rate)}/day</p>
                  )}
                  {b.status === "CLEANING" && canManageBeds && (
                    <button
                      onClick={(e) => markReady(b.id, e)}
                      className="mt-1.5 rounded border border-amber-400 bg-white px-1.5 py-0.5 text-xs font-medium hover:bg-amber-50"
                    >
                      ✓ Mark ready
                    </button>
                  )}
                  {b.status === "VACANT" && canManageBeds && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMaintenanceBed(b);
                      }}
                      className="mt-1.5 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs font-medium hover:bg-slate-50"
                    >
                      Set maintenance
                    </button>
                  )}
                  {b.status === "MAINTENANCE" && canManageBeds && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        clearMaintenance(b.id);
                      }}
                      className="mt-1.5 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs font-medium hover:bg-slate-50"
                    >
                      Clear maintenance
                    </button>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {admitBed && (
        <AdmitModal bed={admitBed} onClose={() => setAdmitBed(null)} onError={setMsg} />
      )}
      {summaryBed && (
        <SummaryPopover
          bed={summaryBed}
          beds={beds}
          wardName={wardName}
          canDischarge={canDischarge}
          onClose={() => setSummaryBed(null)}
          onError={setMsg}
        />
      )}
      {maintenanceBed && (
        <MaintenanceModal bed={maintenanceBed} onClose={() => setMaintenanceBed(null)} onError={setMsg} />
      )}
    </div>
  );
}

function AddBedForm({ wards, onAdded, onError }) {
  const [form, setForm] = useState({ wardType: "", bedNumber: "", dailyRate: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!form.wardType && wards.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm((s) => ({ ...s, wardType: wards[0].code }));
    }
  }, [wards, form.wardType]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiSend("/api/ipd/beds", "POST", {
        wardType: form.wardType,
        bedNumber: form.bedNumber,
        dailyRate: form.dailyRate ? Number(form.dailyRate) : 0,
      });
      setForm({ wardType: form.wardType, bedNumber: "", dailyRate: "" });
      onAdded();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4"
    >
      <p className="col-span-2 text-sm font-semibold sm:col-span-4">Add a bed</p>
      {wards.length === 0 ? (
        <p className="col-span-2 text-xs text-amber-600 sm:col-span-4">
          No wards defined yet — use “Manage wards” above to add one first.
        </p>
      ) : (
        <select
          value={form.wardType}
          onChange={(e) => setForm((s) => ({ ...s, wardType: e.target.value }))}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          {wards.map((w) => (
            <option key={w.code} value={w.code}>
              {w.name}{w.floor ? ` · ${w.floor}` : ""}
            </option>
          ))}
        </select>
      )}
      <input
        placeholder="bed number (e.g. G-104)"
        required
        value={form.bedNumber}
        onChange={(e) => setForm((s) => ({ ...s, bedNumber: e.target.value }))}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      <input
        placeholder="daily rate ₹ (optional)"
        type="number"
        min="0"
        value={form.dailyRate}
        onChange={(e) => setForm((s) => ({ ...s, dailyRate: e.target.value }))}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      <button
        disabled={busy || !form.wardType}
        className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
      >
        Add bed
      </button>
      <p className="col-span-2 text-xs text-slate-400 sm:col-span-4">
        Daily rate is used to calculate the room charge automatically when a patient is discharged.
      </p>
    </form>
  );
}

function ManageWardsPanel({ wards, onChanged, onError }) {
  const [form, setForm] = useState({ name: "", floor: "" });
  const [busy, setBusy] = useState(false);

  async function addWard(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await apiSend("/api/ipd/wards", "POST", { name: form.name.trim(), floor: form.floor.trim() });
      setForm({ name: "", floor: "" });
      onChanged();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(ward) {
    try {
      await apiSend(`/api/ipd/wards/${ward.id}`, "PATCH", { active: !ward.active });
      onChanged();
    } catch (err) {
      onError(err.message);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold">Wards</p>
      <p className="text-xs text-slate-400">
        Define how this hospital&apos;s floors and wards are organized — not fixed to General/ICU.
      </p>

      {wards.length > 0 && (
        <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
          {wards.map((w) => (
            <div key={w.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className={w.active ? "" : "text-slate-400 line-through"}>
                {w.name}
                {w.floor && <span className="text-slate-400"> · {w.floor}</span>}
              </span>
              <button
                onClick={() => toggleActive(w)}
                className="shrink-0 rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50"
              >
                {w.active ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={addWard} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <input
          placeholder="ward name (e.g. Maternity Ward)"
          value={form.name}
          onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
          className="col-span-2 rounded-md border border-slate-300 px-2 py-1.5 text-sm sm:col-span-1"
        />
        <input
          placeholder="floor (e.g. 2nd Floor)"
          value={form.floor}
          onChange={(e) => setForm((s) => ({ ...s, floor: e.target.value }))}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <button
          disabled={busy || !form.name.trim()}
          className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
        >
          Add ward
        </button>
      </form>
    </div>
  );
}

function AdmitModal({ bed, onClose, onError }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [newPatient, setNewPatient] = useState({ name: "", age: "", phone: "" });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function search() {
    if (q.trim().length < 2) return;
    try {
      const { patients } = await apiGet(
        `/api/registration/patients?q=${encodeURIComponent(q.trim())}`,
      );
      setResults(patients);
    } catch (err) {
      onError(err.message);
    }
  }

  async function admit(patientId) {
    setBusy(true);
    try {
      await apiSend("/api/ipd/admissions", "POST", {
        bedId: bed.id,
        reason,
        ...(patientId
          ? { patientId }
          : { name: newPatient.name, age: newPatient.age || undefined, phone: newPatient.phone }),
      });
      onClose();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Admit to ${bed.bed_number}`} onClose={onClose}>
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
            <div
              key={p.id}
              className="mt-2 flex items-center justify-between rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            >
              <span>{p.name} · {p.age}y · {p.phone}</span>
              <button
                onClick={() => admit(p.id)}
                disabled={busy}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs"
              >
                Admit
              </button>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 pt-3">
          <p className="text-sm font-semibold">Or admit a new patient</p>
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
          placeholder="reason for admission"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />

        <button
          onClick={() => admit(null)}
          disabled={busy || !newPatient.name || !newPatient.phone}
          className="w-full rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
        >
          Admit new patient
        </button>
      </div>
    </Modal>
  );
}

function SummaryPopover({ bed, beds, wardName, canDischarge, onClose, onError }) {
  const [dischargeType, setDischargeType] = useState("ROUTINE");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [toBedId, setToBedId] = useState("");
  const [transferReason, setTransferReason] = useState("");

  const vacantBeds = (beds || []).filter((b) => b.status === "VACANT");

  async function discharge() {
    setBusy(true);
    try {
      await apiSend(`/api/ipd/admissions/${bed.admission_id}`, "PATCH", {
        dischargeType,
        dischargeNotes: notes,
      });
      onClose();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function transfer() {
    if (!toBedId || !transferReason.trim()) return;
    setBusy(true);
    try {
      await apiSend(`/api/ipd/admissions/${bed.admission_id}/transfer`, "POST", {
        toBedId,
        reason: transferReason.trim(),
      });
      onClose();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={bed.bed_number} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="font-medium">{bed.patient_name} · {bed.patient_age}y</p>
        <p className="text-slate-500">
          Admitted {bed.admitted_at ? fmtDDMMYYTime(bed.admitted_at) : ""}
        </p>
        <Link
          href={`/dashboard/ipd/admissions/${bed.admission_id}`}
          className="text-slate-600 underline"
        >
          View full admission record →
        </Link>

        {/* Transfer and discharge are both admission-lifecycle decisions —
            same permission (admission:update) gates both. */}
        {canDischarge && (
          <div className="border-t border-slate-200 pt-3">
            <button
              onClick={() => setShowTransfer((s) => !s)}
              className="text-xs font-medium text-slate-600 underline"
            >
              {showTransfer ? "Cancel transfer" : "Transfer to another bed"}
            </button>
            {showTransfer && (
              <div className="mt-2 space-y-2">
                <select
                  value={toBedId}
                  onChange={(e) => setToBedId(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value="">Select a vacant bed…</option>
                  {vacantBeds.map((b) => (
                    <option key={b.id} value={b.id}>
                      {wardName(b.ward_type)} · {b.bed_number}
                    </option>
                  ))}
                </select>
                <input
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  placeholder="reason for transfer"
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
                <button
                  onClick={transfer}
                  disabled={busy || !toBedId || !transferReason.trim()}
                  className="w-full rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
                >
                  Confirm transfer
                </button>
              </div>
            )}
          </div>
        )}

        {canDischarge && (
          <div className="border-t border-slate-200 pt-3">
            <p className="font-semibold">Discharge</p>
            <select
              value={dischargeType}
              onChange={(e) => setDischargeType(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="ROUTINE">Routine</option>
              <option value="TRANSFER">Transfer to another facility</option>
              <option value="AGAINST_MEDICAL_ADVICE">Against medical advice</option>
              <option value="DEATH">Death</option>
            </select>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="discharge notes"
              rows={2}
              className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button
              onClick={discharge}
              disabled={busy}
              className="mt-2 w-full rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
            >
              Discharge
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function MaintenanceModal({ bed, onClose, onError }) {
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await apiSend(`/api/ipd/beds/${bed.id}`, "PATCH", {
        status: "MAINTENANCE",
        maintenanceReason: reason.trim(),
        ...(until ? { maintenanceUntil: until } : {}),
      });
      onClose();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Set ${bed.bed_number} to maintenance`} onClose={onClose}>
      <div className="space-y-2 text-sm">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="reason (e.g. AC repair)"
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">Expected back in service (optional)</span>
          <input
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          onClick={submit}
          disabled={busy || !reason.trim()}
          className="w-full rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
        >
          Set to maintenance
        </button>
        <p className="text-xs text-slate-400">
          Excludes this bed from the available pool until it&apos;s cleared back to vacant.
        </p>
      </div>
    </Modal>
  );
}

function OccupancyReport({ wardName }) {
  const [wards, setWards] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    apiGet("/api/ipd/reports/occupancy")
      .then((d) => setWards(d.wards))
      .catch((e) => setMsg(e.message));
  }, []);

  if (msg) return <p className="text-sm text-red-600">{msg}</p>;
  if (!wards) return <p className="text-sm text-slate-400">Loading report…</p>;
  if (wards.length === 0) return <p className="text-sm text-slate-400">No beds set up yet.</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
            <th className="px-3 py-2">Ward</th>
            <th className="px-3 py-2">Occupancy</th>
            <th className="px-3 py-2">Vacant</th>
            <th className="px-3 py-2">Occupied</th>
            <th className="px-3 py-2">Cleaning</th>
            <th className="px-3 py-2">Maintenance</th>
            <th className="px-3 py-2">Avg. length of stay</th>
          </tr>
        </thead>
        <tbody>
          {wards.map((w) => (
            <tr key={w.wardType} className="border-b border-slate-100 last:border-0">
              <td className="px-3 py-2 font-medium">{wardName(w.wardType)}</td>
              <td className="px-3 py-2">{w.occupancyPct}% <span className="text-slate-400">({w.occupied}/{w.total})</span></td>
              <td className="px-3 py-2">{w.vacant}</td>
              <td className="px-3 py-2">{w.occupied}</td>
              <td className="px-3 py-2">{w.cleaning}</td>
              <td className="px-3 py-2">{w.maintenance}</td>
              <td className="px-3 py-2">
                {w.avgLengthOfStayDays != null ? `${w.avgLengthOfStayDays}d (${w.dischargedCount} discharged)` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--hms-btn-bg)]/30 p-4"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-4 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">{title}</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
