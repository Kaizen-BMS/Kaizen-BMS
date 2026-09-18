"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const TABS = [
  { key: "appointments", label: "Appointments", module: "APPOINTMENTS" },
  { key: "medications", label: "Medications", module: "DOCTOR_OPD" },
  { key: "prescriptions", label: "Prescriptions", module: "DOCTOR_OPD" },
  { key: "lab-reports", label: "Lab Reports", module: "LAB" },
  { key: "radiology-reports", label: "Radiology Reports", module: "RADIOLOGY" },
  { key: "discharge-summaries", label: "Discharge Summaries", module: "IPD" },
  { key: "bills", label: "Bills", module: "BILLING" },
  { key: "feedback", label: "Feedback", module: "APPOINTMENTS" },
];

function fmtDateTime(iso) {
  return iso ? new Date(iso).toLocaleString() : "—";
}
function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

export default function DashboardClient({ tenantSlug, tenantName, profiles, activeModules }) {
  const router = useRouter();
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? null);
  const availableTabs = TABS.filter((t) => activeModules.includes(t.module));
  const [tab, setTab] = useState(availableTabs[0]?.key ?? null);

  async function logout() {
    await fetch("/api/patient-auth/logout", { method: "POST" });
    router.replace(`/patient/${tenantSlug}/login`);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{tenantName}</h1>
          <p className="text-sm text-slate-500">Your records</p>
        </div>
        <button onClick={logout} className="text-sm text-slate-500 underline">
          Sign out
        </button>
      </div>

      {profiles.length > 1 && (
        <div className="mb-4">
          <label className="text-xs text-slate-500">Viewing</label>
          <select
            value={profileId ?? ""}
            onChange={(e) => setProfileId(Number(e.target.value))}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.age ? `· ${p.age}y` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {availableTabs.length === 0 ? (
        <p className="text-sm text-slate-400">No records available yet.</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-1.5 border-b border-slate-200 pb-2">
            {availableTabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  tab === t.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "appointments" && <AppointmentsTab profileId={profileId} tenantSlug={tenantSlug} />}
          {tab === "medications" && <MedicationsTab profileId={profileId} />}
          {tab === "prescriptions" && <PrescriptionsTab profileId={profileId} />}
          {tab === "lab-reports" && <LabReportsTab profileId={profileId} />}
          {tab === "radiology-reports" && <RadiologyReportsTab profileId={profileId} />}
          {tab === "discharge-summaries" && <DischargeSummariesTab profileId={profileId} />}
          {tab === "bills" && <BillsTab profileId={profileId} />}
          {tab === "feedback" && <FeedbackTab profileId={profileId} />}
        </>
      )}
    </div>
  );
}

function useTabData(endpoint, profileId, key) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const refetch = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    setData(null);
    setError("");
    const qs = profileId ? `?patientId=${profileId}` : "";
    apiGet(`/api/patient/${endpoint}${qs}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [endpoint, profileId, refreshKey]);

  if (error) return { error, items: null, refetch };
  if (!data) return { loading: true, items: null, refetch };
  if (data.moduleActive === false) return { inactive: true, items: null, refetch };
  return { items: data[key], refetch };
}

function Card({ children }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">{children}</div>;
}
function TabState({ state, emptyLabel }) {
  if (state.error) return <p className="text-sm text-red-600">{state.error}</p>;
  if (state.loading) return <p className="text-sm text-slate-400">Loading…</p>;
  if (state.inactive) return <p className="text-sm text-slate-400">Not available at this hospital.</p>;
  if (state.items.length === 0) return <p className="text-sm text-slate-400">{emptyLabel}</p>;
  return null;
}

const STATUS_LABEL = {
  BOOKED: "Booked",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
  NO_SHOW: "No-show",
};

function AppointmentsTab({ profileId, tenantSlug }) {
  const state = useTabData("appointments", profileId, "appointments");
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState("");

  async function cancel(id) {
    setBusyId(id);
    setErr("");
    try {
      await apiPost(`/api/patient/appointments/${id}/cancel`, {});
      state.refetch();
    } catch (e) {
      setErr(e.message === "already_finalized" ? "That appointment can no longer be cancelled." : e.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Link
        href={`/patient/${tenantSlug}/book`}
        className="inline-block rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
      >
        + Book an appointment
      </Link>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <AppointmentsList state={state} busyId={busyId} onCancel={cancel} />
    </div>
  );
}

function AppointmentsList({ state, busyId, onCancel }) {
  const fallback = <TabState state={state} emptyLabel="No appointments yet." />;
  if (fallback) return fallback;
  const now = Date.now();
  const upcoming = state.items.filter((a) => new Date(a.slotTime).getTime() >= now && a.status !== "CANCELLED");
  const past = state.items.filter((a) => !(new Date(a.slotTime).getTime() >= now && a.status !== "CANCELLED"));
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase text-slate-400">Upcoming</p>
        <div className="space-y-2">
          {upcoming.length === 0 && <p className="text-sm text-slate-400">None scheduled.</p>}
          {upcoming.map((a) => (
            <Card key={a.id}>
              <p className="font-medium">{fmtDateTime(a.slotTime)}</p>
              <p className="text-slate-500">Dr. {a.doctorName} · {STATUS_LABEL[a.status]}</p>
              {a.reason && <p className="text-slate-400">{a.reason}</p>}
              {(a.status === "BOOKED" || a.status === "CONFIRMED") && (
                <button
                  onClick={() => onCancel(a.id)}
                  disabled={busyId === a.id}
                  className="mt-1.5 text-xs text-red-600 underline disabled:opacity-50"
                >
                  Cancel
                </button>
              )}
            </Card>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase text-slate-400">Past</p>
        <div className="space-y-2">
          {past.length === 0 && <p className="text-sm text-slate-400">None yet.</p>}
          {past.map((a) => (
            <Card key={a.id}>
              <p className="font-medium">{fmtDateTime(a.slotTime)}</p>
              <p className="text-slate-500">Dr. {a.doctorName} · {STATUS_LABEL[a.status]}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function MedicationsTab({ profileId }) {
  const state = useTabData("medications", profileId, "medications");
  const fallback = <TabState state={state} emptyLabel="No active medications." />;
  if (fallback) return fallback;
  return (
    <div className="space-y-2">
      {state.items.map((m, i) => (
        <Card key={i}>
          <p className="font-medium">{m.medicineName}</p>
          {m.dosage && <p className="text-slate-500">{m.dosage}</p>}
        </Card>
      ))}
    </div>
  );
}

function PrescriptionsTab({ profileId }) {
  const state = useTabData("prescriptions", profileId, "prescriptions");
  const fallback = <TabState state={state} emptyLabel="No prescriptions yet." />;
  if (fallback) return fallback;
  return (
    <div className="space-y-2">
      {state.items.map((p) => (
        <Card key={p.id}>
          <p className="font-medium">{fmtDate(p.createdAt)} · Dr. {p.doctorName}</p>
          {p.diagnosis && <p className="text-slate-500">{p.diagnosis}</p>}
          <ul className="mt-1 list-inside list-disc text-slate-600">
            {p.items.map((it, i) => (
              <li key={i}>
                {it.medicineName} {it.dosage ? `— ${it.dosage}` : ""}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function LabReportsTab({ profileId }) {
  const state = useTabData("lab-reports", profileId, "labReports");
  const fallback = <TabState state={state} emptyLabel="No lab reports yet." />;
  if (fallback) return fallback;
  return (
    <div className="space-y-2">
      {state.items.map((r) => (
        <Card key={r.id}>
          <p className="font-medium">{fmtDate(r.resultedAt)}</p>
          {Array.isArray(r.results) &&
            r.results.map((row, i) => (
              <p key={i} className="text-slate-600">
                {row.name || row.test}: {row.value} {row.unit || ""}
              </p>
            ))}
        </Card>
      ))}
    </div>
  );
}

function RadiologyReportsTab({ profileId }) {
  const state = useTabData("radiology-reports", profileId, "radiologyReports");
  const fallback = <TabState state={state} emptyLabel="No radiology reports yet." />;
  if (fallback) return fallback;
  return (
    <div className="space-y-2">
      {state.items.map((r) => (
        <Card key={r.id}>
          <p className="font-medium">{fmtDate(r.reportedAt)} · {r.studyName}</p>
          {r.impression && <p className="text-slate-600">{r.impression}</p>}
        </Card>
      ))}
    </div>
  );
}

function DischargeSummariesTab({ profileId }) {
  const state = useTabData("discharge-summaries", profileId, "dischargeSummaries");
  const fallback = <TabState state={state} emptyLabel="No admissions on record." />;
  if (fallback) return fallback;
  return (
    <div className="space-y-2">
      {state.items.map((d) => (
        <Card key={d.id}>
          <p className="font-medium">
            {fmtDate(d.admittedAt)} – {fmtDate(d.dischargedAt)}
          </p>
          <p className="text-slate-500">{d.ward} · Bed {d.bedNumber} · {d.dischargeType}</p>
          {d.dischargeNotes && <p className="mt-1 text-slate-600">{d.dischargeNotes}</p>}
        </Card>
      ))}
    </div>
  );
}

function FeedbackTab({ profileId }) {
  const state = useTabData("visits", profileId, "visits");
  const [ratings, setRatings] = useState({});
  const [comments, setComments] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState("");
  const [doneIds, setDoneIds] = useState(new Set());

  const fallback = <TabState state={state} emptyLabel="No completed visits yet." />;
  if (fallback) return fallback;

  async function submit(visitId) {
    const rating = ratings[visitId] || 5;
    setBusyId(visitId);
    setErr("");
    try {
      await apiPost("/api/patient/feedback", {
        patientId: profileId,
        visitId,
        rating,
        comment: comments[visitId] || "",
      });
      setDoneIds((s) => new Set(s).add(visitId));
    } catch (e) {
      setErr(e.message === "already_submitted" ? "Feedback was already submitted for this visit." : "Could not submit feedback.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      {err && <p className="text-sm text-red-600">{err}</p>}
      {state.items.map((v) => {
        const submitted = v.hasFeedback || doneIds.has(v.id);
        return (
          <Card key={v.id}>
            <p className="font-medium">{fmtDate(v.dischargedAt)} · {v.entryType}</p>
            {submitted ? (
              <p className="mt-1 text-green-700">Feedback submitted — thank you.</p>
            ) : (
              <div className="mt-2 space-y-2">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setRatings((r) => ({ ...r, [v.id]: n }))}
                      className={`h-7 w-7 rounded-full border text-xs ${
                        (ratings[v.id] || 5) >= n ? "border-amber-400 bg-amber-50" : "border-slate-200"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <input
                  value={comments[v.id] || ""}
                  onChange={(e) => setComments((c) => ({ ...c, [v.id]: e.target.value }))}
                  placeholder="comment (optional)"
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
                <button
                  onClick={() => submit(v.id)}
                  disabled={busyId === v.id}
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  Submit feedback
                </button>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function BillsTab({ profileId }) {
  const state = useTabData("bills", profileId, "bills");
  const fallback = <TabState state={state} emptyLabel="No bills yet." />;
  if (fallback) return fallback;
  return (
    <div className="space-y-2">
      {state.items.map((b) => (
        <Card key={b.id}>
          <div className="flex items-center justify-between">
            <p className="font-medium">{fmtDate(b.createdAt)} · {b.billType}</p>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{b.status}</span>
          </div>
          <p className="mt-1 text-slate-600">Net: ₹{b.netAmount.toFixed(2)}</p>
          {b.payAtHospital ? (
            <p className="mt-1 text-amber-700">Balance due: ₹{b.balanceDue.toFixed(2)} — pay at hospital</p>
          ) : (
            <p className="mt-1 text-green-700">Paid in full</p>
          )}
        </Card>
      ))}
    </div>
  );
}
